// ══════════════════════════════════════════════════════════════
// maps/pohangMap.js — 포항 실지형 맵 (실측 DEM 표고 + OSM 도로망)
//
// 설계: mds/design/m18-pohang-map.md
// 데이터는 개발 시점에 받아 정적 JSON 으로 커밋된 것을 import 만 한다(런타임 fetch 0).
//   data/pohang-height.json : { meta:{centerLat,centerLon,halfKm,mLat,mLon,
//                                      minX,maxX,minZ,maxZ,N,cellMeters}, elev:[N*N] }
//     elev row-major, index = iz*N + ix (행=z 북, 열=x 동)
//   data/pohang-roads.json  : { meta:{...동일 origin...}, ways:[ [{x,z},...], ... ] }
//
// 인터페이스는 naturalMap/cityMap 과 동일 시그니처. 순수 메서드는 this 비의존
// (factory 클로저가 데이터를 캡처한 화살표 함수 → stepVehicle 에 함수참조 전달 가능).
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { distPointToSegment } from '../road.js';
import { terrainNormal } from '../vehicle/dynamics.js';
import { heightToColorHex } from '../terrain.js';

import defaultHeight from './data/pohang-height.json';
import defaultRoads from './data/pohang-roads.json';

// 도로 폭(m) — OSM 정점이 성겨 자연 맵(8)보다 약간 넓힌다. ──────────
export const ROAD_WIDTH_POHANG = 10;

// 청크 스트리밍 파라미터(포항은 셀이 커서 청크를 자연 맵보다 넓게) ──
const CHUNK_SIZE = 250;   // 한 청크 한 변(m)
const CHUNK_SEG = 24;     // 청크당 세그먼트 수(정점 해상도)
const RENDER_DIST = 4;    // 플레이어 청크 기준 로드 반경
const ROAD_YLIFT = 0.4;   // 도로 리본을 지형 위로 띄우는 높이
const SPATIAL_CELL = 200; // 도로 공간 버킷 셀 크기(m)

// ── 위경도 ↔ 로컬 미터 (등거리 평면 근사, 순수) ─────────────────────
//   원점 = bbox 중심(centerLon,centerLat) → 로컬 (0,0).
//   +Z = 북(lat↑), +X = 동(lon↑). 데이터 meta 의 mLat/mLon 을 그대로 사용.
const _meta0 = defaultHeight.meta;
export function lonLatToLocal(lon, lat) {
  return {
    x: (lon - _meta0.centerLon) * _meta0.mLon,
    z: (lat - _meta0.centerLat) * _meta0.mLat,
  };
}
export function localToLonLat(x, z) {
  return {
    lon: _meta0.centerLon + x / _meta0.mLon,
    lat: _meta0.centerLat + z / _meta0.mLat,
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── 도로 세그먼트 + 공간 버킷 인덱스 구축 (순수, 로더 1회) ──────────
//   ways(폴리라인 배열) → 인접 점쌍 세그먼트로 펼치고, 셀 그리드 버킷에
//   세그먼트를 등록한다. distanceToRoad 는 인접 버킷만 검사해 가속한다.
function buildRoadIndex(ways, meta) {
  const segments = [];
  for (const way of ways) {
    for (let i = 0; i < way.length - 1; i++) {
      const a = way[i], b = way[i + 1];
      segments.push([a.x, a.z, b.x, b.z]);
    }
  }

  const cell = SPATIAL_CELL;
  const buckets = new Map();        // key "gx,gz" → [segIndex,...]
  const keyOf = (gx, gz) => `${gx},${gz}`;
  const gridOf = (v) => Math.floor(v / cell);

  // 세그먼트가 가로지르는 셀(범위)에 등록 ──
  segments.forEach(([ax, az, bx, bz], si) => {
    const gx0 = gridOf(Math.min(ax, bx)), gx1 = gridOf(Math.max(ax, bx));
    const gz0 = gridOf(Math.min(az, bz)), gz1 = gridOf(Math.max(az, bz));
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = keyOf(gx, gz);
        let arr = buckets.get(k);
        if (!arr) { arr = []; buckets.set(k, arr); }
        arr.push(si);
      }
    }
  });

  // 최단거리 — 점이 속한 셀과 인접 8셀(반경 확장 포함)만 검사 ──
  function distanceToRoad(x, z) {
    const gx = gridOf(x), gz = gridOf(z);
    let min = Infinity;
    const seen = new Set();
    // 인접 버킷 후보가 비면 점차 반경을 넓혀 가장 가까운 도로를 보장한다.
    for (let r = 1; r <= 64; r++) {
      let any = false;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          // 반경 r 의 테두리 셀만(이전 반경에서 검사한 내부는 건너뜀)
          if (r > 1 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const arr = buckets.get(keyOf(gx + dx, gz + dz));
          if (!arr) continue;
          any = true;
          for (const si of arr) {
            if (seen.has(si)) continue;
            seen.add(si);
            const [ax, az, bx, bz] = segments[si];
            const d = distPointToSegment(x, z, ax, az, bx, bz);
            if (d < min) min = d;
          }
        }
      }
      // 후보를 한 번이라도 찾았고, 현재 최소거리가 다음 반경 테두리보다
      // 가까우면 더 넓혀도 갱신될 수 없으므로 종료.
      if (min !== Infinity && min <= (r - 0) * cell) break;
      if (!any && min !== Infinity && r > 2) break;
    }
    // 후보를 끝내 못 찾은 경우(데이터 매우 희소) 전수 폴백 ──
    if (min === Infinity) {
      for (const [ax, az, bx, bz] of segments) {
        const d = distPointToSegment(x, z, ax, az, bx, bz);
        if (d < min) min = d;
      }
    }
    return min;
  }

  return { segments, distanceToRoad };
}

