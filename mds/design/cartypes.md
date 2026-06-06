# 설계 — 차종 선택 (M13, 승용차/트럭)

> ⚠️ 갱신(2026-06-06): SUV는 승용차와 체감 차이가 적어 **제거**. 최종 **2종(sedan/truck)**. 아래 본문의 SUV 언급은 초기 설계 흔적이며 구현·테스트는 2종 기준.

> 시작화면에서 맵 선택과 동형의 카드 UI로 **차종 2종(sedan/truck)**을 고른다.
> 차종은 (1) **성능치**(가속·기어별 최고속·조향/회전반경·제동·무게감)와 (2) **외형 메시 치수**(차체·캐빈·바퀴)를 바꾼다.
> 트럭=무겁고 느리고 크고 둔함 / 승용차=가볍고 빠르고 민첩 / SUV=중간 (M14 유로트럭식 배송과 어울리게 트럭은 화물 느낌).

작업 진입 규약: `CLAUDE.md → INDEX → 이 문서`. 순수 로직(vehicle/dynamics)은 THREE 비의존을 유지하고, 차종 파라미터는 **평범한 숫자 객체**로만 주입한다.

---

## 1. 차종 데이터 모델 — `src/vehicle/carTypes.js` (신규, 순수 모듈)

차종 = `{ id, label, perf, mesh }`. THREE 비의존(숫자/문자열만). 메시는 색까지 숫자(0xRRGGBB)로 둔다.

```js
// src/vehicle/carTypes.js (순수 — THREE import 금지)
export const CAR_TYPES = {
  sedan: {
    id: 'sedan', label: '승용차',
    perf: { accelBase, gearTopFactor, rollingResist, brakeDecel,
            maxSteerRate, turnFullSpeed, cornerRollK },
    mesh: { bodyLen, bodyWidth, bodyHeight, cabinLen, cabinWidth, cabinHeight,
            cabinOffsetZ, wheelRadius, wheelWidth, wheelBaseHalf, trackHalf,
            eyeHeight, bodyColor, cabinColor, wheelColor },
  },
  suv:   { ... },
  truck: { ... },
};
export const DEFAULT_CAR_ID = 'sedan';
export function getCarType(id) { return CAR_TYPES[id] ?? CAR_TYPES[DEFAULT_CAR_ID]; }
export function listCarTypes() { /* [{id,label}] */ }
```

### 1.1 성능 파라미터 (`perf`) — 현재 모듈 상수와 1:1 대응
| 키 | 대응 현 상수 (위치) | 의미 | 차종별로 바꾸는 이유 |
|---|---|---|---|
| `accelBase` | `ACCEL_BASE=9` (vehicle.js) | 풀스로틀·완전결합 기준 구동 가속 | 트럭↓·승용차↑ (가속감) |
| `gearTopFactor` | (신규, 기본 1.0) | 기어별 최고속에 곱하는 배율 | 트럭 최고속↓ |
| `rollingResist` | `ROLLING_RESIST=0.08` (dynamics.js) | 구름/공기 저항(1/s) | 무거울수록↑(둔함) |
| `brakeDecel` | `BRAKE_DECEL=12` (dynamics.js) | 브레이크 감속(m/s²) | 무거운 트럭↓(잘 안 섬) |
| `maxSteerRate` | `MAX_STEER_RATE=1.2` (dynamics.js) | 최대 요 레이트(rad/s) | 회전반경 — 트럭↓ |
| `turnFullSpeed` | `TURN_FULL_SPEED=8` (dynamics.js) | 조향 권한 100% 도달 속도 | 트럭↑(저속서 둔함) |
| `cornerRollK` | `CORNER_ROLL_K=0.06` (dynamics.js) | 코너링 동적 롤 계수 | 차고 높은 SUV/트럭↑(기우뚱) |

