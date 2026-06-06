// ══════════════════════════════════════════════════════════════
// heading.test.js — 목표 방향 상대각(순수 함수) 단위 테스트 (M19a, TDD RED)
//
// 설계: mds/design/m19-arrow-lights.md §"순수 함수 — 화면 상대 방향각".
//
// 좌표계 규약(dynamics.js 와 동일): +Z=전진, +X=우.
//   - 차량 전방 벡터 = (sin heading, 0, cos heading) (dynamics.advance / carMesh)
//   - 월드 목표 방향각 = atan2(dx, dz)  (dx=target.x-car.x, dz=target.z-car.z)
//       → heading 과 동일한 0=+Z, +=+X(우) 기준.
//   - 상대각 = normalizeAngle(worldAngle - car.heading), 범위 (-π, π].
//       0=정면, +π/2=우측, -π/2=좌측, ±π=후방.
//
// 기대 시그니처(설계 가정):
//   - bearingToTarget(car, target): car={x,z,heading}, target={x,z} → 상대각(rad)
//   - normalizeAngle(a): (-π, π] 로 정규화한 각.
// ══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { bearingToTarget, normalizeAngle } from './heading.js';

const HALF_PI = Math.PI / 2;

describe('bearingToTarget', () => {
  it('정면(차 heading=0, 목표가 +Z 전방) → 상대각 ≈ 0', () => {
    const car = { x: 0, z: 0, heading: 0 };
    const target = { x: 0, z: 10 }; // +Z = 전방
    expect(bearingToTarget(car, target)).toBeCloseTo(0, 6);
  });

  it('우측(heading=0, 목표가 +X) → +π/2 근처', () => {
    const car = { x: 0, z: 0, heading: 0 };
    const target = { x: 10, z: 0 }; // +X = 우측
    expect(bearingToTarget(car, target)).toBeCloseTo(HALF_PI, 6);
  });

  it('좌측(heading=0, 목표가 -X) → -π/2 근처', () => {
    const car = { x: 0, z: 0, heading: 0 };
    const target = { x: -10, z: 0 }; // -X = 좌측
    expect(bearingToTarget(car, target)).toBeCloseTo(-HALF_PI, 6);
  });

  it('후방(heading=0, 목표가 -Z) → ±π 근처', () => {
    const car = { x: 0, z: 0, heading: 0 };
    const target = { x: 0, z: -10 }; // -Z = 후방
    expect(Math.abs(bearingToTarget(car, target))).toBeCloseTo(Math.PI, 6);
  });

  it('heading=π/2 (전방이 +X 향함)일 때 목표 +X → 상대각 ≈ 0 (정면)', () => {
    // 전방 벡터 = (sin(π/2), 0, cos(π/2)) = (1,0,0) = +X
    const car = { x: 0, z: 0, heading: HALF_PI };
    const target = { x: 10, z: 0 };
    expect(bearingToTarget(car, target)).toBeCloseTo(0, 6);
  });

  it('heading 을 회전시켜도 같은 목표 방향이면 상대각이 일관된다', () => {
    // 차를 heading 만큼 회전 + 목표도 같은 각만큼 돌리면 상대각은 불변.
    // 기준: heading=0, 목표 +X(우측) → +π/2.
    const base = bearingToTarget({ x: 0, z: 0, heading: 0 }, { x: 10, z: 0 });
    for (const h of [0.3, 1.0, -1.2, 2.5, -2.9]) {
      // 목표를 월드각 h 만큼 회전한 위치(반지름 10): atan2(dx,dz)=h 가 되도록.
      const target = { x: 10 * Math.sin(h), z: 10 * Math.cos(h) };
      const rel = bearingToTarget({ x: 0, z: 0, heading: h }, target);
      // h 방향을 정면으로 보는 차 → 그 방향 목표는 정면(0).
      expect(rel).toBeCloseTo(0, 6);
      // base 와 무관히 항상 0(정면)으로 정렬됨을 함께 확인.
      expect(Math.abs(rel)).toBeLessThan(1e-6);
    }
    // base 자체는 우측(+π/2) 임을 확인(규약 고정).
    expect(base).toBeCloseTo(HALF_PI, 6);
  });

  it('heading 이 비0일 때 상대각 = worldAngle - heading (정규화) 규약을 따른다', () => {
    // 목표 +X(worldAngle=π/2), heading=π/2 → 상대 0 은 위에서 확인.
    // 여기선 목표 +Z(worldAngle=0), heading=π/2 → 상대 = -π/2 (좌측).
    const rel = bearingToTarget({ x: 0, z: 0, heading: HALF_PI }, { x: 0, z: 10 });
    expect(rel).toBeCloseTo(-HALF_PI, 6);
  });

  it('반환값은 항상 (-π, π] 범위 안이다', () => {
    const car = { x: 0, z: 0, heading: -3.0 };
    for (const [tx, tz] of [[5, 5], [-5, 5], [5, -5], [-5, -5], [0, -7]]) {
      const r = bearingToTarget(car, { x: tx, z: tz });
      expect(r).toBeGreaterThan(-Math.PI - 1e-9);
      expect(r).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe('normalizeAngle', () => {
  it('이미 범위 안인 값은 그대로 둔다', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0, 9);
    expect(normalizeAngle(1.0)).toBeCloseTo(1.0, 9);
    expect(normalizeAngle(-1.0)).toBeCloseTo(-1.0, 9);
  });

  it('π 초과는 -2π 만큼 접힌다', () => {
    expect(normalizeAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 9);
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 9);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  it('-π 이하는 +2π 만큼 접힌다', () => {
    expect(normalizeAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 9);
    expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 9);
  });

  it('+π 경계는 +π 로 유지(범위 (-π, π])', () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  it('-π 경계는 +π 로 접힌다(반열림 구간이라 -π 제외)', () => {
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  it('항상 (-π, π] 범위를 반환한다(여러 입력)', () => {
    for (const a of [10, -10, 7.3, -7.3, 100, -100, 0.0001]) {
      const r = normalizeAngle(a);
      expect(r).toBeGreaterThan(-Math.PI - 1e-9);
      expect(r).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});
