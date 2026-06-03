// ══════════════════════════════════════════════════════════════
// engine.js — 엔진 RPM 동역학 + 클러치 결합 + 시동 꺼짐 (순수 로직)
// clutchEngagement: 0=완전 분리(페달 밟음), 1=완전 결합(페달 뗌)
// ══════════════════════════════════════════════════════════════

export const IDLE_RPM     = 800;   // 공회전
export const STALL_RPM    = 450;   // 이 아래로 떨어지면(결합 상태) 시동 꺼짐
export const MAX_RPM      = 7000;  // 레드라인
export const RPM_RESPONSE = 3.0;   // RPM 추종 속도(1/s)

function lerp(a, b, t) { return a + (b - a) * t; }

export function createEngineState() {
  return { rpm: 0, on: false, stalled: false };
}

// 시동 — 꺼진 상태에서 (클러치 분리 또는 중립)일 때만 걸림 ──────────
export function startEngine(state, { clutchEngagement, inGear }) {
  if (state.on) return { ...state };
  const safe = clutchEngagement <= 0.2 || !inGear;
  if (!safe) return { ...state };  // 기어 든 채 클러치 안 밟으면 시동 실패
  return { rpm: IDLE_RPM, on: true, stalled: false };
}

// 한 스텝 진행 → {rpm, on, stalled, justStalled} ─────────────────
export function stepEngine(state, inputs, dt) {
  const { throttle, clutchEngagement, coupledRpm, inGear } = inputs;

  // 시동 꺼진 상태: RPM 0으로 감쇠, 그대로 off
  if (!state.on) {
    const rpm = Math.max(0, state.rpm - state.rpm * Math.min(1, RPM_RESPONSE * dt));
    return { rpm, on: false, stalled: state.stalled, justStalled: false };
  }

  // 분리(중립 또는 클러치 완전 밟음): 무부하 자유 회전
  const decoupled = !inGear || clutchEngagement <= 0;
  const freeTarget = IDLE_RPM + throttle * (MAX_RPM - IDLE_RPM);
  const target = decoupled
    ? freeTarget
    : lerp(freeTarget, coupledRpm, clutchEngagement); // 반클러치: 바퀴가 엔진을 끌어당김

  let rpm = state.rpm + (target - state.rpm) * Math.min(1, RPM_RESPONSE * dt);
  if (rpm > MAX_RPM) rpm = MAX_RPM;

  // 시동 꺼짐: 결합 상태에서 RPM이 STALL 밑으로
  if (!decoupled && rpm < STALL_RPM) {
    return { rpm: 0, on: false, stalled: true, justStalled: true };
  }

  return { rpm, on: true, stalled: false, justStalled: false };
}
