# M17 — 배송 미션 다양화 (기술설계)

> 상태: 설계. 구현 전. SSoT는 `mds/spec/seed.md`(순수 운송 기조 유지: 시동꺼짐/도로이탈 감점 없음).
> 선행: M14(배송 미션 상태기계) · M16(화물 시각화 `setCargo` + 큰 지도). 본 설계는 그 위에 **추가형**으로 얹는다.

## 0. 목표 / 비목표

**목표**
- 단순 체이닝(이전 dropoff = 다음 pickup)만 있던 배송을 **화물 종류 · 운임/수익 · 거리 편차**로 다양화.
- 긍정적 진행감(누적 수익 ₩, 완료 건수, 목표 달성)만 도입. **감점/실패는 도입하지 않는다.**

**비목표**
- 시동꺼짐/도로이탈/충돌 페널티(순수 운송 기조 유지).
- 화물 종류가 주행 물리에 주는 페널티성 영향(과한 난이도 상승). → 시각/보상에만 반영(주행 영향은 §1.4의 선택지로만 명시, 기본 OFF).
- 시간 제한·랭킹.

---

## 1. 화물 종류 데이터 — 신규 순수 모듈 `src/cargoTypes.js`

THREE 비의존 순수 데이터 + 결정론 선택 함수. (`carTypes.js`와 동일한 스타일.)

### 1.1 데이터 모델
```js
// CARGO_TYPES — 종류별 메타. color 는 carMesh 화물 박스/HUD 색에 그대로 쓰는 hex 숫자.
export const CARGO_TYPES = [
  { id: 'furniture',  label: '가구',     icon: '🛋️', color: 0x8d6e63, baseRate: 12 },
  { id: 'grocery',    label: '식료품',   icon: '🥬', color: 0x66bb6a, baseRate: 9  },
  { id: 'material',   label: '건축자재', icon: '🧱', color: 0xb0703a, baseRate: 15 },
  { id: 'autoparts',  label: '자동차부품', icon: '⚙️', color: 0x90a4ae, baseRate: 18 },
  { id: 'cold',       label: '냉장(콜드체인)', icon: '🧊', color: 0x4fc3f7, baseRate: 22 },
];
```
- `baseRate` = **운임 계수(₩/m 환산용)**. 콜드체인/부품처럼 까다로운 화물일수록 높다(보상↑).
- 5종: 모두 라벨·아이콘(이모지)·색·계수를 가진다. `color`는 M16 `setCargo` 확장(§5)에 그대로 전달.

### 1.2 결정론 선택
좌표/인덱스 해시로 종류를 고른다(난수 없음 → 같은 입력 → 같은 종류).
```js
// 정수 해시(좌표 기반) — pickup·dropoff 좌표를 섞어 안정적 인덱스 산출.
export function cargoIndexFor(pickup, dropoff) {
  const h = Math.round(pickup.x*7 + pickup.z*13 + dropoff.x*17 + dropoff.z*23);
  return ((h % CARGO_TYPES.length) + CARGO_TYPES.length) % CARGO_TYPES.length;
}
export function cargoFor(pickup, dropoff) { return CARGO_TYPES[cargoIndexFor(pickup, dropoff)]; }
export function cargoById(id) { return CARGO_TYPES.find((c) => c.id === id) ?? null; }
```
- 좌표가 정수 격자(도시) / 등간격(자연)이라 충분히 분산된다. job 인덱스를 섞어 넣어도 무방하나, **좌표 기반이 맵 무관·재현성↑** 이라 선호.

### 1.3 carMesh 확장 범위(상세는 §5)
- `setCargo(car, visible, color)` 로 3번째 인자(선택) 추가. `color`가 오면 화물 메시의 `material.color.setHex(color)` 까지 갱신. **인자 2개 호출은 기존 동작 그대로(회귀 0).**

---

## 2. job 모델 확장 — `src/mission.js`

