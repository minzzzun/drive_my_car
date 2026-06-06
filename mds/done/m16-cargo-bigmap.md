# M16 완료 — 화물 시각화 + 큰 지도 보기 + 정차 적재/하차

## 구현

### #2 화물 시각화 (M16a)
- `src/render/carMesh.js` — `buildCar(carType)`에 `name='cargo'` BoxGeometry child(기본 visible=false, `CARGO_COLOR`). 크기/위치 차종 mesh 비례(cargoW=bodyWidth*0.7, cargoD=bodyLen*0.38, cargoH=max(0.5,bodyHeight*1.1), z=캐빈 반대편). `setCargo(car, visible)` named export.
- main: pickedUp→setCargo(true), delivered→setCargo(false), startGame 초기화.

### #9 큰 지도 보기 (M16b)
- `src/render/bigmap.js` (신규) — Canvas 2D 중앙 오버레이. `createBigmap()`→{canvas,draw,show,hide,toggle,open}. minimap 순수 헬퍼(computeBounds/worldToMinimap) 재사용. 도로 폴리라인+전체 배송점(번호)+현재 목표 강조+차량 위치. bounds=전체 배송점+현재위치.
- main: **KeyG** 토글. 열린 동안 주행 정지(animate 게이트)+audio.suspend, 닫으면 resume. pause 중엔 무시. index.html controls-hint "G 지도".

### 정차 적재/하차 (사용자 피드백)
- `src/mission.js` — `STOP_SPEED=0.5` 추가. `stepMission(state, carPos, {speed})`: 반경 안 + **|speed|<=STOP_SPEED** 일 때만 적재/하차(적재·하차 둘 다). opts 미지정 시 정차 간주(기존 테스트 호환).
- main: stepMission에 {speed: vehicle.speed} 전달. HUD: 반경 안인데 달리는 중이면 missionView.needStop→"🛑 정차하세요" 안내.

## 테스트

- carMesh.test 화물 child/setCargo(16개), mission.test 정차 케이스(35개).
- 전체: **290 passed**. build 성공.

## 검증

- 단위 테스트 그린. 수동: 적재함 화물 표시/제거, 정차해야 적재, KeyG 큰 지도, 정차 안내 확인.

## 설계

- [design/m16-cargo-bigmap.md](../design/m16-cargo-bigmap.md)
