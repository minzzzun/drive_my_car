# 설계 — engine.js + gearbox.js (M3, 구동계)

수동 운전의 핵심. 둘 다 순수 모듈(Three.js 비의존, 숫자/평범한 객체만).

## gearbox.js
변속기·기어비·속도↔RPM 변환.

- 상수: `WHEEL_RADIUS=0.3`(m), `FINAL_DRIVE=3.5`, `GEAR_RATIOS`(R:3.6, 1:3.4, 2:2.0, 3:1.4, 4:1.0, 5:0.8), `GEARS=[-1,0,1,2,3,4,5]`(R,N,1~5 순차).
- `gearName(gear)` → 'R'|'N'|'1'..'5'.
- `shiftUp(gear)` / `shiftDown(gear)` — 순차 변속, 범위 clamp(R↔5).
- `totalRatio(gear)` — 기어비×FINAL_DRIVE (중립 0).
- `engineRpmFromSpeed(speed, gear)` — 차속(m/s) → 엔진 RPM. 중립=0, 후진은 |speed|. `rpm = (|v|/(2πr))·60·totalRatio`.
- `speedFromEngineRpm(rpm, gear)` — 역변환(참고/검증용).

## engine.js
엔진 RPM 동역학 + 클러치 결합 + **시동 꺼짐**.

> 클러치 표기: `clutchEngagement` 0=완전 분리(페달 밟음, 엔진↔바퀴 끊김), 1=완전 결합(페달 뗌). 입력 레이어가 페달값을 `1-pedal`로 변환해 전달.

- 상수: `IDLE_RPM=800`, `STALL_RPM=450`, `MAX_RPM=7000`(레드라인), `RPM_RESPONSE=3.0`.
- `createEngineState()` → `{rpm:0, on:false, stalled:false}`.
- `startEngine(state, {clutchEngagement, inGear})` — 꺼져있고 (클러치 분리됨 `≤0.2` 또는 중립)일 때만 시동: `on=true, rpm=IDLE_RPM`. 아니면 그대로(시동 실패).
- `stepEngine(state, {throttle, clutchEngagement, coupledRpm, inGear}, dt)` → `{rpm, on, stalled, justStalled}`.
  - 꺼짐: rpm 0으로 감쇠, off 유지.
  - 분리(중립 or engagement≤0): 목표 = `freeTarget = IDLE_RPM + throttle·(MAX_RPM-IDLE_RPM)` (자유 회전, 무부하 공회전).
  - 결합(기어 들어감 + engagement>0): 목표 = `lerp(freeTarget, coupledRpm, engagement)` — 반클러치 구간에서 바퀴 회전수가 엔진을 끌어내림.
  - `rpm += (target-rpm)·min(1, RPM_RESPONSE·dt)`, 레드라인 clamp.
  - **stall**: 결합 상태에서 `rpm < STALL_RPM` 이면 시동 꺼짐(`on=false, stalled=true, justStalled=true, rpm=0`).

## stall 시나리오 (Seed 부합)
- **출발 클러치 급조작**: 정지(coupledRpm≈0)에서 engagement 급히 1 → 목표 0 → rpm 급강하 → stall.
- **반클러치 정상 출발**: engagement 부분(0.3~0.7)+throttle → 목표가 STALL 위 유지되며 속도(coupledRpm) 상승 → 미stall.
- **정지 시 클러치 미사용**: 기어 든 채 멈춤 + engagement 높음 → coupledRpm 0 → stall.
- **주행 중 저RPM**: 고단에서 속도 급감 → coupledRpm < STALL, engagement 높음 → stall.

## 테스트 설계
- gearbox: shiftUp/down 순차·clamp, totalRatio 중립 0/양수, engineRpmFromSpeed 속도 단조증가·중립 0, rpm↔speed 왕복.
- engine: 시동 조건(중립/클러치 분리 시 성공, 기어+결합 시 실패), 중립 공회전 idle 유지, 무부하 throttle 시 rev업, 정지 클러치 덤프 → stall(justStalled), 반클러치+throttle → 미stall, 레드라인 clamp, stall 후 재시동 전까지 off 유지.
