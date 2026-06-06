// ══════════════════════════════════════════════════════════════
// pohang.test.js — 포항 실지형 맵 "순수 로직" 단위 테스트 (M18b, TDD RED)
//
// 설계 출처: mds/design/m18-pohang-map.md (§1 투영, §2.4 heightAt bilinear,
//            §3.4 isOnRoad/distanceToRoad, §3.5 getDeliveryPoints/getSpawn/
//            getMinimapData, §7 테스트 가이드)
//
// ── 가정한 export 시그니처 ───────────────────────────────────────────
//   src/maps/pohangMap.js 가 아래 중 하나를 제공한다고 가정한다(둘 다 수용):
//     (A) factory `createPohangMap()` → mapObject
//     (B) factory `createPohangMap({ height, roads })` → mapObject
//         (설계 §7: 작은 합성/폴백 데이터 주입으로 결정론 테스트.
//          주입을 지원하지 않는 구현이면 합성-주입 케이스는 자동 skip.)
//     (C) named export `pohangMap` (객체) / default
//
//   mapObject 인터페이스(설계 §0 — naturalMap/cityMap 와 동일 시그니처):
//     id='pohang', label='포항',
//     heightAt(x,z), normalAt(x,z), isOnRoad(x,z), distanceToRoad(x,z),
//     isBlocked(x,z) (항상 false), getGoals(), getDeliveryPoints(),
//     getSpawn(), getMinimapData(), buildStatic, updateWorld (THREE — 존재만 느슨 확인)
//
//   레지스트리: M18c 에서 getMap('pohang') 등록 예정.
//     지금 단계(M18b)에서 미등록이면 해당 케이스는 RED 허용(아래 it 에 명시).
//
//   투영(있으면): lonLatToLocal / localToLonLat 같은 순수 함수가 named export 되면
//     라운드트립·원점·축부호 검증. 없으면 데이터 meta(origin) 검증으로 대체.
//
//   ★ 데이터 실제 포맷(커밋된 JSON 확인 결과 — 설계노트 예시와 키가 다름):
//     pohang-height.json:
//       meta: { centerLat, centerLon, halfKm, mLat, mLon, minX, maxX, minZ, maxZ, N, cellMeters }
//       elev: [N*N] (row-major, 행=z 북, 열=x 동, index = iz*N + ix)
//       격자점 좌표: gridX[ix] = minX + ix*cellMeters, gridZ[iz] = minZ + iz*cellMeters
//       코너 (minX,minZ) == elev[0].
//     pohang-roads.json:
//       meta: { ...동일 origin... }
//       ways: [ [ {x,z}, ... ], ... ]   (로컬 미터 폴리라인 배열)
// ══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import * as pohangModule from './pohangMap.js';
import { distPointToSegment } from '../road.js';

import heightData from './data/pohang-height.json';
import roadsData from './data/pohang-roads.json';

// ── 구현 export 형태(객체 직접 / factory)를 둘 다 수용해 mapObject 를 얻는다 ──
function getPohangMap(opts) {
  const mod = pohangModule;
  if (typeof mod.createPohangMap === 'function') return mod.createPohangMap(opts);
  if (typeof mod.createMap === 'function') return mod.createMap(opts);
  if (mod.pohangMap) return mod.pohangMap;
  if (mod.default && typeof mod.default === 'object') return mod.default;
  if (typeof mod.default === 'function') return mod.default(opts);
  throw new Error('pohangMap.js: createPohangMap factory 또는 pohangMap 객체 export 필요');
}

// 설계상 ROAD_WIDTH_POHANG = 10 (폭 절반 = 5). 직접 export 되면 사용, 아니면 기본 10.
const ROAD_WIDTH_POHANG = pohangModule.ROAD_WIDTH_POHANG ?? 10;
const HALF_W = ROAD_WIDTH_POHANG / 2;

const HMETA = heightData.meta;
const N = HMETA.N;
const CELL = HMETA.cellMeters;
const { minX, minZ, maxX, maxZ } = HMETA;

