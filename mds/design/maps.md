# 설계 — 맵 추상화 계층 + 도시 맵 (M12)

## 목적
기존 **자연 맵(절차적 지형)** 을 유지하면서 **도시 맵(평평한 아스팔트 + 격자 도로망 + 사각 박스 건물)** 을 추가하고, 시작 화면에서 둘 중 하나를 **선택**해 플레이할 수 있게 한다. 이를 위해 두 맵이 동일하게 구현하는 **맵 추상화 인터페이스**를 도입하고, `main.js`가 특정 지형/도로 모듈에 직접 의존하던 부분을 인터페이스 경유로 바꾼다.

후속 마일스톤의 무대:
- M13(차종 3종) — 맵과 독립이므로 영향 없음.
- M14(배송 모드: 순수 운송, 감점 없음) — 도시 맵의 격자 거리/블록이 배송 지점 배치와 잘 맞는다. 본 설계의 목표 지점(`getGoals`)·`isOnRoad` 인터페이스를 M14가 재사용한다.

> 작업 전 `CLAUDE.md` → `mds/INDEX.md` → 본 문서 순으로 확인. 본 설계는 구현이 아니라 다음 단계(구현·테스트)의 지침이다.

---

## 1. 맵 추상화 인터페이스

`main.js`가 현재 직접 의존하는 지점을 역으로 추려 인터페이스로 묶었다. 모든 맵 객체는 아래 메서드를 **동일 시그니처**로 제공한다. 좌표/판정 등 순수 로직은 THREE 비의존, 씬 구성/청크 메시만 THREE 의존.

### 인터페이스 시그니처 (개념)
```js
// createMap(opts) → mapObject
{
  id,                      // 'natural' | 'city'
  label,                   // 시작 화면 표시용 ('자연 지형' / '도시')

  // ── 높이/법선 (순수) ─────────────────────────────────
  heightAt(x, z),          // → number. 자연=terrainHeight, 도시=평지(0)/연석
  normalAt(x, z),          // → {x,y,z}. 기존 terrainNormal(x,z,heightAt) 재사용 가능

  // ── 주행 가능 영역 (순수) ────────────────────────────
  isOnRoad(x, z),          // → bool. 자연=road.isOnRoad, 도시=cityIsOnRoad
  distanceToRoad(x, z),    // → number. (선택) 채점/이탈 거리. 자연=distanceToCenterline

  // ── 목표 지점 (순수) ─────────────────────────────────
  getGoals(),              // → [{index,x,z, ...}]. M12=체크포인트, M14=배송지점
  getSpawn(),              // → {x, z, y, heading}. 위치+초기 heading

  // ── 세계 스트리밍 (THREE) ────────────────────────────
  buildStatic(scene),      // 코스/도로/조명/배경/포그 등 1회 구성 (자연=courseGroup+조명, 도시=아스팔트 바닥+조명)
  updateWorld(px, pz, scene), // 청크 스트리밍 (자연=createChunk, 도시=격자 도로+건물 타일)
  disposeAll(scene),       // (선택) 맵 전환 시 정리. M12는 새로고침 전환이면 생략 가능

  // ── 미니맵 (순수 데이터) ─────────────────────────────
  getMinimapData(),        // → { polylines:[[{x,z}...]], goals:[{x,z}], bounds } 형태로 통일
}
```

### main.js → 인터페이스 매핑(역추적)
현재 `main.js`에서 지형/도로에 직접 닿는 지점과 대응 인터페이스:

