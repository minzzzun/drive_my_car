# 설계 — 후진(R) 기어 W/S 입력 반전 (M10)

> 후진 기어(R, `gear === -1`)에서는 **S = 악셀(후진 구동)**, **W = 브레이크(감속)**.
> 전진 기어(1~5)와 중립(N)에서는 현행 동작을 그대로 유지한다.

## 배경 / 현행 동작

- `input.js`는 순수 키 매핑 모듈로, **기어 상태를 모른다**: `KeyW→throttle=1`, `KeyS→brake=1`로 고정 매핑(`readControls`).
- 따라서 후진 시에도 W를 눌러야 후진 가속이 되어 직관에 어긋난다.
- 실제 수동차 감각: 후진 기어를 넣으면 운전자는 "전진과 동일하게 악셀을 밟아" 차를 뒤로 굴린다. 즉 **물리적 페달(악셀)은 그대로지만, 키보드 W/S를 '전진 페달=W, 후진 페달=S'로 직관화**하려는 것이 본 요구.

## 확정된 구현 방향

`input.js`는 기어를 모르므로 건드리지 않는다. **기어를 아는 `vehicle.js`의 `stepVehicle`에서, `gear === -1`일 때만 throttle↔brake 입력을 swap**한다.

## 변경 대상 파일 / 위치

### 1. `src/vehicle/vehicle.js` — `stepVehicle` (단일 변경 지점)

현재 `stepVehicle`은 함수 첫머리(25행 부근)에서 `controls`를 구조분해한 뒤, `throttle`/`brake`를 그대로 사용한다:

- 46행: `stepEngine(..., { throttle, ... })` — 엔진 RPM 추종에 throttle 사용
- 52~57행: 구동 가속 계산
  ```js
  if (eng.on && inGear && engagement > 0) {
    const dir = gear < 0 ? -1 : 1;
    ...
    engineAccel = dir * throttle * torque * engagement * headroom;
  }
  ```
- 61행: `stepDynamics(..., { engineAccel, brake, steer }, ...)` — brake 사용

**변경**: 구조분해 직후, 기어 확정(`gear` 변수, 변속 반영 후) **다음**에 "유효 입력" 두 변수를 만든다. 변속이 같은 스텝에서 일어날 수 있으므로 **swap은 변속 적용 후의 `gear` 기준**이어야 한다(36행 `inGear` 계산 부근, 또는 그 직후).

```js
// 후진 기어에서는 W/S(throttle/brake) 의미를 뒤집는다.
// gear === -1 → 악셀(S)로 후진 구동, 브레이크(W)로 감속.
const reverse = gear === -1;
const effThrottle = reverse ? brake : throttle;
const effBrake    = reverse ? throttle : brake;
```

그 후 함수 내 `throttle`/`brake` 사용처를 **모두 `effThrottle`/`effBrake`로 치환**:

- 46행 `stepEngine(..., { throttle: effThrottle, ... })` — 후진 가속 페달(S)을 밟을 때 엔진이 취도록(rev/stall이 실제 구동 페달과 일치).
- 57행 `engineAccel = dir * effThrottle * torque * engagement * headroom;`
- 61행 `stepDynamics(v.dyn, { engineAccel, brake: effBrake, steer }, ...)`.

> 대안: 별도 헬퍼 `applyGearControls(controls, gear)`를 두어 `{throttle, brake}`를 보정한 새 controls를 돌려주는 형태도 가능. 다만 변경점이 한 함수 안에 국소화돼 있고 의존이 가벼워, 현재 규모에서는 **인라인 두 변수(`effThrottle`/`effBrake`)** 가 더 읽기 쉽다. 테스트 용이성이 더 필요하면 헬퍼로 승격.

### 2. `src/input.js` — 변경 없음

순수 매핑 모듈의 책임을 유지(기어 비의존). swap은 전적으로 `vehicle.js` 책임.

### 3. `README.md` 조작표 — 갱신 필요 (아래 "README" 절 참조)

