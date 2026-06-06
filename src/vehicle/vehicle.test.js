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

// ──────────────────────────────────────────────────────────────
// M10 — 후진(R) 기어 W/S 입력 반전
// 후진에서는 S=악셀(후진 구동), W=브레이크(감속).
// 전진(1~5)·중립(N)은 현행 동작 유지(회귀).
// ──────────────────────────────────────────────────────────────

// 시동 켜고 R 기어(N→R)로 만든 차량 반환
function reverseEngaged() {
  let v = createVehicle();
  v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);          // 시동
  v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: -1 }, 0.05, flat); // N→R
  return v;
}

// 시동 켜고 1단(N→1)으로 만든 차량 반환
function firstGearEngaged() {
  let v = createVehicle();
  v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);          // 시동
  v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat); // N→1
  return v;
}

describe('후진 W/S 반전 (M10)', () => {
  it('R + S = 후진 가속 (speed < 0)', () => {
    let v = reverseEngaged();
    expect(v.gearName).toBe('R');
    for (let i = 0; i < 30; i++) {
      v = stepVehicle(v, { throttle: 0, brake: 1, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.on).toBe(true);
    expect(v.speed).toBeLessThan(0); // 후진 = 음수 속도
  });

  it('R + W = 감속/정지 (후진 중 절댓값 감소, 0 근처 수렴)', () => {
    let v = reverseEngaged();
    // 먼저 R+S로 후진시켜 speed<0 만든다
    for (let i = 0; i < 30; i++) {
      v = stepVehicle(v, { throttle: 0, brake: 1, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    const reverseSpeed = v.speed;
    expect(reverseSpeed).toBeLessThan(0);

    // 이제 R+W(브레이크)로 0을 향해 감속
    for (let i = 0; i < 30; i++) {
      v = stepVehicle(v, { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.speed).toBeGreaterThan(reverseSpeed); // 절댓값 감소(음수가 0쪽으로)
    expect(Math.abs(v.speed)).toBeLessThan(Math.abs(reverseSpeed));
    expect(v.speed).toBeLessThanOrEqual(0);   // 전진으로 넘어가지 않음
    expect(v.speed).toBeGreaterThan(-0.5);    // 0 근처 수렴
  });

  it('R + W 단독(정지에서)은 전진하지 않는다 (speed 0 유지)', () => {
    let v = reverseEngaged();
    expect(v.speed).toBe(0);
    for (let i = 0; i < 30; i++) {
      v = stepVehicle(v, { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.speed).toBeLessThanOrEqual(0); // 양수(전진)가 되면 안 됨
    expect(Math.abs(v.speed)).toBeLessThan(1e-6); // 정지 유지
  });

  it('R + S 단독(정지에서)은 후진으로 출발한다 (speed 음수)', () => {
    let v = reverseEngaged();
    expect(v.speed).toBe(0);
    for (let i = 0; i < 20; i++) {
      v = stepVehicle(v, { throttle: 0, brake: 1, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.speed).toBeLessThan(0);
  });

  it('회귀 — 전진 기어(1단)는 W=악셀로 전진(불변)', () => {
    let v = firstGearEngaged();
    expect(v.gearName).toBe('1');
    for (let i = 0; i < 40; i++) {
      v = stepVehicle(v, { throttle: 1, brake: 0, clutchPedal: 0.6, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.on).toBe(true);
    expect(v.speed).toBeGreaterThan(0); // 전진
  });

  it('회귀 — 중립(N)은 어떤 입력이든 구동 없음', () => {
    let v = createVehicle();
    v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat); // 시동(N 유지)
    expect(v.gearName).toBe('N');
    for (let i = 0; i < 30; i++) {
      v = stepVehicle(v, { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(Math.abs(v.speed)).toBeLessThan(1e-6); // 구동 없음 → 정지
  });
});