| 현재 코드(main.js) | 인터페이스 |
|---|---|
| `terrainHeight(x,z)` (스폰 y, 카메라 y, `stepVehicle` 콜백) | `map.heightAt` |
| `terrainNormal(d.x,d.z,terrainHeight)` (차체/카메라 up) | `map.normalAt` |
| `createChunk` + `updateWorld(px,pz)` + `loadedChunks` | `map.updateWorld(px,pz,scene)` (loadedChunks는 맵 내부 상태로 이동) |
| `generateCourseWaypoints`/`createRoad`/`placeCheckpoints`/`buildCourse` | `map.buildStatic` + `map.getGoals` |
| `isOnRoad(road,x,z)` (채점) | `map.isOnRoad` |
| `road.waypoints[0]` + spawnHeading | `map.getSpawn` |
| `createMinimap(road, checkpoints)` | `map.getMinimapData` (minimap이 통일 데이터 소비) |
| `scene.background`/`fog`/조명 추가 | `map.buildStatic`(맵별 분위기) |

> **法선 콜백 주의**: `terrainNormal(x,z,sampleHeight,eps)`은 `sampleHeight` 콜백을 받는 순수 함수다. 도시 맵도 `terrainNormal(x,z, map.heightAt)`로 그대로 재사용하면 평지에선 자연히 `{0,1,0}`이 나온다. 즉 `normalAt`은 두 맵 모두 `terrainNormal` 한 줄 래퍼로 충분.

---

## 2. 파일 구조 제안

CLAUDE.md 아키텍처 규약(순수 로직 ↔ THREE 렌더 분리)을 유지한다.

```
src/maps/
  index.js          # 맵 레지스트리: MAPS = { natural, city }, getMap(id), listMaps()
  naturalMap.js     # 현 terrain.js + road.js + render/road.js + createChunk 를 인터페이스로 래핑
  cityMap.js        # 신규: 격자 도로 + 박스 건물 (THREE 렌더 + 청크 스트리밍)
  city.js           # 신규 순수 로직: cityIsOnRoad, 블록/건물 결정론 배치, 격자 좌표 수학
                    #   (cityMap.js 가 city.js 를 소비해 메시 생성 — terrain/road ↔ render/road 관계와 동형)
```

- **순수(테스트 대상)**: `src/maps/city.js`(격자/건물 수학), `src/maps/index.js`의 레지스트리 선택 로직.
- **THREE 의존(수동/통합)**: `cityMap.js`, `naturalMap.js`의 메시·씬 구성 부분.
- `naturalMap.js`는 새 로직을 만들지 않고 **기존 모듈을 그대로 호출**(회귀 0 목표). `createChunk`/`updateWorld`/`loadedChunks`를 `main.js`에서 떼어내 `naturalMap.js` 안으로 이주.

---

## 3. 도시 맵 설계 상세

### 좌표계 / 격자
- 평면 XZ. 자연 맵과 동일하게 `+Z` 전진, heading 0 = +Z.
- 상수(잠정):
  - `BLOCK_SIZE = 60` — 블록(건물 부지) 한 변.
  - `ROAD_WIDTH_CITY = 12` — 도로 폭(자연 8보다 넓게, 격자 교차 주행 여유).
  - `CELL = BLOCK_SIZE + ROAD_WIDTH_CITY = 72` — 격자 한 칸 주기(도로 중심 간 간격).
- 도로 중심선은 `x = k*CELL`, `z = k*CELL` (정수 k)에 놓인다. 즉 모든 정수배 격자선이 도로.

### `cityIsOnRoad(x, z)` — 순수 함수
도로 = 격자선 중심에서 폭 절반 이내. 한 축이라도 격자선 근처면 도로(교차로 포함):
```js
// 격자선 중심까지의 거리(가장 가까운 k*CELL)
function distToGrid(v) {
  const m = ((v % CELL) + CELL) % CELL;   // [0,CELL)
  return Math.min(m, CELL - m);           // 가장 가까운 격자선까지
}
export function cityIsOnRoad(x, z) {
  const half = ROAD_WIDTH_CITY / 2;
  return distToGrid(x) <= half || distToGrid(z) <= half;
}
```
- `distanceToRoad`(이탈 거리용)는 `Math.min(distToGrid(x), distToGrid(z)) - half`를 0 클램프하거나, 채점이 필요 없으면 생략.

