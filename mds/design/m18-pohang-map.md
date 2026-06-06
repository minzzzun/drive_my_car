# M18 — 포항 실지형 맵 (실제 표고 DEM + 실제 도로망 OSM) 기술설계

> 실제 **포항시** 지형(고도, DEM)과 **실제 도로망**(OSM)을 반영한 새 맵 `pohang`을 추가한다.
> 시작 화면에서 **자연 지형 / 도시 / 포항** 중 선택 → 그 위에서 기존 배송 모드로 주행.
>
> 핵심 철학: **데이터는 개발 시점에 한 번 받아 정적 에셋으로 커밋**하고, 런타임은 그 에셋만 읽는다.
> 런타임 외부 API 호출 0 (오프라인/CI/Vitest 안정). 맵 인터페이스는 `naturalMap.js`/`cityMap.js`와 **동일 시그니처**.

작업 진입 규약대로 읽은 문서: `CLAUDE.md`, `mds/INDEX.md`, `src/maps/{index,naturalMap,cityMap,city}.js`,
`src/{road,terrain,mission,main}.js`, `src/render/{minimap,bigmap,road}.js`, `src/maps/index.test.js`.

---

## 0. 맵 인터페이스 계약 (반드시 동일하게 구현)

`naturalMap`/`cityMap`이 노출하는 메서드 — `pohangMap`도 빠짐없이 구현한다:

| 메서드 | 순수성 | 반환/역할 |
|---|---|---|
| `id`, `label` | 값 | `'pohang'`, `'포항'` |
| `heightAt(x, z)` | 순수 | 지면 높이 y (m). 차량 동역학·카메라·도로 리프트가 소비 |
| `normalAt(x, z)` | 순수 | 지면 법선 `{x,y,z}` — `terrainNormal(x,z,heightAt)` 재사용 |
| `isOnRoad(x, z)` | 순수 | 도로 폭 내부 여부 (boolean) |
| `distanceToRoad(x, z)` | 순수 | 가장 가까운 도로 중심선까지 거리 (m) |
| `isBlocked(x, z)` | 순수 | 통과 불가(고체) — **포항은 항상 false**(건물 충돌 없음, 회귀/단순화) |
| `getGoals()` | 순수 | 목표 점 배열 `[{index,x,z}]` (미니맵 goals 호환) |
| `getDeliveryPoints()` | 순수·결정론 | `[{x,z,label}]` — 전부 도로 위. `mission.jobsFromPoints`가 소비 |
| `getSpawn()` | 순수 | `{x,z,y,heading}` — 도로 위 한 점 |
| `getMinimapData()` | 순수 | `{polylines:[[{x,z}]], goals:[{x,z}], bounds}` — minimap/bigmap 소비 |
| `buildStatic(scene)` | THREE | 배경/조명/도로 리본 등 정적 씬 |
| `updateWorld(px, pz, scene)` | THREE | 청크(타일) 스트리밍 — `naturalMap` 패턴 그대로 |
| `tick?` | (선택) | 불필요 → 구현 안 함 |

> `main.js`는 `map.heightAt`/`map.normalAt`/`map.isBlocked`/`map.updateWorld`/`map.getDeliveryPoints`/
> `map.getMinimapData`/`map.getSpawn`/`map.buildStatic`를 직접 호출한다. **시그니처가 어긋나면 즉시 깨진다.**
> `heightAt`은 `stepVehicle(vehicle, controls, dt, map.heightAt)`에 **함수 참조로 전달**되므로 `this` 비의존이어야 한다(화살표/클로저로 바인딩).

---

## 1. 데이터 범위 / 투영 (좌표계)

### 1.1 포항 bbox
- **중심**: 포항시청 부근 `lat0 = 36.0190°N`, `lon0 = 129.3435°E` (확정값은 fetch 스크립트 상수).
- **한 변**: 기본 **12 km × 12 km** (요구 10~15km 범위). 시내+해안+남구 일부 기복 포함.
  - bbox: `lat ∈ [lat0 - Δlat, lat0 + Δlat]`, `lon ∈ [lon0 - Δlon, lon0 + Δlon]`.
  - `halfM = 6000`. 아래 투영으로 `Δlat = halfM / M_LAT`, `Δlon = halfM / M_LON`.

