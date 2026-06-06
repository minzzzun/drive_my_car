// ══════════════════════════════════════════════════════════════
// cargoTypes.js — 화물 종류 데이터 + 결정론 선택 (M17a, 순수·THREE 비의존)
//
// carTypes.js 와 동일 스타일. 좌표 해시로 화물 종류를 결정론적으로 고른다.
//   설계: mds/design/m17-mission-variety.md §1
// ══════════════════════════════════════════════════════════════

// CARGO_TYPES — 종류별 메타. color 는 carMesh 화물 박스/HUD 색에 그대로 쓰는 hex 숫자.
//   baseRate = 운임 계수(₩/m 환산용) — 까다로운 화물일수록 높다(보상↑).
export const CARGO_TYPES = [
  { id: 'furniture', label: '가구',        icon: '🛋️', color: 0x8d6e63, baseRate: 12 },
  { id: 'grocery',   label: '식료품',      icon: '🥬', color: 0x66bb6a, baseRate: 9  },
  { id: 'material',  label: '건축자재',    icon: '🧱', color: 0xb0703a, baseRate: 15 },
  { id: 'autoparts', label: '자동차부품',  icon: '⚙️', color: 0x90a4ae, baseRate: 18 },
  { id: 'cold',      label: '냉장(콜드체인)', icon: '🧊', color: 0x4fc3f7, baseRate: 22 },
];

// 좌표 해시 → 0..len-1 정수(결정론). 음수/소수 좌표도 양수 모듈러로 가드.
export function cargoIndexFor(pickup, dropoff) {
  const h = Math.round(pickup.x * 7 + pickup.z * 13 + dropoff.x * 17 + dropoff.z * 23);
  return ((h % CARGO_TYPES.length) + CARGO_TYPES.length) % CARGO_TYPES.length;
}

// pickup/dropoff 좌표로 화물 종류 1개 선택(결정론).
export function cargoFor(pickup, dropoff) {
  return CARGO_TYPES[cargoIndexFor(pickup, dropoff)];
}

// id 로 화물 종류 조회 — 없으면 null.
export function cargoById(id) {
  return CARGO_TYPES.find((c) => c.id === id) ?? null;
}