### 건물 배치 — 결정론(난수 없음, 좌표 해시)
각 블록은 격자 칸 `(bx, bz)`(정수)로 식별. 블록 중심 = `(bx*CELL + CELL/2 ... )` 보정. 건물은 **블록 내부**(도로 폭을 뺀 영역)에만 둔다.

- 블록 식별: `bx = Math.floor((x)/CELL)`, `bz = Math.floor((z)/CELL)` 류로 청크→블록 매핑.
- 결정론 해시(난수 대체): `terrain.js`의 `rand2D(bx, bz)`를 그대로 재사용해 [0,1) 값을 뽑고, 이를 높이/크기/유무 결정에 사용. (별도 PRNG 불필요, 이미 테스트된 결정론 함수.)
  - `h01 = rand2D(bx*1.0, bz*1.0)` → 건물 높이 `BUILD_MIN_H + h01*(BUILD_MAX_H-BUILD_MIN_H)`.
  - `s01 = rand2D(bx*2.3+7, bz*1.7+3)` → 평면 크기(부지의 50~85%).
  - `e01 = rand2D(bx*0.7+1, bz*3.1+5)` → 빈 블록(공터/광장) 여부 `e01 < 0.12` 면 건물 생략.
- **도로 비겹침 보장**: 건물은 블록 안쪽 `inset = ROAD_WIDTH_CITY/2 + MARGIN(=2)` 만큼 들여 배치하고 크기를 `BLOCK_SIZE - 2*inset` 이하로 캡. 따라서 건물 박스가 격자 도로 폭 영역에 절대 들어가지 않는다(테스트로 검증).
- 박스: `THREE.BoxGeometry(w, h, d)`를 `y = h/2`에 놓아 바닥(아스팔트)에 정렬. 색은 좌표 해시로 회색조 변주(`heightToColorHex` 대신 도시용 단순 팔레트).

> CLAUDE.md "AI 티 안 나는 코드"는 참고만. 청크당 건물 수가 일정하고 좌표 해시 기반이라 배열+반복문이 자연스럽다 — 가독성 우선, 과한 개별 변수 전개는 하지 않는다.

### 바닥 / 차선
- 아스팔트 바닥: 청크(타일)마다 평평한 회색 `PlaneGeometry`(`rotateX(-PI/2)`, `y=0`). 자연 맵 청크 스트리밍과 동일 격자(`CHUNK_SIZE=64` 재사용 권장 — 단순)로 생성/해제.
- (선택) 차선 표시: 격자 도로 중심에 밝은 라인(얇은 Plane 또는 `LineSegments`). M12 최소 구현에선 생략 가능(시각적 사치).

### 청크 스트리밍
- `cityMap.updateWorld(px,pz,scene)`는 자연 맵과 같은 청크 좌표계로 동작:
  - 각 타일에 (a) 아스팔트 바닥 1장, (b) 그 타일 영역에 중심이 든 블록들의 건물 박스를 자식으로 가진 `THREE.Group` 생성.
  - 멀어지면 `dispose`(geometry+material). LOD는 도시 맵에선 불필요(전부 평면+박스) → 거리별 seg 교체 없음.
- 내부 `loadedTiles` Map은 cityMap 내부 상태(자연 맵 `loadedChunks`와 대칭).

### 충돌 (M12 범위)
- **최소 구현**: 건물은 **시각적**으로만 둔다. 주행 정상 판정은 `isOnRoad`(도로 위)로 충분.
- 채점이 켜질 때(`SCORING_ENABLED`)는 도로 이탈 = `!isOnRoad`로 기존 흐름 재사용(건물에 박았는지 별도 판정 안 함).
- (후속 여지) 건물 AABB 충돌은 `city.js`에 `cityBuildingAt(x,z)` 순수 질의를 추가하면 확장 가능하나 **M12 비범위**. 충돌 처리는 단순하게 유지.

---

## 4. 시작 화면 맵 선택 UI