### 1.2 위경도 → 로컬 미터 (등거리 평면 근사, 순수)
포항 위도(~36°)에서 작은 영역이므로 **등거리 직교 근사(equirectangular)**로 충분.

```
// 위도 1도 ≈ 111,320 m (거의 상수)
const M_LAT = 111320;
// 경도 1도 ≈ 111,320 * cos(lat) — 포항 기준 위도로 고정
const M_LON = 111320 * Math.cos(lat0 * Math.PI / 180);  // ≈ 90,000 m

// 원점 = bbox 중심(lat0,lon0) → 로컬 (0,0). 게임 +Z = 북(lat↑), +X = 동(lon↑).
function lonLatToLocal(lon, lat) {
  return {
    x: (lon - lon0) * M_LON,   // 동(+X)
    z: (lat - lat0) * M_LAT,   // 북(+Z) — 게임 전진축과 정합
  };
}
function localToLonLat(x, z) {
  return { lon: lon0 + x / M_LON, lat: lat0 + z / M_LAT };
}
```

- **게임 좌표 매핑**: `+Z = 전진 = 북쪽`, `+X = 동쪽`, `y = 고도(m)`. (`getSpawn().heading`은 `atan2(dx, dz)` 컨벤션 — naturalMap과 동일.)
- 로컬 좌표 범위: `x,z ∈ [-6000, +6000]` m.
- **원점 단일화(리스크 §9 핵심)**: 표고 격자와 도로 투영이 **반드시 같은 `lat0/lon0`를 원점**으로 써야 정합. → 두 데이터의 메타에 `origin:{lat0,lon0}`, `bbox`, `metersPerDeg`를 같이 저장하고, 로더가 일치 검증.

---

## 2. 표고 데이터 (DEM)

### 2.1 격자
- 해상도 **128×128** (기본). 한 변 12km → **셀 간격 ≈ 94.5 m** (`12000/127`).
  - 셀 간격이 크면 산이 뭉툭 → 주행감 위해 §2.4 고도 스케일/과장로 보완.
  - 256×256 옵션 가능하나 에셋 용량(§5)·fetch 호출수 증가 → 기본 128.
- 격자 점 좌표: `gridX[i] = -halfM + i*cell`, `gridZ[j] = -halfM + j*cell` (i,j ∈ [0,127]).

### 2.2 획득 (fetch 스크립트, 런타임 아님)
- **API 후보(우선순위)**:
  1. **opentopodata** (`https://api.opentopodata.org/v1/srtm30m?locations=lat,lon|lat,lon|...`) — 한 요청 최대 100 좌표, 1초당 1요청·하루 1000요청 제한.
  2. **open-elevation** (`https://api.open-elevation.com/api/v1/lookup`, POST body `{locations:[{latitude,longitude},...]}`) — 배치 큼, 가동률 변동.
- **쿼리 방식**: 128×128 = 16384점을 **배치로 분할**(opentopodata면 100점/요청 → 164요청, 요청 간 `sleep(1100ms)`로 레이트리밋 준수). 진행률 로그 + 부분 저장(중단/재개 대비).
- **반환 처리**: 각 응답의 `elevation`(m)을 격자 `[j][i]` 순서로 채움. null/실패 셀은 인접 보간 또는 0.

### 2.3 저장 포맷 — `src/maps/data/pohang-height.json`
JSON 채택(파싱 단순·테스트 용이). 16-bit PNG는 디코딩 의존 + 브라우저/노드 이중 경로 필요 → **불채택**.

