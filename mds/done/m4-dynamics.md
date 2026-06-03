# M4 — dynamics.js + vehicle.js (완료)

## 한 일
- `src/vehicle/dynamics.js` (순수): `integrateSpeed`(구동/브레이크/마찰/정지고정), `yawRate`(속도 비례 조향·후진 반전), `advance`(XZ 전진), `terrainTiltAt`(지형 경사→pitch/roll), `corneringRoll`(횡가속 롤), `isRollover`(임계), `createDynState`/`stepDynamics`. 지형은 `sampleHeight(x,z)` 콜백 주입.
- `src/vehicle/vehicle.js` (순수): `createVehicle`/`stepVehicle` — engine+gearbox+dynamics 결선. 변속 1회 요청, ignition 시동, 결합 RPM→stepEngine, 구동 가속 산출(R 반전), stepDynamics. 파생 상태(rpm/on/stalled/justStalled/rollover/speed/gearName) 반환.

## 검증
- `dynamics.test.js` 14건 + `vehicle.test.js` 7건 = 21건 통과 (전체 79건):
  - 속도/조향/전진/경사 틸트/코너롤/전복 임계, 평지 전진 적분.
  - 통합: 시동, N↔1↔R 변속, 1단 반클러치+throttle 전진 가속, 정지 클러치 덤프 stall(justStalled), 급경사 rollover.

## 다음
- M5: `input.js` 키 매핑(클러치/브레이크/액셀/기어↑↓/조향/시동) + 1인칭 운전석 카메라를 차량에 부착해 main.js에서 실제 주행 결선.