// 모든 way 정점을 평탄화한 세그먼트 배열(거리 비교용 기준값) ──
function allSegments() {
  const segs = [];
  for (const way of roadsData.ways) {
    for (let i = 0; i < way.length - 1; i++) {
      const a = way[i], b = way[i + 1];
      segs.push([a.x, a.z, b.x, b.z]);
    }
  }
  return segs;
}
const SEGMENTS = allSegments();

// 기준 distanceToRoad (모든 세그먼트 최소거리) ──
function refDistanceToRoad(x, z) {
  let min = Infinity;
  for (const [ax, az, bx, bz] of SEGMENTS) {
    const d = distPointToSegment(x, z, ax, az, bx, bz);
    if (d < min) min = d;
  }
  return min;
}

// elev 격자 접근(행=z) ──
function elevAt(ix, iz) {
  return heightData.elev[iz * N + ix];
}

// ════════════════════════════════════════════════════════════════
// 1) 투영 (있으면) / 데이터 meta origin
// ════════════════════════════════════════════════════════════════
describe('투영(lonLatToLocal / localToLonLat) — 있으면 검증', () => {
  const hasProj =
    typeof pohangModule.lonLatToLocal === 'function' &&
    typeof pohangModule.localToLonLat === 'function';

  it('원점(centerLon,centerLat) → 로컬 (0,0)', () => {
    if (!hasProj) return; // 투영 미노출이면 skip (설계 §7 대체: meta 검증)
    const { lonLatToLocal } = pohangModule;
    const o = lonLatToLocal(HMETA.centerLon, HMETA.centerLat);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });

  it('라운드트립 localToLonLat(lonLatToLocal(lon,lat)) ≈ 원래값', () => {
    if (!hasProj) return;
    const { lonLatToLocal, localToLonLat } = pohangModule;
    const lon = HMETA.centerLon + 0.01;
    const lat = HMETA.centerLat + 0.02;
    const loc = lonLatToLocal(lon, lat);
    const back = localToLonLat(loc.x, loc.z);
    expect(back.lon).toBeCloseTo(lon, 6);
    expect(back.lat).toBeCloseTo(lat, 6);
  });

  it('축 부호: 위도↑→z↑, 경도↑→x↑', () => {
    if (!hasProj) return;
    const { lonLatToLocal } = pohangModule;
    const north = lonLatToLocal(HMETA.centerLon, HMETA.centerLat + 0.01);
    const east = lonLatToLocal(HMETA.centerLon + 0.01, HMETA.centerLat);
    expect(north.z).toBeGreaterThan(0);
    expect(east.x).toBeGreaterThan(0);
  });
});

describe('데이터 meta origin 정합 (height ↔ roads 동일 원점)', () => {
  it('두 JSON 의 centerLat/centerLon 이 동일', () => {
    expect(roadsData.meta.centerLat).toBe(HMETA.centerLat);
    expect(roadsData.meta.centerLon).toBe(HMETA.centerLon);
  });

  it('elev 길이는 N*N', () => {
    expect(heightData.elev.length).toBe(N * N);
  });

  it('ways 는 폴리라인({x,z}) 배열의 배열', () => {
    expect(Array.isArray(roadsData.ways)).toBe(true);
    expect(roadsData.ways.length).toBeGreaterThan(0);
    const w0 = roadsData.ways[0];
    expect(Array.isArray(w0)).toBe(true);
    expect(typeof w0[0].x).toBe('number');
    expect(typeof w0[0].z).toBe('number');
  });
});