`index.html`의 `#overlay`에 맵 선택을 추가. 클릭 한 번에 시작하던 현재 흐름을 "맵 선택 → 시작"으로 확장.

- 오버레이에 버튼 2개(라디오/카드): `data-map="natural"`, `data-map="city"`.
- 선택값 전달 흐름:
  1. 오버레이에서 맵 버튼 클릭 → `selectedMapId` 저장(기본 `'natural'`).
  2. "시작" 클릭(또는 카드 클릭 즉시 시작) → `main.js`가 `getMap(selectedMapId)`로 맵 생성 후 초기화.
- **초기화 타이밍 주의**: 현재 `main.js`는 모듈 로드 시점에 코스/스폰/청크를 즉시 만든다. 맵 선택을 받으려면 이 초기화를 **`startGame(mapId)` 함수로 감싸** 오버레이 시작 시점에 호출하도록 바꿔야 한다(아래 §5).
- 전환 단순화안: M12에선 "선택 후 시작" 1회만 지원(게임 중 맵 변경 없음). 다른 맵으로 바꾸려면 새로고침 — `disposeAll` 부담을 줄여 회귀 위험 최소화.

---

## 5. main.js 리팩터링 범위 (회귀 위험 표시)

자연 맵은 **동작 불변**이 절대 조건. 변경 지점:

| # | 변경 | 회귀 위험 |
|---|---|---|
| R1 | import를 `getMap`(maps/index) 중심으로 정리, terrain/road 직접 import 제거(또는 naturalMap 내부로 이동) | 중 |
| R2 | `createChunk`/`updateWorld`/`loadedChunks`/`disposeChunk`를 `naturalMap.js`로 이주 | **높음**(청크 LOD 동작 회귀) |
| R3 | 코스 생성 블록(82~86행)·스폰 블록(185~193행)을 `map.buildStatic`/`map.getSpawn` 호출로 대체 | 중 |
| R4 | `stepVehicle(..., terrainHeight)` → `stepVehicle(..., map.heightAt)` | 중(스폰/주행 높이) |
| R5 | `terrainNormal(d.x,d.z,terrainHeight)` → `map.normalAt(d.x,d.z)` | 낮음 |
| R6 | 채점 `isOnRoad(road,...)` → `map.isOnRoad(...)` | 낮음(현재 SCORING_ENABLED=false) |
| R7 | `createMinimap(road,checkpoints)` → `map.getMinimapData()` 소비형으로 minimap 시그니처 조정 | 중(미니맵 회귀) |
| R8 | 모듈 즉시 실행 초기화를 `startGame(mapId)`로 감싸고 오버레이에서 호출 | **높음**(시작 흐름·루프 가드) |
| R9 | `scene.background`/`fog`/조명을 `map.buildStatic`로 이동 | 낮음 |

- **불변 보장 전략**: naturalMap 래퍼는 기존 함수를 그대로 호출하고, 청크 좌표/seg/색/높이 공식을 한 글자도 바꾸지 않는다. 자연 맵 선택 시 화면이 M11과 동일해야 함.

---

## 6. 단위 테스트 설계 가이드 (다음 단계)

순수 모듈 위주(THREE 비의존):

- **`src/maps/city.test.js`**
  - `cityIsOnRoad`: 격자선 위(`x=0,z=0` 교차로) true, 격자선 폭 안 true, 블록 중앙(`CELL/2,CELL/2`) false, 한 축만 도로여도 true.
  - `distToGrid`: 주기 `CELL` 내 대칭성, 경계값.
  - 건물 배치 **결정론**: 같은 `(bx,bz)` → 같은 높이/크기/유무(동일 결과 2회 호출).
  - **도로 비겹침**: 임의 블록의 건물 AABB가 `cityIsOnRoad` 영역과 교차하지 않음(inset 보장) — 여러 블록 샘플 루프.
  - 빈 블록 비율이 합리적 범위(예: 5~20%).
