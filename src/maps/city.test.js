// ══════════════════════════════════════════════════════════════
// maps/city.test.js — 도시 맵 순수 로직 단위 테스트 (M12b, TDD RED)
//
// 구현(src/maps/city.js)은 아직 없다. 본 테스트는 설계노트
// mds/design/maps.md §3·§6 의 코드 스케치를 근거로 아래 export 시그니처를
// **가정**한다. 구현 에이전트는 이 시그니처에 맞춰 구현한다.
//
// ── 가정한 export 시그니처 (설계노트 maps.md §3·§6) ─────────────
//   상수:
//     BLOCK_SIZE        = 60   // 블록(건물 부지) 한 변
//     ROAD_WIDTH_CITY   = 12   // 도시 도로 폭
//     CELL              = 72   // BLOCK_SIZE + ROAD_WIDTH_CITY (격자 주기)
//     BUILDING_PALETTE  = [..6 hex..]  // 건물 색 팔레트(설계 §3 (1), 6색)
//   함수:
//     distToGrid(v)            // → number. 가장 가까운 격자선(k*CELL)까지 거리, [0, CELL/2]
//     cityIsOnRoad(x, z)       // → bool. 한 축이라도 격자선 폭 내면 true
//     buildingAt(bx, bz)       // → { exists, cx, cz, w, d, h, colorHex, colorIndex }
//                              //   exists: 건물 유무(빈 블록이면 false)
//                              //   cx, cz: 건물 중심 월드좌표
//                              //   w, d:   평면 가로/세로 크기
//                              //   h:      높이 (설계 새 범위: BUILD_MIN_H=6 ~ BUILD_MAX_H=90)
//                              //   colorHex:   BUILDING_PALETTE 중 결정론 선택 hex (exists:false면 0)
//                              //   colorIndex: 위 hex 의 팔레트 인덱스 (exists:false면 -1)
//                              //   결정론(난수 없음): 같은 (bx,bz)→항상 동일 결과(색 포함)
//     cityBuildingAt(x, z)     // → 건물 AABB 안이면 그 건물 객체(buildingAt 결과), 아니면 null
//     cityIsBlocked(x, z)      // → bool. cityBuildingAt(x,z) !== null (건물 내부면 통과 불가)
//
// 설계가 buildingAt 외 다른 이름(getBuilding 등)을 쓸 수 있으나, 본 테스트는
// buildingAt 으로 통일한다. 반환 객체 키도 위 형태를 가정한다.
// 색 식별은 colorHex(권장) 또는 colorIndex 중 어느 쪽이든 통과하도록 작성한다.
//
// 새 케이스(color / 높이 확대 / cityBuildingAt / cityIsBlocked)는 구현 전이라
// RED 가 정상이다. 기존 케이스(distToGrid/cityIsOnRoad/결정론/도로비겹침/빈블록)는
// color 필드 추가에 영향받지 않도록 toMatchObject 등으로 완화해 유지한다.
// ══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  BLOCK_SIZE, ROAD_WIDTH_CITY, CELL, BUILDING_PALETTE,
  distToGrid, cityIsOnRoad, buildingAt,
  cityBuildingAt, cityIsBlocked,
} from './city.js';

// 설계 §3 (2): 확대된 높이 범위 (구현 상수와 일치 가정)
const BUILD_MIN_H = 6;
const BUILD_MAX_H = 90;
// 설계 §3: inset = ROAD_WIDTH_CITY/2 + MARGIN(2) = 8 → 최대 평면 = BLOCK_SIZE - 2*inset = 44
const INSET = ROAD_WIDTH_CITY / 2 + 2;
const MAX_FOOTPRINT = BLOCK_SIZE - 2 * INSET;

describe('상수 / 격자', () => {
  it('BLOCK_SIZE=60, ROAD_WIDTH_CITY=12', () => {
    expect(BLOCK_SIZE).toBe(60);
    expect(ROAD_WIDTH_CITY).toBe(12);
  });
  it('CELL = BLOCK_SIZE + ROAD_WIDTH_CITY = 72 (일관)', () => {
    expect(CELL).toBe(72);
    expect(CELL).toBe(BLOCK_SIZE + ROAD_WIDTH_CITY);
  });
});

