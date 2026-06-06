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

  // ── 통과 불가(고체) 판정 (순수) ──────────────────────
  isBlocked(x, z),         // → bool. 좌표가 통과 불가 고체(건물 등) 내부면 true.
                           //   자연=항상 false(회귀 0), 도시=cityIsBlocked(건물 AABB 내부)

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
| (신규) `stepVehicle` 후 새 위치 충돌 클램프 | `map.isBlocked(newX,newZ)` |
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

### 건물 배치 — 결정론(난수 없음, 좌표 해시) + 다양화(M12b 피드백)
각 블록은 격자 칸 `(bx, bz)`(정수)로 식별. 블록 중심 = `(bx*CELL + CELL/2 ... )` 보정. 건물은 **블록 내부**(도로 폭을 뺀 영역)에만 둔다.

- 블록 식별: `bx = Math.floor((x)/CELL)`, `bz = Math.floor((z)/CELL)` 류로 청크→블록 매핑.
- 결정론 해시(난수 대체): `terrain.js`의 `rand2D(bx, bz)`를 그대로 재사용해 [0,1) 값을 뽑고, 이를 높이/크기/유무/색 결정에 사용. (별도 PRNG 불필요, 이미 테스트된 결정론 함수.)
- **도로 비겹침 보장**: 건물은 블록 안쪽 `inset = ROAD_WIDTH_CITY/2 + MARGIN(=2)` 만큼 들여 배치하고 크기를 `BLOCK_SIZE - 2*inset` 이하로 캡. 따라서 건물 박스가 격자 도로 폭 영역에 절대 들어가지 않는다(테스트로 검증).
- 박스: `THREE.BoxGeometry(w, h, d)`를 `y = h/2`에 놓아 바닥에 정렬.

#### (1) 색상 다양화 — 도시 팔레트 + 결정론 인덱스 선택
현재 `cityMap.createTile`이 `rand2D`로 회색조(0.4~0.7) 한 가지 톤만 변주한다. 이를 **고정 도시 팔레트 N색**에서 결정론으로 1색 고르는 방식으로 바꾼다.

- `city.js`에 팔레트 상수 추가(예 6색 — 콘크리트 회색조 2~3 + 벽돌/베이지 + 청록 유리톤):
  ```js
  export const BUILDING_PALETTE = [
    0x9aa0a6, // 콘크리트 밝은 회색
    0x6f757c, // 콘크리트 짙은 회색
    0xb7a890, // 베이지/석재
    0x9c5f4e, // 벽돌(테라코타)
    0x5f7c8a, // 청회색 유리톤
    0x7d8a73, // 옅은 올리브(저층 외벽)
  ];
  ```
- 색 인덱스 선택(높이/크기 해시와 **다른 시드**로 독립 결정):
  ```js
  const c01 = rand2D(bx * 5.2 + 11, bz * 3.7 + 2);          // 색 전용 시드
  const colorIndex = Math.floor(c01 * BUILDING_PALETTE.length) % BUILDING_PALETTE.length;
  const colorHex   = BUILDING_PALETTE[colorIndex];
  ```
  > `c01`이 정확히 1.0이 될 일은 없지만(`rand2D ∈ [0,1)`), `% length`로 경계를 한 번 더 방어한다.
- 같은 `(bx,bz)`는 항상 같은 색(결정론) — 테스트 대상.

#### (2) 높이/평면 범위 확대 — 고층·저층 혼합
- 높이 범위 확대: `BUILD_MIN_H = 6`, `BUILD_MAX_H = 90`(기존 8~60 → 6~90). 저층 상가~고층 빌딩이 섞이도록.
- 고층/저층 비율 변주(선택, 단순화): 별도 해시 `t01 = rand2D(bx*0.9+13, bz*2.1+6)`로 `t01 < 0.7`이면 **저층대**(`BUILD_MIN_H ~ 30`), 아니면 **고층대**(`30 ~ BUILD_MAX_H`)에서 `h01`로 보간. 이러면 저층이 다수·고층이 소수로 자연스러운 스카이라인이 된다. (간단히 유지하려면 단일 범위 `h01` 보간만 써도 무방 — 구현 시 택1.)
- 평면 크기 변주 폭 확대: 기존 `0.6 + s*0.4`(60~100%) → `0.45 + s*0.55`(45~100%)로 넓혀 좁은 건물/넓은 건물이 섞이게. `w`/`d`는 여전히 독립 해시(`sW`/`sD`)라 정사각~직사각 혼합.

