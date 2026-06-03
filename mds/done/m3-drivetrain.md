# M3 — engine.js + gearbox.js 구동계 (완료)

## 한 일
- `src/vehicle/gearbox.js`: `GEARS`(R/N/1~5), `shiftUp`/`shiftDown`(순차·clamp), `totalRatio`, `engineRpmFromSpeed`/`speedFromEngineRpm`, `gearName`. 상수 `WHEEL_RADIUS=0.3`, `FINAL_DRIVE=3.5`, 기어비표.
- `src/vehicle/engine.js`: `createEngineState`, `startEngine`(중립/클러치 분리 시만), `stepEngine`(공회전·반클러치 결합·레드라인·**stall**). 상수 `IDLE_RPM=800`, `STALL_RPM=450`, `MAX_RPM=7000`.

## 핵심 모델
- 클러치 결합도(0 분리~1 결합)로 엔진 RPM 목표를 `freeTarget`↔`coupledRpm` 사이에서 보간 → 반클러치 표현.
- 결합 상태에서 RPM이 STALL_RPM 밑이면 시동 꺼짐. 정지 클러치 덤프/정지 시 클러치 미사용/주행 중 저RPM 모두 자연히 stall.

## 검증
- `gearbox.test.js` 12건 + `engine.test.js` 11건 = 23건 통과 (전체 58건):
  - 변속 순차/clamp, 변속비, 속도↔RPM 왕복·단조성.
  - 시동 조건, idle 유지, 무부하 rev, 레드라인 clamp.
  - **stall 시나리오**: 정지 클러치 덤프 → stall, 반클러치+throttle → 미stall, stall 후 off 유지.

## 다음
- M4: `dynamics.js`(구동력→가속/조향/위치적분/전복 판정) + `vehicle.js`(engine+gearbox+dynamics 상태기계 `step`).