> **회전반경**은 별도 값이 아니라 `maxSteerRate`(작을수록 반경 큼)와 `turnFullSpeed`(클수록 저속 둔함)의 조합으로 표현한다. 추가 상수 도입 없이 기존 `yawRate` 모델에 그대로 주입 가능.
> **무게감**은 `rollingResist`↑(가속 후 잘 안 빠짐) + `brakeDecel`↓(잘 안 섬) + `accelBase`↓(굼뜸)로 표현. 별도 mass 항을 두지 않아 적분식 변경 0.

### 1.2 메시 파라미터 (`mesh`)
| 키 | 현재 하드코딩 값 (carMesh.js) | 의미 |
|---|---|---|
| `bodyLen / bodyWidth / bodyHeight` | 4 / 2 / 0.5 (chassis BoxGeometry) | 차체 길이/폭/높이 |
| `cabinLen / cabinWidth / cabinHeight` | 1.2 / 1.5 / 0.8 (cabin) | 캐빈 치수 |
| `cabinOffsetZ` | -0.3 (cabin.position.z) | 캐빈 전후 위치 |
| `wheelRadius / wheelWidth` | 0.3 / 0.3 (CylinderGeometry) | 바퀴 반경/폭 |
| `wheelBaseHalf` | 1.3 (앞/뒤 z=±1.3) | 휠베이스 절반(전후 바퀴 위치) |
| `trackHalf` | 1.0 (좌/우 x=±1) | 윤거 절반(좌우 바퀴 위치) |
| `eyeHeight` | `EYE_HEIGHT=1.2` (main.js) | 1인칭 운전석 눈높이 |
| `bodyColor/cabinColor/wheelColor` | 0xcc2222/0x2255cc/0x222222 | 색 |

> `mesh.wheelRadius`는 물리(gearbox.js의 `WHEEL_RADIUS=0.3`)와 **분리**해 둔다. 즉 외형 바퀴만 키우고 구동비는 건드리지 않는다(회귀 안전). 외형/물리 정합을 맞출지는 후속 선택(§7 단계 분할).

### 1.3 3종 잠정 수치 (튜닝 시작값)
| 항목 | sedan(승용차) | suv | truck(트럭) |
|---|---|---|---|
| `accelBase` | 10 | 8 | 6 |
| `gearTopFactor` | 1.05 | 1.0 | 0.85 |
| `rollingResist` | 0.07 | 0.09 | 0.13 |
| `brakeDecel` | 13 | 11 | 9 |
| `maxSteerRate` | 1.35 | 1.1 | 0.85 |
| `turnFullSpeed` | 7 | 8 | 11 |
| `cornerRollK` | 0.05 | 0.07 | 0.09 |
| `bodyLen×W×H` | 4.0×1.9×0.5 | 4.4×2.1×0.7 | 6.5×2.4×0.9 |
| `cabinLen×W×H` | 1.4×1.5×0.7 | 1.7×1.7×0.85 | 1.8×2.2×1.3 |
| `cabinOffsetZ` | -0.3 | -0.4 | +1.6 (트럭=캐빈 앞쪽) |
| `wheelRadius` | 0.30 | 0.36 | 0.45 |
| `wheelBaseHalf` | 1.3 | 1.45 | 2.2 |
| `trackHalf` | 1.0 | 1.05 | 1.15 |
| `eyeHeight` | 1.2 | 1.6 | 2.4 |
| 색(body) | 0xcc2222 | 0x2e7d32 | 0xf0a500 |

> 기본값 `sedan`은 **현재 체감과 최대한 가깝게** 두되 accelBase만 9→10 등 미세 조정은 튜닝 단계에서. 회귀 테스트(§6)는 "기본 인자=현재 상수"로 검증하므로, **현재 상수와 동일한 별도 `legacy`성 기본값 경로**를 보장한다(아래 §2).

---

## 2. 파라미터 주입 설계 (핵심)

순수 물리(vehicle.js / dynamics.js)가 지금 모듈 상수를 직접 참조한다. 차종 값을 흘려보내는 두 방안:

