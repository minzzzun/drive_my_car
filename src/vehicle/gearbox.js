// ══════════════════════════════════════════════════════════════
// gearbox.js — 변속기 (순수 로직, Three.js 비의존)
// 기어: -1=R, 0=N, 1~5. 속도(m/s) ↔ 엔진 RPM 변환.
// ══════════════════════════════════════════════════════════════

export const WHEEL_RADIUS = 0.3;   // 바퀴 반경(m)
export const FINAL_DRIVE  = 3.5;   // 종감속비
export const GEARS = [-1, 0, 1, 2, 3, 4, 5];  // R, N, 1~5 (순차 변속 순서)

// 기어별 변속비 (중립은 동력 전달 없음)
const GEAR_RATIOS = {
  '-1': 3.6,  // R
  '0': 0,     // N
  '1': 3.4,
  '2': 2.0,
  '3': 1.4,
  '4': 1.0,
  '5': 0.8,
};

export function gearName(gear) {
  if (gear === -1) return 'R';
  if (gear === 0)  return 'N';
  return String(gear);
}

// 순차 변속 (범위 clamp) ───────────────────────────────────────────
export function shiftUp(gear) {
  const i = GEARS.indexOf(gear);
  return GEARS[Math.min(i + 1, GEARS.length - 1)];
}

export function shiftDown(gear) {
  const i = GEARS.indexOf(gear);
  return GEARS[Math.max(i - 1, 0)];
}

// 총 변속비 (기어비 × 종감속비, 중립 0) ───────────────────────────
export function totalRatio(gear) {
  return GEAR_RATIOS[String(gear)] * FINAL_DRIVE;
}

// 차속(m/s) → 엔진 RPM. 중립은 0, 후진은 |speed|. ──────────────────
export function engineRpmFromSpeed(speed, gear) {
  const ratio = totalRatio(gear);
  if (ratio === 0) return 0;
  const wheelRps = Math.abs(speed) / (2 * Math.PI * WHEEL_RADIUS); // 바퀴 회전/초
  return wheelRps * 60 * ratio;
}

// 엔진 RPM → 차속(m/s) (역변환, 참고/검증용) ──────────────────────
export function speedFromEngineRpm(rpm, gear) {
  const ratio = totalRatio(gear);
  if (ratio === 0) return 0;
  const wheelRps = rpm / 60 / ratio;
  return wheelRps * 2 * Math.PI * WHEEL_RADIUS;
}
