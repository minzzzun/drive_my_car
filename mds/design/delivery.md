# M14 — 유로트럭식 배송 모드 기술설계 (delivery.md)

> 면허시험형(순차 체크포인트 + 타이머 + 감점)을 **배송 미션**으로 전환한다.
> 적재지(pickup)에서 짐을 싣고 → 목적지(dropoff)로 운반해 하차. 여러 배송을 이어서.
> **시간 제한·채점·감점·게임오버 전면 제거.** 목표 도달만이 진행. 두 맵(자연/도시) 모두 동작.

---

## 0. 요구사항 확정 사항 (재확인)

- 진행 방식: pickup 도착 → 적재 → dropoff 도착 → 하차 → 다음 job. job 들을 순차로.
- 패널티 없음: 시동꺼짐·도로이탈·전복·충돌 어떤 것도 점수/진행에 영향 없음. (단, 건물 통과 차단 `isBlocked` 물리 클램프는 운전 물리이므로 그대로 유지.)
- 종료: '전체 배송 완료'만 종료(또는 무한 반복). 탈락·실패 상태는 존재하지 않음.
- 대상 맵: natural + city 둘 다. 도시 맵 배송이 핵심 그림.

---

## 1. 배송 미션 상태기계 — 신규 순수 모듈 `src/mission.js`

`scoring.js` 와 같은 위치/스타일(순수, THREE 비의존, `{x,z}` 숫자만)로 만든다.
`main.js` 가 매 프레임 차량 위치를 넘기면 도착을 판정해 단계를 전이한다.

### 1.1 상태 형태

```js
// job: 하나의 배송 단위
// { pickup: {x, z, label}, dropoff: {x, z, label} }

// mission state
{
  jobs,          // job[] — 순차 처리할 배송 목록 (불변)
  index,         // number — 현재 처리 중인 job 인덱스 (0..jobs.length)
  phase,         // 'toPickup' | 'toDropoff' | 'done'
  hasCargo,      // boolean — 적재 여부 (toDropoff 단계에서 true)
  completed,     // number — 하차 완료한 배송 건수
  total,         // number — jobs.length (HUD 표시 편의)
}
```

- `phase === 'done'` 이면 모든 job 완료. `index === jobs.length`.
- `hasCargo` 는 파생값이지만(=phase==='toDropoff') HUD/적재 표현 편의를 위해 명시 보유.

### 1.2 상수

```js
export const ARRIVE_RADIUS = 6;   // 목표 도달 판정 반경(m). 기존 CHECKPOINT_RADIUS(6)와 동일 톤.
```

### 1.3 순수 API

```js
// 미션 생성 — jobs 비면 즉시 done.
export function createMission(jobs) { ... }

// 현재 목표점 — done 이면 null.
//   → { x, z, phase, label }   (phase: 'toPickup'|'toDropoff')
export function currentTarget(state) { ... }

// 한 스텝 전진 — carPos={x,z}. 도착(거리<ARRIVE_RADIUS)이면 phase 전이.
//   반환: { state, event }
//   event ∈ null | 'pickedUp' | 'delivered' | 'allDone'
//   - toPickup 도착 → hasCargo=true, phase='toDropoff', event='pickedUp'
//   - toDropoff 도착 → completed++, index++, event='delivered'
//        · 다음 job 있으면 phase='toPickup', hasCargo=false
//        · 없으면 phase='done'  (이 경우 event는 'allDone' 우선 반환)
export function stepMission(state, carPos) { ... }
```

세부 규칙:
- `stepMission` 은 `scoring.js` 의 `stepScore` 처럼 **불변 갱신**(새 객체 반환). 입력 state 변형 금지.
- `phase==='done'` 이면 no-op: `{ state, event: null }`.
- 도착 판정 거리: `Math.hypot(carPos.x - t.x, carPos.z - t.z) < ARRIVE_RADIUS` (경계 `=`는 미도착 → strict `<`).
- 한 프레임에 하나의 전이만 처리(pickup과 같은 좌표에 dropoff가 겹쳐도 다음 프레임에 처리). 단순/예측가능 우선.
- `delivered` 로 인해 모든 job 소진 시 event는 `'allDone'`(상위에서 '배송 완료' 오버레이 트리거 용). 마지막 건의 '배송완료' 토스트가 필요하면 main 에서 `state.completed` 증가를 함께 감지해 처리.