### 2.1 확장된 job 형태(추가형)
```
job = {
  pickup:   {x, z, label},
  dropoff:  {x, z, label},
  cargo:    {id, label, icon, color, baseRate},   // ← 신규
  distance: number,                               // ← 신규(m, pickup↔dropoff 직선)
  fare:     number,                               // ← 신규(₩, 정수)
}
```
- `cargo/distance/fare`는 **추가 필드**. 기존 `{pickup,dropoff}`만 가진 job(테스트의 `mkJob`)도 그대로 동작해야 한다(§7 회귀).

### 2.2 운임 공식 (순수·결정론)
```js
export const FARE_BASE = 3000;     // 기본 출장비(거리 0이라도 받는 최소 운임 성격)
export function jobDistance(job)  { return Math.hypot(job.dropoff.x-job.pickup.x, job.dropoff.z-job.pickup.z); }
export function computeFare(distanceM, baseRate) {
  return Math.round(FARE_BASE + distanceM * baseRate);   // ₩ = 기본 + 거리 × 화물계수
}
```
- 거리 길수록 / 까다로운 화물일수록 운임↑ → 자연스러운 보상 편차.

### 2.3 job 보강 함수 — `enrichJob(job)` (멱등)
```js
// 이미 cargo/fare 가 있으면 그대로 둔다(멱등). 없으면 결정론적으로 채운다.
export function enrichJob(job) {
  const cargo = job.cargo ?? cargoFor(job.pickup, job.dropoff);
  const distance = job.distance ?? jobDistance(job);
  const fare = job.fare ?? computeFare(distance, cargo.baseRate);
  return { ...job, cargo, distance, fare };
}
```
- `jobsFromPoints`가 이걸 거쳐 종류·거리·운임을 부여한다(§3). 분리해 두면 단위 테스트가 쉽다.

### 2.4 `jobsFromPoints` 보강
- 기존 분기(체이닝 기본 / `mode:'pairs'`)는 **그대로 두고**, 마지막에 `jobs.map(enrichJob)`로 보강.
  ```js
  // ... 기존 분기로 jobs 생성 후
  return jobs.map(enrichJob);   // cargo/distance/fare 부여(결정론)
  ```
- 기존 테스트 `jobs[i].pickup/dropoff` 검증은 추가 필드와 무관하게 통과(객체에 키가 늘 뿐).
  단, "이전 dropoff = 다음 pickup (`toEqual`)" 테스트는 §7에서 처리(아래).

---

## 3. 다양한 경로 — 거리 편차 생성기

### 3.1 문제
체이닝은 "이전 dropoff = 다음 pickup"이라 매 구간이 인접 점 한 칸이라 거리 편차가 작다.
멀고 가까운 구간을 섞으면 운임 편차 + 이동 재미가 생긴다.

### 3.2 신규 모드 `mode:'mixed'` (결정론 셔플 쌍)
- 점 인덱스를 **결정론 순열**(LCG/고정 시드)로 섞어 비겹침 쌍을 만든다 → pickup↔dropoff가 멀리 떨어진 쌍이 섞임.
```js
// 결정론 순열(고정 시드 LCG) — 같은 N → 같은 순서.
function deterministicOrder(n, seed = 1) {
  const idx = [...Array(n).keys()];
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;     // LCG
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
// mode:'mixed' → 섞은 순서로 (a0→a1),(a2→a3),... 비겹침 쌍 → enrichJob
```
- `pairs`/`mixed` 둘 다 `floor(N/2)` job. `mixed`는 같은 점집합에서도 **거리 분산이 커짐**(멀고 가까운 쌍 혼재).
- **기본 모드는 유지(체이닝)**. main.js가 어떤 모드를 쓸지는 §4 결선에서 선택(권장: `'mixed'`로 다양화).
- 결정론이므로 단위 테스트로 "같은 입력 → 같은 job 배열" 검증 가능.

### 3.3 모드 비교
| mode | job 수 | pickup-dropoff 관계 | 거리 편차 | 용도 |
|---|---|---|---|---|
| (기본) chaining | N-1 | 인접 점 체이닝 | 작음 | 기존 동작/회귀 |
| pairs | ⌊N/2⌋ | 입력 순서 비겹침 쌍 | 중간 | 단순 분리 배송 |
| **mixed** | ⌊N/2⌋ | 결정론 셔플 쌍 | **큼** | M17 다양화(권장) |

