// engine.js 단위 테스트 (M3)
import { describe, it, expect } from 'vitest';
import {
  IDLE_RPM, STALL_RPM, MAX_RPM,
  createEngineState, startEngine, stepEngine,
} from './engine.js';

// 여러 스텝 진행 헬퍼
function run(state, inputs, dt, steps) {
  let s = { ...state };
  let last;
  for (let i = 0; i < steps; i++) {
    last = stepEngine(s, inputs, dt);
    s = { rpm: last.rpm, on: last.on, stalled: last.stalled };
  }
  return last;
}

describe('createEngineState', () => {
  it('초기엔 꺼져있고 rpm 0', () => {
    const s = createEngineState();
    expect(s.on).toBe(false);
    expect(s.rpm).toBe(0);
  });
});

describe('startEngine', () => {
  it('중립이면 시동 성공', () => {
    const s = startEngine(createEngineState(), { clutchEngagement: 1, inGear: false });
    expect(s.on).toBe(true);
    expect(s.rpm).toBeCloseTo(IDLE_RPM, 6);
  });
  it('클러치 밟으면(분리) 기어 들어가도 시동 성공', () => {
    const s = startEngine(createEngineState(), { clutchEngagement: 0, inGear: true });
    expect(s.on).toBe(true);
  });
  it('기어 든 채 클러치 결합 상태면 시동 실패', () => {
    const s = startEngine(createEngineState(), { clutchEngagement: 1, inGear: true });
    expect(s.on).toBe(false);
  });
});

describe('stepEngine — 공회전/레브', () => {
  it('중립 공회전은 idle 유지', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 1, inGear: false });
    const r = run(on, { throttle: 0, clutchEngagement: 0, coupledRpm: 0, inGear: false }, 0.05, 40);
    expect(r.on).toBe(true);
    expect(r.rpm).toBeCloseTo(IDLE_RPM, 0);
  });
  it('무부하(분리) throttle 주면 RPM 상승', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 1, inGear: false });
    const r = run(on, { throttle: 1, clutchEngagement: 0, coupledRpm: 0, inGear: false }, 0.05, 40);
    expect(r.rpm).toBeGreaterThan(IDLE_RPM + 1000);
    expect(r.on).toBe(true);
  });
  it('레드라인을 넘지 않음', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 1, inGear: false });
    const r = run(on, { throttle: 1, clutchEngagement: 0, coupledRpm: 0, inGear: false }, 0.05, 200);
    expect(r.rpm).toBeLessThanOrEqual(MAX_RPM + 1e-6);
  });
});

describe('stepEngine — 시동 꺼짐(stall)', () => {
  it('정지 상태에서 클러치 급결합(덤프) → stall', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 0, inGear: true });
    // 1단 들어간 채, 속도 0(coupledRpm 0), 클러치 완전 결합, throttle 없음
    const r = run(on, { throttle: 0, clutchEngagement: 1, coupledRpm: 0, inGear: true }, 0.1, 5);
    expect(r.on).toBe(false);
    expect(r.stalled).toBe(true);
  });
  it('반클러치 + throttle 로 출발하면 stall 안 남', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 0, inGear: true });
    // 부분 결합(0.4) + throttle, 속도가 서서히 붙는 상황(coupledRpm 점증)
    let s = { ...on };
    let last;
    for (let i = 0; i < 20; i++) {
      const coupledRpm = i * 60; // 속도 상승에 따른 결합 RPM 증가
      last = stepEngine(s, { throttle: 0.6, clutchEngagement: 0.4, coupledRpm, inGear: true }, 0.05);
      s = { rpm: last.rpm, on: last.on, stalled: last.stalled };
    }
    expect(last.on).toBe(true);
    expect(last.stalled).toBe(false);
  });
  it('stall 후에는 재시동 전까지 꺼진 채 유지', () => {
    const on = startEngine(createEngineState(), { clutchEngagement: 0, inGear: true });
    const stalled = run(on, { throttle: 0, clutchEngagement: 1, coupledRpm: 0, inGear: true }, 0.1, 5);
    expect(stalled.on).toBe(false);
    // 시동 꺼진 상태로 계속 step → 켜지지 않음
    const still = run({ rpm: 0, on: false, stalled: true }, { throttle: 1, clutchEngagement: 0, coupledRpm: 0, inGear: false }, 0.05, 20);
    expect(still.on).toBe(false);
  });
  it('STALL_RPM은 IDLE_RPM보다 낮다', () => {
    expect(STALL_RPM).toBeLessThan(IDLE_RPM);
  });
});