// ════════════════════════════════════════════════════════════════
// 2) heightAt(x,z) — bilinear 보간
// ════════════════════════════════════════════════════════════════
describe('heightAt bilinear (실 데이터)', () => {
  it('격자 코너 (minX,minZ) 에서 elev[0] 과 일치(보간 오차 작음)', () => {
    const m = getPohangMap();
    // HEIGHT_SCALE / 상대고도(기준고도 빼기) 가 적용될 수 있어 절대값 대신
    // "코너 두 곳의 차이"가 elev 차이에 비례하는지로 검증(스케일·오프셋 불변).
    const h00 = m.heightAt(minX, minZ);          // elev[0]
    const hx1 = m.heightAt(minX + CELL, minZ);   // elev[iz=0,ix=1]
    const dGot = hx1 - h00;
    const dRef = elevAt(1, 0) - elevAt(0, 0);
    // scale 미지(>0) → 비율이 양수·동부호. dRef 가 0 아닌 샘플 가정.
    if (dRef !== 0) {
      expect(Math.sign(dGot)).toBe(Math.sign(dRef));
    }
    expect(Number.isFinite(h00)).toBe(true);
  });

  it('인접 두 격자점 중앙은 두 고도의 (스케일된) 평균 근처', () => {
    const m = getPohangMap();
    const xL = minX + 3 * CELL, xR = minX + 4 * CELL;
    const z = minZ + 2 * CELL;
    const hL = m.heightAt(xL, z);
    const hR = m.heightAt(xR, z);
    const hMid = m.heightAt((xL + xR) / 2, z);
    expect(hMid).toBeCloseTo((hL + hR) / 2, 3);
  });

  it('bbox 밖 좌표는 가장자리로 clamp (throw 없음, 유한값)', () => {
    const m = getPohangMap();
    const far = m.heightAt(maxX + 5000, maxZ + 5000);
    expect(Number.isFinite(far)).toBe(true);
    // 모서리 클램프 → 코너 격자점과 동일해야 함
    const corner = m.heightAt(maxX, maxZ);
    expect(far).toBeCloseTo(corner, 6);

    const farNeg = m.heightAt(minX - 9999, minZ - 9999);
    expect(Number.isFinite(farNeg)).toBe(true);
    expect(farNeg).toBeCloseTo(m.heightAt(minX, minZ), 6);
  });

  it('heightAt 은 this 비의존(분리 호출 가능) — stepVehicle 함수참조 전달 대비', () => {
    const m = getPohangMap();
    const f = m.heightAt;
    const a = f(0, 0);
    const b = m.heightAt(0, 0);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBe(b);
  });
});

// 합성 데이터 주입 지원 시: bilinear 정확도 결정론 검증(설계 §7 권장) ──
describe('heightAt bilinear (합성 주입 — 지원 시)', () => {
  // 4x4 격자, elev = iz*10 + ix (행=z). cell=100, minX=minZ=0.
  const synth = {
    meta: {
      centerLat: 36.019, centerLon: 129.3435, halfKm: 5,
      mLat: 111320, mLon: 90038.06870520914,
      minX: 0, maxX: 300, minZ: 0, maxZ: 300, N: 4, cellMeters: 100,
    },
    elev: [
      0, 1, 2, 3,        // iz=0
      10, 11, 12, 13,    // iz=1
      20, 21, 22, 23,    // iz=2
      30, 31, 32, 33,    // iz=3
    ],
  };
  const synthRoads = { meta: synth.meta, ways: [[{ x: 0, z: 0 }, { x: 300, z: 0 }]] };

  function makeSynth() {
    let m;
    try { m = getPohangMap({ height: synth, roads: synthRoads }); }
    catch { return null; }
    return m;
  }
  // 주입이 실제로 반영됐는지(코너 = 0) 판별
  function injected(m) {
    if (!m) return false;
    const h = m.heightAt(0, 0);
    return Number.isFinite(h) && Math.abs(h) < 1e-6; // 상대고도/스케일이어도 코너0은 0
  }

  it('격자점 정확값: heightAt(ix*cell, iz*cell) == elev[iz,ix]', () => {
    const m = makeSynth();
    if (!injected(m)) return; // 주입 미지원 → skip(RED 아님)
    expect(m.heightAt(100, 0)).toBeCloseTo(1, 6);   // ix=1,iz=0
    expect(m.heightAt(0, 100)).toBeCloseTo(10, 6);  // ix=0,iz=1
    expect(m.heightAt(200, 300)).toBeCloseTo(32, 6);// ix=2,iz=3
  });

  it('셀 중앙은 네 모서리 평균', () => {
    const m = makeSynth();
    if (!injected(m)) return;
    // 셀 (ix0=0,iz0=0) 중앙 (50,50): 평균(0,1,10,11)=5.5
    expect(m.heightAt(50, 50)).toBeCloseTo(5.5, 6);
  });
});

