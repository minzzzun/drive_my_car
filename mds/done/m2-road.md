# M2 — road.js 도로/체크포인트 (완료)

## 한 일
- `src/road.js` (순수 기하): `generateCourseWaypoints`(결정론적 사행 코스), `createRoad`(세그먼트+누적 호길이), `distPointToSegment`, `distanceToCenterline`, `isOnRoad`, `pointAtDistance`, `placeCheckpoints`(균등 분할, 마지막=골인). 상수 `ROAD_WIDTH=8`, `DEFAULT_CHECKPOINTS=5`.
- `src/render/road.js` (THREE): `buildCourse` — 중심선을 따라 지형에 드리운 리본 도로 메시 + 체크포인트 링 마커 그룹 생성.
- `main.js`: 코스 생성 후 씬에 추가, 플레이어를 도로 시작점에 스폰.

## 검증
- `src/road.test.js` 단위 테스트 22건 통과(전체 35건):
  - 점-선분 거리, 세그먼트/총길이/s0, 중심선 거리, isOnRoad 폭 경계, pointAtDistance clamp/보간, placeCheckpoints 개수·순서·도로 위·골인, generateCourseWaypoints 결정론.
- `npm run build` 성공.
- ⚠️ 시각 확인(도로가 지형 위에 자연스럽게 보이는지)은 M6/M9의 dev 실행에서 최종 확인 예정.

## 다음
- M3: `engine.js` + `gearbox.js` — 엔진 RPM·클러치·stall, 기어비·변속 순수 로직.
