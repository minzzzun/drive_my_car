// scoring.js 단위 테스트 (M7)
import { describe, it, expect } from 'vitest';
import {
  START_SCORE, PASS_MARK, PENALTIES,
  createScore, stepScore,
} from './scoring.js';

const NO_EV = { rollover: false, majorCollision: false, stalled: false, offRoad: false, collision: false, reachedCheckpoint: false };
function mk() { return createScore({ totalCheckpoints: 3, timeLimit: 45 }); }

describe('createScore', () => {
  it('100점·driving·체크포인트 0·타이머', () => {
    const s = mk();
    expect(s.score).toBe(START_SCORE);
    expect(s.state).toBe('driving');
    expect(s.nextCheckpoint).toBe(0);
    expect(s.timeLeft).toBe(45);
  });
});

describe('감점', () => {
  it('시동꺼짐 -5', () => {
    const s = stepScore(mk(), { ...NO_EV, stalled: true }, 0);
    expect(s.score).toBe(95);
  });
  it('도로이탈 -10, 충돌 -10', () => {
    expect(stepScore(mk(), { ...NO_EV, offRoad: true }, 0).score).toBe(90);
    expect(stepScore(mk(), { ...NO_EV, collision: true }, 0).score).toBe(90);
  });
  it('PENALTIES 값', () => {
    expect(PENALTIES).toEqual({ stall: 5, roadOff: 10, collision: 10, timeOver: 10 });
  });
});

describe('즉시 실패', () => {
  it('전복 → failed', () => {
    expect(stepScore(mk(), { ...NO_EV, rollover: true }, 0).state).toBe('failed');
  });
  it('대형 충돌 → failed', () => {
    expect(stepScore(mk(), { ...NO_EV, majorCollision: true }, 0).state).toBe('failed');
  });
});

describe('70점 미만 탈락', () => {
  it('누적 감점이 70 미만이면 failed', () => {
    let s = mk();
    for (let i = 0; i < 4; i++) s = stepScore(s, { ...NO_EV, offRoad: true }, 0); // 100→60
    expect(s.score).toBeLessThan(PASS_MARK);
    expect(s.state).toBe('failed');
  });
  it('정확히 70은 합격선(통과)', () => {
    let s = mk();
    for (let i = 0; i < 3; i++) s = stepScore(s, { ...NO_EV, offRoad: true }, 0); // 100→70
    expect(s.score).toBe(70);
    expect(s.state).toBe('driving');
  });
});

describe('체크포인트', () => {
  it('통과 시 nextCheckpoint++·타이머 리셋', () => {
    let s = mk();
    s = stepScore(s, { ...NO_EV, reachedCheckpoint: true }, 10); // timeLeft 45-10=35 후 리셋
    expect(s.nextCheckpoint).toBe(1);
    expect(s.timeLeft).toBe(45);
  });
  it('마지막 체크포인트 통과 → passed', () => {
    let s = mk(); // total 3
    s = stepScore(s, { ...NO_EV, reachedCheckpoint: true }, 0);
    s = stepScore(s, { ...NO_EV, reachedCheckpoint: true }, 0);
    s = stepScore(s, { ...NO_EV, reachedCheckpoint: true }, 0);
    expect(s.nextCheckpoint).toBe(3);
    expect(s.state).toBe('passed');
  });
});

describe('제한시간 초과', () => {
  it('타이머 0 이하 → -10 + 다음 체크포인트로 진행', () => {
    let s = mk();
    s = stepScore(s, NO_EV, 50); // 45초 초과
    expect(s.score).toBe(90);
    expect(s.nextCheckpoint).toBe(1);
    expect(s.timeLeft).toBeGreaterThan(0);
  });
});

describe('종료 상태', () => {
  it('failed 이후 step은 no-op', () => {
    let s = stepScore(mk(), { ...NO_EV, rollover: true }, 0);
    const after = stepScore(s, { ...NO_EV, offRoad: true }, 0);
    expect(after).toEqual(s);
  });
});