## swap 로직 논리 검증 (vehicle.js 52~58 + dynamics.js 근거)

좌표 규약(dynamics.md): `speed` 전진 +, 후진 −. `engineRpmFromSpeed`는 `|speed|` 사용이라 후진에서도 RPM 양수.

### (A) R에서 S 키 = 후진 가속
- 입력: `throttle=0`(W 안 눌림), `brake=1`(S 눌림). swap → `effThrottle=1`, `effBrake=0`.
- 구동 가속: `dir=-1`(57행), `engineAccel = -1 · 1 · torque · engagement · headroom < 0`.
- `integrateSpeed`(dynamics.js 20~26): `a = engineAccel − ROLLING_RESIST·speed − 0`. `engineAccel<0` → speed가 음수로 감소 = **후진 가속**. ✅
- `headroom = 1 − |speed|/maxSpeed(R)` 이 후진 최고속(R 기어 레드라인 환산)을 한계로 가속을 줄인다. ✅

### (B) R에서 W 키 = 감속(브레이크)
- 입력: `throttle=1`(W 눌림), `brake=0`. swap → `effThrottle=0`, `effBrake=1`.
- `engineAccel = dir · 0 · ... = 0`. 구동력 없음.
- `integrateSpeed`: `a = 0 − ROLLING_RESIST·speed − 1·BRAKE_DECEL·sign(speed)`. 후진 중 `speed<0`이므로 `sign(speed)=−1` → `−BRAKE_DECEL·(−1)=+BRAKE_DECEL` → 양의 가속으로 **0을 향해 감속**. ✅
- 24행 정지 고정: `brake>0`이고 0을 가로지르면 `next=0` → 후진 중 W로 정확히 멈춤(부호 튐 방지). ✅

### (C) R에서 S로 후진 중 엔진 거동
- `effThrottle`을 `stepEngine`에 넘기므로, S를 밟으면 엔진 RPM이 따라 오른다(반클러치 결합 시 `coupledRpm`과 lerp). 후진 중 클러치를 급히 떼면 저RPM stall 판정도 정상 동작(engine.js 46행). ✅
- 만약 `stepEngine`에 **원본 throttle을 그대로** 두면: R에서 S로 후진하는데 엔진은 공회전(throttle=0 인식)으로 떨어져 결합 시 stall이 비정상적으로 잘 난다. 따라서 **`stepEngine`에도 `effThrottle`을 넘기는 것이 일관적**이며 본 설계의 채택안.

## N(중립)·전진 기어 불변 보장

- `reverse = (gear === -1)` 조건 하나로만 분기. `gear` ∈ {0,1,2,3,4,5}이면 `effThrottle=throttle`, `effBrake=brake` 로 **항등** → 기존 코드 경로와 비트 단위로 동일.
- N(0): `inGear=false`라 애초에 `engineAccel=0`. swap 여부와 무관. ✅
- 전진 1~5: swap 미적용. 기존 M4 동역학 테스트가 그대로 그린이어야 함(회귀 없음). ✅

## 엣지 케이스

1. **R↔1단 전환 순간**: swap 기준이 **변속 적용 후의 `gear`** 이므로, 같은 스텝에서 R→1로 올라가면 그 스텝부터 즉시 정상(비반전) 매핑. 반대로 N→R(또는 1→...→R) 진입한 스텝부터 반전 적용. 한 프레임의 모호함 없음(중간 N을 항상 거치는 순차 변속 특성상 R↔전진 직접 전환도 없음).
2. **정지 중(speed=0)**: 
   - R+S(후진 악셀): `engineAccel<0` → speed가 0에서 음수로 출발 = 후진 시작. 단 `engagement>0`(클러치 충분히 뗌)이어야 구동(52행). 정지+클러치 밟은 채면 구동 0.
   - R+W(브레이크): `sign(0)=0`이라 브레이크 항 0, 구동도 0 → 그대로 정지. 안전. ✅
