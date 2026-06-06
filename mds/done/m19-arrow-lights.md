# M19 완료 — 목표 방향 나침반 + 차량 등화

## 구현

### 목표 방향 화살표(나침반)
- `src/heading.js` (신규, 순수) — `normalizeAngle(a)`(-π,π], `bearingToTarget(car,target)`=normalizeAngle(atan2(dx,dz)-car.heading).
- `src/render/compass.js` (신규) — `createCompass()`→{el,update({bearing,distance,phase,visible,label})}. 상단 고정 DOM, 화살표 회전(정면=↑), 단계색(비콘과 통일), done/목표없음 숨김.
- main: updateHUD에서 currentTarget+vehicle.dyn으로 bearingToTarget → compass.update.

### 차량 등화
- `src/render/carMesh.js` — buildCar에 후미 램프 6 child(brakeL/R 빨강·reverseL/R 흰·turnL/R 호박, Box+MeshBasicMaterial, 기본 LAMP_OFF). 후미 z<0, 후진등 안쪽<브레이크등<방향지시 바깥, 차종 비례. `setLights(car,{brake,reverse,turnLeft,turnRight})`, `LAMP_ON`/`LAMP_OFF` export.
- main updateVehicle: controls.brake→brake, gear===-1→reverse, steer 방향 + blinkClock(0.45s)→방향지시. setLights.

## 테스트

- `src/heading.test.js`(14), `src/render/carMesh.test.js` 램프/setLights(15) 추가.
- 전체: **385 passed**. build 성공. 회귀 0(순수함수·신규 DOM·신규 child만).

## 검증

- 단위 테스트 그린. 수동: 나침반 방향/거리, S 브레이크등·R 후진등·A/D 방향지시 깜빡 확인.

## 설계

- [design/m19-arrow-lights.md](../design/m19-arrow-lights.md)
