# 설계 — road.js (M2)

## 목적
LOD_demo 지형 위에 깔 **단일 경로 도로**를 정의하고, 차량 채점(도로 이탈)·체크포인트 통과·미니맵 표시가 공유할 순수 기하 질의를 제공한다. Three.js 비의존(평면 {x,z} 좌표만 다룸). 높이(Y)는 `terrain.terrainHeight`로 별도 질의.

## 공개 API (`src/road.js`)
- 상수: `ROAD_WIDTH = 8`, `DEFAULT_CHECKPOINTS = 5`
- `generateCourseWaypoints(opts)` — 결정론적 사행(meander) 경로 웨이포인트 `[{x,z}, ...]` 생성. 시작점/길이/굽이 진폭 지정.
- `createRoad(waypoints, opts)` — 웨이포인트를 세그먼트열로 변환. 반환 `{ waypoints, width, segments:[{ax,az,bx,bz,len,s0}], totalLength }`.
- `distPointToSegment(px,pz, ax,az, bx,bz)` — 점-선분 최단거리.
- `distanceToCenterline(road, x, z)` — 도로 중심선까지 최단거리.
- `isOnRoad(road, x, z)` — 중심선 거리 ≤ width/2 인가.
- `pointAtDistance(road, s)` — 호 길이 s 위치의 `{x,z}` (clamp). 차량 스폰/헤딩, 체크포인트 배치에 사용.
- `placeCheckpoints(road, count)` — 호 길이 균등 분할로 체크포인트 `[{index,x,z,s}]`. k=1..count 에 대해 s=totalLength*k/count → 마지막 체크포인트가 도로 끝(골인).

## 설계 원칙
- 모든 입력/출력은 숫자/평범한 객체. `road` 객체는 미리 계산된 세그먼트+누적 호 길이(s0)를 들고 있어 거리 질의가 단순.
- 코스 생성은 난수 없이 sine 합으로 결정론적 사행 → 테스트 재현 가능, 매번 같은 코스.

## 테스트 설계 (`src/road.test.js`)
- `distPointToSegment`: 선분 위/수직 오프셋/끝점 너머 클램프 케이스.
- `createRoad`: totalLength = 세그먼트 길이 합, segments 길이 = waypoints-1, s0 누적 정확.
- `distanceToCenterline`: 웨이포인트 위 = 0, 수직 d만큼 떨어지면 ≈ d.
- `isOnRoad`: width/2 안쪽 true, 바깥 false.
- `pointAtDistance`: s=0 → 첫 점, s=total → 끝 점, 중간 보간.
- `placeCheckpoints`: 개수 일치, s 증가 순서, 각 체크포인트가 도로 위(distanceToCenterline≈0), 마지막은 도로 끝.
- `generateCourseWaypoints`: 결정론(동일 opts 동일 결과), 시작점 일치, 점 개수.