- **방안 A (권장)**: `createVehicle(spawn, carParams)`로 차량 상태에 `carParams`를 보관 → `stepVehicle`이 모듈 상수 대신 `v.car`를 읽고, `stepDynamics`에 **튜닝 상수 묶음**을 인자로 넘긴다. 함수 시그니처에 **기본 인자**를 두어 인자를 안 주면 현재 상수와 동일하게 동작 → 기존 테스트 회귀 0.
- **방안 B**: 모듈 상수를 함수 옵션으로 점진 노출(개별 인자). 호출부가 늘고 디폴트 분산으로 회귀 위험↑.

→ **방안 A 채택.** carParams를 한 객체로 묶어 한 곳(carTypes.js)에서 관리, 적분 함수는 옵션 객체 하나만 추가로 받는다.

### 2.1 시그니처 변경
```js
// vehicle.js
import { getCarType } from './carTypes.js';

// carParams 미지정 시 기본 차종(sedan)이 아니라 ── '현재 상수' 유지를 위해
// 모듈 상수로 구성한 LEGACY_CAR 를 디폴트로 둔다(회귀 0의 핵심).
const LEGACY_CAR = {
  accelBase: ACCEL_BASE, gearTopFactor: 1,
  rollingResist: ROLLING_RESIST, brakeDecel: BRAKE_DECEL,
  maxSteerRate: MAX_STEER_RATE, turnFullSpeed: TURN_FULL_SPEED, cornerRollK: CORNER_ROLL_K,
};

export function createVehicle(spawn = {}, carParams = LEGACY_CAR) {
  return { engine: createEngineState(), gear: 0, dyn: createDynState(spawn), car: carParams };
}

export function stepVehicle(v, controls, dt, sampleHeight) {
  const car = v.car ?? LEGACY_CAR;          // 구(舊) 상태 객체 호환
  ...
  const torque = car.accelBase * (totalRatio(gear) / totalRatio(3));
  const maxSpeed = Math.abs(speedFromEngineRpm(MAX_RPM, gear)) * car.gearTopFactor;
  ...
  const dyn = stepDynamics(v.dyn, { engineAccel, brake: effBrake, steer }, dt, sampleHeight, car);
  return { ..., car: v.car };               // car 를 상태에 계속 보존
}
```
> `ROLLING_RESIST` 등은 `dynamics.js`에 있으므로 vehicle.js에서 import해 `LEGACY_CAR` 구성. 또는 `dynamics.js`가 `LEGACY_DYN`을 export하고 vehicle이 합치는 방식도 가능(둘 다 무방, import 방향만 일관).

```js
// dynamics.js — 적분 함수가 옵션 객체를 마지막 인자로 받되 기본값=현 상수
export function integrateSpeed(speed, engineAccel, brake, dt,
  { rollingResist = ROLLING_RESIST, brakeDecel = BRAKE_DECEL } = {}) {
  const a = engineAccel - rollingResist * speed - brake * brakeDecel * sign(speed);
  ...
}
export function yawRate(steer, speed,
  { maxSteerRate = MAX_STEER_RATE, turnFullSpeed = TURN_FULL_SPEED } = {}) {
  const authority = Math.min(1, Math.abs(speed) / turnFullSpeed);
  return steer * maxSteerRate * sign(speed) * authority;
}
export function corneringRoll(steer, speed, { cornerRollK = CORNER_ROLL_K } = {}) {
  return -steer * Math.abs(speed) * cornerRollK;
}
export function stepDynamics(state, inputs, dt, sampleHeight, car = {}) {
  const speed   = integrateSpeed(state.speed, inputs.engineAccel, inputs.brake, dt, car);
  const heading = state.heading - yawRate(inputs.steer, speed, car) * dt;
  ...
  const roll = tilt.roll + corneringRoll(inputs.steer, speed, car);
  ...
}
```

