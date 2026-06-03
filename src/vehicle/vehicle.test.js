// vehicle.js 통합 상태기계 단위 테스트 (M4)
import { describe, it, expect } from 'vitest';
import { createVehicle, stepVehicle } from './vehicle.js';

const flat = () => 0;
const NEUTRAL = { throttle: 0, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false };

describe('createVehicle', () => {
  it('초기엔 중립·엔진 꺼짐', () => {
    const v = createVehicle({ x: 0, z: 0 });
    expect(v.gear).toBe(0);
    expect(v.engine.on).toBe(false);
  });
});

describe('시동', () => {
  it('중립에서 ignition으로 시동', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);
    expect(v.on).toBe(true);
    expect(v.rpm).toBeGreaterThan(0);
  });
});

describe('변속 (클러치 필요)', () => {
  it('클러치를 밟고(shiftPedal=1) shift +1 → N→1', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat);
    expect(v.gear).toBe(1);
    expect(v.gearName).toBe('1');
  });
  it('클러치 밟고 shift -1 → N→R', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: -1 }, 0.05, flat);
    expect(v.gear).toBe(-1);
    expect(v.gearName).toBe('R');
  });
  it('클러치를 안 밟으면(clutchPedal=0) 변속되지 않는다', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 0, shift: 1 }, 0.05, flat);
    expect(v.gear).toBe(0); // 중립 유지
  });
});

describe('출발 — 반클러치 + throttle', () => {
  it('1단 반클러치로 전진 가속, 엔진 유지', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);          // 시동
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat); // 클러치 밟고 1단
    for (let i = 0; i < 40; i++) {
      v = stepVehicle(v, { throttle: 0.8, brake: 0, clutchPedal: 0.6, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.on).toBe(true);
    expect(v.stalled).toBe(false);
    expect(v.speed).toBeGreaterThan(0);
    expect(v.dyn.z).toBeGreaterThan(0);
  });
});

describe('시동 꺼짐', () => {
  it('정지 상태에서 클러치 완전히 떼고(덤프) throttle 없이 → stall', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat); // 클러치 밟고 1단
    let stalledOnce = false;
    for (let i = 0; i < 10; i++) {
      v = stepVehicle(v, { throttle: 0, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.1, flat);
      if (v.justStalled) stalledOnce = true;
    }
    expect(v.on).toBe(false);
    expect(stalledOnce).toBe(true);
  });
});

describe('전복', () => {
  it('급경사 지형에서 rollover 플래그', () => {
    const steep = (x) => x * 5; // 가파른 측면 경사
    let v = createVehicle({ x: 0, z: 0 });
    v = stepVehicle(v, NEUTRAL, 0.05, steep);
    expect(v.rollover).toBe(true);
  });
});
