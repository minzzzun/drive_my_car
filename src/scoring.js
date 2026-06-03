// ══════════════════════════════════════════════════════════════
// scoring.js — 감점/게임오버/승리 (순수 로직)
// main.js가 엣지 이벤트를 감지해 stepScore에 전달.
// ══════════════════════════════════════════════════════════════

export const START_SCORE    = 100;
export const PASS_MARK       = 70;
export const CHECKPOINT_TIME = 45;  // 체크포인트별 제한시간(초)
export const PENALTIES = { stall: 5, roadOff: 10, collision: 10, timeOver: 10 };

export function createScore({ totalCheckpoints, timeLimit = CHECKPOINT_TIME }) {
  return {
    score: START_SCORE,
    state: 'driving',
    nextCheckpoint: 0,
    totalCheckpoints,
    timeLimit,
    timeLeft: timeLimit,
    log: [],
  };
}

function penalize(s, type, amount) {
  s.score = Math.max(0, s.score - amount);
  s.log.push(type);
}

function advanceCheckpoint(s) {
  s.nextCheckpoint += 1;
  s.timeLeft = s.timeLimit;
  if (s.nextCheckpoint >= s.totalCheckpoints) {
    s.state = 'passed';
  }
}

export function stepScore(state, ev, dt) {
  if (state.state !== 'driving') return state;
  const s = { ...state, log: [...state.log] };

  // 즉시 실패 (전복 / 대형 충돌)
  if (ev.rollover || ev.majorCollision) {
    s.state = 'failed';
    s.log.push(ev.rollover ? 'rollover' : 'majorCollision');
    return s;
  }

  // 감점 이벤트(엣지)
  if (ev.stalled)   penalize(s, 'stall', PENALTIES.stall);
  if (ev.offRoad)   penalize(s, 'roadOff', PENALTIES.roadOff);
  if (ev.collision) penalize(s, 'collision', PENALTIES.collision);

  // 체크포인트 통과
  let advanced = false;
  if (ev.reachedCheckpoint) { advanceCheckpoint(s); advanced = true; }

  // 제한시간 (이번 프레임에 체크포인트로 진행하지 않았고, 아직 주행 중일 때만)
  if (s.state === 'driving' && !advanced) {
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      penalize(s, 'timeOver', PENALTIES.timeOver);
      advanceCheckpoint(s);
    }
  }

  // 합격선 미만 탈락
  if (s.state === 'driving' && s.score < PASS_MARK) {
    s.state = 'failed';
  }

  return s;
}