### 2.2 회귀 0 전략
- 모든 신규 인자에 **기본값 = 현재 모듈 상수**. 인자를 안 넘기면 비트 단위로 현행 동작.
- `createVehicle()` 1인자 호출, `stepDynamics(...4인자)`, `integrateSpeed/yawRate/corneringRoll` 구 호출은 그대로 통과.
- `v.car`가 없는 옛 상태 객체에도 `?? LEGACY_CAR` 폴백.
- 즉 **기존 vehicle/dynamics 테스트는 단 한 줄도 수정 불필요** (목표: 회귀 0).

---

## 3. 메시 파라미터화 — `buildCar(carType)`

```js
export function buildCar(carType = {}) {
  const m = { ...DEFAULT_MESH, ...(carType.mesh ?? carType) }; // 치수+색 머지(기본=현재 값)
  // chassis: BoxGeometry(m.bodyWidth, m.bodyHeight, m.bodyLen)
  // cabin:   BoxGeometry(m.cabinWidth, m.cabinHeight, m.cabinLen), z = m.cabinOffsetZ
  // wheelGeo: CylinderGeometry(m.wheelRadius, m.wheelRadius, m.wheelWidth, 16)
  // wheelPos: [±trackHalf, baseY, ±wheelBaseHalf]  ← 4개 (baseY = wheelRadius 기준 보정)
}
```
- `DEFAULT_MESH`는 **현재 carMesh.js 하드코딩 값**과 동일 → 인자 없이 호출하면 기존 메시 그대로(회귀 0). 기존 `carMesh.test.js`(자식 6개 이상, 변환) 불변.
- 바퀴 Y 위치는 현재 고정 `-0.05`인데, 바퀴 반경이 커지면 땅에 묻히므로 `baseY = chassis 바닥 - wheelRadius + α` 식으로 **반경 연동**한다. 트럭 큰 바퀴가 자연스럽게 보이도록.
- `updateCarTransform`은 dyn(위치/heading/법선)만 쓰므로 **치수 무관 → 변경 없음**. 단 차체가 커지면 시각적 중심은 그대로(그룹 원점=차량 중심) 유지.

### 3.1 1인칭 카메라 높이(`eyeHeight`)
- 현재 `main.js`의 `const EYE_HEIGHT = 1.2` 고정. 트럭은 시야가 높아야 자연스럽다.
- 차종 선택 시 `EYE_HEIGHT = carType.mesh.eyeHeight`로 **선택 시점에 1회 설정**(let 변수화). 1인칭/3인칭 카메라 코드의 `EYE_HEIGHT` 참조는 그대로 그 값을 읽는다.
- 3인칭 카메라 거리(현재 `-fx*9, +4.5`)도 큰 트럭은 약간 멀게 두면 보기 좋지만, 1차 범위에서는 eyeHeight만 반영하고 3인칭 거리 조정은 선택(후속).

---

## 4. 선택 UI (맵 카드와 동형)

`index.html` 오버레이에 차종 카드 3개 추가. 맵 선택(`#map-select`)과 동일 패턴.

