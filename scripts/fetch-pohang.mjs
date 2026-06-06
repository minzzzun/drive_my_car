// ══════════════════════════════════════════════════════════════
// fetch-pohang.mjs — 포항 실지형 데이터 받아 정적 에셋으로 저장 (M18)
//   표고: open-meteo elevation API (격자 N×N, 배치 100/req)
//   도로: Overpass API (highway 폴리라인) → 로컬 미터 투영
//   출력: src/maps/data/pohang-height.json, pohang-roads.json
//
//   사용: node scripts/fetch-pohang.mjs
//   런타임은 외부 API를 부르지 않는다(이 스크립트로 받은 에셋만 읽음).
// ══════════════════════════════════════════════════════════════
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

// ── 포항 중심/범위 ────────────────────────────────────────────
const CENTER_LAT = 36.019;
const CENTER_LON = 129.3435;
const HALF_KM = 5;              // 중심에서 ± 5km (10km×10km)
const N = 80;                   // 표고 격자 한 변(셀 ≈ 125m)
const ROAD_FILTER = 'motorway|trunk|primary|secondary|tertiary';

// 등거리 평면 근사 — 위경도 ↔ 로컬 미터
const M_LAT = 111320;                               // 위도 1도 ≈ 111.32km
const M_LON = 111320 * Math.cos(CENTER_LAT * Math.PI / 180); // 경도 1도(포항 위도)

const halfM = HALF_KM * 1000;
const dLat = halfM / M_LAT;     // bbox 반경(도)
const dLon = halfM / M_LON;
const minLat = CENTER_LAT - dLat, maxLat = CENTER_LAT + dLat;
const minLon = CENTER_LON - dLon, maxLon = CENTER_LON + dLon;

const OUT_DIR = 'src/maps/data';
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// lat/lon → 로컬 미터(원점=중심, +X 동, +Z 북)
function toLocal(lat, lon) {
  return { x: (lon - CENTER_LON) * M_LON, z: (lat - CENTER_LAT) * M_LAT };
}

const META = {
  centerLat: CENTER_LAT, centerLon: CENTER_LON, halfKm: HALF_KM,
  mLat: M_LAT, mLon: M_LON,
  minX: -halfM, maxX: halfM, minZ: -halfM, maxZ: halfM,
};

// ── 1) 표고 격자 ──────────────────────────────────────────────
async function fetchHeights() {
  console.log(`[height] ${N}×${N} 격자 표고 요청...`);
  // 격자 좌표(행=z=북, 열=x=동). iz: minLat→maxLat, ix: minLon→maxLon
  const lats = [], lons = [];
  for (let iz = 0; iz < N; iz++) {
    const lat = minLat + (maxLat - minLat) * (iz / (N - 1));
    for (let ix = 0; ix < N; ix++) {
      const lon = minLon + (maxLon - minLon) * (ix / (N - 1));
      lats.push(lat); lons.push(lon);
    }
  }
  const total = lats.length;
  const elev = new Array(total).fill(0);
  const BATCH = 100;  // opentopodata: 최대 100 locations/req, 1 req/s
  for (let i = 0; i < total; i += BATCH) {
    const locs = [];
    for (let k = i; k < Math.min(i + BATCH, total); k++) locs.push(`${lats[k]},${lons[k]}`);
    const url = `https://api.opentopodata.org/v1/srtm30m?locations=${locs.join('|')}`;
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429 || res.status === 503) throw new Error(`HTTP ${res.status} (rate)`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const arr = j.results;
        for (let k = 0; k < arr.length; k++) elev[i + k] = arr[k].elevation ?? 0;
        ok = true;
      } catch (e) {
        console.warn(`  batch ${i} 재시도 ${attempt + 1}: ${e.message}`);
        await sleep(2000 * (attempt + 1));
      }
    }
    if (!ok) throw new Error(`표고 배치 ${i} 실패`);
    process.stdout.write(`\r  ${Math.min(i + BATCH, total)}/${total}`);
    await sleep(1100);  // 1 req/s 준수
  }
  console.log('\n[height] 완료');
  const round1 = (v) => Math.round(v * 10) / 10;
  return { meta: { ...META, N, cellMeters: (2 * halfM) / (N - 1) }, elev: elev.map(round1) };
}

// ── 2) 도로망 ─────────────────────────────────────────────────
async function fetchRoads() {
  console.log('[roads] Overpass 요청...');
  const q = `[out:json][timeout:60];way["highway"~"${ROAD_FILTER}"](${minLat},${minLon},${maxLat},${maxLon});out geom;`;
  let data = null;
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  const headers = { 'User-Agent': 'driving-game-dev/1.0 (educational)' };
  for (const m of mirrors) {
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      try {
        // GET + 쿼리스트링(probe 에서 검증된 방식). POST 는 일부 미러서 406.
        const res = await fetch(`${m}?data=${encodeURIComponent(q)}`, { headers });
        if (res.status === 429 || res.status === 504) throw new Error(`HTTP ${res.status} (rate)`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (e) {
        console.warn(`  ${m} 재시도 ${attempt + 1}: ${e.message}`);
        await sleep(3000 * (attempt + 1));
      }
    }
    if (data) break;
  }
  if (!data) throw new Error('Overpass 전 미러 실패');

  const ways = [];
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map((g) => {
      const p = toLocal(g.lat, g.lon);
      return { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
    });
    if (pts.length >= 2) ways.push(pts);
  }
  console.log(`[roads] way ${ways.length}개`);
  return { meta: META, ways };
}

// ── main ──────────────────────────────────────────────────────
const HEIGHT_PATH = `${OUT_DIR}/pohang-height.json`;
if (existsSync(HEIGHT_PATH) && !process.argv.includes('--height')) {
  console.log('[height] 기존 파일 존재 → 건너뜀 (--height 로 강제 재요청)');
} else {
  const height = await fetchHeights();
  writeFileSync(HEIGHT_PATH, JSON.stringify(height));
  console.log(`저장: ${HEIGHT_PATH} (${(JSON.stringify(height).length / 1024 | 0)} KB)`);
}

const roads = await fetchRoads();
writeFileSync(`${OUT_DIR}/pohang-roads.json`, JSON.stringify(roads));
console.log(`저장: ${OUT_DIR}/pohang-roads.json (${(JSON.stringify(roads).length / 1024 | 0)} KB)`);

console.log(`도로 ${roads.ways.length} ways 저장 완료`);
