# M19 — 목표 방향 화살표(#1) + 차량 등화(#2) (기술설계)

> 진입 규약대로 CLAUDE.md → INDEX.md → 본 설계 순. 본 문서는 **설계만** 담는다(구현 X).
> 대상 2건: ① 현재 배송 목표가 화면 밖/멀리 있어도 방향을 알 수 있는 화면 상단 나침반 화살표 + 거리(#1), ② 차량 등화(브레이크등/후진등/방향지시등) 램프 메시(#2).
> 코딩 스타일: 2-space, 한국어 주석, UPPER_SNAKE 상수. 순수 로직은 THREE 비의존(CLAUDE.md). TDD: 순수 함수·메시 child 검사로 단위 테스트.
> **단계 분할 권고**: 두 기능은 독립적이므로 **M19a(방향 화살표) / M19b(차량 등화)** 로 나눠 각각 테스트 그린 후 커밋한다. 둘 다 작지만 결선 지점·테스트 대상이 달라 분리가 깔끔하다.

---

## 항목 #1 — 목표 방향 화살표 / 나침반 (M19a)

### 현황
- 현재 목표는 `mission.js currentTarget(state)` 가 `{x, z, phase, label}` 또는 `null`(done) 반환.
- `main.js updateHUD`(232~234행)에서 이미 `t = currentTarget(mission)` + `dist = Math.hypot(...)` 로 **거리**를 계산해 `hud.update(..., { distance: dist, ... })` 로 넘긴다 → 거리는 이미 흐름에 있다.
- 차량 heading 은 `vehicle.dyn.heading`. 좌표계: `+Z=전진`, 전방 벡터 `(sin h, 0, cos h)`(main.js 200행, carMesh.js 102행과 동일).
- 3D 비콘(`render/beacon.js`)은 목표를 멀리서도 빔으로 보이게 하지만, **방향/거리를 정량으로 알려주지 않고** 시야 밖이면 안 보인다. 화살표는 이를 보완(항상 방향을 가리킴).

### 순수 함수 — 화면 상대 방향각 (테스트 대상)
THREE 비의존 순수 모듈로 둔다(노드 테스트 가능). 신규 `src/heading.js`(또는 `src/nav.js`).

```js
// 목표를 가리키는 "차량 heading 기준 상대각"(rad).
//   - 월드 목표 방향각 = atan2(dx, dz)  (좌표계: +Z=전진, +X=우 → 전방=0, 우측=+)
//   - 상대각 = 목표 방향각 - heading, (-π, π] 로 정규화.
//   - 0=정면, +π/2=우측, -π/2=좌측, ±π=후방.
export function bearingToTarget(car, target) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const worldAngle = Math.atan2(dx, dz);   // heading 과 동일 규약(sin/cos)
  return normalizeAngle(worldAngle - car.heading);
}

// (-π, π] 정규화.
export function normalizeAngle(a) {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r >   Math.PI) r -= 2 * Math.PI;
  return r;
}
```

- **각 규약 일치 검증**: car heading 의 전방 벡터가 `(sin h, 0, cos h)` 이므로 월드 방향각도 `atan2(dx, dz)` 로 두면 heading 과 같은 0=+Z, +=+X(우) 기준이 되어 상대각이 직관적으로 맞는다. (`atan2(dz, dx)` 로 두면 축이 어긋나니 주의 — 반드시 `atan2(dx, dz)`.)
- 화면 회전 적용: 화살표 DOM/Canvas를 `상대각`만큼 회전(시계방향 양수가 화면 우측이 되도록 CSS `rotate(deg)` 부호 정렬). 0이면 위(↑, 정면) 가리키게.

### 렌더 — 권장안: 상단 고정 나침반(회전 화살표)
두 방식 비교:
- **(A) 상단 중앙 고정 나침반 — 항상 같은 자리에서 화살표만 상대각으로 회전 + 아래 거리 텍스트.** **권장.** 항상 보이고(시야 밖 목표도 OK), 구현·테스트 단순, 기존 HUD 토스트/게이지와 시각적으로 정돈됨. "정면이면 ↑" 직관.
- (B) 화면 가장자리 추적(목표를 화면 경계에 투영해 가장자리에 배치) — 카메라 투영·클리핑 계산 필요(THREE projection), 1인칭/3인칭 분기까지 얽혀 복잡·테스트난이도↑. 비권장(과한 정밀도).

→ 방식 A 채택. 구현은 **DOM 요소(회전 transform)** 로. (Canvas보다 단순하고 HUD가 이미 DOM 패턴.)

### 구현 — hud.js 확장 vs 신규 compass.js
- **권장: 신규 `src/render/compass.js`** — `createCompass()` 가 `{ el, update({ bearing, distance, phase, visible }) }` 반환. hud.js 비대화 방지 + 독립 단위(테스트·재사용). hud.js 의 `createHud`/토스트 패턴을 그대로 답습.
- DOM 구조(예): 고정 div(상단 중앙, `top:18px`), 내부에 화살표 글리프(▲ 또는 SVG)와 거리 텍스트(`{round(distance)} m`), 목표 라벨(선택). 화살표 회전은 `arrowEl.style.transform = 'rotate(' + deg + 'deg)'`.
  - `deg = bearing * 180 / Math.PI`. (정면=0°=↑.) 단계 색은 비콘과 동색 통일: 적재(toPickup)=`#33aaff`, 배송(toDropoff)=`#ff5533`.
- **done/목표 없음**: `currentTarget` 이 null → `update({ visible:false })` 로 `el.style.display='none'` 숨김(비콘과 동일 규칙).

```js
// render/compass.js (개요)
export function createCompass() {
  const el = document.createElement('div');
  el.id = 'compass';
  el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);' +
    'background:rgba(0,0,0,0.55);color:#fff;padding:8px 14px;border-radius:10px;' +
    'font-family:system-ui,sans-serif;text-align:center;z-index:25;pointer-events:none;display:none';
  el.innerHTML =
    '<div id="compass-arrow" style="font-size:26px;line-height:1;transition:transform .1s">▲</div>' +
    '<div id="compass-dist" style="font-size:13px;margin-top:2px;opacity:.85"></div>';
  document.body.appendChild(el);
  const arrow = el.querySelector('#compass-arrow');
  const dist  = el.querySelector('#compass-dist');
  function update(v) {
    if (!v || !v.visible) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    arrow.style.transform = 'rotate(' + (v.bearing * 180 / Math.PI) + 'deg)';
    arrow.style.color = v.phase === 'toDropoff' ? '#ff5533' : '#33aaff';
    dist.textContent = Math.round(v.distance) + ' m' + (v.label ? ' · ' + v.label : '');
  }
  return { el, update };
}
```

### main.js 결선
- import: `import { createCompass } from './render/compass.js';` + `import { bearingToTarget } from '../heading.js'`(경로는 위치에 맞게).
- 생성: HUD 생성부(216행 근처)에서 `const compass = createCompass();` 1회.
- 갱신: `updateHUD` 안, 이미 `t = currentTarget(mission)` + `dist` 가 있는 지점(234행 직후)에 추가:
  ```js
  compass.update(t
    ? { visible: true, bearing: bearingToTarget(vehicle.dyn, t), distance: dist, phase: mission.phase, label: t.label }
    : { visible: false });
  ```
- **회귀 0**: 신규 DOM/모듈 추가만, 기존 HUD/미니맵/비콘 로직 불변. done이면 숨김.

### 테스트 (heading.test.js — 순수)
- `bearingToTarget` 경계: 정면(target 정북=+Z, heading 0 → ≈0), 우측(target +X, heading 0 → +π/2), 좌측(target −X → −π/2), 후방(target −Z → ±π).
- heading 이 0이 아닐 때: heading=π/2(동쪽 향함)일 때 target +X(동쪽)면 상대각 ≈0(정면).
- `normalizeAngle`: π 초과/−π 이하 입력이 (-π, π]로 접힘, ±π 경계 처리.
- compass 모듈은 DOM 토글만이라 순수 함수 테스트로 충분(렌더 검증은 수동). 필요 시 jsdom으로 `update({visible:false})` → `display:none` 확인.

---

## 항목 #2 — 차량 등화 (M19b)

### 현황
- `carMesh.js buildCar(carType)` 가 `THREE.Group`(섀시 Box + 캐빈 Box + 바퀴 Cylinder 4 + cargo Box) 반환. child 에 `name` 부여(`'chassis'`,`'cabin'`,`'cargo'`) + `getObjectByName` 패턴 정착(M16a).
- 차종 치수: sedan `cabinOffsetZ -0.3`(캐빈 뒤쪽), truck `cabinOffsetZ +1.6`(캐빈 앞쪽). `+Z=전진`. 후미(차 뒤)는 항상 `−Z` 방향, 전면은 `+Z`. 좌우는 `±trackHalf`.
- 입력: `readControls` → `{ brake(0/1), steer(-1/0/+1), throttle, ... }`. `steer<0`=좌(A), `steer>0`=우(D).
- 기어: `vehicle.gear === -1` = R(후진), `gearName(-1)='R'`. R 판정은 `vehicle.gear === -1`.
- 갱신 결선 지점: `main.js updateVehicle` 가 매 프레임 controls/vehicle 보유 → 여기서 setLights 호출.

### 램프 child 설계 — buildCar 에 추가
6개 램프(모두 작은 Box child, `MeshBasicMaterial` 로 조명 무관 발광 느낌). 기본 off = 어두운 색.

| name | 위치(차 로컬) | off 색 | on 색 | 트리거 |
|---|---|---|---|---|
| `brakeL` | 후미(−Z), 좌(−trackHalf) | 0x330000(어두운 빨강) | 0xff0000(빨강) | brake 입력 |
| `brakeR` | 후미(−Z), 우(+trackHalf) | 0x330000 | 0xff0000 | brake 입력 |
| `reverseL` | 후미(−Z), 좌 안쪽 | 0x333333(어두운 회색) | 0xffffff(흰) | gear === -1 |
| `reverseR` | 후미(−Z), 우 안쪽 | 0x333333 | 0xffffff | gear === -1 |
| `turnL` | 좌측 전/후(−trackHalf) | 0x3a2a00(어두운 호박) | 0xffaa00(호박) | steer<0 깜빡 |
| `turnR` | 우측 전/후(+trackHalf) | 0x3a2a00 | 0xffaa00 | steer>0 깜빡 |

치수·위치 산출(차종 mesh 비례, 결정론):
- 램프 크기: `lampW = bodyWidth * 0.12`, `lampH = max(0.12, bodyHeight * 0.35)`, `lampD = 0.08`(얇게).
- 후미 z: `zRear = -bodyLen / 2 + 0.05`(섀시 뒷면 살짝 안쪽).
- 후미 y: `lampY = bodyHeight * 0.5`(섀시 측면 높이).
- 브레이크등 x: `±(trackHalf * 0.85)`(좌/우 바깥). 후진등 x: `±(trackHalf * 0.45)`(안쪽).
- 방향지시등: 후미 모서리 공유 또는 측면. 단순화로 **후미 양끝**에 둬도 충분(좌=−trackHalf*0.95, 우=+trackHalf*0.95). (사실적으로 전후 2쌍 원하면 전면 `+bodyLen/2` 에도 추가 가능 — 1차는 후미만.)

```js
// carMesh.js buildCar 내부, cargo 추가 뒤. (off 색은 LAMP_OFF 상수표)
function addLamp(name, x, z, offColor) {
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(lampW, lampH, lampD),
    new THREE.MeshBasicMaterial({ color: offColor }),
  );
  lamp.name = name;
  lamp.position.set(x, lampY, z);
  car.add(lamp);
}
addLamp('brakeL',  -tr * 0.85, zRear, LAMP_OFF.brake);
addLamp('brakeR',   tr * 0.85, zRear, LAMP_OFF.brake);
addLamp('reverseL', -tr * 0.45, zRear, LAMP_OFF.reverse);
addLamp('reverseR',  tr * 0.45, zRear, LAMP_OFF.reverse);
addLamp('turnL',    -tr * 0.95, zRear, LAMP_OFF.turn);
addLamp('turnR',     tr * 0.95, zRear, LAMP_OFF.turn);
```

상수(carMesh.js):
```js
export const LAMP_OFF = { brake: 0x330000, reverse: 0x333333, turn: 0x3a2a00 };
export const LAMP_ON  = { brake: 0xff0000, reverse: 0xffffff, turn: 0xffaa00 };
```

### 갱신 API — setLights (carMesh.js named export)
`updateCarTransform` 확장보다 **별도 `setLights`** 권장(관심사 분리, 테스트 단순, transform 과 호출 주기 분리 가능). setCargo 와 동일한 `getObjectByName` 토글 패턴.

```js
// 등화 갱신 — state = { brake, reverse, turnLeft, turnRight }(불리언).
//   깜빡임은 호출 측(main)이 turnLeft/turnRight 의 on/off 를 시간으로 토글해 전달.
//   각 램프 material.color 만 LAMP_ON/OFF 로 setHex (메시 생성/제거 없음).
export function setLights(car, state = {}) {
  const set = (name, on, onHex, offHex) => {
    const l = car.getObjectByName(name);
    if (l && l.material) l.material.color.setHex(on ? onHex : offHex);
  };
  set('brakeL',  state.brake,   LAMP_ON.brake,   LAMP_OFF.brake);
  set('brakeR',  state.brake,   LAMP_ON.brake,   LAMP_OFF.brake);
  set('reverseL', state.reverse, LAMP_ON.reverse, LAMP_OFF.reverse);
  set('reverseR', state.reverse, LAMP_ON.reverse, LAMP_OFF.reverse);
  set('turnL',   state.turnLeft,  LAMP_ON.turn,  LAMP_OFF.turn);
  set('turnR',   state.turnRight, LAMP_ON.turn,  LAMP_OFF.turn);
}
```

### 깜빡임 — main.js 시간 기반 토글
- 방향지시등은 일정 주기(예 `BLINK_PERIOD = 0.45s`)로 켜짐/꺼짐. main 의 `updateVehicle` 가 누적 시간으로 on 위상을 계산해 setLights 에 전달(carMesh 는 단순 on/off만).
- 누적 시간 변수(모듈 스코프): `let blinkClock = 0;` → `blinkClock += dt; const blinkOn = (blinkClock % BLINK_PERIOD) < BLINK_PERIOD / 2;`
- **후진(R) 시 W/S 반전 주의**(M10): R에서는 `throttle`(W)이 브레이크로 동작. 브레이크등은 "실제 감속 입력" 기준이 자연스러우므로 `controls.brake || (reverse && controls.throttle)` 같이 effBrake 의미로 켤지, 아니면 단순히 `controls.brake` 로 둘지 택1. **권장: 단순 `controls.brake`(S키) 기준** — UI 일관성·구현 단순. (정밀히 하려면 vehicle 이 effBrake 를 파생 상태로 내보내게 확장.)

### main.js 결선
`updateVehicle` 안, `updateCarTransform(car, d, n)` 호출(197행) 직후/직전:
```js
const reverse = vehicle.gear === -1;
blinkClock += dt;
const blinkOn = (blinkClock % BLINK_PERIOD) < BLINK_PERIOD / 2;
setLights(car, {
  brake:     controls.brake > 0,
  reverse:   reverse,
  turnLeft:  controls.steer < 0 && blinkOn,
  turnRight: controls.steer > 0 && blinkOn,
});
```
- import 에 `setLights` 추가(`carMesh.js` 에서). `controls` 는 함수 초반에 이미 `readControls(input)` 로 있음.
- **회귀 0**: 램프는 신규 child(기존 부품 개수 검사는 `>=6` 이라 안전), off 기본색이라 시각 변화는 입력 시에만. 자연/도시/포항 모든 맵 동일(맵 무관). setLights 미호출 시에도 외형은 어두운 램프가 추가될 뿐.

### 테스트 (carMesh.test.js 확장)
- buildCar 가 `brakeL/brakeR/reverseL/reverseR/turnL/turnR` 6개 child 를 가진다(`getObjectByName` 으로 존재 확인, 각 `MeshBasicMaterial`).
- 램프 위치: 후미(z<0) + 좌우 부호(brakeL.x<0, brakeR.x>0). 후진등이 브레이크등보다 안쪽(`|reverseL.x| < |brakeL.x|`).
- 램프 크기 차종 비례: 트럭 램프가 승용차보다 큼(`lampW = bodyWidth*0.12`).
- `setLights` 토글: `setLights(car, { brake:true })` → brakeL/brakeR material.color === LAMP_ON.brake; `{ brake:false }` → LAMP_OFF.brake. reverse/turnLeft/turnRight 각각 독립 토글. idempotent.
- 기본 off: buildCar 직후 각 램프 색 === LAMP_OFF.*.
- 부품 개수 회귀: `children.length >= 6` 유지(섀시1+캐빈1+바퀴4+cargo1+램프6 = 13).

---

## 영향 범위 표

| 파일 | 변경 | 신규/수정 | 항목 |
|---|---|---|---|
| `src/heading.js` | `bearingToTarget`/`normalizeAngle` 순수 함수 | 신규 | #1 |
| `src/heading.test.js` | 상대각 경계 테스트 | 신규 | #1 |
| `src/render/compass.js` | `createCompass()` 상단 나침반 DOM | 신규 | #1 |
| `src/render/carMesh.js` | 램프 6 child + `setLights` + `LAMP_ON/OFF` 상수 | 수정 | #2 |
| `src/render/carMesh.test.js` | 램프 child·setLights 토글 테스트 | 수정 | #2 |
| `src/main.js` | compass 생성·updateHUD 갱신 / setLights 결선·blinkClock | 수정 | #1·#2 |

회귀 0 근거: 순수 함수·신규 DOM·신규 child만 추가. 기존 mission/vehicle/HUD/minimap/beacon/맵 로직 불변. 램프 기본 off색 → 입력 없을 때 시각 변화 미미. 모든 맵 공통(맵 의존 코드 없음).

## 단계 분할 / 커밋
- **M19a(방향 화살표)**: heading.js + heading.test.js + compass.js + main 결선 → 테스트 그린 → 커밋.
- **M19b(차량 등화)**: carMesh.js 램프/ setLights + carMesh.test.js + main 결선(blinkClock) → 테스트 그린 → 커밋.
- 완료 후 `mds/done/m19-*.md` 작성 + INDEX 갱신(본 설계 단계에서는 INDEX 미수정).