```json
{
  "meta": {
    "origin": { "lat0": 36.0190, "lon0": 129.3435 },
    "bbox":   { "halfM": 6000 },
    "metersPerDeg": { "lat": 111320, "lon": 90090 },
    "grid":   { "n": 128, "cell": 94.49 },
    "source": "opentopodata/srtm30m",
    "fetchedAt": "2026-06-06"
  },
  "elev": [ /* n*n 개 number(m), row-major: idx = j*n + i */ ]
}
```
- `elev`는 **1차원 배열**(중첩보다 가벼움). idx = `j*n + i`.
- 압축: 소수 1자리 반올림(`Math.round(h*10)/10`)으로 용량 절감(§5).

### 2.4 `heightAt(x, z)` — 격자 bilinear 보간 (순수, 테스트 핵심)
```
function heightAt(x, z) {
  // 로컬→격자 실수 인덱스
  const fx = (x + halfM) / cell;   // [0, n-1] 범위 기대
  const fz = (z + halfM) / cell;
  // bbox 밖이면 가장자리 클램프(맵 밖 추락 방지)
  const cx = clamp(fx, 0, n - 1), cz = clamp(fz, 0, n - 1);
  const i0 = Math.floor(cx), j0 = Math.floor(cz);
  const i1 = Math.min(i0 + 1, n - 1), j1 = Math.min(j0 + 1, n - 1);
  const tx = cx - i0, tz = cz - j0;
  const h00 = elev[j0*n+i0], h10 = elev[j0*n+i1];
  const h01 = elev[j1*n+i0], h11 = elev[j1*n+i1];
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return (a + (b - a) * tz) * HEIGHT_SCALE;   // 과장 옵션
}
```
- `HEIGHT_SCALE` 기본 `1.0`. 주행감을 위해 `1.3~1.6`로 과장 가능(상수 1곳). **DEM 절대고도를 기준고도(셀 최소 or 중심값)에서 뺀 상대고도**로 다뤄 차량 스폰 y가 과도하게 높지 않게(예: `elevBase = elev[중심]` 빼기) — 게임 좌표 y는 상대고도.
- 순수·`this` 비의존: factory 클로저가 `elev/n/cell/halfM`을 캡처한 화살표 함수.

---

## 3. 도로망 데이터 (OSM)

### 3.1 획득 — Overpass API (fetch 스크립트)
- 엔드포인트: `https://overpass-api.de/api/interpreter` (POST, body=쿼리). 미러: `https://overpass.kumi.systems/api/interpreter`.
- 쿼리(bbox + highway 필터, 주행 가능 종류만):
```
[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"]
     (south,west,north,east);
);
out geom;
```
  - `out geom;` → 각 way에 `geometry:[{lat,lon},...]` 폴리라인 직접 포함(노드 별도 조회 불필요, 단순).
  - bbox = `localToLonLat`의 역(중심±half) 결과 위경도.
  - footway/cycleway/service 등은 제외(차량 주행 대상 아님 + 데이터량 절감).

### 3.2 변환 → 세그먼트 (스크립트에서 미리 투영)
- 각 way.geometry의 `(lon,lat)`를 `lonLatToLocal`로 로컬 m 폴리라인으로 변환.
- way 단위 **폴리라인 배열**로 저장(세그먼트화는 로더/맵에서 `createRoad` 스타일로). 너무 촘촘한 점은 다운샘플(연속 점 거리 < 8m면 스킵)로 용량 절감.

### 3.3 저장 포맷 — `src/maps/data/pohang-roads.json`
```json
{
  "meta": { "origin": {...}, "bbox": {...}, "source": "overpass", "highwayTypes": [...] },
  "ways": [
    { "type": "primary", "pts": [ {"x":..,"z":..}, ... ] },
    ...
  ]
}
```
- `meta.origin`은 height와 **반드시 동일**(로더 검증, §1.2).