> 설계 노트: `scoring.js`의 `state` 키(`state`, `nextCheckpoint`)와 혼동을 피하려고 미션 키는 `phase`/`index`로 다르게 둔다.

---

## 2. job 생성 — 맵별 배송 지점

### 2.1 맵 인터페이스 확장: `getDeliveryPoints()`

기존 `getGoals()` 는 "순차 통과 체크포인트" 의미라 그대로 쓰면 모드 의미가 흐려진다.
**신규 메서드 `getDeliveryPoints()` 를 두 맵에 추가**해, 도로 위 후보점 배열 `[{x, z, label}]` 을 결정론적으로 반환한다. (getGoals 는 당장 제거하지 않고 둔다 → 회귀 위험 최소화. 호출부만 교체.)

반환 규약:
- 모든 점은 **도로 위**(자연: 중심선 위, 도시: 격자 도로/교차점). 차량이 도달 가능해야 함.
- 최소 4점 이상(pickup/dropoff 쌍 ≥ 2 job 구성).
- 결정론(난수 없음). 같은 맵이면 항상 같은 좌표.
- `label` 은 사람이 읽을 짧은 한국어 표시명(예: '북부 창고', '중앙 교차로').

### 2.2 도시 맵 (`cityMap.js`)

격자 교차점들을 결정론적으로 선택. 기존 `goals`(x=0 라인 5개)를 일반화:
- 교차점 좌표는 `(i*CELL, j*CELL)` 형태(`CELL=72`). 교차점은 항상 도로 위.
- 예: `[(0,0),(0,2CELL),(2CELL,2CELL),(2CELL,0),(−2CELL,3CELL),...]` 처럼 6~8개 고정 목록.
- 스폰(0,0)과 첫 pickup 이 같지 않도록 첫 점은 스폰에서 떨어진 교차점으로.

### 2.3 자연 맵 (`naturalMap.js`)

도로 중심선 웨이포인트 근처 점을 사용. 가장 단순/안전한 방법:
- 기존 `placeCheckpoints(road, N)`(중심선 등간격 점)를 재사용해 N(예: 6~8)개 점을 뽑고 label만 부여.
- 즉 `getDeliveryPoints()` 내부에서 `placeCheckpoints(road, 6)` 결과에 `label` 을 매핑. 전부 도로 중심선 위라 도달 보장.

### 2.4 pickup/dropoff 쌍 구성 — 어디서?

**맵이 점만 주고, 쌍 구성은 `mission.js` 의 보조 빌더가 담당**(맵을 단순하게, 쌍 정책을 한 곳에).

```js
// 배송 지점 배열 → job 배열 (결정론, 인접쌍)
//   points = [p0,p1,p2,p3,...]  →  [{pickup:p0, dropoff:p1}, {pickup:p1, dropoff:p2}, ...]
export function jobsFromPoints(points, opts = {}) { ... }
```

- 기본 정책: **체이닝**(이전 dropoff = 다음 pickup) → 끊김 없는 연속 운송, 유로트럭식 흐름에 자연스럽고 길찾기 단순.
  - points N개 → job N−1개.
- 대안(옵션): 비겹침 쌍 `(p0→p1),(p2→p3)` — 짐을 내린 뒤 다음 적재지로 빈차 이동(데드헤드)이 생겨 더 "배송답다". `opts.mode:'pairs'` 로 선택 가능하게 설계만 해두고 기본은 체이닝.
- 라벨 합성은 point.label 그대로 사용.

> main 결선 시: `const points = map.getDeliveryPoints(); const mission = createMission(jobsFromPoints(points));`

---

## 3. scoring.js 처리 방침

**권고: scoring.js 는 호출만 끊고 파일/테스트는 남긴다(삭제하지 않음).**

근거:
- 이미 `SCORING_ENABLED = false` 로 채점은 꺼져 있다. M14는 그 빈자리에 mission 을 끼우는 작업.
- scoring.js/scoring.test.js 는 순수 모듈이라 빌드/런타임에 영향 없음. 삭제하면 done 노트(m7)와 INDEX 정합성도 깨진다.

