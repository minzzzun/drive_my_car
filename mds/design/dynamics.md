# 설계 — dynamics.js + vehicle.js (M4, 차량 동역학/통합)

둘 다 순수 모듈. 지형 높이는 호출자가 `sampleHeight(x,z)` 콜백으로 주입(테스트는 mock 지형 사용).

## 좌표/방향 규약
- `heading`(yaw, rad): 0 → 전진 방향 = +Z. 전진 벡터 `(sin h, cos h)` in (x,z), heading↑ → +X 쪽 회전.
- `speed`(m/s): 전진 +, 후진 −.

## dynamics.js
- 상수: `ROLLING_RESIST=0.6`(1/s), `BRAKE_DECEL=12`(m/s²), `MAX_STEER_RATE=1.2`(rad/s), `TURN_FULL_SPEED=8`(m/s), `CORNER_ROLL_K=0.06`, `ROLL_LIMIT=1.0`/`PITCH_LIMIT=1.0`(rad), `RIDE_HEIGHT=0.5`, `SAMPLE_FWD=1.5`/`SAMPLE_SIDE=1.2`.
- `integrateSpeed(speed, engineAccel, brake, dt)` — `a = engineAccel − ROLLING_RESIST·speed − brake·BRAKE_DECEL·sign(speed)`; 브레이크가 0을 가로지르면 정지 고정.
- `yawRate(steer, speed)` — `steer·MAX_STEER_RATE·sign(speed)·min(1,|speed|/TURN_FULL_SPEED)` (정지 시 0, 후진 시 반전).
- `advance(pos, heading, speed, dt)` — XZ 전진.
- `terrainTiltAt(x,z,heading,sampleHeight)` — 전/후·좌/우 높이 샘플로 `{pitch, roll}` 산출(평지 0).
- `corneringRoll(steer, speed)` — 횡가속 동적 롤(조향 반대 부호, 속도↑로 증가).
- `isRollover(roll, pitch)` — `|roll|>ROLL_LIMIT || |pitch|>PITCH_LIMIT`.
- `createDynState()` / `stepDynamics(state, {engineAccel, brake, steer}, dt, sampleHeight)` → 새 상태 `{x,y,z,heading,speed,roll,pitch,rollover}`.

## vehicle.js (engine + gearbox + dynamics 조합 상태기계)
- `createVehicle(spawn)` → `{engine, gear:0, dyn}`.
- `stepVehicle(v, controls, dt, sampleHeight)`:
  - `controls = {throttle, brake, clutchPedal, steer, shift(+1/−1/0), ignition(bool)}`.
  - `engagement = 1 − clutchPedal`.
  - `shift` 요청 시 `shiftUp/shiftDown` 1회 적용(중립↔클러치 무관, 단순화).
  - `ignition` & 엔진 off → `startEngine`.
  - `coupledRpm = engineRpmFromSpeed(speed, gear)` → `stepEngine`.
  - 구동 가속 `engineAccel`: 엔진 on·기어·engagement>0일 때 `dir·throttle·ACCEL_BASE·(totalRatio(gear)/totalRatio(1))·engagement` (R은 dir=−1), 아니면 0.
  - `stepDynamics` 호출.
  - 반환: 새 `{engine, gear, dyn}` + 파생 `{rpm, stalled, justStalled, rollover, gearName}`.

## 구동 모델 (후속 튜닝)
- 구동 가속 = 기어별 토크(저단↑) × `headroom(1 − |speed|/maxSpeed(gear))`. `maxSpeed`는 레드라인×기어비 → 고단일수록 최고속↑. 구름저항은 가볍게(0.08)만.

## 테스트 설계
- dynamics: integrateSpeed(가속/브레이크/무입력 감쇠/정지고정), yawRate(0속도 0·부호·후진반전), advance(heading 0→+Z, π/2→+X), terrainTiltAt(평지 0·경사 부호), corneringRoll(부호·속도증가), isRollover(임계), stepDynamics(평지 전진·y=지형+RIDE_HEIGHT).
- vehicle: 시동(N에서 ignition→on), 1단 반클러치+throttle→전진 가속, 정지 클러치 덤프→stall(justStalled), 전복 지형→rollover, 변속(shift로 기어 변화).