### 3.4 `isOnRoad` / `distanceToRoad` (순수, road.js 재사용)
- 모든 way를 평탄화한 **세그먼트 배열** 구축(로더가 1회): 각 way 인접 점쌍 → `{ax,az,bx,bz}`.
- `distanceToRoad(x,z)` = 모든 세그먼트에 대해 `road.distPointToSegment(x,z,...)` 최소값.
  - 세그먼트가 많으므로(수천) **공간 그리드 버킷**으로 가속(셀 200m, 인접 9버킷만 검사). 순수 함수 결과는 동일, 성능만 개선.
- `isOnRoad(x,z)` = `distanceToRoad(x,z) <= ROAD_WIDTH_POHANG/2`.
- **도로 폭** `ROAD_WIDTH_POHANG = 10`(차종 type에 따라 약간 넓게; naturalMap 8보다 넓혀 OSM 정점 성김 보정).

### 3.5 `getDeliveryPoints` / `getSpawn` / `getMinimapData` (순수·결정론)
- **`getDeliveryPoints`**: 도로 위 결정론 선택.
  - 방법: 전체 way 중 **점 개수·길이 기준 상위 N개 주요 도로**를 결정론 정렬(길이 내림차순, 동률은 첫 점 x→z)한 뒤, 그 도로들의 등간격 점에서 8개 선정. 각 점은 그 도로 위 = 도로 위 보장.
  - 또는 더 단순: 모든 way 정점을 결정론 정렬해 **인접 점 최소거리 ≥ 600m** 필터로 8개 추출(공간 분산). label은 `'지점 A'..'지점 H'` 또는 가까운 way.type 기반.
  - 결정론: 입력 데이터 고정 → 항상 같은 결과(난수 금지).
- **`getSpawn`**: 가장 긴 way의 첫 점 = `{x,z}`, `y = heightAt(x,z)`, `heading = atan2(dx,dz)`(그 way 둘째 점 방향). 도로 위 보장.
- **`getMinimapData`**:
  ```
  { polylines: ways.map(w => w.pts),
    goals: deliveryPoints.map(p => ({x:p.x, z:p.z})),
    bounds: { minX:-halfM, maxX:halfM, minZ:-halfM, maxZ:halfM } }
  ```
  - polylines가 수천이면 미니맵 부하 → **간선(primary/secondary/trunk)만** polylines로 내보내는 다운샘플 옵션. bounds 명시(전체 bbox).

---

## 4. 렌더

### 4.1 지형 — heightmap 청크 스트리밍 (naturalMap 패턴 재사용)
- `naturalMap.createChunk`를 본떠 `createPohangChunk(cx, cz)`:
  - `PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg)` + `rotateX(-π/2)`.
  - 각 정점 `wx,wz`에서 `pos[i+1] = heightAt(wx,wz)`(보간 DEM). 양자화 불필요(부드러운 지형).
  - **색** = 고도/경사 기반: `terrain.heightToColorHex(h)` 재사용 가능하나, 포항용 팔레트 권장
    (해안=모래/물, 평지=초록, 산지=바위/회색). 경사(법선 y) 낮으면 바위색으로 셰이딩.
  - `getSeg(cx,cz,pcx,pcz)`로 LOD(naturalMap 동일). `computeVertexNormals()`.
- `updateWorld`/`disposeChunk`/`loadedChunks` 로직은 **naturalMap에서 거의 그대로 이주**(좌표·스트리밍 불변). bbox 밖 청크는 `heightAt` 클램프로 평탄 가장자리.

### 4.2 도로 — 폴리라인 리본 (render/road.js 응용)
- `render/road.js`의 `buildRoadMesh`는 **단일 도로**용(`pointAtDistance` 기반). 포항은 way가 다수 →
  way마다 폴리라인 리본 생성하는 `buildPohangRoads(ways, heightAt)` 신설(같은 리본 알고리즘 재사용):
  - 각 way.pts를 따라 좌우 `±halfW` 오프셋 정점 + `y = heightAt(..) + yLift(0.2)`로 지형 위에 살짝.
  - 모든 way를 **하나의 BufferGeometry로 머지**(드로콜 절감) — 정적 1회 `buildStatic`에서 생성.
  - 간선/지선 색 구분(간선 짙은 회색, 지선 약간 밝게) 선택.
