# M18 완료 — 포항 실지형 맵 (실제 표고 DEM + 실제 도로망 OSM)

> 실제 포항(중심 36.019N, 129.3435E, ±5km) 지형·도로를 반영한 'pohang' 맵. 시작화면에서 자연/도시/포항 선택.

## 데이터 (정적 에셋, 런타임 외부 API 호출 없음)

- `scripts/fetch-pohang.mjs` — 빌드/개발 시점 fetch 스크립트.
  - 표고: opentopodata SRTM30m, 80×80 격자(셀 ≈126m) → `src/maps/data/pohang-height.json` (-26~285m, 17KB).
  - 도로: OpenStreetMap Overpass(highway motorway~tertiary) GET → 로컬 미터 투영 → `src/maps/data/pohang-roads.json` (1158 ways, 218KB).
  - 레이트리밋 대비(opentopodata 1req/s, Overpass GET+미러+백오프). 표고 파일 있으면 건너뜀(`--height` 강제).

## 구현

- `src/maps/pohangMap.js` (신규) — `createPohangMap()` + `lonLatToLocal`/`localToLonLat`/`ROAD_WIDTH_POHANG`.
  - `heightAt(x,z)` 격자 bilinear(클로저 캡처=this 비의존), bbox 밖 clamp. `normalAt`=terrainNormal 재사용.
  - `isOnRoad`/`distanceToRoad`: ways→세그먼트, **200m 공간 버킷 인덱스**로 가속(전수탐색 회피, distPointToSegment 결과 일치). 폭 10m.
  - `getSpawn`(최장 way 첫 점), `getDeliveryPoints`(도로 위 최소 800m 이격 최대 8점, label '포항 A~H'), `getMinimapData`(ways+goals+bbox), `getGoals`, `isBlocked=false`.
  - 렌더: buildStatic(하늘/조명, 안개 없음, ways 머지 도로 리본 yLift 0.4), updateWorld(CHUNK_SIZE 250 청크 스트리밍, 정점 y=heightAt, 고도색 물/모래/풀/바위).
- `src/maps/index.js` — 'pohang'(label '포항') 등록. 자연/도시 회귀 0.
- `index.html` — 맵 카드 🏔️ 포항 추가(.map-card 스타일 재사용).

## 테스트

- `src/maps/pohang.test.js`(33) — 투영/heightAt bilinear(코너·중앙·clamp·this 비의존)/isOnRoad·distanceToRoad/getSpawn/getDeliveryPoints(결정론·도로위·이격)/getMinimapData/인터페이스 계약.
- 전체: **356 passed**. build 성공(데이터 json 번들 포함, ~235KB).

## 출처

- 표고: opentopodata SRTM (NASA SRTM). 도로: © OpenStreetMap contributors, ODbL.

## 후속 여지

- 지명 입력(임의 도시 생성): 스크립트 `--place` 지오코딩(A안) 또는 게임 내 입력(B안) — **보류**(나중에).
- OSM 정점 성긴 구간 isOnRoad 끊김, 도로 머지 메시 로드 부하, 지형 스케일/도로 폭 튜닝.

## 설계

- [design/m18-pohang-map.md](../design/m18-pohang-map.md)