---

## 4. 수익 / 진행감 — mission 상태 + 결선

### 4.1 mission 상태에 `earnings` 추가
```js
export function createMission(jobs) {
  const list = jobs ?? [];
  return {
    jobs: list, index: 0,
    phase: list.length === 0 ? 'done' : 'toPickup',
    hasCargo: false, completed: 0, total: list.length,
    earnings: 0,   // ← 신규: 누적 수익(₩). delivered 시 해당 job.fare 가산.
  };
}
```

### 4.2 `stepMission` 반환에 `fare` 포함 + earnings 가산
- **delivered / allDone 전이 시** 방금 완료한 job의 `fare`만큼 `earnings` 증가. 반환 event 객체에 `fare`(이번 건)·`earnings`(누적) 동봉.
- 현재 `stepMission`은 `{ state, event }`(event=문자열) 반환. 문자열 호환을 깨지 않기 위해 **반환에 필드 추가**:
  ```js
  // 하차(delivered/allDone) 시:
  const fare = state.jobs[state.index]?.fare ?? 0;
  return {
    state: { ...state, ..., earnings: state.earnings + fare },
    event: 'delivered',   // (문자열 그대로 — 기존 테스트 호환)
    fare,                 // ← 이번 건 운임(₩)
  };
  ```
  - `event`는 **문자열 그대로** 유지(기존 `expect(event).toBe('delivered')` 깨지지 않음).
  - `fare`는 추가 반환 필드(구독 안 하면 무시됨). `state.earnings`는 fare 미정의(=0) 시 0 가산 → 구 job에도 안전.
- `pickedUp`은 earnings 불변(적재 시점엔 수익 없음). `fare:0` 또는 미포함.

### 4.3 HUD 표시(상세 §5)
- line2(배송)에 **현재 화물 종류(icon+label)**, **이번 운임(₩fare)**, **누적 수익(₩earnings)**, **완료 N/total** 표시.
- 완료 토스트: `✅ 배송 완료! +₩{fare} (누적 ₩{earnings})`.
- 전체 완료 오버레이: `🎉 모든 배송 완료! {completed}건 · 총수익 ₩{earnings}`.
- (선택) 목표 표시: "목표 ₩{TARGET} 달성!" 식. 목표는 `total × 평균운임` 정도로 정하되 **달성 못해도 페널티 없음**(긍정 메시지만).

---

## 5. 표시 결선

### 5.1 `setCargo` 확장 — `src/render/carMesh.js`
```js
// 3번째 인자 color(선택): 오면 화물 박스 색까지 갱신. 2-인자 호출은 기존 동작 그대로.
export function setCargo(car, visible, color) {
  const cargo = car.getObjectByName('cargo');
  if (!cargo) return;
  cargo.visible = !!visible;
  if (color != null && cargo.material) cargo.material.color.setHex(color);
}
```
- `CARGO_COLOR`(기본 택배톤)는 fallback으로 유지. color 미전달 시 색 변경 없음(회귀 0).

### 5.2 `main.js` 결선 (이벤트)
- `pickedUp`: 현재 job의 `cargo.color`로 `setCargo(car, true, cargo.color)` → 적재함 색이 화물 종류색.
  - 토스트: `📦 {icon}{label} 적재 — {다음 목표 label}(으)로! (운임 ₩{fare})`.
- `delivered`: `setCargo(car, false)` + 토스트 `✅ 배송 완료! +₩{fare} (누적 ₩{earnings})`.
- 현재 job의 cargo는 `mission.jobs[mission.index].cargo`로 접근(전이 전 index 기준 주의 — pickedUp은 같은 index, delivered는 전이 후 index가 바뀌므로 **반환 fare/event 시점 값을 토스트에 사용**).

### 5.3 HUD `missionView` 확장 — `src/render/hud.js`
- `update(vehicle, missionView)`의 missionView에 필드 추가:
  `{ ..., cargoIcon, cargoLabel, fare, earnings }`.