#### (3) `buildingAt` 반환에 색 필드 추가
- 기존 `{ exists, cx, cz, w, d, h }` → `{ exists, cx, cz, w, d, h, colorHex, colorIndex }`로 확장.
  - `colorHex`: 위 팔레트에서 고른 hex(렌더가 그대로 `MeshPhongMaterial({ color })`에 사용).
  - `colorIndex`: 테스트/디버그 편의(결정론 검증을 hex 대신 index로도 가능).
  - `exists:false`일 때는 `colorHex:0, colorIndex:-1` 등 무의미값으로 둔다(렌더가 `exists` 가드로 건너뜀).
- `cityMap.createTile`은 더 이상 `rand2D` 회색조를 직접 계산하지 않고 `b.colorHex`만 사용 → 색 결정 로직이 순수 모듈(`city.js`)로 일원화(테스트 가능).

> CLAUDE.md "AI 티 안 나는 코드"는 참고만. 청크당 건물 수가 일정하고 좌표 해시 기반이라 배열+반복문이 자연스럽다 — 가독성 우선, 과한 개별 변수 전개는 하지 않는다.

### 바닥 / 도로 색 구분 / 차선
현재 타일은 단일 회색 아스팔트 `Plane`(`0x3a3d42`) 한 장이라 도로와 블록 바닥이 구분되지 않는다(피드백 ②). 도로 영역과 비도로(블록/인도) 영역의 색을 시각적으로 분리한다.

- **색 상수**(`city.js` 또는 `cityMap.js`에 정의):
  ```js
  export const GROUND_COLOR = 0x8d9199; // 비도로(블록 바닥/인도) — 밝은 콘크리트
  export const ROAD_COLOR   = 0x32353b; // 도로 — 짙은 아스팔트
  ```
- **렌더 방식 — 택1**:
  - **(a) 권장: 비도로색 바닥 Plane + 그 위에 도로 스트립 메시 덮기.**
    - 타일 바닥은 `GROUND_COLOR` 단일 `PlaneGeometry`(`y=0`).
    - 그 위에 격자 도로 영역을 `ROAD_COLOR` 스트립으로 덮는다: 타일 범위와 겹치는 격자선 `x=k*CELL`, `z=k*CELL`마다 폭 `ROAD_WIDTH_CITY`·길이 `CHUNK_SIZE`의 얇은 `PlaneGeometry`(또는 `BoxGeometry`)를 `y=0.01`(z-fighting 회피)에 깐다.
    - 한 타일에 걸치는 격자선만 순회(건물 블록 인덱스 산출과 동일한 `bxMin..bxMax`/`bzMin..bzMax` 범위 재사용)해 세로/가로 스트립을 추가. 교차로는 세로·가로 스트립이 겹쳐 자연히 덮인다.
    - **권장 근거**: 메시 추가만으로 끝나 단순·안정적이고, 기존 타일 스트리밍/`disposables` 구조에 스트립 geo/mat만 추가 push하면 dispose도 그대로 동작.
  - **(b) 대안: 정점 색(vertex color) Plane 한 장.**
    - 바닥 `PlaneGeometry`에 세분 격자를 주고 각 정점 월드 좌표에 `cityIsOnRoad`를 적용해 `ROAD_COLOR`/`GROUND_COLOR`를 `color` attribute로 칠한다(`vertexColors:true`).
    - 메시 1장으로 끝나지만 도로 경계가 정점 해상도에 의존해 계단지고, 세분 비용·구현 복잡도가 (a)보다 높다 → **비권장**.