- `buildStatic(scene)`: 배경(하늘색)·조명(naturalMap과 동일 톤)·도로 머지 메시 추가.
  - 도로 정점이 매우 많으면 머지 메시가 무거움 → **간선만 리본, 지선은 isOnRoad 판정만**(렌더 생략) 옵션으로 부하 조절.

---

## 5. fetch 스크립트 — `scripts/fetch-pohang.mjs`

Node ESM 스크립트(런타임 아님, 개발자만 실행). `package.json`에 `"fetch:pohang": "node scripts/fetch-pohang.mjs"` 추가 제안.

### 5.1 동작
1. 상수: `lat0/lon0/halfM/n/highwayTypes`.
2. **표고**: 128×128 좌표 생성 → opentopodata 배치(100/요청, `sleep(1100)`) → `pohang-height.json` 저장. 부분 진행 캐시(`*.partial.json`)로 중단 재개.
3. **도로**: Overpass 쿼리 POST → way.geometry 투영·다운샘플 → `pohang-roads.json` 저장.
4. 두 파일에 동일 `meta.origin` 기록.

### 5.2 레이트리밋/실패 대비
- 타임아웃·429·5xx 시 지수 백오프 재시도(최대 3회), 미러 엔드포인트 폴백.
- 표고 API_A 실패 → API_B 자동 전환.
- 전부 실패 시 **비정상 종료하지 않고** §5.3 폴백 데이터 생성으로 경고 출력.

### 5.3 폴백 (데이터 없을 때도 맵이 깨지지 않게) — **중요**
- 레포에는 처음부터 **작은 샘플/절차적 폴백 데이터**를 커밋해 둔다(네트워크 없이도 게임 동작):
  - **표고 폴백**: `terrain.smoothNoise`를 재사용한 절차적 DEM을 스크립트가 생성(또는 32×32 저해상 실측 1회분). `meta.source:"fallback-procedural"`.
  - **도로 폴백**: 포항 도로를 본뜬 **소수의 결정론 폴리라인**(간선 격자/해안선 모사) 몇 개. 전부 로컬 좌표.
- 로더는 `meta.source`와 무관하게 같은 포맷만 보면 됨 → 실측/폴백 **투명 교체**.
- M18a에서 **폴백 데이터를 먼저 커밋**(작은 용량) → 실측 fetch 성공 시 같은 파일 덮어쓰기.

### 5.4 에셋 크기 관리
- 128×128 소수1자리 JSON ≈ 16384×~6B ≈ **~100KB**(gzip 후 더 작음). 256×256은 ~400KB → 기본 128 유지.
- 도로: 다운샘플(8m) + 간선 위주 → 수십~수백 KB. 너무 크면 지선 제외.
- 로더 import는 `import height from './data/pohang-height.json'`(Vite JSON 기본 지원) 또는 `fetch('/...json')`. **정적 import 권장**(번들에 포함, 테스트에서 직접 require 가능).

---

## 6. 맵 인터페이스 / 레지스트리 등록

- `src/maps/index.js`:
  ```js
  import { createPohangMap } from './pohangMap.js';
  const MAP_FACTORIES = { natural: ..., city: ..., pohang: createPohangMap };
  const MAP_LABELS    = { natural: '자연 지형', city: '도시', pohang: '포항' };
  ```
- `index.html`: map-card 추가 `data-map="pohang"`(아이콘 🌊/🏔️, 라벨 '포항'). `main.js`의 map-card 핸들러는 일반화돼 있어 수정 불필요.
- **자연/도시 회귀 0**: 기존 factory/label/테스트 불변. 추가만.

---

## 7. 단위 테스트 가이드 (순수 부분만 — `pohangMap.test.js` 신설)

THREE/시각(buildStatic/updateWorld/렌더 색)은 수동 검증. 아래는 Vitest 대상:

