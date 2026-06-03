# 설계 — render/carMesh.js (M6)

## 목적
차량을 표현하는 THREE 메시 그룹을 만들고, 매 프레임 `vehicle.dyn`(위치/heading/roll/pitch)에 맞춰 변환한다. 1인칭이라 주로 보닛/바퀴가 시야 하단에 보이고, 미니맵(M8)에서 위에서 보인다. test1(`섀시+캐빈+바퀴`) 구성을 참조.

## 공개 API (`src/render/carMesh.js`)
- `buildCar(opts)` → `THREE.Group` (자식: 섀시 박스, 캐빈 박스, 바퀴 4개).
- `updateCarTransform(group, dyn)` — `group.position=(x,y,z)`, `rotation`(order 'YXZ'): `y=heading`, `x=-pitch`, `z=-roll`.

## 형상 (test1 참조, 비율 유지)
- 섀시 BoxGeometry(2, 0.5, 4) 빨강 계열.
- 캐빈 BoxGeometry(1.5, 0.8, 1.2) 위에 얹음.
- 바퀴 4개: CylinderGeometry(0.3,0.3,0.3) 회전(x축 정렬), 네 모서리.
- 그룹 원점 = 차량 중심(바닥에서 약간 위). `dyn.y = 지형+RIDE_HEIGHT(0.5)` 와 정합.

## main.js 결선
- `buildCar()` 씬에 추가, 매 프레임 `updateCarTransform(car, vehicle.dyn)`.
- 1인칭 카메라는 운전석(중심 약간 위·앞). 보닛이 시야 하단에 들어오도록.

## 테스트 (`src/render/carMesh.test.js`)
- `buildCar`가 `THREE.Group` 반환, 자식 수 ≥ 6(섀시+캐빈+바퀴4).
- `updateCarTransform`가 위치/회전을 dyn대로 설정(THREE 객체는 node에서 WebGL 없이 생성 가능).

## 시각 확인
- `npm run dev` → 시동(Enter)·1단(E)·반클러치 출발·도로 주행·체크포인트 링 통과·전복 확인.