- **`src/maps/index.test.js`**
  - `getMap('natural')`/`getMap('city')`가 인터페이스 메서드를 모두 가진 객체 반환, 알 수 없는 id는 기본값(natural) 또는 에러.
  - `listMaps()` 길이/라벨.
- **`src/maps/naturalMap.test.js`** (래퍼 동치성, THREE 미사용 메서드만)
  - `naturalMap.heightAt(x,z) === terrainHeight(x,z)` (여러 좌표 샘플).
  - `naturalMap.isOnRoad(x,z) === road.isOnRoad(road,x,z)`.
  - `naturalMap.getSpawn()`이 기존 `waypoints[0]`+heading 계산과 일치.
  - `getGoals()` === 기존 `placeCheckpoints` 결과.

> 메시/씬 구성(`buildStatic`,`updateWorld`,건물 BoxGeometry)은 THREE 의존이라 단위 테스트 비대상 — 수동/통합 확인(dev 서버).

---

## 7. 단계 분할 권고

M12는 (추상화 + 신규 도시 맵 + UI)로 범위가 크다. **3분할** 권고:

| 단계 | 내용 | 산출 | 회귀 위험 | 검증 |
|---|---|---|---|---|
| **M12a** | 맵 추상화 인터페이스 + `naturalMap` 래퍼 + main.js 인터페이스 경유로 전환(§5) | maps/index.js, naturalMap.js, main 리팩터 | **높음**(R2/R8) | 자연 맵 화면·주행 M11과 동일(회귀 0), naturalMap 동치성 테스트 |
| **M12b** | `city.js`(순수) + `cityMap.js`(렌더) — 격자 도로·건물·아스팔트·청크 | maps/city.js, cityMap.js | 중(신규, 자연 맵 무관) | city 단위 테스트 그린 + 도시 맵 수동 주행 |
| **M12c** | 시작 화면 맵 선택 UI(§4) + `startGame(mapId)` 결선 | index.html, style.css, main.js | 중(시작 흐름) | 두 맵 선택→플레이 수동 확인 |

- **순서 근거**: M12a로 자연 맵을 인터페이스 위에 올려 **회귀 0**을 먼저 확정(가장 위험한 R2/R8을 도시 맵 변수 없이 격리). 그 위에 M12b/M12c를 안전하게 쌓는다.
- 각 단계마다 기능 단위 커밋 + done 노트(`mds/done/m12a..c-*.md`) + INDEX 갱신(본 설계 작업에서는 INDEX 미수정 지시).

---

## 8. 영향 범위 요약 표

| 파일 | M12a | M12b | M12c |
|---|---|---|---|
| `src/maps/index.js` | 신규 | — | (city 등록) |
| `src/maps/naturalMap.js` | 신규 | — | — |
| `src/maps/city.js` | — | 신규(순수) | — |
| `src/maps/cityMap.js` | — | 신규(THREE) | — |
| `src/main.js` | 대폭(R1~R9) | (city import 없음) | startGame 결선 |
| `src/render/minimap.js` | 시그니처 조정(R7) | — | — |
| `index.html` / `src/style.css` | — | — | 맵 선택 UI |
| `src/terrain.js`/`src/road.js`/`src/render/road.js` | **불변**(naturalMap이 호출만) | — | — |

---

## 결정 사항 / 미해결
- `CHUNK_SIZE=64`를 도시 타일에도 재사용(단순) — 블록 주기 `CELL=72`와 정렬되진 않으나, 건물은 타일이 아니라 **블록 중심 소속**으로 판정하므로 무관.
- 미니맵 통일 포맷(`getMinimapData`) 도입으로 minimap.js가 도로/격자 둘 다 그릴 수 있게 — M12a에서 자연 맵 폴리라인을 이 포맷에 맞춰 회귀 확인.
- 건물 충돌·차선·맵 in-game 전환은 **M12 비범위**(후속).