1. **투영 라운드트립**: `localToLonLat(lonLatToLocal(lon,lat))` ≈ 원래값(허용 1e-6). 원점 `(lon0,lat0)→(0,0)`. 북쪽 위도↑ → z↑, 동쪽 경도↑ → x↑(부호·축 정합).
2. **heightAt bilinear**:
   - 격자 코너 좌표에서 `heightAt` == 해당 `elev`(스케일 반영).
   - 두 코너 중앙은 두 고도의 평균(선형).
   - bbox 밖(예 x=halfM+1000)은 가장자리 클램프값(NaN/추락 없음).
   - 작은 합성 elev 배열(예 4×4)로 결정론 검증.
3. **isOnRoad / distanceToRoad**: 합성 way(직선 세그먼트) 주입 → 중심선 위=0, 폭 절반 경계, 폭 밖 판정. `distPointToSegment` 결과와 일치.
4. **getDeliveryPoints**: (a) 결정론(두 번 호출 동일), (b) 모든 점이 `isOnRoad`=true, (c) 점 개수·label 존재, (d) 인접 점 최소거리 조건 충족.
5. **getSpawn**: 도로 위(`isOnRoad`), `y === heightAt(x,z)`, heading 유한.
6. **getMinimapData**: polylines 비어있지 않음, goals == deliveryPoints 좌표, bounds = bbox.
7. **데이터 로더 파싱**: height/roads JSON → 격자 길이 `n*n`, ways 구조, **meta.origin 일치 검증**(불일치 시 throw 또는 경고). 폴백 데이터로도 로더가 동작.
8. **인터페이스 계약**(index.test 확장): `getMap('pohang').id==='pohang'`, 순수 메서드 전부 함수, `isBlocked` 존재(항상 false), `listMaps()`에 pohang 포함.

> 테스트는 실측 대용량 JSON 대신 **작은 합성/폴백 데이터**를 주입(팩토리에 데이터 주입 인자 `createPohangMap({ height, roads })` 추가, 기본은 실파일) — 빠르고 결정론.

---

## 8. 단계 분할 권고

| 단계 | 내용 | 산출/검증 | 영향 범위 |
|---|---|---|---|
| **M18a** | fetch 스크립트 + 데이터 포맷 + **작은 샘플/폴백 데이터 커밋** | `scripts/fetch-pohang.mjs`, `src/maps/data/pohang-{height,roads}.json`(폴백), 로더 파싱 테스트 | 신규 파일만. 기존 0 변경 |
| **M18b** | `pohangMap` 순수 로직 + 테스트 | 투영·`heightAt`·`isOnRoad`·`distanceToRoad`·`getDeliveryPoints`·`getSpawn`·`getMinimapData` + `pohangMap.test.js` | `src/maps/pohangMap.js`(순수부), 데이터 로더 모듈 |
| **M18c** | 렌더(지형 청크·도로 리본) + 선택 UI 등록 | `buildStatic`/`updateWorld`/`createPohangChunk`/`buildPohangRoads`, `index.js` 등록, `index.html` 카드 | `pohangMap.js`(THREE부), `maps/index.js`, `index.html` |

**영향 범위 표(파일별)**

| 파일 | 변경 | 비고 |
|---|---|---|
| `src/maps/pohangMap.js` | 신규 | factory `createPohangMap` |
| `src/maps/pohangData.js`(권장) | 신규 | JSON 로드·검증·세그먼트/공간버킷 구축(순수) |
| `src/maps/data/pohang-height.json` | 신규(에셋) | 폴백 먼저, 실측 덮어쓰기 |
| `src/maps/data/pohang-roads.json` | 신규(에셋) | 〃 |
| `scripts/fetch-pohang.mjs` | 신규 | 개발자 실행용 |
| `src/maps/index.js` | 1줄 추가×2 | factory/label 등록(회귀 0) |
| `index.html` | 카드 1개 추가 | 회귀 0 |
| `src/maps/pohangMap.test.js` | 신규 | 순수 테스트 |
| `package.json` | script 1개(선택) | `fetch:pohang` |
| `main.js`, `road.js`, `terrain.js`, `mission.js`, `render/*` | **변경 없음** | 인터페이스로 흡수 |