- line2 렌더에 `${cargoIcon} ${cargoLabel}` · `운임 ₩${fare}` · `누적 ₩${earnings}` 추가(기존 phase/label/distance/hasCargo/completed/total 유지). 필드 없으면 빈 문자열(하위호환).
- main.js `updateHUD`에서 현재 job(`mission.jobs[mission.index]`)의 cargo/fare와 `mission.earnings`를 missionView에 넣어 전달.

### 5.4 결과 오버레이 — `main.js`
- `mission.phase==='done'` 안내에 **총수익 ₩{earnings}** 추가:
  `🎉 모든 배송 완료! · {completed}건 · 총수익 ₩{earnings}`.

### 5.5 미니맵 / 큰 지도(`bigmap.js`)
- 좌표/도로/현재목표 강조는 **변경 없음**(영향 최소).
- (선택) 큰 지도 점 라벨에 화물 아이콘 접두(`{icon} {label}`) — `deliveryPoints`는 지점(점) 단위라 화물(=job 단위)과 1:1이 아니므로 **무리하게 하지 않는다**. 큰 지도는 그대로 두는 것을 권장. (필요 시 M17b에서 현재 job 화물 아이콘만 제목줄에 표기.)

---

## 6. 순수성 / 테스트 설계

### 6.1 `src/cargoTypes.test.js` (신규)
- 데이터 유효성: 각 항목 `id/label/icon/color/baseRate` 존재, `id` 유일, `color`는 0x000000~0xFFFFFF, `baseRate>0`.
- 결정론: `cargoFor(p,d)`가 같은 입력 → 같은 객체 id. 다른 좌표는 분산(전체가 한 종류로 쏠리지 않음 — 샘플 점들로 ≥3종 등장 검증).
- `cargoIndexFor`가 항상 0..len-1 정수.
- `cargoById('cold')` 정상, 없는 id → null.

### 6.2 `src/mission.test.js` 확장
- **운임/거리**: `enrichJob`이 `distance=pickup↔dropoff 직선`, `fare=computeFare(distance, cargo.baseRate)` 부여. 멱등(이미 fare 있으면 보존).
- **jobsFromPoints 보강**: 반환 job에 `cargo/distance/fare` 존재, 결정론(같은 입력 깊은 동등).
- **mixed 모드**: `floor(N/2)`개, 결정론(2회 호출 동등), 거리 편차가 chaining보다 큼(또는 최소/최대 거리 spread 검증).
- **earnings**: `createMission` 초기 `earnings:0`. delivered 1건 후 `earnings === 그 job.fare`. 전체 완료 후 `earnings === Σ fare`. `stepMission` 반환에 `fare` 포함(delivered/allDone).
- **불변성 유지**: earnings 가산도 새 객체(입력 state 미변형).

### 6.3 `src/render/carMesh.test.js` 확장
- `setCargo(car, true, 0x4fc3f7)` → `cargo.visible===true` 그리고 `cargo.material.color.getHex()===0x4fc3f7`.
- `setCargo(car, false)`(2-인자) → 색 변경 없음(회귀: 호출 전 색 유지).

### 6.4 수동 검증(THREE/HUD)
- 적재 시 화물 박스 색이 종류색으로 바뀌는지, HUD에 화물 아이콘/운임/누적 수익이 뜨는지, 완료 토스트 `+₩`, 결과 오버레이 총수익.

---

## 7. 회귀 (기존 테스트 보호)

기존 `mission.test.js`는 35건(M16 기준). 깨질 수 있는 지점과 대응:

| 기존 테스트 | 위험 | 대응 |
|---|---|---|
| `createMission` 초기상태 | earnings 추가는 신규 키 → 기존 expect 영향 없음 | 추가형, 안전 |
| `stepMission` event 문자열(`toBe('delivered')`) | event를 객체로 바꾸면 깨짐 | **event는 문자열 유지**, fare는 별도 반환 필드 |
| `stepMission` 불변성/`toEqual(s0)` | earnings 가산이 새 객체면 OK | 새 객체 반환 유지 |
| done no-op `after.state` `toEqual(done)` | earnings 동일하면 OK | done no-op은 earnings 불변 |
| `jobsFromPoints` pickup/dropoff 검증 | 키만 늘어남 | 안전 |
| **`jobsFromPoints` "이전 dropoff = 다음 pickup" `toEqual`** | enrichJob이 dropoff/pickup 객체 자체는 안 바꿈 → `job.dropoff`·`job.pickup`은 원본 점 객체 그대로라 `toEqual` 유지 | **enrichJob은 pickup/dropoff를 그대로 spread**(좌표 객체 변형 금지). 안전 |
| `mkJob`(cargo 없는 job) 사용 테스트 | `currentTarget`/`stepMission`이 cargo 의존하면 깨짐 | stepMission earnings 가산은 `job.fare ?? 0` 로 fare 없으면 0. **cargo/fare에 의존하지 않게 ?? 가드** |

핵심 원칙: **(1) event 문자열 불변, (2) 추가 필드만, (3) cargo/fare/earnings 모두 `??` 가드로 구 job 안전.**

---

## 8. 영향 범위 / 단계 분할

### 8.1 영향 범위 표
| 파일 | 변경 | 종류 | 단계 |
|---|---|---|---|
| `src/cargoTypes.js` | 신규(데이터+cargoFor/cargoIndexFor/cargoById) | 순수 | M17a |
| `src/cargoTypes.test.js` | 신규 | 테스트 | M17a |
| `src/mission.js` | enrichJob/jobDistance/computeFare/FARE_BASE, jobsFromPoints 보강, mode:'mixed', earnings, stepMission fare 반환 | 순수 | M17a |
| `src/mission.test.js` | 운임/거리/mixed/earnings 케이스 추가 | 테스트 | M17a |
| `src/render/carMesh.js` | `setCargo(car, visible, color)` 3번째 인자 | 렌더 | M17b |
| `src/render/carMesh.test.js` | color 인자 케이스 | 테스트 | M17b |
| `src/render/hud.js` | missionView에 cargoIcon/cargoLabel/fare/earnings 표시 | 렌더 | M17b |
| `src/main.js` | jobsFromPoints mode:'mixed', 이벤트 토스트(₩·화물), updateHUD missionView 확장, 결과 오버레이 총수익, setCargo 색 전달 | 결선 | M17b |
| `src/render/bigmap.js` | (선택) 제목줄 현재 화물 아이콘 | 렌더 | M17b(옵션) |

### 8.2 단계 분할 권고
- **M17a — 미션/화물 코어 + 테스트(순수만)**
  - `cargoTypes.js`(+test), `mission.js` 확장(enrichJob/운임/mixed/earnings/stepMission fare)(+test).
  - THREE/HUD 무변경. `npm test` 그린으로 마감(기존 회귀 0 확인).
- **M17b — HUD · 화물색 · 결선(렌더/통합)**
  - `setCargo` color, hud missionView, main.js 이벤트/HUD/결과 오버레이/`mode:'mixed'`.
  - carMesh.test color 케이스. 수동 검증(적재색·HUD수익·토스트·총수익).

> 분리 이유: M17a는 순수·테스트로 100% 자동검증 가능(빠른 그린), M17b는 시각/수동 검증 비중이 커 위험이 다르다. 코어가 그린이면 결선은 표시만 얹는 저위험 작업.

---

## 9. 열린 결정(구현 시 확정)

- **§1.4 화물→주행 영향(선택)**: 냉장/건축자재 무게로 가속/최고속 미세 하향 등은 *과하지 않게*만, 기본 **OFF**. 도입 시 `cargo`에 `massFactor` 추가하고 dynamics가 아닌 perf 스케일로만(페널티 아님, 체감용). M17 기본 범위 제외 권장.
- **목표(target)**: ₩X 또는 N건. 페널티 없는 긍정 표시로만. 기본은 "전 건 완료 + 총수익" 표시로 충분.
- **mode 기본값**: main.js에서 다양화를 위해 `'mixed'` 채택 권장하나, 자연 맵(점 4개→2 job)은 다양성이 적으므로 점 수(getDeliveryPoints N)도 함께 검토. (점 수 변경 시 §7의 #4 거리 임계 테스트 영향 — 그땐 테스트 갱신 명시 필요.)
