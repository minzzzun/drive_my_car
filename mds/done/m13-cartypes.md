# M13 완료 — 차종 선택 (승용차/트럭)

> 시작화면에서 차종 선택 → 성능(가속/조향/제동/무게감)·외형(차체/바퀴/시야높이)이 달라짐. **2종(sedan/truck)**.

## 구현

### M13a — 코어(순수, 회귀 0)
- `src/vehicle/carTypes.js` (신규) — `CAR_TYPES{sedan,truck}`, `DEFAULT_CAR_ID`, `getCarType`/`listCarTypes`. 각 차종 `{id,label,perf(7키),mesh(치수·eyeHeight·색)}`.
- `src/vehicle/vehicle.js` — `createVehicle(spawn, carParams)` 방안 A 주입, `v.car`(없으면 LEGACY_CAR=현 상수) 사용, `stepDynamics(...,car)` 전달.
- `src/vehicle/dynamics.js` — integrateSpeed/yawRate/corneringRoll/stepDynamics가 차종 파라미터를 옵션으로(기본값=현 모듈 상수 → 회귀 0). 기존 상수 export 유지.

### M13b — 외형 + 선택 UI + 결선
- `src/render/carMesh.js` — `buildCar(carType?)` 파라미터화(DEFAULT_MESH 폴백=회귀 0). 차체/캐빈/바퀴 치수·색·바퀴Y(반경 연동) 반영, chassis/cabin name 부여.
- `index.html`/`src/style.css` — 차종 카드(승용차/트럭) + 맵 카드 공존.
- `src/main.js` — `selectedCarId`, `startGame(mapId, carId)`, `buildCar(carType.mesh)` 재생성, `createVehicle(spawn, carType.perf)`, `EYE_HEIGHT` let화→차종 eyeHeight(트럭 시야 높음).

### 보강(사용자 피드백)
- **SUV 제거**(승용차와 체감 차이 적음) → 최종 2종.

## 차종 수치(perf)
| | sedan | truck |
|---|---|---|
| accelBase | 10 | 6 |
| rollingResist | 0.07 | 0.13 |
| brakeDecel | 13 | 9 |
| maxSteerRate | 1.35 | 0.85 |
| eyeHeight | 1.2 | 2.4 |
| bodyLen×W×H | 4.0×1.9×0.5 | 6.5×2.4×0.9 |

## 테스트

- `src/vehicle/carTypes.test.js`(24) — 데이터 유효성·상대 단조성(truck<sedan)·주입 동작(sedan.speed>truck.speed)·회귀 0. `src/render/carMesh.test.js`(8) — buildCar 치수 반영·기본 외형 회귀.
- 전체: **231 passed**. `npm run build` 성공. vehicle/dynamics 기존 테스트 무수정 통과.

## 비고 / 후속

- 3인칭 카메라 거리 차종 미연동(보류). 실주행 성능 미세 튜닝은 후속 여지.

## 설계

- [design/cartypes.md](../design/cartypes.md)
