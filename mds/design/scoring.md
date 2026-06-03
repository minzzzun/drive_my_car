# 설계 — scoring.js (M7, 감점/게임오버)

순수 모듈. main.js가 엣지 이벤트(한 번만 true)를 감지해 넘기고, scoring은 규칙만 적용.

## 상수
- `START_SCORE=100`, `PASS_MARK=70`, `CHECKPOINT_TIME=45`(초).
- `PENALTIES = { stall:5, roadOff:10, collision:10, timeOver:10 }`.

## 상태
`{ score, state:'driving'|'passed'|'failed', nextCheckpoint, totalCheckpoints, timeLeft, log:[] }`

## API
- `createScore({ totalCheckpoints, timeLimit })` → 초기 상태(score 100, driving, nextCheckpoint 0, timeLeft=timeLimit).
- `stepScore(state, ev, dt)` — driving일 때만 동작. ev:
  - `rollover` 또는 `majorCollision` → 즉시 `failed`(전복·대형사고).
  - `stalled`(엣지) → −5, `offRoad`(엣지) → −10, `collision`(엣지) → −10.
  - `reachedCheckpoint`(엣지) → nextCheckpoint++, 타이머 리셋. 마지막 통과 시 `passed`.
  - 타이머: `timeLeft -= dt`; 0 이하 → `timeOver` −10 + nextCheckpoint++(놓침) + 타이머 리셋.
  - 감점 후 `score < PASS_MARK` → `failed`. score는 0 하한.
- 종료 상태(passed/failed)에서는 no-op.

## 규칙 근거 (Seed)
- 100 시작, 70 미만 탈락. 전복/대형사고 즉시 실패. 체크포인트별 45초, 초과 시 −10 후 진행. 전 체크포인트 통과+70↑ = 합격.

## main.js 엣지 감지(통합)
- `stalled` = vehicle.justStalled.
- `offRoad` = `isOnRoad` true→false 전이.
- `rollover` = vehicle.rollover (전복=대형사고/즉시실패).
- `collision`(경미) = 차체 기울기가 충돌 임계 초과(전복 미만)로 진입하는 전이(디바운스).
- `reachedCheckpoint` = 다음 체크포인트 반경 진입.
- 결과(passed/failed)는 오버레이로 표시(정식 HUD 게이지는 M8).

## 테스트 (`src/scoring.test.js`)
- 초기 100/driving, stall −5, offRoad/collision −10, rollover·majorCollision 즉시 failed, 70 미만 failed, 체크포인트 통과 시 nextCheckpoint++·타이머 리셋, 마지막 통과 passed, timeOver −10+진행, 종료 상태 no-op.