describe('distToGrid', () => {
  it('격자선(0, CELL, 2*CELL)에서 0', () => {
    expect(distToGrid(0)).toBeCloseTo(0, 9);
    expect(distToGrid(CELL)).toBeCloseTo(0, 9);
    expect(distToGrid(2 * CELL)).toBeCloseTo(0, 9);
  });
  it('블록 중앙(CELL/2)에서 최대(CELL/2)', () => {
    expect(distToGrid(CELL / 2)).toBeCloseTo(CELL / 2, 9);
  });
  it('주기 CELL 내 대칭성 (m 과 CELL-m 동일 거리)', () => {
    for (const m of [3, 10, 25, 30]) {
      expect(distToGrid(m)).toBeCloseTo(distToGrid(CELL - m), 9);
    }
  });
  it('주기성: v 와 v+CELL 동일', () => {
    for (const v of [0, 5, 17.5, 36, 60]) {
      expect(distToGrid(v)).toBeCloseTo(distToGrid(v + CELL), 9);
      expect(distToGrid(v)).toBeCloseTo(distToGrid(v + 3 * CELL), 9);
    }
  });
  it('음수 좌표도 정상(모듈러 보정)', () => {
    expect(distToGrid(-CELL)).toBeCloseTo(0, 9);
    expect(distToGrid(-CELL / 2)).toBeCloseTo(CELL / 2, 9);
    expect(distToGrid(-5)).toBeCloseTo(distToGrid(5), 9);
    // 항상 [0, CELL/2] 범위
    for (let v = -200; v <= 200; v += 7.3) {
      const d = distToGrid(v);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(CELL / 2 + 1e-9);
    }
  });
});

describe('cityIsOnRoad', () => {
  const half = ROAD_WIDTH_CITY / 2; // 6

  it('격자 교차로(0,0) → true', () => {
    expect(cityIsOnRoad(0, 0)).toBe(true);
  });
  it('격자선 위(x=0, z=블록중앙) → true (한 축만 도로여도 true)', () => {
    expect(cityIsOnRoad(0, CELL / 2)).toBe(true);
    expect(cityIsOnRoad(CELL / 2, 0)).toBe(true); // 다른 축 단독도 true
  });
  it('블록 정중앙(CELL/2, CELL/2) → false', () => {
    expect(cityIsOnRoad(CELL / 2, CELL / 2)).toBe(false);
  });
  it('도로 폭 경계 안(half 직전) → true', () => {
    expect(cityIsOnRoad(half - 0.01, CELL / 2)).toBe(true);
    expect(cityIsOnRoad(CELL / 2, half - 0.01)).toBe(true);
  });
  it('도로 폭 경계 밖(half 직후) → false (양 축 모두 도로 밖)', () => {
    expect(cityIsOnRoad(half + 0.01, CELL / 2)).toBe(false);
    expect(cityIsOnRoad(CELL / 2, half + 0.01)).toBe(false);
  });
  it('경계값 정확히 half 는 도로 포함(<=)', () => {
    expect(cityIsOnRoad(half, CELL / 2)).toBe(true);
  });
  it('다른 격자선 인근(x≈CELL, 블록중앙 z)도 true', () => {
    expect(cityIsOnRoad(CELL + half - 0.01, CELL / 2)).toBe(true);
    expect(cityIsOnRoad(-CELL, CELL / 2)).toBe(true); // 음수 격자선
  });
});