```html
<p>차종과 맵을 선택하고 클릭하여 시작하세요</p>
<div id="car-select">
  <div class="car-card selected" data-car="sedan"><div class="car-card-icon">🚗</div><div class="car-card-label">승용차</div></div>
  <div class="car-card" data-car="suv"><div class="car-card-icon">🚙</div><div class="car-card-label">SUV</div></div>
  <div class="car-card" data-car="truck"><div class="car-card-icon">🚚</div><div class="car-card-label">트럭</div></div>
</div>
<div id="map-select"> ... 기존 맵 카드 ... </div>
```
- `style.css`: `.car-card`/`#car-select`는 기존 `.map-card`/`#map-select` 규칙을 **그대로 재사용**(공통 클래스로 묶거나 선택자 추가). selected 하이라이트(#00ff88) 동일.
- 레이아웃: 차종 카드 행을 맵 카드 행 **위**에 배치(세로 스택). 두 행 모두 오버레이 중앙 컬럼 안.
- 카드 클릭 핸들러는 맵 카드와 동일하게 `e.stopPropagation()` + `started` 가드 + selected 토글.

---

## 5. main.js 결선 범위

| 변경 지점 | 내용 |
|---|---|
| import | `import { getCarType, DEFAULT_CAR_ID } from './vehicle/carTypes.js';` |
| 상태 | `let selectedCarId = DEFAULT_CAR_ID;` (맵의 `selectedMapId` 옆) |
| EYE_HEIGHT | `const` → `let EYE_HEIGHT = 1.2;` (선택 차종에 따라 변경) |
| 카드 핸들러 | `.car-card` querySelectorAll → 클릭 시 `selectedCarId` 갱신 + selected 토글 |
| 오버레이 클릭 | `startGame(selectedMapId, selectedCarId)` |
| `startGame` | 시그니처 `startGame(mapId, carId = DEFAULT_CAR_ID)`; `const carType = getCarType(carId);` |
| createVehicle | `vehicle = createVehicle({...spawn}, carType.perf);` |
| buildCar | `car`를 startGame에서 (재)생성하거나, 전역 `car`를 교체. 현재는 모듈 로드 시 `buildCar()` 1회 → **startGame에서 기존 car 제거 후 `buildCar(carType)`로 재생성**(scene.remove(old) → scene.add(new)). |
| EYE_HEIGHT 설정 | `EYE_HEIGHT = carType.mesh.eyeHeight ?? 1.2;` (startGame 내) |

> 현재 `car`는 전역 const이고 모듈 로드시 1회 생성된다. 차종을 startGame 시점에 알게 되므로, **car 메시 생성을 startGame으로 이동**(또는 startGame에서 교체)하는 것이 가장 깔끔. dispose는 1회성이라 생략 가능하나, 재시작 대비 `scene.remove(prevCar)` 권장.

---

## 6. 단위 테스트 설계 가이드

신규 `src/vehicle/carTypes.test.js`:
- **데이터 유효성**: `CAR_TYPES`에 sedan/suv/truck 3종 존재. 각 차종이 `id,label,perf,mesh` 보유. `perf`의 필수 키 7종, `mesh`의 필수 키 전부 존재하고 숫자/유효. `getCarType('truck').id==='truck'`, 알 수 없는 id→sedan, 미지정→sedan. `listCarTypes()`가 `[{id,label}]` 3개.
- **상대 성능 단조성**(데이터 차원): `truck.perf.accelBase < suv < sedan`, `truck.rollingResist > sedan`, `truck.maxSteerRate < sedan`, `truck.mesh.bodyLen > sedan` 등 "트럭이 더 무겁고/느리고/크고/둔함" 불변식.

`vehicle.test.js` 보강:
- **차종별 가속 차이가 stepVehicle 결과에 반영**: 동일 시동→1단→동일 입력/스텝수로, `truck.perf`로 만든 차량의 누적 speed < `sedan.perf` 차량의 speed. (같은 기어·throttle 비교)
- **조향 차이**: 동일 속도에서 truck의 heading 변화량 < sedan(`maxSteerRate` 반영).
- **회귀**: `createVehicle()` (carParams 미지정) 동작이 기존 출발/stall/후진 테스트와 동일 — 기존 테스트가 그대로 통과하면 충족.

`dynamics.test.js` 보강(선택):
- `integrateSpeed`/`yawRate`/`corneringRoll`에 옵션 객체를 넘겼을 때 값 변화, 미지정 시 현 상수와 동일.

메시(`buildCar(carType)`): **수동/통합 검증**(THREE 치수). 단, 회귀로 `buildCar()` 자식 6개 이상은 기존 carMesh.test.js로 보장. 차종별 치수가 BoxGeometry에 반영되는지는 가벼운 단언 추가 가능하나 1차에선 수동.

---

## 7. 영향 범위 표

| 파일 | 변경 | 회귀 위험 |
|---|---|---|
| `src/vehicle/carTypes.js` | **신규**(순수, 데이터) | 없음 |
| `src/vehicle/vehicle.js` | `createVehicle(spawn,carParams)`, `stepVehicle`이 `v.car` 사용, `LEGACY_CAR` 기본값, 상태에 `car` 보존 | 낮음(기본값=현 상수) |
| `src/vehicle/dynamics.js` | `integrateSpeed/yawRate/corneringRoll/stepDynamics`에 옵션 인자 추가(기본=현 상수) | 낮음(기본값) |
| `src/render/carMesh.js` | `buildCar(carType)` 치수/색 파라미터화, 바퀴 Y 반경 연동, `DEFAULT_MESH`=현재 값 | 낮음(기본=현재) |
| `index.html` | `#car-select` 카드 3개 추가 | 없음 |
| `src/style.css` | `.car-card`/`#car-select`(맵 규칙 재사용) | 없음 |
| `src/main.js` | `selectedCarId`, 카드 핸들러, `startGame(mapId,carId)`, `createVehicle(...,perf)`, `buildCar(carType)` 교체, `EYE_HEIGHT` let화 | 중(차량/카메라 결선 변경) |
| 테스트 | `carTypes.test.js` 신규 + `vehicle.test.js` 차종 차이/회귀 보강 | — |

### 단계 분할 권고
- **M13a (순수 코어)**: `carTypes.js` + vehicle/dynamics 파라미터 주입 + 단위 테스트(데이터·차종 가속/조향 차이·회귀). 렌더 무관, 회귀 0 확인.
- **M13b (메시+UI 결선)**: `buildCar(carType)` 파라미터화 + EYE_HEIGHT + 선택 카드 UI + main.js 결선. 수동 주행 검증(3종 체감 차이·시야 높이·외형).
- (선택) **M13c 튜닝**: 잠정 수치 실주행 튜닝, 외형 바퀴↔구동 wheelRadius 정합 여부, 3인칭 거리 차종 연동.

---

## 8. 설계 핵심 요약
1. **데이터 모델**: 신규 순수 모듈 `src/vehicle/carTypes.js`. 차종 = `{id,label,perf,mesh}`. `perf` 7키는 기존 모듈 상수(ACCEL_BASE/ROLLING_RESIST/BRAKE_DECEL/MAX_STEER_RATE/TURN_FULL_SPEED/CORNER_ROLL_K + 신규 gearTopFactor)와 1:1, `mesh`는 차체/캐빈/바퀴 치수+eyeHeight+색. 3종 잠정 수치표 제시(트럭=느림/둔함/큼).
2. **주입 권장안=방안 A**: `createVehicle(spawn, carParams)`로 차량 상태에 `car` 보관 → `stepVehicle`이 `v.car` 사용, `stepDynamics(state,inputs,dt,sampleHeight,car)`로 전달. 적분 함수(`integrateSpeed/yawRate/corneringRoll`)는 마지막에 옵션 객체를 받고 **기본값=현재 상수**.
3. **회귀 0**: 모든 신규 인자 기본값을 현 상수로 두고, vehicle은 `LEGACY_CAR`/`v.car ?? LEGACY_CAR` 폴백 → 기존 vehicle/dynamics 테스트 무수정 통과.
4. **메시 파라미터화**: `buildCar(carType)`가 치수/색을 머지(`DEFAULT_MESH`=현재 값). 바퀴 Y는 반경 연동. `updateCarTransform`은 불변. 1인칭 `EYE_HEIGHT`를 차종 `eyeHeight`로 startGame에서 설정(트럭 시야 높음).
5. **선택 UI**: 맵 카드와 동형 `.car-card` 3개(`#car-select`)를 오버레이에 추가, CSS 규칙 재사용. `selectedCarId` 흐름, `startGame(mapId, carId)`로 전달.
6. **테스트 대상**: carTypes 데이터 유효성(3종·필수 필드·상대 단조성), 차종별 stepVehicle 가속/조향 차이(truck<sedan), 기본 인자 회귀, 메시는 수동.
7. **단계 분할**: M13a(순수 코어+테스트, 회귀 0) → M13b(메시+UI 결선, 수동검증) → (선택)M13c 튜닝.