- (선택) 중앙 차선: 격자 도로 중심선에 밝은 얇은 라인(`y=0.02` Plane 또는 `LineSegments`, 색 `0xd8d2b0`)을 후속으로 추가 가능. **본 M12b 보강 범위에서는 도로/바닥 색 분리까지만 하고 차선은 후속 여지로 남긴다.**

### 청크 스트리밍
- `cityMap.updateWorld(px,pz,scene)`는 자연 맵과 같은 청크 좌표계로 동작:
  - 각 타일에 (a) 아스팔트 바닥 1장, (b) 그 타일 영역에 중심이 든 블록들의 건물 박스를 자식으로 가진 `THREE.Group` 생성.
  - 멀어지면 `dispose`(geometry+material). LOD는 도시 맵에선 불필요(전부 평면+박스) → 거리별 seg 교체 없음.
- 내부 `loadedTiles` Map은 cityMap 내부 상태(자연 맵 `loadedChunks`와 대칭).

### 충돌 — 건물 통과 차단(M12b 보강, 핵심 피드백 ③)
기존엔 건물을 시각적으로만 두고 통과를 허용했으나, 피드백 ③으로 **차량이 건물 박스를 통과하지 못하게** 한다. 순수 물리(`vehicle.js`/`dynamics.js`)는 건드리지 않고, **순수 질의 + main의 위치 클램프**로 구현한다(아키텍처상 충돌은 맵 책임, 적용은 결선부 책임).

#### (1) `city.js` 순수 질의 추가
- `cityBuildingAt(x, z)` → 해당 좌표를 **건물 AABB 안에 포함하는** 건물의 정보(또는 `null`).
  - 좌표가 속한 블록만 계산하면 충분: `bx = Math.floor(x/CELL)`, `bz = Math.floor(z/CELL)`로 블록을 구하고 그 블록의 `buildingAt(bx,bz)` 하나만 AABB 검사.
  - **인접 블록 보정**: 건물은 블록 중앙 정렬이라 한 블록당 1동이고 도로 inset 안쪽에 있으므로, 한 좌표가 들어갈 수 있는 건물은 자신이 속한 블록의 건물뿐이다. 따라서 인접 블록 순회 없이 **자기 블록 1개만** 검사하면 된다(단순·빠름).
  - AABB 판정:
    ```js
    export function cityBuildingAt(x, z) {
      const bx = Math.floor(x / CELL), bz = Math.floor(z / CELL);
      const b = buildingAt(bx, bz);
      if (!b.exists) return null;
      const hw = b.w / 2, hd = b.d / 2;
      if (x >= b.cx - hw && x <= b.cx + hw && z >= b.cz - hd && z <= b.cz + hd) {
        return b;     // { exists, cx, cz, w, d, h, colorHex, ... }
      }
      return null;
    }
    ```
- `cityIsBlocked(x, z)` → `cityBuildingAt(x, z) !== null` (bool). 건물 내부면 true.

#### (2) 맵 인터페이스 `isBlocked(x,z)` 구현(§1)
- `naturalMap.isBlocked = () => false` (자연 맵엔 통과 불가 고체 없음 — 회귀 0).
- `cityMap.isBlocked(x, z) { return cityIsBlocked(x, z); }`.

#### (3) main.js 결선 — 위치 클램프
`updateVehicle(dt)`에서 `stepVehicle`가 새 위치를 계산한 **직후**, 새 좌표가 막혀 있으면 이동을 무효화한다.
- 패턴:
  1. `stepVehicle` 전 **이전 위치**를 보관(`const prevX = vehicle.dyn.x, prevZ = vehicle.dyn.z;`).
  2. `vehicle = stepVehicle(...)` 후 `const d = vehicle.dyn;`.
  3. `if (map.isBlocked(d.x, d.z)) { d.x = prevX; d.z = prevZ; vehicle.speed = 0; }` — 위치를 되돌리고 속도 0(정지). `d.y`는 맵 높이라 도시(평지)에선 무관.
  - `vehicle.dyn`은 `stepVehicle` 결과 객체이므로 필드를 직접 덮어써도 다음 프레임 적분 입력으로 안전하게 쓰인다(순수 모듈은 입력 상태를 읽기만 함). `vehicle.speed`도 0으로 맞춰 다음 프레임이 다시 건물로 파고들지 않게 한다.
