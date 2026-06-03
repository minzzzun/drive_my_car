# M7 — scoring.js 감점/게임오버 (완료)

## 한 일
- `src/scoring.js` (순수): `createScore`/`stepScore`. 100점 시작, 시동꺼짐 −5·도로이탈/충돌/시간초과 −10, 전복·대형사고 즉시 실패, 70점 미만 탈락, 체크포인트 통과 시 진행·타이머 리셋, 전 체크포인트 통과 시 합격. 상수 `START_SCORE`/`PASS_MARK`/`CHECKPOINT_TIME`/`PENALTIES`.
- `main.js` 통합: 엣지 감지(도로이탈 전이·기울기 충돌·전복·시동꺼짐·체크포인트 진입 반경·dt 타이머) → `stepScore`. HUD에 점수/체크포인트/남은시간 표시. 합격/불합격 결과 오버레이. 게임오버 시 차량 정지.

## 검증
- `scoring.test.js` 12건 통과 (전체 101건): 감점/즉시실패/70미만 탈락/체크포인트 진행·합격/시간초과/종료 no-op.
- `npm run build` 성공.

## 비고
- 코스에 장애물이 없어 `majorCollision`(대형충돌)은 현재 전복(rollover=즉시실패)으로 대표. 경미 충돌은 차체 기울기(전복 미만)로 감지. 장애물 추가 시 majorCollision 연결 가능.

## 다음
- M8: `minimap.js`(우상단 상공뷰: 도로·차량·체크포인트) + `hud.js`(RPM 게이지 등 정식 HUD).