구체:
1. `main.js` 에서 `createScore/stepScore/CHECKPOINT_TIME` import 제거, `mission` import 추가.
2. `SCORING_ENABLED` 상수 및 그 분기(updateVehicle의 채점 블록, updateHUD의 결과 오버레이 블록) 제거.
3. `prevOnRoad/prevCollide/CHECKPOINT_RADIUS/COLLISION_TILT` 등 채점 전용 잔재 제거.
4. scoring.js / scoring.test.js 는 **그대로 보존**. (향후 별도 모드로 부활 가능하게.)
5. mission.test.js 를 **신규 추가**(§7).

> '순수 운송 = 게임오버/탈락 없음'을 코드로 보장: animate 루프의 `score.state === 'driving'` 게이트를 `mission.phase !== 'done'` 로 교체. done 이후엔 차량 입력은 계속 받되(자유주행) 미션 step은 no-op.

---

## 4. HUD / UI 변경 — `render/hud.js`

`hud.update(vehicle, score)` 의 두 번째 인자를 **mission 상태 + 현재목표거리**로 교체.

### 4.1 표시 항목 (line2 영역 재구성)

- **현재 단계**: `📦 적재지로` (toPickup) / `🏁 배송지로` (toDropoff) / `✅ 모든 배송 완료` (done)
- **목표 라벨**: 현재 target.label (예: '중앙 교차로')
- **목표까지 거리**: `Math.round(dist)` m
- **적재 상태**: `hasCargo` → `🟩 적재됨` / `⬜ 빈차`
- **완료 건수**: `completed / total`
- 제거: 점수(`score.score`), 타이머(`timeLeft`), 체크포인트 카운트.

line1(기어/RPM/속도/엔진 ON·OFF·전복 표시)과 RPM 게이지는 **그대로 유지**(운전 피드백). 전복(`⚠️ 전복`)은 패널티가 아니라 단순 상태 표시로 남겨도 무방.

### 4.2 시그니처 변경

```js
// 변경 전: function update(vehicle, score)
// 변경 후: function update(vehicle, missionView)
//   missionView = { phase, label, distance, hasCargo, completed, total }
```

main 이 매 프레임 `currentTarget(mission)` + 차량 위치로 distance 를 계산해 missionView 를 만들어 넘긴다(거리 계산은 main 쪽, hud 는 표시만 — 기존 hud 가 순수 표시인 관례 유지).

### 4.3 토스트(도착 메시지)

`stepMission` 의 event 를 받아 일시 메시지 표시:
- `pickedUp` → "📦 짐을 실었습니다 — {dropoff.label}(으)로!"
- `delivered` → "✅ 배송 완료! ({completed}/{total})"
- `allDone` → 결과 오버레이로 흡수(아래 §6).

구현 위치: hud.js 에 `showToast(text, ms=2200)` 추가(작은 div, 자동 페이드). main 의 updateVehicle 에서 event 발생 시 호출. (순수성 영향 없음 — toast는 DOM 부수효과로 hud 모듈 내부에 캡슐화.)

### 4.4 목표 방향 화살표 (선택)

- 1순위(권장, 저비용): **미니맵 마커 강조**로 충분(§5).
- 2순위(선택): 화면 중앙 상단에 방위 화살표. `angle = atan2(target.x - car.x, target.z - car.z) - car.heading` 로 회전. 설계만 명시, M14 필수 아님(M14b 후속/선택).

### 4.5 조작 안내 문구

하단 안내(`W 액셀 …`)는 유지. 변경 불필요.

---

## 5. 미니맵 — `render/minimap.js`

현재 `draw(dyn, score)` 가 `score.nextCheckpoint` 로 현재 목표를 강조한다. 이를 mission 기반으로 교체.

### 5.1 시그니처/마커 변경

```js
// 변경 전: draw(dyn, score)  — goals[i] 강조: i===nextCheckpoint
// 변경 후: draw(dyn, missionMarker)
//   missionMarker = { pickup: {x,z}|null, dropoff: {x,z}|null, phase }
```

표현:
- **pickup 마커**: 파란 사각/원(아이콘색 예 `#33aaff`) — toPickup 단계에서 강조(큰 크기 + 펄스/외곽선).
- **dropoff 마커**: 주황/빨강(예 `#ff5533`) — toDropoff 단계에서 강조.
- 현재 단계 목표를 크게(반경 6~7px), 비활성 목표(다음 단계 미리보기)는 작게(3px)·반투명.
- 차량 삼각형/도로 폴리라인은 그대로.

### 5.2 데이터 소스