// ════════════════════════════════════════════════════════════════
// 3) isOnRoad(x,z) / distanceToRoad(x,z)
// ════════════════════════════════════════════════════════════════
describe('isOnRoad / distanceToRoad (실 데이터)', () => {
  it('어떤 way 의 한 정점 위면 distanceToRoad≈0, isOnRoad=true', () => {
    const m = getPohangMap();
    const p = roadsData.ways[0][0];
    expect(m.distanceToRoad(p.x, p.z)).toBeCloseTo(0, 3);
    expect(m.isOnRoad(p.x, p.z)).toBe(true);
  });

  it('distanceToRoad 가 전 세그먼트 최소거리(distPointToSegment)와 일치', () => {
    const m = getPohangMap();
    const samples = [
      [0, 0], [1000, -500], [-2000, 1500], [3000, 3000], [-100, -100],
    ];
    for (const [x, z] of samples) {
      expect(m.distanceToRoad(x, z)).toBeCloseTo(refDistanceToRoad(x, z), 3);
    }
  });

  it('모든 도로에서 아주 먼 좌표(bbox 밖 큰 값)는 isOnRoad=false', () => {
    const m = getPohangMap();
    expect(m.isOnRoad(maxX + 100000, maxZ + 100000)).toBe(false);
  });

  it('isOnRoad = (distanceToRoad <= ROAD_WIDTH/2) — 폭 경계 안/밖', () => {
    const m = getPohangMap();
    // way0 의 한 세그먼트에 수직으로 약간 벗어난 점을 만들어 경계 안/밖 검증.
    const a = roadsData.ways[0][0], b = roadsData.ways[0][1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len; // 세그먼트 법선(단위)
    // 중점에서 법선으로 (HALF_W - 0.5) 이동 → 안쪽
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const inX = mx + nx * (HALF_W - 0.5), inZ = mz + nz * (HALF_W - 0.5);
    const outX = mx + nx * (HALF_W + 5), outZ = mz + nz * (HALF_W + 5);
    expect(m.isOnRoad(inX, inZ)).toBe(true);
    // 바깥은 근처 다른 도로가 없다는 보장은 없으나, distanceToRoad 와 임계 정합은 확인
    const dOut = m.distanceToRoad(outX, outZ);
    expect(m.isOnRoad(outX, outZ)).toBe(dOut <= HALF_W + 1e-9);
  });

  it('distanceToRoad 는 this 비의존(분리 호출)', () => {
    const m = getPohangMap();
    const f = m.distanceToRoad;
    expect(Number.isFinite(f(0, 0))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// 4) getSpawn()
// ════════════════════════════════════════════════════════════════
describe('getSpawn (실 데이터)', () => {
  it('도로 위(isOnRoad=true) 점을 반환', () => {
    const m = getPohangMap();
    const s = m.getSpawn();
    expect(m.isOnRoad(s.x, s.z)).toBe(true);
  });

  it('y 가 heightAt(x,z) 와 정합, heading 은 유한 숫자', () => {
    const m = getPohangMap();
    const s = m.getSpawn();
    expect(s.y).toBeCloseTo(m.heightAt(s.x, s.z), 6);
    expect(typeof s.heading).toBe('number');
    expect(Number.isFinite(s.heading)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// 5) getDeliveryPoints()
// ════════════════════════════════════════════════════════════════
describe('getDeliveryPoints (실 데이터, 결정론)', () => {
  it('4개 이상 반환', () => {
    const m = getPohangMap();
    const pts = m.getDeliveryPoints();
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThanOrEqual(4);
  });

  it('전부 도로 위(isOnRoad=true)이고 label 을 가진다', () => {
    const m = getPohangMap();
    for (const p of m.getDeliveryPoints()) {
      expect(m.isOnRoad(p.x, p.z)).toBe(true);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('결정론: 두 번 호출(같은/다른 인스턴스) 결과 동일', () => {
    const a = getPohangMap().getDeliveryPoints();
    const b = getPohangMap().getDeliveryPoints();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBeCloseTo(b[i].x, 9);
      expect(a[i].z).toBeCloseTo(b[i].z, 9);
    }
  });

  it('서로 떨어져 있다(인접 점 최소 간격 > 0)', () => {
    const m = getPohangMap();
    const pts = m.getDeliveryPoints();
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        expect(d).toBeGreaterThan(1);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 6) getMinimapData()
// ════════════════════════════════════════════════════════════════
describe('getMinimapData (실 데이터)', () => {
  it('polylines(도로) 배열 + goals + bounds 형식', () => {
    const m = getPohangMap();
    const md = m.getMinimapData();
    expect(Array.isArray(md.polylines)).toBe(true);
    expect(md.polylines.length).toBeGreaterThan(0);
    // 각 polyline 은 {x,z} 점 배열
    const pl0 = md.polylines[0];
    expect(Array.isArray(pl0)).toBe(true);
    expect(typeof pl0[0].x).toBe('number');
    expect(typeof pl0[0].z).toBe('number');
    expect(Array.isArray(md.goals)).toBe(true);
  });

  it('bounds 가 bbox(minX/maxX/minZ/maxZ) 와 정합', () => {
    const m = getPohangMap();
    const md = m.getMinimapData();
    expect(md.bounds).toBeTruthy();
    expect(md.bounds.minX).toBeCloseTo(minX, 6);
    expect(md.bounds.maxX).toBeCloseTo(maxX, 6);
    expect(md.bounds.minZ).toBeCloseTo(minZ, 6);
    expect(md.bounds.maxZ).toBeCloseTo(maxZ, 6);
  });

  it('goals 좌표가 getDeliveryPoints 와 일치', () => {
    const m = getPohangMap();
    const md = m.getMinimapData();
    const dp = m.getDeliveryPoints();
    expect(md.goals.length).toBe(dp.length);
    for (let i = 0; i < dp.length; i++) {
      expect(md.goals[i].x).toBeCloseTo(dp[i].x, 6);
      expect(md.goals[i].z).toBeCloseTo(dp[i].z, 6);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 7) 인터페이스 계약
// ════════════════════════════════════════════════════════════════
describe('인터페이스 계약 (설계 §0)', () => {
  const PURE_METHODS = [
    'heightAt', 'normalAt', 'isOnRoad', 'distanceToRoad',
    'isBlocked', 'getGoals', 'getDeliveryPoints', 'getSpawn', 'getMinimapData',
  ];

  it("id='pohang', label='포항'", () => {
    const m = getPohangMap();
    expect(m.id).toBe('pohang');
    expect(m.label).toBe('포항');
  });

  it('순수 인터페이스 메서드를 모두 함수로 가진다', () => {
    const m = getPohangMap();
    for (const name of PURE_METHODS) {
      expect(typeof m[name], `${name} 가 함수여야 함`).toBe('function');
    }
  });

  it('isBlocked 은 항상 false (포항은 건물 충돌 없음)', () => {
    const m = getPohangMap();
    for (const [x, z] of [[0, 0], [1000, -1000], [maxX + 9999, 0]]) {
      expect(m.isBlocked(x, z)).toBe(false);
    }
  });

  it('normalAt 은 {x,y,z} 유한 벡터 반환', () => {
    const m = getPohangMap();
    const n = m.normalAt(0, 0);
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
    expect(Number.isFinite(n.z)).toBe(true);
  });

  it('getGoals 는 배열 반환', () => {
    const m = getPohangMap();
    expect(Array.isArray(m.getGoals())).toBe(true);
  });

  it('THREE 의존 메서드(buildStatic/updateWorld) 존재(느슨 확인)', () => {
    const m = getPohangMap();
    expect(typeof m.buildStatic).toBe('function');
    expect(typeof m.updateWorld).toBe('function');
  });
});

// 레지스트리 등록(M18c 예정 — 지금 미등록이면 RED 허용) ──
describe("레지스트리 getMap('pohang') (M18c 등록 예정)", () => {
  it("getMap('pohang').id === 'pohang' 이고 listMaps 에 포함", async () => {
    const { getMap, listMaps } = await import('./index.js');
    const m = getMap('pohang');
    expect(m.id).toBe('pohang');
    expect(listMaps().map((e) => e.id)).toContain('pohang');
  });
});
