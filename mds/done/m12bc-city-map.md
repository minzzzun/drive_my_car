# M12b/c 완료 — 도시 맵 + 시작화면 맵 선택 UI

> 평지 아스팔트 + 격자 도로망 + 다양한 박스 건물(색/높이 변주) + 건물 충돌. 시작화면에서 자연/도시 선택.

## 구현

### M12b — 도시 맵
- `src/maps/city.js` (신규, 순수) — 격자: `BLOCK_SIZE=60`, `ROAD_WIDTH_CITY=12`, `CELL=72`. `distToGrid`, `cityIsOnRoad`, `buildingAt(bx,bz)`(결정론 해시 rand2D 기반: 높이 6~90·평면 45~100%·`BUILDING_PALETTE` 6색 `colorHex`, inset로 도로 비겹침), `cityBuildingAt(x,z)`/`cityIsBlocked(x,z)`(충돌 질의). 색 상수 `GROUND_COLOR`/`ROAD_COLOR`.
- `src/maps/cityMap.js` (신규, THREE) — 맵 인터페이스(`createCityMap`). heightAt=0 평지, isOnRoad/isBlocked, getSpawn(교차로), getGoals(격자 교차점 5), getMinimapData(격자 폴리라인+goals), buildStatic(도시 조명/포그), updateWorld(타일 스트리밍: 밝은 콘크리트 바닥 Plane + 짙은 아스팔트 도로 스트립 + 팔레트 색 건물 박스, dispose 관리).
- `src/maps/index.js` — city 등록(`{id:'city',label:'도시'}`).

### 보강(사용자 피드백)
- 건물 **다양화**: 6색 팔레트 + 높이/크기 범위 확대(저층 다수·고층 소수).
- **도로색 구분**: 비도로(콘크리트)/도로(아스팔트) 색 분리 렌더.
- **건물 충돌**: `map.isBlocked` 인터페이스 추가(자연=항상 false, 도시=cityIsBlocked). main `updateVehicle`에서 stepVehicle 후 isBlocked면 이전 위치 복원+정지(순수 물리 미수정).

### M12c — 맵 선택 UI
- `index.html`/`src/style.css` — 시작 오버레이에 맵 카드 2개(자연/도시).
- `src/main.js` — `selectedMapId`(기본 natural), 카드 click 선택(stopPropagation), 시작 시 `startGame(selectedMapId)`.

## 테스트

- `src/maps/city.test.js`(32) — 격자/도로 판정, 건물 결정론·색·범위·도로 비겹침, cityBuildingAt/cityIsBlocked. naturalMap.isBlocked===false, index isBlocked 보유.
- 전체: **202 passed**. `npm run build` 성공.

## 검증

- 단위 테스트 그린. 브라우저 수동: 도시 선택→격자 도로/다색 건물/충돌 정지, 자연 맵 회귀 0 확인.

## 비고 / 후속

- 충돌은 정지 방식(슬라이딩·고속 터널링 미보강). 차선 중앙선·건물 다양 형상은 후속 여지. 배송지점은 M14.

## 설계

- [design/maps.md](../design/maps.md) §3·§4·§1(isBlocked)
