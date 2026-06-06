# M16 — 화물 시각화(#2) + 큰 지도 보기(#9) (기술설계)

> 진입 규약대로 CLAUDE.md → INDEX.md → 본 설계 순. 본 문서는 **설계만** 담는다(구현 X).
> 대상 2건: ① 적재/하차 시 차량에 화물 박스 메시 표시(#2), ② 키 토글 전체 지도 오버레이(#9).
> 코딩 스타일: 2-space, 한국어 주석, UPPER_SNAKE 상수, 순수 로직은 THREE 비의존(CLAUDE.md).
> **단계 분할 권고**: 두 기능은 독립적이므로 **M16a(화물) / M16b(큰지도)** 로 나눠 각각 테스트 그린 후 커밋한다.

---

## 항목 #2 — 화물 시각화 (M16a)

### 현황
- 차량 메시는 `render/carMesh.js`의 `buildCar(carType)`가 `THREE.Group`(섀시 Box + 캐빈 Box + 바퀴 Cylinder 4)을 반환한다. 그룹 원점 = 차량 중심.
- 차종 mesh 치수(`carTypes.js`):
  - sedan: `bodyLen 4.0, bodyWidth 1.9, bodyHeight 0.5`, 캐빈 `cabinLen 1.4, cabinHeight 0.7, cabinOffsetZ -0.3`(캐빈이 **뒤쪽**).
  - truck: `bodyLen 6.5, bodyWidth 2.4, bodyHeight 0.9`, 캐빈 `cabinLen 1.8, cabinHeight 1.3, cabinOffsetZ 1.6`(캐빈이 **앞쪽** → 뒤쪽이 적재함 공간).
- 좌표계: +Z = 전진(길이), 섀시는 `position.y = bodyHeight/2 - 0.05`(윗면 ≈ `bodyHeight - 0.05`).
- 미션 상태(`mission.js`)에 `hasCargo`가 이미 있고, `stepMission`이 `pickedUp`/`delivered` 이벤트를 반환. `main.js updateVehicle`(154~159행)이 이 이벤트로 토스트만 띄운다. **메시 토글 결선 지점이 이미 존재한다.**

### 설계 — 권장안: buildCar 시 숨겨진 cargo child 생성 + visible 토글
두 방식 비교:
- **(A) buildCar 안에서 cargo Mesh를 미리 child로 만들고 `visible=false`로 두기 + `setCargo(car, visible)`로 토글** — **권장.** child 생성/제거 반복이 없어 GC 부담 0, 테스트가 `car.getObjectByName('cargo')` 한 번으로 끝남. 재시작(차량 재생성) 시 자동 초기화.
- (B) 토글 때마다 add/remove + geometry/material dispose — 픽업/하차마다 메모리 할당·해제가 반복되고 dispose 누락 위험. 비권장.

→ 방식 A 채택. `carMesh.js`에 cargo child 생성 로직 + `setCargo` export 추가.

### 화물 위치·크기 산출 (차종 mesh 치수 기준, 결정론)
적재함 = 캐빈을 뺀 섀시 윗부분. 캐빈이 `cabinOffsetZ` 쪽에 있으므로 화물은 **반대편 섀시 위**에 얹는다.
- 화물 z 중심 = 캐빈 반대편으로 밀기. `cabinOffsetZ`의 부호 반대로:
  - `cargoZ = -sign(cabinOffsetZ) * bodyLen * 0.18` (캐빈이 앞(+Z, 트럭)이면 화물은 뒤(−Z), 캐빈이 뒤(−Z, 승용차)이면 화물은 앞/지붕쪽). sign(0)=+1 폴백.
- 화물 폭/길이 = 섀시 안에 들어오게 비율로:
  - `cargoW = bodyWidth * 0.7`
  - `cargoD = bodyLen * 0.38`
  - `cargoH = max(0.5, bodyHeight * 1.1)` (트럭이 승용차보다 자연히 큰 박스가 됨)
- 화물 y 중심 = 섀시 윗면 + 화물 높이 절반:
  - `cargoY = (bodyHeight - 0.05) + cargoH / 2`
- 색: 기본 갈색 택배 박스 톤 단색 `CARGO_COLOR = 0x9c6b3f`. (종류 다양화는 아래 참고.)

> 위 비율 계수는 두 차종 모두 섀시 위에 자연스럽게 얹히도록 고른 값. 시각 보정은 수동 확인 후 조정 가능.

### carMesh.js 변경
```js
// 화물 박스 색(택배 톤). M17 미션 다양화 때 opts.color 로 확장 여지.
export const CARGO_COLOR = 0x9c6b3f;

// buildCar 내부, 바퀴 추가 뒤에:
const m2 = m;  // 머지된 mesh 치수
const sgn = (m2.cabinOffsetZ || 0) >= 0 ? 1 : -1;   // 캐빈 쪽
const cargoW = m2.bodyWidth * 0.7;
const cargoD = m2.bodyLen  * 0.38;
const cargoH = Math.max(0.5, m2.bodyHeight * 1.1);
const cargo = new THREE.Mesh(
  new THREE.BoxGeometry(cargoW, cargoH, cargoD),
  new THREE.MeshPhongMaterial({ color: CARGO_COLOR }),
);
cargo.name = 'cargo';
cargo.position.set(0, (m2.bodyHeight - 0.05) + cargoH / 2, -sgn * m2.bodyLen * 0.18);
cargo.visible = false;   // 기본 비표시 — 픽업 시 켜짐(회귀 0: 기존 외형 그대로)
car.add(cargo);

// 화물 표시/숨김 토글 — mission.hasCargo 와 동기화.
export function setCargo(car, visible) {
  const cargo = car.getObjectByName('cargo');
  if (cargo) cargo.visible = !!visible;
}
```
- **회귀 0**: cargo는 기본 `visible=false`라 기존 주행 화면 외형은 변하지 않는다. carMesh 기존 테스트(`children.length >= 6`)는 child 1개가 늘어도 통과(≥6 유지).

### main.js 결선
`updateVehicle`의 미션 이벤트 분기(154~159행)에서 토글:
```js
if (event === 'pickedUp') {
  setCargo(car, true);                 // 적재함에 박스 표시
  const t = currentTarget(mission);
  hud.showToast(`📦 짐을 실었습니다 — ${t ? t.label : ''}(으)로!`);
} else if (event === 'delivered') {
  setCargo(car, false);                // 하차 → 박스 숨김
  hud.showToast(`✅ 배송 완료! (${mission.completed}/${mission.total})`);
}
```
- 추가 안전망(이벤트 누락/재시작 대비): 매 프레임 `mission.hasCargo`로 동기화하는 한 줄도 가능 —
  `setCargo(car, mission.hasCargo);` (이벤트 토글과 idempotent하게 공존). 둘 중 **이벤트 토글 우선**, 동기화 한 줄은 보강용으로 선택 적용.
- import에 `setCargo` 추가: `import { buildCar, updateCarTransform, setCargo } from './render/carMesh.js';`
- `startGame`에서 차량 재생성 시 cargo는 새 메시라 자동으로 `visible=false`. 새 미션도 `hasCargo=false`라 정합. 별도 리셋 불필요.

### (선택) 화물 종류 — M17 연계 여지만
- M16은 **기본 박스 1종**(CARGO_COLOR). 향후 `setCargo(car, true, { color })` 또는 job별 화물 메타(`job.cargo`)를 받아 색/형태를 바꾸는 확장은 **M17(미션 다양화)** 에서 다룬다. 본 설계는 시그니처 확장 여지(`opts` 자리)만 남겨둔다.

### 테스트 (carMesh.test.js 보강)
THREE 객체는 WebGL 없이 생성 가능 → 기존 carMesh 테스트 관례 그대로.
- `buildCar()`가 `name='cargo'`인 child를 가지며 기본 `visible === false`.
- `setCargo(car, true)` 후 cargo.visible === true, `setCargo(car, false)` 후 false (idempotent).
- 트럭 cargo가 승용차 cargo보다 큰 박스(BoxGeometry width/depth/height) — bodyLen/Width/Height 비례 확인.
- cargo z 위치가 캐빈 반대편(부호) — sedan(`cabinOffsetZ<0`)이면 cargoZ>0, truck(`cabinOffsetZ>0`)이면 cargoZ<0.
- 기존 `children.length >= 6` 테스트가 여전히 통과(child 추가가 회귀 아님) 확인.

---

## 항목 #9 — 큰 지도 보기 (M16b)

### 현황
- 미니맵(`render/minimap.js`)은 우상단 160px 고정. `createMinimap(data)` → `{canvas, draw(dyn, missionMarker)}`. 순수 헬퍼 `computeBounds(waypoints, pad)` / `worldToMinimap(wx, wz, view)` 제공.
- 맵 데이터: `map.getMinimapData()` → `{ polylines:[[{x,z}...]], goals, bounds }`. `map.getDeliveryPoints()` → `[{x,z,label}]`. 미션 진행 상태는 `mission`(`index`/`phase`/`hasCargo`/`completed`).
- 키 처리: `main.js` keydown(98~106행) — `Escape`=일시정지, `KeyM`=음소거, `Digit4`/`Numpad4`=카메라 토글, 나머지는 `onKeyDown(input)`. KEYMAP은 W/A/S/D/Shift/Q/E/Enter 사용.

### 토글 키 — 권장: **KeyG** (Map=G, "지도")
- 충돌 검토: KEYMAP(W/A/S/D/Q/E/Shift/Enter)·시스템(Escape/M/4)과 겹치지 않음. `Tab`은 브라우저 포커스 이동과 충돌·preventDefault 필요로 비권장. → **KeyG 채택.**
- keydown 핸들러 맨 앞 분기(Escape 다음)에 추가:
```js
if (e.code === 'KeyG') { toggleBigMap(); return; }
```

### 표시 방식 — 권장: 별도 `src/render/bigmap.js` 모듈
미니맵을 키워 재사용할 수도 있으나, ① 전체 화면 중앙 큰 캔버스, ② bounds를 **전체 배송점 + 현재 위치**로 매번 계산, ③ 번호/라벨 텍스트·현재 목표 강조 등 요구가 달라 **별도 모듈이 깔끔**. minimap.js의 순수 헬퍼(`computeBounds`/`worldToMinimap`)는 **그대로 import 재사용**(중복 구현 금지).

`render/bigmap.js` 골격:
```js
import { computeBounds, worldToMinimap } from './minimap.js';

// 큰 지도 오버레이 생성 — 화면 중앙 큰 캔버스(예 70vmin), 기본 숨김.
export function createBigMap(mapData, deliveryPoints, opts = {}) {
  const size = opts.size ?? 640;       // 정사각 캔버스 픽셀
  const polylines = mapData.polylines ?? [];
  const points = deliveryPoints ?? [];
  const canvas = document.createElement('canvas');
  canvas.id = 'bigmap';
  // position:fixed; 중앙; display:none(토글); 반투명 배경; z-index 미니맵보다 위(40+)
  const ctx = canvas.getContext('2d');

  function draw(dyn, mission) {
    // bounds = 모든 배송점 + 현재 차량 위치 → 전체 경로가 다 보이게(pad 여유)
    const all = points.concat([{ x: dyn.x, z: dyn.z }]);
    const bounds = computeBounds(all, BIGMAP_PAD);
    const view = { bounds, size };
    // 1) 도로망 폴리라인(연하게)
    // 2) 배송 지점 점 + 번호(1..N)/라벨, 현재 목표(currentTarget) 강조(큰 원/색)
    //    - mission.phase=='toPickup' → 현재 pickup, 'toDropoff' → 현재 dropoff 강조
    //    - 완료된 지점은 흐리게, 미래 지점은 보통
    // 3) 현재 위치 삼각형(heading) — minimap 차량 마커와 동일 수학(a=-heading+PI/2)
  }
  function show() { canvas.style.display = 'block'; }
  function hide() { canvas.style.display = 'none'; }
  function toggle() { ... return visible; }
  return { canvas, draw, show, hide, toggle, get visible() {...} };
}
```
- 상수 `BIGMAP_PAD`(예 60m)로 전체가 화면에 여유있게 들어오게.
- 번호/라벨: `getDeliveryPoints()` 순서가 곧 배송 순서(`jobsFromPoints` 체이닝)이므로 인덱스+1을 번호로, label을 보조 텍스트로.

### 게임 동작 — 권장: 큰 지도 열린 동안 **주행 일시정지(입력 무시)** + 단순 오버레이
- pause(`Escape`)와의 구분: pause는 시작 오버레이(설정창)를 띄우고 포인터락을 푼다. 큰 지도는 **별개의 가벼운 일시정지**로, 설정창을 띄우지 않고 지도만 본다.
- 권장 동작: `bigMapOpen` 플래그를 두고
  - `animate()`의 주행 조건을 `if (started && !paused && !bigMapOpen && mission) updateVehicle(dt);` 로 막아 **물리/조향 정지**(엔진 폭주·도로이탈 방지).
  - 엔진음: 열 때 `audio.suspend()`, 닫을 때 `audio.resume()`(M15의 suspend 래퍼 재사용). 미적용해도 무방하나 권장.
  - 큰 지도 표시 중에도 `updateHUD`/`render`는 계속 돌아 지도가 매 프레임 갱신(차량 마커는 정지 위치 유지).
- 닫으면(`KeyG` 재토글) `bigMapOpen=false`, `hide()`, `audio.resume()` → 주행 복귀.
- **pause 중에는 큰 지도 토글 무시**(설정창이 떠 있을 때 혼선 방지): `toggleBigMap`에서 `if (paused || !started || !mission) return;`.

### 데이터 출처
- 도로망: `map.getMinimapData().polylines`(+bounds 무시하고 자체 계산).
- 전체 목표: `map.getDeliveryPoints()`(번호/라벨), 현재 목표 강조는 `mission` + `currentTarget(mission)`.
- 현재 위치/heading: `vehicle.dyn`.

### main.js 결선
```js
import { createBigMap } from './render/bigmap.js';
let bigmap = null;
let bigMapOpen = false;

// startGame 안(minimap 생성 근처):
if (bigmap) bigmap.canvas.remove();
bigmap = createBigMap(map.getMinimapData(), map.getDeliveryPoints());
document.body.appendChild(bigmap.canvas);

// keydown:
if (e.code === 'KeyG') { toggleBigMap(); return; }

function toggleBigMap() {
  if (paused || !started || !mission || !bigmap) return;
  bigMapOpen = bigmap.toggle();           // true=열림
  if (bigMapOpen) audio.suspend(); else audio.resume();
}

// animate(): 주행 조건에 !bigMapOpen 추가
if (started && !paused && !bigMapOpen && mission) updateVehicle(dt);

// updateHUD() 끝(또는 별도): 큰 지도 열렸으면 매 프레임 갱신
if (bigMapOpen && bigmap) bigmap.draw(vehicle.dyn, mission);
```

### 테스트
- 순수 헬퍼는 minimap.js의 `computeBounds`/`worldToMinimap`를 재사용하므로 **bigmap.js에 새 순수 함수는 최소화**.
- 자체 순수 함수가 생기면(예 "전체 배송점+현재위치로 bounds 계산" 래퍼) 그것만 단위 테스트. 없으면 큰 지도는 minimap.test 처럼 **fake canvas 컨텍스트 스텁**으로 draw 호출 시 throw 없음·현재 목표 강조 마커 기록 정도만 단언.
- 대부분 **수동 검증**(KeyG로 열림/닫힘, 전체 경로·번호·현재 목표·차량 위치 표시, 열린 동안 주행 정지).

---

## 공통 — main.js 변경 지점 / 영향 범위

### main.js 변경 지점 요약
| 위치 | 변경 |
|---|---|
| import (1~14행) | `setCargo` 추가, `createBigMap` 추가 |
| keydown(98~106행) | `KeyG` 분기 추가(`toggleBigMap`) |
| 상태 변수(35~47행) | `bigmap`, `bigMapOpen` 추가 |
| `updateVehicle` 미션 이벤트(154~159행) | `pickedUp→setCargo(true)`, `delivered→setCargo(false)` |
| `startGame`(254~292행) | bigmap 생성/부착(미니맵 옆) |
| `animate`(303행) | 주행 조건에 `!bigMapOpen` 추가 |
| `updateHUD` 또는 animate | `bigMapOpen`이면 `bigmap.draw` 호출 |

### 영향 범위 표
| 파일 | 변경 | 회귀 위험 |
|---|---|---|
| `render/carMesh.js` | cargo child + `setCargo`/`CARGO_COLOR` export | 낮음(기본 hidden, children≥6 유지) |
| `render/bigmap.js` (신규) | 큰 지도 오버레이 | 신규(기존 무영향) |
| `render/minimap.js` | 변경 없음(헬퍼만 재사용) | 없음 |
| `mission.js` / `carTypes.js` | 변경 없음 | 없음 |
| `main.js` | 결선 7곳 | 낮음(플래그/토글, 기존 흐름 보존) |
| 테스트 | carMesh.test 보강, (선택) bigmap 스텁 | — |

### 단계 분할 권고
- **M16a 화물**: carMesh `setCargo` + 테스트 그린 → main 결선 → 커밋.
- **M16b 큰지도**: bigmap.js + 헬퍼 재사용 + (선택)스텁 테스트 → main 결선(KeyG/플래그) → 커밋.
- 완료 후 `mds/done/`에 노트, `mds/INDEX.md` 갱신(본 설계는 INDEX 미수정).