// ── heightAt bilinear 보간 클로저 생성 (순수, this 비의존) ──────────
function makeHeightAt(meta, elev) {
  const { N, cellMeters: cell, minX, minZ } = meta;
  return (x, z) => {
    // 로컬 → 격자 실수 인덱스
    const fx = (x - minX) / cell;
    const fz = (z - minZ) / cell;
    const cx = clamp(fx, 0, N - 1);
    const cz = clamp(fz, 0, N - 1);
    const ix0 = Math.floor(cx), iz0 = Math.floor(cz);
    const ix1 = Math.min(ix0 + 1, N - 1), iz1 = Math.min(iz0 + 1, N - 1);
    const tx = cx - ix0, tz = cz - iz0;
    const h00 = elev[iz0 * N + ix0], h10 = elev[iz0 * N + ix1];
    const h01 = elev[iz1 * N + ix0], h11 = elev[iz1 * N + ix1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  };
}

// ── 배송 지점 결정론 선택 (도로 위 보장, 공간 분산) ─────────────────
//   way 를 길이 내림차순(동률은 첫 점 x→z)으로 정렬 → 긴 도로 위주.
//   각 way 의 중점을 후보로, 이미 뽑은 점과 최소 간격(MIN_GAP) 이상이면 채택.
function selectDeliveryPoints(ways) {
  const MIN_GAP = 800;     // 배송점 간 최소 이격(m)
  const TARGET = 8;        // 목표 개수

  const wayLen = (w) => {
    let len = 0;
    for (let i = 0; i < w.length - 1; i++) {
      len += Math.hypot(w[i + 1].x - w[i].x, w[i + 1].z - w[i].z);
    }
    return len;
  };
  // 결정론 정렬용 사본(원본 불변)
  const sorted = ways
    .filter((w) => w.length >= 2)
    .map((w) => ({ w, len: wayLen(w) }))
    .sort((p, q) => {
      if (q.len !== p.len) return q.len - p.len;     // 길이 내림차순
      if (p.w[0].x !== q.w[0].x) return p.w[0].x - q.w[0].x;
      return p.w[0].z - q.w[0].z;
    });

  // way 의 호 길이 중점 좌표(도로 위 보장) ──
  const midpointOf = (w) => {
    let total = 0;
    const segLen = [];
    for (let i = 0; i < w.length - 1; i++) {
      const l = Math.hypot(w[i + 1].x - w[i].x, w[i + 1].z - w[i].z);
      segLen.push(l); total += l;
    }
    let target = total / 2, acc = 0;
    for (let i = 0; i < segLen.length; i++) {
      if (acc + segLen[i] >= target) {
        const t = segLen[i] === 0 ? 0 : (target - acc) / segLen[i];
        return {
          x: w[i].x + (w[i + 1].x - w[i].x) * t,
          z: w[i].z + (w[i + 1].z - w[i].z) * t,
        };
      }
      acc += segLen[i];
    }
    return { x: w[0].x, z: w[0].z };
  };

  const picked = [];
  for (const { w } of sorted) {
    if (picked.length >= TARGET) break;
    const p = midpointOf(w);
    let ok = true;
    for (const q of picked) {
      if (Math.hypot(p.x - q.x, p.z - q.z) < MIN_GAP) { ok = false; break; }
    }
    if (ok) picked.push(p);
  }
  // 이격 조건으로 부족하면(데이터 희소) 간격 없이 보충 ──
  if (picked.length < 4) {
    for (const { w } of sorted) {
      if (picked.length >= 4) break;
      const p = midpointOf(w);
      if (!picked.some((q) => q.x === p.x && q.z === p.z)) picked.push(p);
    }
  }
  return picked.map((p, i) => ({
    x: p.x, z: p.z,
    label: `포항 ${String.fromCharCode(65 + i)}`,  // '포항 A', '포항 B', ...
  }));
}

// ── 청크 메시 생성 (THREE) ─────────────────────────────────────────
const _chunkColor = new THREE.Color();

function createChunk(cx, cz, heightAt) {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEG, CHUNK_SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position.array;
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const wx = cx * CHUNK_SIZE + pos[i];
    const wz = cz * CHUNK_SIZE + pos[i + 2];
    const h = heightAt(wx, wz);
    pos[i + 1] = h;
    _chunkColor.setHex(heightToColorHex(h));
    colors[i] = _chunkColor.r; colors[i + 1] = _chunkColor.g; colors[i + 2] = _chunkColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  return { mesh, mat };
}

function disposeChunk(chunk) {
  chunk.mesh.geometry.dispose();
  chunk.mat.dispose();
}

// ── 도로 리본 머지 메시 (THREE) — 모든 way 를 한 BufferGeometry 로 ──
function buildRoadMesh(ways, heightAt) {
  const halfW = ROAD_WIDTH_POHANG / 2;
  const positions = [];
  const indices = [];
  let base = 0;

  for (const way of ways) {
    if (way.length < 2) continue;
    const start = base;
    for (let i = 0; i < way.length; i++) {
      const p = way[i];
      const a = way[Math.max(0, i - 1)];
      const b = way[Math.min(way.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;            // 진행방향 수직(좌우)
      const lx = p.x + nx * halfW, lz = p.z + nz * halfW;
      const rx = p.x - nx * halfW, rz = p.z - nz * halfW;
      positions.push(
        lx, heightAt(lx, lz) + ROAD_YLIFT, lz,
        rx, heightAt(rx, rz) + ROAD_YLIFT, rz,
      );
    }
    for (let i = 0; i < way.length - 1; i++) {
      const l0 = start + i * 2, r0 = l0 + 1, l1 = start + (i + 1) * 2, r1 = l1 + 1;
      indices.push(l0, r0, l1, r0, r1, l1);
    }
    base += way.length * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhongMaterial({ color: 0x33333a, shininess: 4, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

// ── 포항 맵 객체 생성 (factory) ────────────────────────────────────
//   createPohangMap()                         → 커밋된 실측 데이터 사용
//   createPohangMap({ height, roads })         → 합성/폴백 데이터 주입(테스트)
export function createPohangMap(opts = {}) {
  const heightData = opts.height ?? defaultHeight;
  const roadsData = opts.roads ?? defaultRoads;
  const meta = heightData.meta;
  const elev = heightData.elev;
  const ways = roadsData.ways;
  const { minX, maxX, minZ, maxZ } = meta;

  const heightAt = makeHeightAt(meta, elev);
  const roadIndex = buildRoadIndex(ways, meta);
  const distanceToRoad = (x, z) => roadIndex.distanceToRoad(x, z);
  const isOnRoad = (x, z) => distanceToRoad(x, z) <= ROAD_WIDTH_POHANG / 2;

  // 배송 지점(결정론) — 1회 계산해 캐시 ──
  const deliveryPoints = selectDeliveryPoints(ways);

  // 스폰: 가장 긴 way 의 첫 점, heading 은 둘째 점 방향 ──
  function computeSpawn() {
    let best = ways[0], bestLen = -1;
    for (const w of ways) {
      if (w.length < 2) continue;
      let len = 0;
      for (let i = 0; i < w.length - 1; i++) {
        len += Math.hypot(w[i + 1].x - w[i].x, w[i + 1].z - w[i].z);
      }
      if (len > bestLen) { bestLen = len; best = w; }
    }
    const p = best[0];
    const next = best[1] ?? { x: p.x, z: p.z + 1 };
    const heading = Math.atan2(next.x - p.x, next.z - p.z);
    return { x: p.x, z: p.z, y: heightAt(p.x, p.z), heading };
  }
  const spawn = computeSpawn();

  // 청크 스트리밍 상태 ──
  const loadedChunks = new Map();
  let roadMesh = null;

  return {
    id: 'pohang',
    label: '포항',

    // ── 높이/법선 (순수, this 비의존) ──
    heightAt,
    normalAt(x, z) { return terrainNormal(x, z, heightAt); },

    // ── 주행 가능 영역 (순수) ──
    isOnRoad,
    distanceToRoad,

    // ── 통과 불가 판정 — 포항은 건물 충돌 없음(항상 false) ──
    isBlocked() { return false; },

    // ── 목표 지점 — 배송 지점과 동일(미니맵 goals 호환) ──
    getGoals() {
      return deliveryPoints.map((p, i) => ({ index: i, x: p.x, z: p.z }));
    },

    // ── 배송 지점 (순수, 결정론) ──
    getDeliveryPoints() {
      return deliveryPoints.map((p) => ({ x: p.x, z: p.z, label: p.label }));
    },

    // ── 스폰 (도로 위 한 점) ──
    getSpawn() {
      return { x: spawn.x, z: spawn.z, y: spawn.y, heading: spawn.heading };
    },

    // ── 미니맵 (순수 데이터, 통일 포맷) ──
    getMinimapData() {
      return {
        polylines: ways.map((w) => w.map((p) => ({ x: p.x, z: p.z }))),
        goals: deliveryPoints.map((p) => ({ x: p.x, z: p.z })),
        bounds: { minX, maxX, minZ, maxZ },
      };
    },

    // ── 정적 씬 (THREE) — 배경/조명 + 도로 머지 메시 ──
    buildStatic(scene) {
      scene.background = new THREE.Color(0x9fc6e8);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sunLight = new THREE.DirectionalLight(0xfffde7, 1.3);
      sunLight.position.set(300, 500, 200);
      scene.add(sunLight);
      scene.add(new THREE.HemisphereLight(0x9fc6e8, 0x4a5a3a, 0.45));

      roadMesh = buildRoadMesh(ways, heightAt);
      scene.add(roadMesh);
    },

    // ── 청크 스트리밍 (THREE) ──
    updateWorld(px, pz, scene) {
      const pcx = Math.floor(px / CHUNK_SIZE);
      const pcz = Math.floor(pz / CHUNK_SIZE);

      for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
        for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
          const cx = pcx + dx, cz = pcz + dz;
          const key = `${cx},${cz}`;
          if (!loadedChunks.get(key)) {
            const chunk = createChunk(cx, cz, heightAt);
            scene.add(chunk.mesh);
            loadedChunks.set(key, chunk);
          }
        }
      }

      const toDelete = [];
      for (const [key, chunk] of loadedChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > RENDER_DIST + 1 || Math.abs(cz - pcz) > RENDER_DIST + 1) {
          scene.remove(chunk.mesh);
          disposeChunk(chunk);
          toDelete.push(key);
        }
      }
      toDelete.forEach((k) => loadedChunks.delete(k));
    },
  };
}