---

## 9. 리스크 / 대응

1. **데이터 획득 실패(API down/레이트리밋)** → §5.3 폴백 데이터를 레포에 선커밋. 게임은 폴백으로도 완전 동작. 실측은 가능할 때 덮어쓰기.
2. **에셋 용량** → 128 격자·소수1자리·도로 다운샘플(8m)·간선 위주로 ~수백KB 이내. 256 격자는 옵션.
3. **좌표 정합(고도격자 vs 도로 원점)** → 두 JSON `meta.origin` 동일 강제 + 로더 검증(불일치 throw). 같은 `lonLatToLocal` 사용.
4. **bbox 경계 추락** → `heightAt` 가장자리 클램프 + 청크 가장자리 평탄.
5. **도로 세그먼트 과다로 `distanceToRoad` 비용** → 공간 버킷 그리드(순수 결과 동일, 성능만). 미니맵/리본은 간선 위주 다운샘플.
6. **OSM 위경도 정점 성김 → isOnRoad 끊김** → 도로 폭 10m로 약간 넓힘, 세그먼트 보간.
7. **DEM 절대고도로 스폰 y 과대** → 중심 고도 기준 상대화 + `HEIGHT_SCALE` 튜닝.

---

## 10. 설계 핵심 요약

- **데이터 범위/투영**: 포항 중심(36.0190N,129.3435E) 12km×12km bbox. 등거리 평면 근사로 위경도→로컬m(`M_LAT=111320`, `M_LON=111320·cos lat0≈90km/deg`), 원점=중심, +Z=북·+X=동·y=고도. 표고·도로가 **동일 origin** 공유(정합 핵심).
- **표고**: 128×128 격자(셀 ≈94.5m), opentopodata(SRTM)/open-elevation 배치 fetch → `src/maps/data/pohang-height.json`(1D `elev`+meta). `heightAt`은 격자 **bilinear 보간**(순수, 가장자리 클램프, `HEIGHT_SCALE` 과장).
- **도로**: Overpass `out geom`으로 highway 폴리라인 → 로컬m 투영·다운샘플 → `pohang-roads.json`(ways). `isOnRoad/distanceToRoad`는 `road.distPointToSegment` + 공간버킷, 폭 10m. `getDeliveryPoints/getSpawn`은 도로 위 결정론 선택.
- **렌더**: 지형=naturalMap 청크 패턴(PlaneGeometry, `heightAt`→y, 고도/경사 색, LOD `getSeg`) 스트리밍. 도로=way 폴리라인 리본 머지 메시(`render/road.js` 알고리즘 응용, 지형 위 yLift).
- **fetch 스크립트**: `scripts/fetch-pohang.mjs`(node) — 표고/Overpass 배치 fetch, 레이트리밋 sleep·백오프·미러·API 폴백. **데이터 없을 때 절차적/소형 폴백 데이터 생성·선커밋**으로 맵 비파손. 에셋 ~수백KB.
- **레지스트리**: `index.js`에 `pohang`(label '포항') 추가 + `index.html` 카드. 자연/도시 회귀 0(추가만).
- **분할**: M18a(fetch+포맷+폴백 데이터) → M18b(순수 로직+테스트) → M18c(렌더+UI 등록).
- **테스트 대상(순수)**: 투영 라운드트립, `heightAt` bilinear(코너/중앙/경계), `isOnRoad/distanceToRoad`, `getDeliveryPoints`(결정론·도로위), `getSpawn`, `getMinimapData`, 로더 파싱·origin 일치, 인터페이스 계약. THREE/시각은 수동.
- **리스크**: 데이터 획득 실패→폴백 선커밋, 에셋 용량→다운샘플, 원점 정합→meta.origin 검증, 경계 추락→클램프, 세그먼트 과다→공간버킷.
