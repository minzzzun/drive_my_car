// ══════════════════════════════════════════════════════════════
// maps/city.js — 도시 맵 순수 로직 (Three.js 비의존)
// 격자 도로망 좌표 수학 + 결정론 건물 배치(좌표 해시).
// cityMap.js 가 본 모듈을 소비해 메시를 생성한다
// (terrain ↔ render/road 관계와 동형).
// ══════════════════════════════════════════════════════════════
import { rand2D } from '../terrain.js';

// 상수 ───────────────────────────────────────────────────────────
export const BLOCK_SIZE      = 60;                          // 블록(건물 부지) 한 변
export const ROAD_WIDTH_CITY = 12;                          // 도시 도로 폭
export const CELL            = BLOCK_SIZE + ROAD_WIDTH_CITY; // = 72, 격자 주기

// 건물 높이 범위 (확대: 저층 상가 ~ 고층 빌딩) ───────────────────
const BUILD_MIN_H = 6;
const BUILD_MAX_H = 90;

// 도로를 절대 침범하지 않게 블록 안쪽으로 들이는 여백
const MARGIN = 2;
const INSET  = ROAD_WIDTH_CITY / 2 + MARGIN;  // = 8 (> half=6 이므로 도로 비겹침 보장)

// 빈 블록(공터/광장) 비율 임계
const EMPTY_THRESHOLD = 0.12;

// 도시 건물 팔레트 — 콘크리트 회색조 2 + 베이지/석재 + 벽돌 + 청회색 유리톤 + 올리브
export const BUILDING_PALETTE = [
  0x9aa0a6, // 콘크리트 밝은 회색
  0x6f757c, // 콘크리트 짙은 회색
  0xb7a890, // 베이지/석재
  0x9c5f4e, // 벽돌(테라코타)
  0x5f7c8a, // 청회색 유리톤
  0x7d8a73, // 옅은 올리브(저층 외벽)
];

// 바닥/도로 색 구분 — 비도로(블록 바닥/인도) vs 도로(아스팔트)
export const GROUND_COLOR = 0x8d9199; // 비도로 — 밝은 콘크리트
export const ROAD_COLOR   = 0x32353b; // 도로 — 짙은 아스팔트

// 가장 가까운 격자선(k*CELL)까지의 거리 [0, CELL/2] (음수/주기 보정) ──
export function distToGrid(v) {
  const m = ((v % CELL) + CELL) % CELL;  // [0, CELL)
  return Math.min(m, CELL - m);          // 가장 가까운 격자선까지
}

// 도로 판정 — 한 축이라도 격자선 폭 절반 이내면 도로(교차로 포함) ──
export function cityIsOnRoad(x, z) {
  const half = ROAD_WIDTH_CITY / 2;
  return distToGrid(x) <= half || distToGrid(z) <= half;
}

// 블록 (bx,bz) 의 건물 정보 — 결정론(난수 없음, 좌표 해시) ──────────
//   → { exists, cx, cz, w, d, h, colorHex, colorIndex }
export function buildingAt(bx, bz) {
  // 빈 블록 여부
  const e01 = rand2D(bx * 0.7 + 1, bz * 3.1 + 5);
  if (e01 < EMPTY_THRESHOLD) {
    return { exists: false, cx: 0, cz: 0, w: 0, d: 0, h: 0, colorHex: 0, colorIndex: -1 };
  }

  // 블록 중심(셀 중앙) — 건물은 블록 중앙에 정렬
  const cx = bx * CELL + CELL / 2;
  const cz = bz * CELL + CELL / 2;

  // 건물이 들어갈 수 있는 최대 평면 크기(도로 비겹침 보장)
  const maxFootprint = BLOCK_SIZE - 2 * INSET;  // = 44

  // 평면 크기: 최대치의 45~100% (가로/세로 각각 다른 해시 → 정사각~직사각 혼합)
  const sW = rand2D(bx * 2.3 + 7, bz * 1.7 + 3);
  const sD = rand2D(bx * 1.1 + 4, bz * 2.9 + 9);
  const w = maxFootprint * (0.45 + sW * 0.55);
  const d = maxFootprint * (0.45 + sD * 0.55);

  // 높이 — 저층대 다수 / 고층대 소수로 스카이라인 변주
  const t01 = rand2D(bx * 0.9 + 13, bz * 2.1 + 6);
  const h01 = rand2D(bx * 1.0, bz * 1.0);
  let h;
  if (t01 < 0.7) {
    // 저층대 [BUILD_MIN_H, 30]
    h = BUILD_MIN_H + h01 * (30 - BUILD_MIN_H);
  } else {
    // 고층대 [30, BUILD_MAX_H]
    h = 30 + h01 * (BUILD_MAX_H - 30);
  }

  // 색 — 색 전용 해시로 팔레트 인덱스 결정론 선택(높이/크기와 독립 시드)
  const c01 = rand2D(bx * 5.2 + 11, bz * 3.7 + 2);
  const colorIndex = Math.floor(c01 * BUILDING_PALETTE.length) % BUILDING_PALETTE.length;
  const colorHex = BUILDING_PALETTE[colorIndex];

  return { exists: true, cx, cz, w, d, h, colorHex, colorIndex };
}

// 좌표를 포함하는 건물 — 자기 블록 1개만 AABB 검사 (없으면 null) ─────
//   건물은 블록 중앙 정렬 + 도로 inset 안쪽이라 한 좌표가 들어갈
//   건물은 자기 블록의 건물뿐 → 인접 블록 순회 불필요.
export function cityBuildingAt(x, z) {
  const bx = Math.floor(x / CELL), bz = Math.floor(z / CELL);
  const b = buildingAt(bx, bz);
  if (!b.exists) return null;
  const hw = b.w / 2, hd = b.d / 2;
  if (x >= b.cx - hw && x <= b.cx + hw && z >= b.cz - hd && z <= b.cz + hd) {
    return b;  // { exists, cx, cz, w, d, h, colorHex, colorIndex }
  }
  return null;
}

// 통과 불가(고체) 판정 — 건물 AABB 내부면 true ────────────────────
export function cityIsBlocked(x, z) {
  return cityBuildingAt(x, z) !== null;
}
