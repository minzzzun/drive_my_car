// ══════════════════════════════════════════════════════════════
// vehicle.js — engine + gearbox + dynamics 조합 상태기계 (순수 로직)
// stepVehicle(v, controls, dt, sampleHeight) → 새 차량 상태
// ══════════════════════════════════════════════════════════════
import { createEngineState, startEngine, stepEngine, MAX_RPM } from './engine.js';
import {
  shiftUp, shiftDown, totalRatio, engineRpmFromSpeed, speedFromEngineRpm, gearName,
} from './gearbox.js';
import {
  createDynState, stepDynamics,
  ROLLING_RESIST, BRAKE_DECEL, MAX_STEER_RATE, TURN_FULL_SPEED, CORNER_ROLL_K,
} from './dynamics.js';

// 구동력(토크감) 기준. 저단일수록 토크가 커 가속이 빠르다.
export const ACCEL_BASE = 9;   // 풀스로틀·완전결합 기준 구동 가속(m/s²)
export const CLUTCH_SHIFT_MAX = 0.2;  // 변속 허용: 클러치 결합도 이 이하(=충분히 밟음)일 때만

// 차종 미지정 시 사용하는 현행 상수 묶음(회귀 0의 핵심). perf 7키를 현 모듈 상수로 구성.
export const LEGACY_CAR = {
  accelBase: ACCEL_BASE,
  gearTopFactor: 1,
  rollingResist: ROLLING_RESIST,
  brakeDecel: BRAKE_DECEL,
  maxSteerRate: MAX_STEER_RATE,
  turnFullSpeed: TURN_FULL_SPEED,
  cornerRollK: CORNER_ROLL_K,
};

// carParams 미지정 시 LEGACY_CAR(현 상수) → 인자 없이 호출하면 현행과 동일하게 동작.
export function createVehicle(spawn = {}, carParams = LEGACY_CAR) {
  return {
    engine: createEngineState(),
    gear: 0,
    dyn: createDynState(spawn),
    car: carParams,
  };
}

// controls = {throttle, brake, clutchPedal, steer, shift(+1/-1/0), ignition}
export function stepVehicle(v, controls, dt, sampleHeight) {
  const car = v.car ?? LEGACY_CAR;  // 구(舊) 상태 객체(car 없음) 호환
  const { throttle, brake, clutchPedal, steer, shift, ignition } = controls;
  const engagement = 1 - clutchPedal;  // 1=완전 결합(페달 뗌), 0=완전 분리(클러치 밟음)

  // 변속 (한 스텝 1회 요청) — 클러치를 충분히 밟았을 때만 가능 ──────
  let gear = v.gear;
  const clutchIn = engagement <= CLUTCH_SHIFT_MAX;  // 클러치 밟힘
  if (clutchIn) {
    if (shift > 0) gear = shiftUp(gear);
    else if (shift < 0) gear = shiftDown(gear);
  }

  const inGear = gear !== 0;

  // 후진 기어에서는 W/S(throttle/brake) 의미를 뒤집는다.
  // gear === -1 → 악셀(S)로 후진 구동, 브레이크(W)로 감속.
  const reverse = gear === -1;
  const effThrottle = reverse ? brake : throttle;
  const effBrake    = reverse ? throttle : brake;

  // 시동 ────────────────────────────────────────────────────────
  let engineState = v.engine;
  if (ignition && !engineState.on) {
    engineState = startEngine(engineState, { clutchEngagement: engagement, inGear });
  }

  // 엔진 스텝 (바퀴 결합 RPM) ───────────────────────────────────
  const coupledRpm = engineRpmFromSpeed(v.dyn.speed, gear);
  const eng = stepEngine(engineState, { throttle: effThrottle, clutchEngagement: engagement, coupledRpm, inGear }, dt);

  // 구동 가속 ───────────────────────────────────────────────────
  // 기어별 최고속(레드라인×기어비)을 한계로, 그 근처에서 가속이 줄어든다.
  // 저단=큰 토크·낮은 최고속, 고단=작은 토크·높은 최고속 (실제 차와 동일한 경향).
  let engineAccel = 0;
  if (eng.on && inGear && engagement > 0) {
    const dir = gear < 0 ? -1 : 1;
    const maxSpeed = Math.abs(speedFromEngineRpm(MAX_RPM, gear)) * car.gearTopFactor; // 이 기어 최고속(차종 배율)
    // #7 고단 토크 바닥 혼합 — 고단이 0.57배까지 떨어지지 않게(5단≈0.81배) 가속 회복.
    //   저단은 여전히 큼(1단≈1.64배). 단조 경향·차종차등(accelBase) 유지.
    const ratioK   = totalRatio(gear) / totalRatio(3);
    const torque   = car.accelBase * (0.55 + 0.45 * ratioK);
    const headroom = Math.max(0, 1 - Math.abs(v.dyn.speed) / maxSpeed); // 최고속 근처서 0
    engineAccel = dir * effThrottle * torque * engagement * headroom;
  }

  // 동역학 스텝 ─────────────────────────────────────────────────
  const dyn = stepDynamics(v.dyn, { engineAccel, brake: effBrake, steer }, dt, sampleHeight, car);

  return {
    engine: { rpm: eng.rpm, on: eng.on, stalled: eng.stalled },
    gear,
    dyn,
    car,  // 차종 파라미터를 상태에 계속 보존
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
