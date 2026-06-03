// dynamics.js 단위 테스트 (M4)
import { describe, it, expect } from 'vitest';
import {
  RIDE_HEIGHT, ROLL_LIMIT,
  integrateSpeed, yawRate, advance, terrainTiltAt, corneringRoll, isRollover,
  createDynState, stepDynamics,
} from './dynamics.js';

const flat = () => 0; // 평지 mock

describe('integrateSpeed', () => {
  it('구동 가속이 속도를 높인다', () => {
    expect(integrateSpeed(0, 5, 0, 0.1)).toBeGreaterThan(0);
  });
  it('브레이크가 속도를 줄인다', () => {
    expect(integrateSpeed(10, 0, 1, 0.1)).toBeLessThan(10);
  });
  it('입력 없으면 마찰로 감쇠', () => {
    expect(integrateSpeed(10, 0, 0, 0.1)).toBeLessThan(10);
  });
  it('브레이크로 0을 가로지르면 정지(부호 안 바뀜)', () => {
    expect(integrateSpeed(0.5, 0, 1, 0.5)).toBe(0);
  });
});

describe('yawRate', () => {
  it('정지 시 0', () => {
    expect(yawRate(1, 0)).toBe(0);
  });
  it('조향 부호 따라감(전진)', () => {
    expect(yawRate(1, 10)).toBeGreaterThan(0);
    expect(yawRate(-1, 10)).toBeLessThan(0);
  });
  it('후진은 반전', () => {
    expect(yawRate(1, -10)).toBeLessThan(0);
  });
});

describe('advance', () => {
  it('heading 0 → +Z 이동', () => {
    const p = advance({ x: 0, z: 0 }, 0, 10, 0.1);
    expect(p.z).toBeCloseTo(1, 6);
    expect(p.x).toBeCloseTo(0, 6);
  });
  it('heading π/2 → +X 이동', () => {
    const p = advance({ x: 0, z: 0 }, Math.PI / 2, 10, 0.1);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
});

describe('terrainTiltAt', () => {
  it('평지는 pitch/roll 0', () => {
    const t = terrainTiltAt(0, 0, 0, flat);
    expect(t.pitch).toBeCloseTo(0, 6);
    expect(t.roll).toBeCloseTo(0, 6);
  });
  it('+Z로 올라가는 경사 → pitch 부호', () => {
    const up = (x, z) => z * 0.5; // +Z 방향 오르막
    const t = terrainTiltAt(0, 0, 0, up);
    expect(Math.abs(t.pitch)).toBeGreaterThan(0.1);
  });
});

describe('corneringRoll', () => {
  it('조향 반대 부호, 속도 클수록 큼', () => {
    const a = corneringRoll(1, 10);
    const b = corneringRoll(1, 20);
    expect(Math.abs(b)).toBeGreaterThan(Math.abs(a));
    expect(Math.sign(a)).toBe(-1);
  });
});

describe('isRollover', () => {
  it('임계 초과 시 true', () => {
    expect(isRollover(ROLL_LIMIT + 0.1, 0)).toBe(true);
    expect(isRollover(0, ROLL_LIMIT + 0.1)).toBe(true);
    expect(isRollover(0.1, 0.1)).toBe(false);
  });
});

describe('stepDynamics', () => {
  it('평지에서 전진하고 y는 지형+RIDE_HEIGHT', () => {
    let s = createDynState({ x: 0, y: 0, z: 0, heading: 0 });
    for (let i = 0; i < 30; i++) {
      s = stepDynamics(s, { engineAccel: 4, brake: 0, steer: 0 }, 0.05, flat);
    }
    expect(s.speed).toBeGreaterThan(0);
    expect(s.z).toBeGreaterThan(0);
    expect(s.y).toBeCloseTo(RIDE_HEIGHT, 6);
    expect(s.rollover).toBe(false);
  });
});