- `getMinimapData()` 의 `goals` 필드 의존을 끊는다. minimap 은 도로 polylines/bounds 만 맵에서 받고, **목표 마커는 main 이 mission.currentTarget 으로 계산해 draw 인자로 전달**.
- `getMinimapData()` 의 `goals` 는 당장 비워도(또는 유지해도) 무방 — minimap 이 더 이상 읽지 않게 변경. bounds/polylines 포맷은 불변.

---

## 6. main.js 결선 범위

### 6.1 startGame

```js
// 기존: checkpoints = map.getGoals(); score = createScore({...});
// 신규:
const points  = map.getDeliveryPoints();
mission       = createMission(jobsFromPoints(points));
// 미니맵은 폴리라인만 소비하도록 createMinimap(map.getMinimapData()) 유지
```
- `checkpoints` 전역/`createScore` 호출 제거. `mission` 전역 추가.

### 6.2 updateVehicle

- 채점 블록(SCORING_ENABLED) 전체 제거.
- 대신:
```js
const { state: nextMission, event } = stepMission(mission, { x: d.x, z: d.z });
mission = nextMission;
if (event === 'pickedUp')  hud.showToast(...);
if (event === 'delivered') hud.showToast(...);   // allDone 은 §6.4 오버레이가 처리
```
- 차량 충돌(`map.isBlocked`)·사운드(`audio.update/onShift`)·차종(perf/eyeHeight)·카메라(1/3인칭)·맵 스트리밍은 **전부 그대로 공존**. mission 은 추가 한 줄일 뿐 운전 물리/렌더를 건드리지 않음.

### 6.3 updateHUD

```js
const t = currentTarget(mission);
const dist = t ? Math.hypot(vehicle.dyn.x - t.x, vehicle.dyn.z - t.z) : 0;
hud.update(vehicle, {
  phase: mission.phase, label: t?.label ?? '',
  distance: dist, hasCargo: mission.hasCargo,
  completed: mission.completed, total: mission.total,
});
const marker = t ? (mission.phase === 'toPickup'
  ? { pickup: t, dropoff: null, phase: mission.phase }
  : { pickup: null, dropoff: t, phase: mission.phase }) : { pickup:null, dropoff:null, phase:'done' };
minimap.draw(vehicle.dyn, marker);
```

### 6.4 결과 오버레이

- 기존 합격/불합격 오버레이를 **'전체 배송 완료' 안내**로 교체:
```js
if (mission.phase === 'done' && result.style.display === 'none') {
  result.innerHTML = `<div>🎉 모든 배송 완료!<br>
    <span style="font-size:20px">${mission.completed}건 배송</span><br>
    <span style="font-size:15px;opacity:.7">새로고침(F5)하여 다시 도전</span></div>`;
  result.style.display = 'flex';
}
```
- '무한 모드'를 원하면 done 대신 jobsFromPoints 를 순환 생성(설계 옵션). 기본은 유한 + 완료 오버레이.

### 6.5 animate 루프 게이트

```js
// 기존: if (started && !paused && score && score.state === 'driving') updateVehicle(dt);
// 신규: if (started && !paused && mission) updateVehicle(dt);
```
- done 이후에도 자유 주행 허용(탈락 없음). 미션 step 은 no-op이라 안전. (원하면 done 시 입력만 멈추도록 게이트 추가 가능 — 선택.)

---

## 7. 단위 테스트 설계 가이드 — `src/mission.test.js` (신규)

순수 모듈만 테스트(HUD/미니맵/토스트는 수동 검증).

### 7.1 createMission / currentTarget
- 빈 jobs → `phase==='done'`, `currentTarget===null`.
- job 1개 → 초기 `phase==='toPickup'`, `hasCargo===false`, `index===0`, `completed===0`, `total===1`.
- `currentTarget` 가 toPickup 단계에서 pickup 좌표/label·`phase:'toPickup'` 반환, 적재 후 dropoff 반환.

### 7.2 도착 전이 (stepMission)
- pickup 도달(거리<R) → `event==='pickedUp'`, `hasCargo===true`, `phase==='toDropoff'`.
- dropoff 도달 → `event==='delivered'`, `completed===1`, 다음 job 있으면 `phase==='toPickup'`/`hasCargo===false`.
- 미도착(거리>R) → `event===null`, state 불변(동등성).