- **슬라이딩(벽 따라 미끄러짐) 여부**: 최소 구현은 **정지**(x,z 모두 되돌림)로 권고. 옵션으로 축별 분리 클램프(막힌 축만 되돌리고 다른 축은 허용 → 벽을 따라 미끄러짐)도 가능:
  ```js
  // 옵션: 축 분리 슬라이딩
  if (map.isBlocked(d.x, prevZ)) d.x = prevX;   // x 이동만으로 충돌 → x 되돌림
  if (map.isBlocked(prevX, d.z)) d.z = prevZ;   // z 이동만으로 충돌 → z 되돌림
  ```
  단순함을 위해 **기본은 전체 정지**, 슬라이딩은 후속 개선 여지로 명시.

#### (4) 엣지 케이스
- **스폰**: 스폰은 교차로(도로 위, 건물 inset 밖)라 항상 통과 가능 영역 — 스폰이 건물 안일 위험 없음(테스트로 `cityIsBlocked(spawn) === false` 확인 가능).
- **고속 터널링**: 프레임당 이동거리 = `speed * dt`. 최대 속도×`dt(≤0.05)`가 가장 얇은 건물 폭(`minFootprint ≈ 45%*44 ≈ 20`)보다 작으면 점 샘플 클램프로 충분히 막힌다. 현재 속도 영역에선 안전하나, 극단적 고속이 생기면 **이동 선분 샘플링(중간 점 몇 개 검사)** 으로 보강 가능 — 본 보강 범위 밖, 주석으로만 언급.
- 건물은 도로 inset 밖에 있어 `cityIsBlocked`와 `cityIsOnRoad`는 상호 배타적(도로 위면 절대 막히지 않음) — 테스트로 정합 확인.

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
  - 건물 배치 **결정론**: 같은 `(bx,bz)` → 같은 높이/크기/유무/**색**(`colorHex`·`colorIndex` 동일, 2회 호출 일치).
  - 건물 **색 유효성**: `exists` 건물의 `colorHex`가 `BUILDING_PALETTE`에 포함, `colorIndex ∈ [0, PALETTE.length)`.
  - 건물 **높이/크기 범위**: `h ∈ [BUILD_MIN_H, BUILD_MAX_H]`, `w,d ≤ maxFootprint`(=`BLOCK_SIZE-2*INSET`)·`> 0` — 확대된 범위 내인지 여러 블록 샘플.
  - **도로 비겹침**: 임의 블록의 건물 AABB가 `cityIsOnRoad` 영역과 교차하지 않음(inset 보장) — 여러 블록 샘플 루프.
  - 빈 블록 비율이 합리적 범위(예: 5~20%).
  - **`cityBuildingAt`/`cityIsBlocked`(신규)**:
    - 건물 중심 `(b.cx,b.cz)`에서 `cityIsBlocked === true`, 반환 건물이 `buildingAt(bx,bz)`와 **정합**(같은 `cx,cz,w,d`).
    - 도로 위 좌표(`x=0,z=0` 등 `cityIsOnRoad===true`)에서 `cityIsBlocked === false` (도로↔건물 상호 배타).
    - 빈 블록(`exists:false`) 중심에서 `cityBuildingAt === null`.
    - AABB 경계 바로 밖(`cx + w/2 + ε`)에서 `false`, 바로 안에서 `true`.
- **`src/maps/index.test.js`**
  - `getMap('natural')`/`getMap('city')`가 인터페이스 메서드를 모두 가진 객체 반환, 알 수 없는 id는 기본값(natural) 또는 에러.
  - `listMaps()` 길이/라벨.
- **`src/maps/naturalMap.test.js`** (래퍼 동치성, THREE 미사용 메서드만)
  - `naturalMap.heightAt(x,z) === terrainHeight(x,z)` (여러 좌표 샘플).
  - `naturalMap.isOnRoad(x,z) === road.isOnRoad(road,x,z)`.
  - `naturalMap.isBlocked(x,z) === false` (여러 좌표 — 자연 맵엔 고체 없음, 회귀 0).
  - `naturalMap.getSpawn()`이 기존 `waypoints[0]`+heading 계산과 일치.
  - `getGoals()` === 기존 `placeCheckpoints` 결과.

> 메시/씬 구성(`buildStatic`,`updateWorld`,건물 BoxGeometry, 도로 스트립/바닥 색, 건물 팔레트 적용)은 THREE 의존이라 단위 테스트 비대상 — **dev 서버에서 수동 확인**: 건물 색이 여러 색으로 섞여 보이는지, 도로(짙은 아스팔트)와 블록 바닥(밝은 콘크리트)이 구분되는지, 차량이 건물에 막혀 정지하는지.

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

| 파일 | M12a | M12b | M12c | M12b 보강(피드백 ①②③) |
|---|---|---|---|---|
| `src/maps/index.js` | 신규 | — | (city 등록) | — |
| `src/maps/naturalMap.js` | 신규 | — | — | `isBlocked: ()=>false` 추가 |
| `src/maps/city.js` | — | 신규(순수) | — | `BUILDING_PALETTE`·색/높이 확대·`colorHex`·`cityBuildingAt`·`cityIsBlocked`·`ROAD/GROUND_COLOR` |
| `src/maps/cityMap.js` | — | 신규(THREE) | — | `b.colorHex` 사용·도로 스트립+비도로 바닥·`isBlocked` 노출 |
| `src/main.js` | 대폭(R1~R9) | (city import 없음) | startGame 결선 | `updateVehicle`에 `isBlocked` 위치 클램프 |
| `src/render/minimap.js` | 시그니처 조정(R7) | — | — | — |
| `index.html` / `src/style.css` | — | — | 맵 선택 UI | — |
| `src/terrain.js`/`src/road.js`/`src/render/road.js` | **불변**(naturalMap이 호출만) | — | — | **불변**(rand2D만 재사용) |
| `src/vehicle/dynamics.js`·`vehicle.js` | — | — | — | **불변**(충돌은 main 클램프, 순수 물리 미수정) |

**맵 인터페이스 추가**: 모든 맵에 `isBlocked(x,z)` 메서드 추가(§1). 자연=항상 false, 도시=`cityIsBlocked`.

---

## 결정 사항 / 미해결
- `CHUNK_SIZE=64`를 도시 타일에도 재사용(단순) — 블록 주기 `CELL=72`와 정렬되진 않으나, 건물은 타일이 아니라 **블록 중심 소속**으로 판정하므로 무관.
- 미니맵 통일 포맷(`getMinimapData`) 도입으로 minimap.js가 도로/격자 둘 다 그릴 수 있게 — M12a에서 자연 맵 폴리라인을 이 포맷에 맞춰 회귀 확인.
- **건물 충돌은 M12b 보강에서 범위에 포함**(피드백 ③): `city.js` 순수 질의 `cityBuildingAt`/`cityIsBlocked` + 맵 인터페이스 `isBlocked` + main 위치 클램프(정지). 슬라이딩·선분 샘플링·맵 in-game 전환·중앙 차선은 여전히 후속.
- **건물 다양화(피드백 ①)**: 고정 도시 팔레트 6색 + 색 전용 해시 인덱스 선택, 높이 6~90·평면 45~100%로 범위 확대, `buildingAt`에 `colorHex` 추가. 전부 결정론 유지.
- **도로/바닥 색 분리(피드백 ②)**: `ROAD_COLOR`/`GROUND_COLOR` 상수, 비도로 바닥 Plane 위에 도로 스트립 메시를 덮는 (a)안 권장. 차선은 후속.
