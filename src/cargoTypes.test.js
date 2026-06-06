// ══════════════════════════════════════════════════════════════
// cargoTypes.test.js — 화물 종류 데이터 + 결정론 선택 (M17a, TDD RED)
//
// 구현(src/cargoTypes.js)은 아직 없다. 설계노트
//   mds/design/m17-mission-variety.md §1 (화물 종류 데이터)·§6.1 (테스트 설계)
// 의 스펙을 근거로 아래 export 시그니처를 **가정**한다. 구현 에이전트는 이 시그니처에 맞춘다.
//
// ── 가정한 export 시그니처 (m17-mission-variety.md §1.1·§1.2) ──────
//   src/cargoTypes.js:
//     CARGO_TYPES                     // 배열, 5종. 각 { id, label, icon, color, baseRate }
//     cargoIndexFor(pickup, dropoff)  // → 0..CARGO_TYPES.length-1 정수 (좌표 해시, 결정론)
//     cargoFor(pickup, dropoff)       // → CARGO_TYPES[cargoIndexFor(...)] 객체 (결정론)
//     cargoById(id)                   // → 해당 객체 | null (없으면 null)
//
// 모두 구현 전이므로 RED 가 정상이다.
// ══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  CARGO_TYPES,
  cargoIndexFor,
  cargoFor,
  cargoById,
} from './cargoTypes.js';

describe('CARGO_TYPES — 데이터 유효성', () => {
  it('배열이며 5종(설계 §1.1)', () => {
    expect(Array.isArray(CARGO_TYPES)).toBe(true);
    expect(CARGO_TYPES.length).toBe(5);
  });

  it('각 항목이 { id, label, icon, color, baseRate } 필수 필드를 갖고 타입이 맞음', () => {
    for (const c of CARGO_TYPES) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.icon).toBe('string');
      expect(c.icon.length).toBeGreaterThan(0);
      // color 는 hex 숫자 (0x000000 ~ 0xFFFFFF)
      expect(typeof c.color).toBe('number');
      expect(Number.isInteger(c.color)).toBe(true);
      expect(c.color).toBeGreaterThanOrEqual(0x000000);
      expect(c.color).toBeLessThanOrEqual(0xffffff);
      // baseRate 는 양수
      expect(typeof c.baseRate).toBe('number');
      expect(c.baseRate).toBeGreaterThan(0);
    }
  });

  it('id 는 유일', () => {
    const ids = CARGO_TYPES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cargoIndexFor — 항상 유효 인덱스(정수, 결정론)', () => {
  // 음수/소수 좌표 등 다양한 입력에서도 0..len-1 정수가 나와야 함(음수 모듈러 가드)
  const samples = [
    [{ x: 0, z: 0 }, { x: 10, z: 10 }],
    [{ x: -50, z: -50 }, { x: -10, z: 30 }],
    [{ x: 123, z: -456 }, { x: -789, z: 12 }],
    [{ x: 7.5, z: -3.2 }, { x: 0.1, z: 99.9 }],
  ];

  it('모든 입력에서 0..CARGO_TYPES.length-1 정수', () => {
    for (const [p, d] of samples) {
      const idx = cargoIndexFor(p, d);
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(CARGO_TYPES.length);
    }
  });

  it('결정론: 같은 입력 → 같은 인덱스', () => {
    for (const [p, d] of samples) {
      expect(cargoIndexFor(p, d)).toBe(cargoIndexFor(p, d));
    }
  });
});

describe('cargoFor — 결정론 선택 + 분산', () => {
  it('같은 입력 → 같은 종류(동일 id)', () => {
    const p = { x: 12, z: 34 };
    const d = { x: 56, z: 78 };
    expect(cargoFor(p, d).id).toBe(cargoFor(p, d).id);
  });

  it('반환 객체는 CARGO_TYPES 중 하나', () => {
    const c = cargoFor({ x: 1, z: 2 }, { x: 3, z: 4 });
    expect(CARGO_TYPES).toContain(c);
  });

  it('여러 입력에서 2종 이상으로 분산(한 종류로 쏠리지 않음, 설계 §6.1)', () => {
    // 정수 격자 위 점들로 다양한 pickup/dropoff 조합 생성
    const ids = new Set();
    for (let px = 0; px < 6; px++) {
      for (let pz = 0; pz < 6; pz++) {
        ids.add(cargoFor({ x: px * 10, z: pz * 10 }, { x: pz * 17, z: px * 23 }).id);
      }
    }
    // 설계 §6.1: 샘플 점들로 ≥3종 등장 검증
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});

describe('cargoById — id 조회', () => {
  it('존재하는 id 는 해당 객체 반환', () => {
    const first = CARGO_TYPES[0];
    expect(cargoById(first.id)).toBe(first);
  });

  it('없는 id → null', () => {
    expect(cargoById('__no_such_cargo__')).toBeNull();
  });
});
