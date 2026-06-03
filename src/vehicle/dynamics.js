// ══════════════════════════════════════════════════════════════
// dynamics.js — 차량 운동학 (순수 로직, Three.js 비의존)
// heading 0 → 전진 +Z. 지형 높이는 sampleHeight(x,z) 콜백으로 주입.
// ══════════════════════════════════════════════════════════════

export const ROLLING_RESIST = 0.08;  // 가벼운 구름/공기 저항(1/s) — 최고속은 기어별 한계가 제어
export const BRAKE_DECEL    = 12;     // 브레이크 감속(m/s²)
export const MAX_STEER_RATE = 1.2;    // 최대 요 레이트(rad/s)
export const TURN_FULL_SPEED = 8;     // 이 속도 이상이면 조향 권한 100%
export const CORNER_ROLL_K  = 0.06;   // 코너링 동적 롤 계수
export const ROLL_LIMIT     = 1.0;    // 전복 롤 임계(rad ≈ 57°)
export const PITCH_LIMIT    = 1.0;    // 전복 피치 임계(rad)
export const RIDE_HEIGHT    = 0.5;    // 지형 위 차체 높이
export const SAMPLE_FWD     = 1.5;    // 전/후 높이 샘플 거리
export const SAMPLE_SIDE    = 1.2;    // 좌/우 높이 샘플 거리

function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

// 종방향 속도 적분 ─────────────────────────────────────────────────
export function integrateSpeed(speed, engineAccel, brake, dt) {
  const a = engineAccel - ROLLING_RESIST * speed - brake * BRAKE_DECEL * sign(speed);
  let next = speed + a * dt;
  // 브레이크로 0을 가로지르면 정지 고정(부호 반전 방지)
  if (brake > 0 && sign(next) !== sign(speed) && speed !== 0) next = 0;
  return next;
}

// 요 레이트(조향) ─────────────────────────────────────────────────
export function yawRate(steer, speed) {
  const authority = Math.min(1, Math.abs(speed) / TURN_FULL_SPEED);
  return steer * MAX_STEER_RATE * sign(speed) * authority;
}

// XZ 전진 ─────────────────────────────────────────────────────────
export function advance(pos, heading, speed, dt) {
  return {
    x: pos.x + Math.sin(heading) * speed * dt,
    z: pos.z + Math.cos(heading) * speed * dt,
  };
}

// 지형 경사로부터 pitch/roll 산출 ─────────────────────────────────
export function terrainTiltAt(x, z, heading, sampleHeight) {
  const fx = Math.sin(heading), fz = Math.cos(heading);  // 전진
  const rx = Math.cos(heading), rz = -Math.sin(heading); // 우측
  const hF = sampleHeight(x + fx * SAMPLE_FWD,  z + fz * SAMPLE_FWD);
  const hB = sampleHeight(x - fx * SAMPLE_FWD,  z - fz * SAMPLE_FWD);
  const hR = sampleHeight(x + rx * SAMPLE_SIDE, z + rz * SAMPLE_SIDE);
  const hL = sampleHeight(x - rx * SAMPLE_SIDE, z - rz * SAMPLE_SIDE);
  return {
    pitch: Math.atan2(hF - hB, 2 * SAMPLE_FWD),
    roll:  Math.atan2(hR - hL, 2 * SAMPLE_SIDE),
  };
}

// 코너링 동적 롤(조향 반대 방향으로 기움) ──────────────────────────
export function corneringRoll(steer, speed) {
  return -steer * Math.abs(speed) * CORNER_ROLL_K;
}

// 지형 법선 (차체 '천장' 방향) — 중심 차분으로 근사 ────────────────
export function terrainNormal(x, z, sampleHeight, eps = 1.0) {
  const hL = sampleHeight(x - eps, z);
  const hR = sampleHeight(x + eps, z);
  const hD = sampleHeight(x, z - eps);
  const hU = sampleHeight(x, z + eps);
  const nx = (hL - hR) / (2 * eps);
  const nz = (hD - hU) / (2 * eps);
  const ny = 1;
  const len = Math.hypot(nx, ny, nz);
  return { x: nx / len, y: ny / len, z: nz / len };
}

// 전복 판정 ───────────────────────────────────────────────────────
export function isRollover(roll, pitch) {
  return Math.abs(roll) > ROLL_LIMIT || Math.abs(pitch) > PITCH_LIMIT;
}

// 상태 생성/스텝 ──────────────────────────────────────────────────
export function createDynState(spawn = {}) {
  return {
    x: spawn.x ?? 0, y: spawn.y ?? RIDE_HEIGHT, z: spawn.z ?? 0,
    heading: spawn.heading ?? 0, speed: 0,
    roll: 0, pitch: 0, rollover: false,
  };
}

export function stepDynamics(state, inputs, dt, sampleHeight) {
  const { engineAccel, brake, steer } = inputs;
  const speed   = integrateSpeed(state.speed, engineAccel, brake, dt);
  // 1인칭 화면 기준 조향: 화면 오른쪽 = 월드 -X 이므로 heading 적분 부호를 음수로
  const heading = state.heading - yawRate(steer, speed) * dt;
  const p       = advance(state, heading, speed, dt);
  const y       = sampleHeight(p.x, p.z) + RIDE_HEIGHT;

  const tilt = terrainTiltAt(p.x, p.z, heading, sampleHeight);
  const roll = tilt.roll + corneringRoll(steer, speed);
  const pitch = tilt.pitch;

  return {
    x: p.x, y, z: p.z, heading, speed,
    roll, pitch, rollover: isRollover(roll, pitch),
  };
}
