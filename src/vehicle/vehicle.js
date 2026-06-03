// ══════════════════════════════════════════════════════════════
// vehicle.js — engine + gearbox + dynamics 조합 상태기계 (순수 로직)
// stepVehicle(v, controls, dt, sampleHeight) → 새 차량 상태
// ══════════════════════════════════════════════════════════════
import { createEngineState, startEngine, stepEngine } from './engine.js';
import {
  shiftUp, shiftDown, totalRatio, engineRpmFromSpeed, gearName,
} from './gearbox.js';
import { createDynState, stepDynamics } from './dynamics.js';

export const ACCEL_BASE = 6;   // 1단 풀스로틀·완전결합 기준 구동 가속(m/s²)

export function createVehicle(spawn = {}) {
  return {
    engine: createEngineState(),
    gear: 0,
    dyn: createDynState(spawn),
  };
}

// controls = {throttle, brake, clutchPedal, steer, shift(+1/-1/0), ignition}
export function stepVehicle(v, controls, dt, sampleHeight) {
  const { throttle, brake, clutchPedal, steer, shift, ignition } = controls;
  const engagement = 1 - clutchPedal;  // 1=완전 결합(페달 뗌)

  // 변속 (한 스텝 1회 요청) ─────────────────────────────────────
  let gear = v.gear;
  if (shift > 0) gear = shiftUp(gear);
  else if (shift < 0) gear = shiftDown(gear);

  const inGear = gear !== 0;

  // 시동 ────────────────────────────────────────────────────────
  let engineState = v.engine;
  if (ignition && !engineState.on) {
    engineState = startEngine(engineState, { clutchEngagement: engagement, inGear });
  }

  // 엔진 스텝 (바퀴 결합 RPM) ───────────────────────────────────
  const coupledRpm = engineRpmFromSpeed(v.dyn.speed, gear);
  const eng = stepEngine(engineState, { throttle, clutchEngagement: engagement, coupledRpm, inGear }, dt);

  // 구동 가속 ───────────────────────────────────────────────────
  let engineAccel = 0;
  if (eng.on && inGear && engagement > 0) {
    const dir = gear < 0 ? -1 : 1;
    engineAccel = dir * throttle * ACCEL_BASE * (totalRatio(gear) / totalRatio(1)) * engagement;
  }

  // 동역학 스텝 ─────────────────────────────────────────────────
  const dyn = stepDynamics(v.dyn, { engineAccel, brake, steer }, dt, sampleHeight);

  return {
    engine: { rpm: eng.rpm, on: eng.on, stalled: eng.stalled },
    gear,
    dyn,
    // 파생 상태(HUD/채점용)
    rpm: eng.rpm,
    on: eng.on,
    stalled: eng.stalled,
    justStalled: eng.justStalled,
    rollover: dyn.rollover,
    speed: dyn.speed,
    gearName: gearName(gear),
  };
}
