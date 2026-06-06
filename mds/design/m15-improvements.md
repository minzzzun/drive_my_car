# M15 — 주행/네비 빠른 개선 4종 (기술설계)

> 진입 규약대로 CLAUDE.md → INDEX.md → 본 설계 순. 본 문서는 **설계만** 담는다(구현 X).
> 대상 4건: ① ESC 일시정지 시 엔진음 정지 + 차량 정지(#10), ② 안개 제거 + 목적지 3D 핀 비콘(#3),
> ③ 목적지 간 거리 확대(#4 거리), ④ 기어 최고속 튜닝(특히 5단)(#7 기어속도).
> 코딩 스타일: 2-space, 한국어 주석, UPPER_SNAKE 상수, 순수 로직은 THREE 비의존(CLAUDE.md).

---

## 항목 #10 — ESC 일시정지 시 엔진음 끄고 차량 정지

### 현황
- `main.js`에 이미 일시정지 골격이 있다.
  - `pauseGame()` (86~91행): `paused=true`, 오버레이 표시, 포인터락 해제. **오디오·차량은 손대지 않음.**
  - 오버레이 click 핸들러(76~83행): 재개 시 `paused=false`, 오버레이 숨김, `audio.resume()`.
  - `animate()` (287행): `if (started && !paused && mission) updateVehicle(dt);` → **paused면 물리/오디오 업데이트 자체가 안 돈다.**
- `audio.js`: `update(rpm, on)`이 매 프레임 `engineGain`을 설정. paused면 `update`가 안 불려 **엔진 gain이 마지막 값(주행 중이면 0.45)에 그대로 멈춰 엔진음이 계속 들린다.** `_ctx` getter는 있으나 `suspend()` 래퍼는 없음.

### 설계 — 권장안: AudioContext suspend/resume (방법 A)
오디오 끄기 두 후보:
- **(A) `ctx.suspend()` / `ctx.resume()`** — 엔진음·변속음·잔향 모두 한 번에 정지. AudioContext 시간이 멈춰 재개 시 끊김 없이 복원. **권장.**
- (B) `audio.update(rpm, false)`로 엔진 gain만 0 — 변속음 등 다른 노드는 안 멈추고, 엔진 소스 playbackRate는 계속 흐름. 부분적이라 비권장.

`audio.js`에 얇은 래퍼 2개 추가(상태 머신 불변, idempotent):
```js
// 일시정지: ctx가 있으면 suspend (그래프/소스 유지, 시간만 정지)
function suspend() {
  if (ctx && ctx.suspend && ctx.state === 'running') ctx.suspend();
}
// (resume()은 기존 함수가 ctx.resume() 호출까지 포함 → 그대로 재사용)
```
- 반환 객체에 `suspend`를 추가. 기존 `resume`은 이미 `ctx.resume()`을 호출하므로 재개 경로 변경 불필요.
- 음소거(M) 로직과 독립: suspend는 시간 정지, mute는 masterGain 0. 직교하므로 충돌 없음.

### 설계 — 차량 정지
- paused 동안 `updateVehicle`가 호출되지 않으므로 **새 프레임 물리는 이미 멈춰 있다.** 단, 일시정지 직전 가지고 있던 `vehicle.dyn.speed`가 남아 있어 **재개 순간 그 속도로 튀어나간다.** 요구사항(차량 정지)을 만족하려면 pause 진입 시 속도를 0으로 죽인다.
- `pauseGame()` 안에서:
  ```js
  if (vehicle) { vehicle.dyn.speed = 0; vehicle.speed = 0; }  // 관성 제거(재개 시 정지 상태)
  ```
  - `dyn.speed`(적분 소스) + 파생 `vehicle.speed`(HUD용) 둘 다 0. `stepVehicle`의 충돌 클램프 분기(main 131~137행)와 동일 패턴.
  - RPM/기어/시동 상태는 유지 → 재개 후 다시 클러치/스로틀로 출발(시동 꺼짐 아님).

### main.js 정확한 변경 지점
1. `pauseGame()` (86~91행) 본문 끝에 추가:
   - `audio.suspend();`
   - 위의 `vehicle.dyn.speed=0; vehicle.speed=0;`(vehicle null 가드).
2. 재개(오버레이 click, 76~83행): 이미 `audio.resume()` 있음 → suspend된 ctx를 resume. **추가 변경 불필요**(단, resume 호출이 paused=false보다 뒤/앞 어디든 무방).
3. `audio.js` 반환 객체에 `suspend` export.

### 회귀/주의
- `pointerlockchange`(106~108행)도 `pauseGame()`을 부르므로 같은 경로로 일관 처리됨(중복 호출 idempotent — paused면 즉시 return).
- suspend 중 `audio.update`는 animate 게이트로 호출 안 됨. resume 후 첫 `updateVehicle`에서 정상 변조 재개.

---

## 항목 #3 — 안개 제거 + 목적지 3D 핀 비콘

### 현황
- 안개: `naturalMap.js:115` `scene.fog = new THREE.FogExp2(0x87ceeb, 0.010)`, `cityMap.js:172` `new THREE.FogExp2(0xb8bcc2, 0.006)`.
- 목표 위치 표시는 **미니맵 마커뿐**(`minimap.js` draw, main 207~215행). 월드 3D 마커는 없음.
- 카메라 far=700(main:29).

### 설계 — 안개
- **완전 제거 권장**: 비콘이 "멀리서 보이게" 하는 게 목적이므로 fog가 원경 비콘을 흐린다. 두 맵 `buildStatic`에서 `scene.fog` 라인 삭제(또는 `scene.fog = null`).
- 대안(분위기 유지): 밀도를 1/3 수준으로(자연 0.010→0.003, 도시 0.006→0.002) 옅게. 단, 비콘 빔은 `fog:false` 머티리얼로 fog 영향 배제(아래).
- 권장: **완전 제거**(요구사항 1순위가 가시성). 배경색은 유지.

### 설계 — 신규 모듈 `src/render/beacon.js` (THREE 의존, 렌더 레이어)
목표 1곳을 가리키는 단일 비콘 객체. main이 currentTarget으로 위치/색 갱신.

구성 메시(THREE.Group):
- **수직 빔**: `CylinderGeometry(rTop, rBottom, height, radialSeg)` — 가늘고(반경 ~1.2m) 매우 길게(`BEACON_HEIGHT = 120`). 반투명 `MeshBasicMaterial({ transparent:true, opacity:0.35, depthWrite:false, fog:false })`. 원점 y는 height/2(바닥에서 위로).
- **떠있는 핀(상단 마커)**: 작은 구 또는 역삼각뿔(`ConeGeometry` 뒤집어 핀처럼) + 살짝 위(`y ≈ 8~12`)에 배치. 불투명 `MeshBasicMaterial({ fog:false })`.
- **바닥 링(선택)**: 도착 반경 시각화용 `RingGeometry(ARRIVE_RADIUS-0.3, ARRIVE_RADIUS, 32)`을 지면에 눕혀(rotateX -PI/2) 배치. 색은 핀과 동일.
- `fog:false`(머티리얼 옵션)로 안개 옅게 남길 경우에도 비콘은 또렷. `depthTest`는 기본 true 유지(건물 뒤에 가리는 자연스러움). "건물 너머로도 보이게"를 강하게 원하면 빔만 `depthTest:false`+`renderOrder` 상향 옵션 고려(설계 선택지로 명시).

API:
```js
export const BEACON_HEIGHT = 120;
export const BEACON_PICKUP_COLOR  = 0x33aaff;  // 파랑(적재) — 미니맵과 동색
export const BEACON_DROPOFF_COLOR = 0xff5533;  // 주황빨강(배송)
export function createBeacon() { /* Group + 자식 메시 생성, scene.add 대상 반환 */ }
//  beacon.group : THREE.Group  (main이 scene.add)
//  beacon.update(target, phase) : target={x,z}|null, phase='toPickup'|'toDropoff'|'done'
//     - target null/done → group.visible=false
//     - 있으면 visible=true, group.position.set(target.x, 0, target.z),
//       phase에 따라 색 갱신(material.color.setHex), 핀/빔/링 일괄.
```
- 미세 애니메이션(선택): 핀 `position.y` sin 펄스 또는 group `rotation.y` 회전 → main animate에서 `beacon.spin(dt)` 호출. 필수는 아님.

### main.js 결선
- import `createBeacon`. `startGame`에서 1회 생성 후 `scene.add(beacon.group)`(차량 메시처럼 재시작 시 기존 제거/재생성, 혹은 1회 생성 후 update만).
- `updateHUD()`(또는 `updateVehicle` 미션 갱신부) 안, currentTarget 계산 직후:
  ```js
  beacon.update(t, mission.phase);   // t = currentTarget(mission)
  ```
  - 목표 전환(pickedUp/delivered) 시 자동으로 위치·색이 따라감(currentTarget이 갱신되므로).
- y는 0 고정으로 두되, 도시(평지 y=0)·자연(지형 높이) 모두 빔이 충분히 길어 무방. 정밀히 하려면 `map.heightAt(t.x,t.z)`를 base y로.

### 회귀/주의
- THREE 의존 → 단위 테스트 대상 아님(수동 확인). 순수 로직 없음.
- fog 제거는 분위기 변화만, 충돌/물리/네비 로직 영향 0.

---

## 항목 #4 — 목적지 간 거리 확대

### 현황
- **자연**: `naturalMap.getDeliveryPoints()`가 `placeCheckpoints(road, 6)` → 도로 총길이를 6등분한 6개 점(8개 알파벳 라벨까지 여유). 코스: `generateCourseWaypoints({count:24})`, spacing 28 → 총 도로길이 ≈ 24×28 굽이감 포함. 6점이면 점 간 도로거리 ≈ 총길이/6.
- **도시**: `cityMap`의 `deliveryGrid` 8개 고정, 좌표 `(i*CELL, j*CELL)`, CELL=72. 인접 점 간격이 1~2칸(72~144m) 위주.
- `mission.test.js`: 두 맵 모두 **`length ≥ 4`, on-road, deterministic** 만 요구. 도시는 **첫 점 ≠ 스폰(0,0)**. → 점 수/좌표 자유롭게 늘려도 테스트 통과.

### 설계 — 자연 맵
- `placeCheckpoints(road, N)`의 N을 **줄여 간격↑**: `6 → 4`. (라벨 A~D, ≥4 충족.)
  - 점 간 도로거리 ≈ 총길이/4 로 1.5배 확대.
- 더 키우려면 코스 자체를 길게: `generateCourseWaypoints({count: 24→32, spacing: 28})` 또는 `spacing 28→36`. (회귀: `getGoals`는 별도 `DEFAULT_CHECKPOINTS=5`라 영향 없음. 단 코스 waypoints를 바꾸면 `getSpawn`/`getMinimapData`/`getGoals` 좌표가 함께 바뀜 → naturalMap.test.js의 getSpawn/getGoals 동치 테스트는 **자기 참조(refRoad 동일 파라미터)**라 깨지지 않음. 다만 파라미터를 한 곳에서 바꾸면 테스트의 `generateCourseWaypoints` 호출 파라미터도 같이 맞춰야 함.)
  - **권장(최소 변경)**: 코스는 그대로 두고 **N만 4로**. 간격 1.5배, 회귀 0.
- 권장 수치: `placeCheckpoints(road, 4)` (필요 시 코스 spacing 28→34로 추가 확대).

### 설계 — 도시 맵
- 교차점 stride를 키운다: 현재 i,j가 ±1~±3 → **±2~±4 위주로 더 멀리**. CELL=72이므로 stride 2칸=144m, 4칸=288m.
- 권장 새 `deliveryGrid`(스폰(0,0) 제외, 전부 짝수/홀수 무관 i,j → `i*CELL`/`j*CELL`은 항상 격자선 위 = 도로):
  ```
  { i: 0,  j: 3,  label: '북부 창고' },     // 216m
  { i: 3,  j: 3,  label: '동북 물류센터' },
  { i: 3,  j: 0,  label: '동부 시장' },
  { i: 3,  j: -3, label: '동남 항만' },
  { i: 0,  j: -3, label: '남부 터미널' },
  { i: -3, j: -2, label: '서남 공단' },
  { i: -3, j: 2,  label: '서부 역' },
  { i: -1, j: 4,  label: '중앙 교차로' },
  ```
  - 인접 job(체이닝) 간 직선거리 대부분 ≥ 144~288m. 첫 점 (0,216)≠스폰 ✔. 모두 격자선 위 ✔.
- 미니맵 `getMinimapData`의 `RANGE=6`(±432m)으로 여전히 커버. 그대로 OK.

### ARRIVE_RADIUS 조정
- 현재 6m. 거리가 커지면 6m는 상대적으로 더 정밀해져 "조금 더 가야 도착" 체감↑. 살짝 키우는 안: **6 → 8**.
  - **단, `mission.test.js:61` `expect(ARRIVE_RADIUS).toBe(6)` 와 경계 테스트(208~223행)가 6 기준**. 8로 바꾸면 이 테스트 상수를 8로 갱신해야 함(경계 테스트는 `ARRIVE_RADIUS` 심볼을 쓰므로 값만 바꾸면 통과).
  - **권장: 6 유지**(거리만 늘리고 반경은 그대로 두면 테스트 무수정). 체감 문제 시 8로 올리고 위 1줄 테스트만 수정.

### 단위 테스트 가이드 (순수 → 테스트 가능)
- `mission.test.js`의 두 `getDeliveryPoints` 블록은 변경 후에도 통과해야 함(≥4, on-road, deterministic, 도시 첫점≠스폰). 회귀로 보면 됨.
- 추가 권장 테스트(선택): "인접 배송점 간 최소 거리 ≥ THRESHOLD" assert로 거리 확대 의도를 고정.
  - 도시: `for i in pts-1: hypot(pts[i+1]-pts[i]) >= 100` 등.
  - 자연: 도로 위 점이라 직선거리 변동 큼 → 개수(=4) assert가 더 안정적.

---

## 항목 #7 — 기어 최고속 튜닝 (특히 5단 느림)

### 현황 분석
최고속 산식(`vehicle.js:77~80`):
```
maxSpeed = |speedFromEngineRpm(MAX_RPM, gear)| * car.gearTopFactor
headroom = max(0, 1 - |speed| / maxSpeed)
engineAccel = dir * throttle * torque * engagement * headroom
```
- `speedFromEngineRpm(MAX_RPM,gear)` = MAX_RPM에서 그 기어의 이론 최고속.
- **이론 최고속(현 상수)**: (km/h)

| 기어 | base | sedan ×1.05 | truck ×0.85 |
|---|---|---|---|
| 1 | 66.5 | 69.9 | 56.5 |
| 2 | 113.1 | 118.8 | 96.1 |
| 3 | 161.6 | 169.6 | 137.3 |
| 4 | 226.2 | 237.5 | 192.3 |
| 5 | 282.7 | 296.9 | 240.3 |

- **숫자상 5단 최고속은 낮지 않다(280+km/h).** 체감상 느린 진짜 원인은 **headroom 모델 + 고단 토크 급감**:
  - 고단 torque = `accelBase × totalRatio(gear)/totalRatio(3)`. 5단 비 = `0.8/1.4 ≈ 0.571` → 5단 토크가 3단의 57%.
  - headroom은 maxSpeed가 멀어 1에 가깝지만, **torque 자체가 작아 가속이 굼떠** "최고속까지 도달이 사실상 불가/매우 느림" → 체감 "5단이 느리다"로 나타남.
- 즉 핵심은 **고단 가속력(torque)** 과 **maxSpeed가 너무 멀어 도달 불가**라는 두 측면. 단순히 maxSpeed를 더 올리면 더 안 닿는다.

### 설계 — 권장 조합 (단조성·차종차등 유지)
목표: 5단을 "충분히 빠르고 실제로 그 속도에 닿는" 톱기어로. 현실적 톱스피드 목표:
- **sedan 5단 실주행 도달 ≈ 180~200 km/h, truck ≈ 130~150 km/h** 부근(게임 체감 기준).

두 레버를 함께 조정:

1. **고단 토크 바닥 끌어올리기 (체감 가속)** — `vehicle.js`의 torque 식 완화:
   ```js
   // 현재: torque = car.accelBase * (totalRatio(gear)/totalRatio(3));
   // 제안: 고단 토크가 0.57배까지 떨어지지 않게 바닥(floor) 혼합.
   const ratioK = totalRatio(gear) / totalRatio(3);
   const torque = car.accelBase * (0.55 + 0.45 * ratioK); // 5단≈0.55+0.45*0.571=0.807배
   ```
   - 5단 토크가 3단의 0.57→0.81배로 회복 → 고단에서 실제로 가속해 최고속 근처에 도달.
   - 저단(1단 ratioK=`3.4/1.4=2.43`)은 `0.55+0.45*2.43=1.64`배 → 여전히 저단 토크 큼(출발력 유지). 단조 토크 경향 유지.
   - **이 한 줄이 "5단이 느리다" 체감의 주원인 교정.**

2. **최고속을 실제 도달 가능 범위로 약간 낮춰 닿게** — 두 택 중 하나:
   - (택1, 권장) `gearTopFactor`는 유지하고 위 torque 보정만. maxSpeed 자체는 충분.
   - (택2) maxSpeed가 너무 멀면 끝이 영영 안 닿으니 **FINAL_DRIVE 또는 5단 비를 조정**해 톱을 현실화:
     - `GEAR_RATIOS['5'] 0.8 → 0.95` 로 올리면 5단 maxSpeed 282→238km/h(base)로 내려와 더 닿기 쉬움. 단 **단조성(1>2>3>4>5 totalRatio) 유지 필요**: 0.95 < 1.0(4단)이므로 OK.
     - 또는 `FINAL_DRIVE 3.5 → 3.2`: 전 기어 최고속 +9% 상승(고단 더 빠르게) + 저단 토크 약간↓. 단조성 영향 없음(공통 배율).

- **권장 최종안**: **#1 torque 바닥 + #2 택2의 `GEAR_RATIOS['5'] 0.8→0.95`**.
  - 효과: 5단 토크 회복 + 5단 최고속을 닿기 쉬운 238km/h(base)로. sedan 5단 ≈ 250km/h 이론·실주행 200km/h대 도달, truck ≈ 200km/h 이론.
  - 차종차등: `accelBase`(sedan 10/truck 6)·`gearTopFactor`(1.05/0.85) 그대로 → 격차 유지.

### 회귀 — 깨지거나 갱신 필요한 테스트
- `gearbox.test.js`:
  - `totalRatio(1) > totalRatio(5)` (36행): 0.95×3.5 < 3.4×3.5 ✔ 통과.
  - `totalRatio(5) > 0` ✔.
  - `totalRatio(4) ≈ 1.0×FINAL_DRIVE` (41행): 4단 비 안 건드림 ✔.
  - `같은 속도면 저단 RPM > 고단` (52행): 5단 비 0.8→0.95라도 4단(1.0)보다 작아 RPM 더 낮음 ✔.
  - **FINAL_DRIVE를 바꾸는 경우(택2 후자)**: `totalRatio(4)` 테스트는 `FINAL_DRIVE` 심볼을 쓰므로 통과(상수만 바뀜). rpm↔speed 왕복 테스트도 비 무관 ✔.
- `vehicle.test.js`: torque 식 변경 → 가속 절대값이 바뀜. **"출발/가속이 일어난다(speed 증가)" 류 정성 테스트는 통과**하지만, 특정 수치(예: n초 후 속도 == X)를 박은 테스트가 있으면 갱신 필요. → 구현 시 `npm test -- vehicle`로 확인, 깨지면 기대값 갱신(단조 가속·고단<저단 토크 경향은 보존되어야 함).
- 단조성 보장 회귀 테스트(권장 추가, 순수): "1..5단 base 최고속이 단조 증가" `speedFromEngineRpm(MAX_RPM, g)`로 assert.

---

## 영향 범위 표

| 항목 | 변경 파일 | 신규 | 테스트 |
|---|---|---|---|
| #10 ESC | `src/main.js`(pauseGame), `src/render/audio.js`(suspend 추가) | — | 수동(엔진음 정지·재개·정지 확인) |
| #3 안개/비콘 | `src/maps/naturalMap.js`(fog 제거), `src/maps/cityMap.js`(fog 제거), `src/main.js`(beacon 결선) | `src/render/beacon.js` | 수동(원경 비콘·색 전환) |
| #4 거리 | `src/maps/naturalMap.js`(N 6→4), `src/maps/cityMap.js`(deliveryGrid 확대), (선택)`src/mission.js`(ARRIVE_RADIUS) | — | 순수: `mission.test.js` 회귀(+거리 assert 추가 권장). ARRIVE_RADIUS 변경 시 test 상수 갱신 |
| #7 기어속도 | `src/vehicle/vehicle.js`(torque 식), `src/vehicle/gearbox.js`(GEAR_RATIOS['5'] 또는 FINAL_DRIVE) | — | 순수: `gearbox.test.js`(통과 예상), `vehicle.test.js`(수치 테스트 시 갱신), 단조성 assert 추가 권장 |

---

## 단위 테스트 가능성 요약
- **#4·#7 = 순수 → Vitest 자동 검증 가능**(mission/gearbox/vehicle). 회귀 우선, 의도 고정용 assert 추가 권장.
- **#3·#10 = THREE/DOM/AudioContext 의존 → 수동 검증**(`npm run dev`). audio suspend는 `ctx.state` 확인 정도만 단위로 가능하나 비핵심.