### 7.3 ARRIVE_RADIUS 경계
- 거리 == ARRIVE_RADIUS → **미도착**(strict `<`).
- 거리 = R−ε → 도착.

### 7.4 순서/전체 완료
- pickup→dropoff 순서 강제: dropoff 좌표에 먼저 가도 toPickup 단계에선 전이 안 됨(현재 target은 pickup).
- 다건 job 끝까지 진행 → 마지막 dropoff 도달 시 `event==='allDone'`, `phase==='done'`, `completed===jobs.length`.
- done 상태에서 stepMission → no-op(`event===null`, state 동등).

### 7.5 불변성
- `stepMission(state, pos)` 호출 후 입력 `state` 객체가 변형되지 않음(원본 phase/index 유지).

### 7.6 jobsFromPoints 결정론
- N개 점 → 체이닝 모드 N−1 job, 각 `pickup=points[i]`, `dropoff=points[i+1]`.
- 같은 입력 → 같은 출력(깊은 동등). `mode:'pairs'` 옵션 시 floor(N/2) job.
- (선택) 맵 결정론: `createCityMap().getDeliveryPoints()` 두 번 호출 결과 동등 / `getDeliveryPoints()` 점이 모두 `isOnRoad===true`.

> 기존 scoring.test.js 는 변경 없이 그대로 그린 유지(회귀 0). 전체 테스트 수는 mission.test.js 만큼 증가.

---

## 8. 단계 분할 권고 + 영향 범위

분량이 있으므로 **2단계 분할** 권고.

### M14a — 미션 코어 + 테스트 (순수, 회귀 0)
- 신규 `src/mission.js`(createMission/currentTarget/stepMission/jobsFromPoints/ARRIVE_RADIUS).
- 신규 `src/mission.test.js`.
- 맵 인터페이스에 `getDeliveryPoints()` 추가(natural=placeCheckpoints 재사용, city=교차점 목록).
- main/HUD/미니맵은 **아직 미변경** → 기존 동작 그대로(SCORING_ENABLED=false 상태 유지). 테스트만 추가되어 안전.

### M14b — HUD·미니맵·main 결선 (통합, 수동 검증)
- `render/hud.js` update 시그니처 변경 + showToast 추가.
- `render/minimap.js` draw 시그니처/마커 변경.
- `main.js`: scoring import/분기 제거, mission 결선, startGame/updateVehicle/updateHUD/결과오버레이/animate 게이트 교체.
- scoring.js/scoring.test.js 보존(호출만 제거).
- 두 맵에서 수동 주행: pickup→적재 토스트→dropoff→배송완료→다음 job→전체완료 오버레이, 미니맵 마커 색/강조 확인.

### 영향 범위 표

| 파일 | M14a | M14b | 변경 성격 |
|---|---|---|---|
| `src/mission.js` | 신규 | — | 순수 신규 |
| `src/mission.test.js` | 신규 | — | 테스트 신규 |
| `src/maps/naturalMap.js` | `getDeliveryPoints()` 추가 | — | 가산(기존 getGoals 보존) |
| `src/maps/cityMap.js` | `getDeliveryPoints()` 추가 | — | 가산 |
| `src/render/hud.js` | — | update 시그니처 변경 + showToast | 표시 로직 교체 |
| `src/render/minimap.js` | — | draw 시그니처/마커 변경 | 표시 로직 교체 |
| `src/main.js` | — | scoring 제거·mission 결선 | 결선 교체 |
| `src/scoring.js` | — | (보존, 호출만 제거) | 무변경 |
| `src/scoring.test.js` | — | 보존 | 무변경 |
| `mds/INDEX.md`, `mds/done/*` | M14a 노트 | M14b 노트 | 문서(설계 작업 범위 밖) |

---

## 9. 미해결/결정 필요 (구현 전 확인 권장)

1. job 쌍 정책 기본값: **체이닝**(연속 운송)으로 제안. '데드헤드 있는 비겹침 쌍'을 원하면 `mode:'pairs'` 로 전환.
2. 종료: 유한(완료 오버레이) vs 무한 순환. 기본 **유한** 제안.
3. done 이후 입력: 자유 주행 허용(제안) vs 정지. 탈락이 없는 모드 취지상 자유 주행이 자연스러움.
4. `getGoals()` 의 운명: 당장 보존(회귀 안전). 안정화 후 별도 정리 PR에서 제거 검토.