3. **R에서 W와 S 동시 입력**: swap 후 `effThrottle=brake=1`, `effBrake=throttle=1` → 후진 가속과 브레이크가 동시. `integrateSpeed`에서 `engineAccel<0`과 `+BRAKE_DECEL`이 상쇄/경쟁. 전진 기어에서 W+S 동시 입력과 대칭적인 거동이라 별도 처리 불필요(기존 정책 유지).
4. **HUD 표시**: 기어명은 `gearName(gear)`로 'R' 표시(기존). HUD는 페달 입력 라벨을 직접 표기하지 않으므로 **HUD 코드 변경 불필요**. (선택) 후진 중 "S=악셀" 안내를 화면에 띄우고 싶다면 별도 후속 작업으로 분리하며, 본 M10 범위 밖.
5. **후진 최고속**: R 기어비(3.6) 기준 `maxSpeed`가 한계. 기존 구동 모델 그대로라 별도 튜닝 불필요.

## 테스트 설계 가이드 (다음 단계 테스트 작성 에이전트용)

`tests/` 의 기존 vehicle 테스트 관례를 따른다. mock `sampleHeight = () => 0`(평지), 엔진 on·기어 R·`clutchPedal=0`(완전 결합) 세팅에서 `stepVehicle`을 여러 스텝 돌려 `speed` 부호/크기를 검사.

필수 케이스:
1. **R + S = 후진 가속**: gear=R, `{throttle:0, brake:1, clutchPedal:0}` 몇 스텝 → `speed < 0`(점점 작아짐).
2. **R + W = 감속/정지**: 먼저 R+S로 `speed<0` 만든 뒤, `{throttle:1, brake:0}` → `speed`가 0을 향해 증가(절댓값 감소), 결국 0 근처.
3. **R + W 단독(정지에서)**: speed=0에서 `{throttle:1, brake:0}` → speed 변화 없음(여전히 0, 전진하지 않음). ← 반전이 "W로 전진"되지 않음을 보장.
4. **R + S 단독(정지에서)**: speed=0에서 `{throttle:0, brake:1}` → speed가 음수로 출발.
5. **전진 기어 불변(회귀)**: gear=1, `{throttle:1, brake:0}` → `speed > 0`(전진). gear=1, `{throttle:0, brake:1}` → 후진 중이 아니면 정지 유지/감속. (기존 M4 테스트와 동일 결과)
6. **중립 불변**: gear=0(N), 어떤 throttle/brake든 `engineAccel` 경로 비활성 → 구동 없음.
7. **(선택) 엔진 RPM 추종**: R에서 S 밟을 때 엔진 RPM이 상승(공회전 위로) — `stepEngine`에 `effThrottle`이 전달됨을 간접 검증.
8. **(선택) 변속 경계**: R→(N)→1 순차 변속 직후 스텝에서 W가 다시 악셀, S가 브레이크로 복귀.

## README 갱신 필요 여부 — 필요함

`README.md` 16~28행 "🎮 조작법" 표에 후진 동작을 명시한다. 권장 수정:

- `W` 행: `액셀 (후진 R 기어에서는 브레이크)`
- `S` 행: `브레이크 (후진 R 기어에서는 액셀/후진 구동)`
- 또는 표 아래에 한 줄 주석 추가: *"후진(R) 기어에서는 W/S가 뒤바뀐다 — **S=후진 악셀, W=브레이크**."*

조작 본문(28행 "출발 요령")은 전진 기준이라 그대로 두고, 후진 안내 한 줄만 별도로 덧붙이는 것을 권장.

## 영향 범위 요약

| 파일 | 변경 | 비고 |
|------|------|------|
| `src/vehicle/vehicle.js` | `stepVehicle` 내 `effThrottle`/`effBrake` 2변수 추가 + 3개 사용처 치환 | 핵심 변경 |
| `src/input.js` | 없음 | 순수 매핑 유지 |
| `src/render/hud.js` | 없음 | 기어명만 표시(기존) |
| `README.md` | 조작표 후진 주석 추가 | 문서 |
| `tests/vehicle.*` | 후진 swap 케이스 추가 | TDD |