describe('buildingAt — 결정론(난수 없음)', () => {
  it('같은 (bx,bz) 2회 호출 시 완전히 동일한 결과(색 포함)', () => {
    for (const [bx, bz] of [[0, 0], [3, -2], [-5, 7], [12, 12]]) {
      const a = buildingAt(bx, bz);
      const b = buildingAt(bx, bz);
      expect(a).toEqual(b);
    }
  });
  it('반환 객체는 기대 키를 가진다', () => {
    const b = buildingAt(1, 1);
    expect(b).toHaveProperty('exists');
    // 존재하는 건물이면 위치/크기/높이 수치가 모두 유한
    if (b.exists) {
      for (const k of ['cx', 'cz', 'w', 'd', 'h']) {
        expect(Number.isFinite(b[k])).toBe(true);
      }
      expect(b.w).toBeGreaterThan(0);
      expect(b.d).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
    }
  });
  it('건물 중심은 해당 블록 셀 내부에 위치', () => {
    for (const [bx, bz] of [[0, 0], [2, 5], [-3, 1]]) {
      const b = buildingAt(bx, bz);
      if (!b.exists) continue;
      // 블록 셀 범위 [bx*CELL, bx*CELL+CELL]
      expect(b.cx).toBeGreaterThanOrEqual(bx * CELL);
      expect(b.cx).toBeLessThanOrEqual(bx * CELL + CELL);
      expect(b.cz).toBeGreaterThanOrEqual(bz * CELL);
      expect(b.cz).toBeLessThanOrEqual(bz * CELL + CELL);
    }
  });
});

describe('도로 비겹침 (핵심) — 건물 AABB 가 도로 폭을 침범하지 않음', () => {
  it('여러 블록 샘플의 건물 AABB 모서리/변이 모두 도로 밖', () => {
    let checked = 0;
    for (let bx = -10; bx <= 10; bx++) {
      for (let bz = -10; bz <= 10; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        checked++;
        const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2;
        const z0 = b.cz - b.d / 2, z1 = b.cz + b.d / 2;
        // AABB 4 모서리는 도로가 아니어야 함
        for (const px of [x0, x1]) {
          for (const pz of [z0, z1]) {
            expect(cityIsOnRoad(px, pz)).toBe(false);
          }
        }
        // 4 변을 촘촘히 샘플링 (도로 폭을 스치지 않는지)
        const N = 12;
        for (let i = 0; i <= N; i++) {
          const tx = x0 + (x1 - x0) * (i / N);
          const tz = z0 + (z1 - z0) * (i / N);
          expect(cityIsOnRoad(tx, z0)).toBe(false); // 아래 변
          expect(cityIsOnRoad(tx, z1)).toBe(false); // 위 변
          expect(cityIsOnRoad(x0, tz)).toBe(false); // 왼 변
          expect(cityIsOnRoad(x1, tz)).toBe(false); // 오른 변
        }
      }
    }
    // 샘플에 실제 건물이 충분히 포함됐는지(테스트 무의미화 방지)
    expect(checked).toBeGreaterThan(0);
  });
});

describe('빈 블록 비율 (합리적 범위)', () => {
  it('0..30 블록 샘플에서 건물 생략 비율이 약 5~20%', () => {
    let total = 0, empty = 0;
    for (let bx = 0; bx <= 30; bx++) {
      for (let bz = 0; bz <= 30; bz++) {
        total++;
        if (!buildingAt(bx, bz).exists) empty++;
      }
    }
    const ratio = empty / total;
    // 설계: e01 < 0.12 면 생략 → 균등분포 가정 시 대략 12% 근방.
    // 해시 분포 편차를 감안해 넉넉히 5~20% 범위로 검증.
    expect(ratio).toBeGreaterThan(0.05);
    expect(ratio).toBeLessThan(0.20);
  });
});

// ── 신규(M12b 보강) ───────────────────────────────────────────────
// 아래 describe 들은 설계 §3 (건물 색 다양화 / 높이 확대 / 건물 충돌)을 검증한다.
// 구현 전이므로 RED 가 정상이다.

// 건물 객체에서 결정론 색 식별자를 뽑는다(colorHex 우선, 없으면 colorIndex).
function colorKeyOf(b) {
  if (b.colorHex !== undefined) return `hex:${b.colorHex}`;
  if (b.colorIndex !== undefined) return `idx:${b.colorIndex}`;
  return undefined;
}

describe('건물 색 — 결정론 / 팔레트 유효성', () => {
  it('BUILDING_PALETTE 는 6색 hex 배열', () => {
    expect(Array.isArray(BUILDING_PALETTE)).toBe(true);
    expect(BUILDING_PALETTE.length).toBe(6);
    for (const c of BUILDING_PALETTE) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('같은 블록은 색이 결정론(2회 호출 동일)', () => {
    for (const [bx, bz] of [[0, 0], [4, 1], [-3, 6], [9, -2]]) {
      const a = buildingAt(bx, bz);
      const b = buildingAt(bx, bz);
      if (!a.exists) continue;
      expect(colorKeyOf(a)).toBe(colorKeyOf(b));
    }
  });

  it('존재 건물의 색은 팔레트 안의 유효 색(colorHex ∈ PALETTE, colorIndex ∈ [0,len))', () => {
    let checked = 0;
    for (let bx = 0; bx <= 10; bx++) {
      for (let bz = 0; bz <= 10; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        checked++;
        if (b.colorHex !== undefined) {
          expect(BUILDING_PALETTE).toContain(b.colorHex);
        }
        if (b.colorIndex !== undefined) {
          expect(b.colorIndex).toBeGreaterThanOrEqual(0);
          expect(b.colorIndex).toBeLessThan(BUILDING_PALETTE.length);
          // colorHex 도 제공된다면 인덱스와 정합
          if (b.colorHex !== undefined) {
            expect(b.colorHex).toBe(BUILDING_PALETTE[b.colorIndex]);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('여러 블록에서 2종 이상(≥3) 색이 실제 등장(다양성)', () => {
    const colors = new Set();
    for (let bx = 0; bx <= 20; bx++) {
      for (let bz = 0; bz <= 20; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        const k = colorKeyOf(b);
        if (k !== undefined) colors.add(k);
      }
    }
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});

describe('건물 높이/크기 범위 (확대된 설계 범위)', () => {
  it('h ∈ [BUILD_MIN_H, BUILD_MAX_H]=[6,90], w·d ∈ (0, MAX_FOOTPRINT]', () => {
    let checked = 0;
    for (let bx = -8; bx <= 8; bx++) {
      for (let bz = -8; bz <= 8; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        checked++;
        expect(b.h).toBeGreaterThanOrEqual(BUILD_MIN_H - 1e-9);
        expect(b.h).toBeLessThanOrEqual(BUILD_MAX_H + 1e-9);
        expect(b.w).toBeGreaterThan(0);
        expect(b.d).toBeGreaterThan(0);
        expect(b.w).toBeLessThanOrEqual(MAX_FOOTPRINT + 1e-9);
        expect(b.d).toBeLessThanOrEqual(MAX_FOOTPRINT + 1e-9);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('높이가 단일값이 아니라 저층~고층이 섞여 등장(편차 존재)', () => {
    const heights = [];
    for (let bx = 0; bx <= 20; bx++) {
      for (let bz = 0; bz <= 20; bz++) {
        const b = buildingAt(bx, bz);
        if (b.exists) heights.push(b.h);
      }
    }
    expect(heights.length).toBeGreaterThan(0);
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    // 저층~고층 혼합이면 max-min 이 충분히 크다(단일 높이 회귀 방지)
    expect(max - min).toBeGreaterThan(10);
  });
});

describe('cityBuildingAt — 건물 AABB 질의', () => {
  it('건물 중심에서 그 건물(또는 truthy) 반환, buildingAt 와 정합', () => {
    let checked = 0;
    for (let bx = -5; bx <= 5; bx++) {
      for (let bz = -5; bz <= 5; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        checked++;
        const got = cityBuildingAt(b.cx, b.cz);
        expect(got).toBeTruthy();
        // 같은 블록 박스 범위와 일치
        expect(got.cx).toBeCloseTo(b.cx, 9);
        expect(got.cz).toBeCloseTo(b.cz, 9);
        expect(got.w).toBeCloseTo(b.w, 9);
        expect(got.d).toBeCloseTo(b.d, 9);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('도로 위(격자 교차로 등 cityIsOnRoad=true) 에서는 null', () => {
    for (const [x, z] of [[0, 0], [CELL, 0], [0, CELL], [CELL, CELL], [2 * CELL, -CELL]]) {
      expect(cityIsOnRoad(x, z)).toBe(true); // 전제 확인
      expect(cityBuildingAt(x, z)).toBeNull();
    }
  });

  it('빈 블록(exists=false)의 중심에서 null', () => {
    let checkedEmpty = 0;
    for (let bx = 0; bx <= 30 && checkedEmpty < 3; bx++) {
      for (let bz = 0; bz <= 30 && checkedEmpty < 3; bz++) {
        const b = buildingAt(bx, bz);
        if (b.exists) continue;
        checkedEmpty++;
        const cx = bx * CELL + CELL / 2;
        const cz = bz * CELL + CELL / 2;
        expect(cityBuildingAt(cx, cz)).toBeNull();
      }
    }
    expect(checkedEmpty).toBeGreaterThan(0);
  });
});

describe('cityIsBlocked — 건물 충돌 판정', () => {
  it('건물 중심은 통과 불가(true)', () => {
    let checked = 0;
    for (let bx = -5; bx <= 5; bx++) {
      for (let bz = -5; bz <= 5; bz++) {
        const b = buildingAt(bx, bz);
        if (!b.exists) continue;
        checked++;
        expect(cityIsBlocked(b.cx, b.cz)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('도로 위는 통과 가능(false) — 도로↔건물 상호 배타', () => {
    for (const [x, z] of [[0, 0], [CELL, 0], [0, CELL], [-CELL, CELL]]) {
      expect(cityIsOnRoad(x, z)).toBe(true);
      expect(cityIsBlocked(x, z)).toBe(false);
    }
  });

  it('빈 블록 중심은 통과 가능(false)', () => {
    let checkedEmpty = 0;
    for (let bx = 0; bx <= 30 && checkedEmpty < 3; bx++) {
      for (let bz = 0; bz <= 30 && checkedEmpty < 3; bz++) {
        const b = buildingAt(bx, bz);
        if (b.exists) continue;
        checkedEmpty++;
        const cx = bx * CELL + CELL / 2;
        const cz = bz * CELL + CELL / 2;
        expect(cityIsBlocked(cx, cz)).toBe(false);
      }
    }
    expect(checkedEmpty).toBeGreaterThan(0);
  });

  it('AABB 경계 안은 true, 바로 밖은 false (경계값)', () => {
    // 첫 번째 존재 건물을 찾아 경계값 검사
    let b = null;
    outer:
    for (let bx = 0; bx <= 20; bx++) {
      for (let bz = 0; bz <= 20; bz++) {
        const cand = buildingAt(bx, bz);
        if (cand.exists) { b = cand; break outer; }
      }
    }
    expect(b).toBeTruthy();
    const hw = b.w / 2, hd = b.d / 2;
    const eps = 1e-4;
    // 경계 바로 안쪽
    expect(cityIsBlocked(b.cx - hw + eps, b.cz)).toBe(true);
    expect(cityIsBlocked(b.cx + hw - eps, b.cz)).toBe(true);
    expect(cityIsBlocked(b.cx, b.cz - hd + eps)).toBe(true);
    expect(cityIsBlocked(b.cx, b.cz + hd - eps)).toBe(true);
    // 경계 바로 바깥
    expect(cityIsBlocked(b.cx + hw + eps, b.cz)).toBe(false);
    expect(cityIsBlocked(b.cx - hw - eps, b.cz)).toBe(false);
    expect(cityIsBlocked(b.cx, b.cz + hd + eps)).toBe(false);
    expect(cityIsBlocked(b.cx, b.cz - hd - eps)).toBe(false);
  });
});
