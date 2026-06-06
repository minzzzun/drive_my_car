# 설계 — audio.js 사운드 시스템 (엔진음 + 변속음) (M11)

> 실제 엔진 샘플 루프(Web Audio `AudioBufferSourceNode`, RPM 비례 `playbackRate`) + 변속음(짧은 ogg 샘플, 실패 시 절차적 클릭 폴백).
> `src/render/audio.js`는 **DOM/THREE 비의존**(AudioContext 외 외부 의존 없음). 결선은 `main.js`가 담당.

> ⚠️ **변경 이력 (2026-06): 엔진 합성 방식 교체.**
> 기존: 절차적 sawtooth `OscillatorNode` + `rpmToFreq`(60~320Hz) + `ENGINE_GAIN_ON=0.15`.
> 변경 사유: 사용자 피드백 "너무 시끄럽다". sawtooth 톤이 공회전에서도 거슬리고 인공적.
> 변경 후: 실제 자동차 엔진 녹음 샘플을 `loop=true`로 재생하고 RPM에 비례해 `playbackRate`를 변조해 사실적인 럼블/회전 상승음을 낸다. `rpmToFreq`→`rpmToPlaybackRate`, `ENGINE_FREQ_MIN/MAX`→`ENGINE_RATE_MIN/MAX`로 교체된다.

## 목표 / 범위
- **엔진음**: 실제 엔진 녹음(`src/render/sounds/engine.ogg`)을 `AudioBufferSourceNode(loop=true)`로 끊김 없이 재생하고, `vehicle.rpm`에 비례해 `playbackRate`를 실시간 변조(idle은 느리게/저음, 레드라인은 빠르게/고음). 엔진 on/off는 `engineGain` 엔벨로프로 페이드 in/out(소스 자체는 계속 루프). 샘플 디코드 완료 전에는 무동작.
- **변속음**: `gear`가 바뀌는 순간 1회 재생. ogg 1개(`src/render/sounds/shift.ogg`). 파일 부재/로드 실패 시 **절차적 클릭(노이즈 버스트)** 으로 graceful fallback.
- **자동재생 정책**: `AudioContext`는 사용자 제스처(시작 오버레이 click) 시점에 생성/`resume()`. 엔진/변속 샘플 fetch·decode도 이 시점에 시작.
- **음소거**: `KeyM` 토글.

### 엔진 에셋 (확보됨, 사실)
- `src/render/sounds/engine.ogg` — 실제 자동차 엔진 녹음, 9.04초, 스테레오 44.1kHz, 188KB.
- 라이선스: **CC BY-SA 4.0**, 저작자 **Scheinwerfermann**, 출처 Wikimedia Commons (`File:225_Slant_Six.ogg`, https://commons.wikimedia.org/wiki/File:225_Slant_Six.ogg).
- → **출처표기 의무**. README에 CREDITS 섹션 추가 필요(아래 "출처표기" 참조).

## audio.js — 공개 API

```js
// 의존성 주입: 테스트/모킹을 위해 AudioContext 생성자를 주입 가능하게 한다.
// 미주입 시 window.AudioContext || window.webkitAudioContext 사용.
export function createAudio(opts = {}) { ... }
//   opts = { AudioContextCtor?, shiftUrl?, maxRpm? }
//   → { resume(), update(rpm, on), onShift(), setMuted(bool), toggleMute(), get muted() }
```

> **공개 API 시그니처는 기존과 동일하게 유지**한다: `createAudio` / `resume` / `update(rpm, on)` / `onShift` / `setMuted` / `toggleMute` / `muted` getter / `_ctx` getter. `opts`도 동일(`{ AudioContextCtor?, shiftUrl?, maxRpm? }`). 내부 엔진 합성 방식만 교체된다.

| 메서드 | 책임 |
| --- | --- |
| `resume()` | 첫 호출 시 `AudioContext` 생성 + 그래프(masterGain/engineGain) 구성 + `ctx.resume()`. 엔진/변속 샘플 비동기 로드 시작. 엔진 소스는 **디코드 완료 콜백에서** 생성·`start()`(아직 디코드 안 됐으면 그래프만 준비). 이후 호출은 idempotent(이미 살아있으면 `resume()`만, 그래프/소스 재생성 X). 사용자 제스처에서만 호출. |
| `update(rpm, on)` | 매 프레임 호출. `rpm`→`rpmToPlaybackRate`로 변환해 엔진 소스 `playbackRate`를 부드럽게 타깃팅(`setTargetAtTime`). `on`에 따라 엔진 gain 엔벨로프 on/off. ctx 미생성/음소거/**엔진 소스 미준비(디코드 전)면 무동작(no-op)**. |
| `onShift()` | 변속 1회 재생. ogg 버퍼 준비됐으면 그것을, 아니면 절차적 클릭. 음소거면 무동작. |
| `setMuted(bool)` / `toggleMute()` | 마스터 gain을 0/정상으로. 상태 플래그 유지. `muted` getter 제공. |

> 순수 로직(`rpmToPlaybackRate`)은 named export로 따로 빼서 단위 테스트 대상화한다.

## 오디오 그래프 구조

```
[engineSrc (AudioBufferSourceNode, loop=true,  → [engineGain] ┐
            buffer=engineBuffer)]                              ├→ [masterGain] → ctx.destination
[shift 노드(샘플/클릭)] → (1회성) ───────────────────────────┘
```

- `masterGain`: 음소거/전역 볼륨. 음소거 = gain 0(노드 연결은 유지, 토글이 즉시 반영).
- `engineGain`: 엔진 on=페이드 in(목표 `ENGINE_GAIN_ON`≈0.45), off=페이드 out(0). `setTargetAtTime`으로 클릭 노이즈 방지.
- `engineSrc`: `AudioBufferSourceNode`, `loop = true`, `buffer = engineBuffer`. **소스는 한 번만 `start()` 하고 재시작 불가**하므로 on/off는 소스를 stop/restart 하지 않고 `engineGain` 엔벨로프로만 제어(소스는 디코드 후 계속 루프 재생). 소리 변조는 `playbackRate`로.
  - 엔진 샘플 **디코드 완료 후에만** 소스 생성/`start()` 한다. 디코드 전에는 그래프(masterGain/engineGain)만 준비된 상태이며 `update()`는 no-op.

## 엔진음 합성 — RPM → 재생속도 매핑 (순수 함수)

```js
// IDLE~MAX RPM을 엔진 샘플 재생속도 배율로 선형 매핑.
// idle은 느리게(저음 럼블), 레드라인은 빠르게(고음 회전). 경계 밖은 clamp.
// main에서 engine.js의 MAX_RPM과 정합되게 maxRpm 주입 권장.
export const ENGINE_RATE_MIN = 0.6;  // idle 근처 재생속도 배율
export const ENGINE_RATE_MAX = 2.2;  // 레드라인 근처 재생속도 배율
export function rpmToPlaybackRate(rpm, maxRpm = 7000) {
  const t = Math.min(1, Math.max(0, rpm / maxRpm));          // 0~1 clamp
  return ENGINE_RATE_MIN + t * (ENGINE_RATE_MAX - ENGINE_RATE_MIN);
}
```

- 단조 증가(아이들↔레드라인 사이), 양 끝 clamp, 음수/초과 입력에 안전.
- `playbackRate` 적용은 `engineSrc.playbackRate.setTargetAtTime(target, ctx.currentTime, 0.04)`로 부드럽게(프레임 점프 시 글리치 방지).
- **제거(deprecated)**: 기존 `ENGINE_FREQ_MIN`/`ENGINE_FREQ_MAX`/`rpmToFreq`는 더 이상 export하지 않는다. 테스트도 `rpmToPlaybackRate`/`ENGINE_RATE_MIN`/`ENGINE_RATE_MAX` 기준으로 교체.
- (선택) 사실감을 위해 throttle/rpm에 따라 `ENGINE_GAIN_ON`을 미세 가감(예 공회전 0.35 → 가속 0.5)할 수 있으나 핵심은 "공회전에서 과하지 않게". 기본은 고정값.

## 에셋 로드 — 엔진 + 변속음

두 샘플 모두 동일한 패턴으로 로드한다.
- 최상단 import: `import engineUrl from './sounds/engine.ogg';` + `import shiftUrl from './sounds/shift.ogg';` (Vite가 해시된 정적 URL 문자열로 변환).
- `resume()` 안에서(ctx 생성/`ctx.resume()` 직후) 비동기로 `fetch → arrayBuffer → ctx.decodeAudioData` 시도.
  - **엔진**: 디코드 성공 시 `engineBuffer` 보관 → 그 시점에 `engineSrc` 생성(`loop=true`, `buffer=engineBuffer`, `engineGain`에 연결, `playbackRate` 초기값=`rpmToPlaybackRate(0, maxRpm)`) → `start()`. 디코드 **실패 시 엔진음은 무음(폴백 없음)** — 게임 진행엔 지장 없음. (sawtooth 같은 절차적 대체는 두지 않는다.)
  - **변속**: 디코드 성공 시 `shiftBuffer` 보관, 실패 시 **절차적 클릭 폴백** 유지(아래).
- 로드 실패는 `try/catch` + `res.ok` 검사로 흡수하고 콘솔 경고만. 비동기라 `resume()`은 디코드를 기다리지 않으며, `update()`는 `engineSrc` 준비 전까지 no-op.

## 변속음 — 로드 전략 + 폴백

### 로드 방식: **AudioBuffer(fetch + decodeAudioData)** 채택
| 방식 | 장점 | 단점 |
| --- | --- | --- |
| `new Audio(url)` (HTMLAudio) | 구현 단순, AudioContext 없이도 재생 | 짧은 효과음 연타 시 재생 충돌(같은 엘리먼트 재생 중 재호출 문제), 레이턴시·정책 처리 별도, 그래프(음소거 masterGain) 밖 |
| **`fetch → arrayBuffer → ctx.decodeAudioData` → `AudioBufferSourceNode`** | 그래프 안(음소거/볼륨 일관), 저레이턴시, 매 재생마다 새 source 노드라 연타 안전 | AudioContext 필요(이미 사용 중이라 무관), 비동기 로드 |

→ 엔진음과 **동일 그래프(masterGain) 아래** 두어 음소거가 일관되게 적용되고, 효과음 연타에 강한 `decodeAudioData` 방식을 채택.

### 로드 시점 / 폴백 경로
- `resume()` 안에서(ctx 생성 직후) `shift.ogg`를 비동기 로드 시도 → 성공 시 `shiftBuffer` 보관.
- `onShift()` 동작 분기:
  1. `shiftBuffer`가 있으면 `AudioBufferSourceNode`를 새로 만들어 `masterGain`에 연결 후 `start()`(자동 GC).
  2. 없으면(미로드/실패/디코드 중) **절차적 클릭** 재생.
- **절차적 클릭(노이즈 버스트)**: 짧은(약 30~50ms) 화이트노이즈 버퍼를 즉석 생성 + 빠른 gain 감쇠 엔벨로프. 변속의 "딸깍" 느낌.
  ```js
  // 개요: ctx.createBuffer(1, n, sr)에 (Math.random()*2-1) 채우고
  //       AudioBufferSourceNode + 짧은 감쇠 gain(setTargetAtTime)로 burst.
  ```
- 로드 실패는 `try/catch` + fetch `res.ok` 검사로 흡수하고 **콘솔 경고만**(게임 진행 막지 않음). 즉, ogg 부재가 기본 동작을 깨지 않는다.

### 에셋 경로 / Vite import 규약
- 경로: `src/render/sounds/shift.ogg`, `src/render/sounds/engine.ogg`(둘 다 저장소에 존재).
- **권장**: `import shiftUrl from './sounds/shift.ogg';`, `import engineUrl from './sounds/engine.ogg';` → Vite가 해시된 정적 URL 문자열로 변환(빌드시 자산 처리). 이 URL을 `fetch`.
- `opts.shiftUrl`로 주입 가능(테스트/대체용). 변속음은 "있으면 ogg, 없으면 클릭", 엔진음은 "있으면 루프, 없으면 무음".

## main.js 결선 지점

| 위치(현재 코드) | 결선 내용 |
| --- | --- |
| import 추가 | `import { createAudio } from './render/audio.js';` + 인스턴스 `const audio = createAudio({ maxRpm: MAX_RPM });` (MAX_RPM은 vehicle.js에서 export됨 — 추가 import) |
| 오버레이 click 핸들러 (95행 부근) | `started=true` 처리 직후 `audio.resume();` — 사용자 제스처 시점에 AudioContext 생성/resume + mp3 로드 시작 |
| `updateVehicle(dt)` (208행 부근) | `vehicle = stepVehicle(...)` 이후 `audio.update(vehicle.rpm, vehicle.on);` 호출(매 프레임). **변속 감지**: 모듈 스코프 `prevGear` 추가, `if (vehicle.gear !== prevGear) { audio.onShift(); prevGear = vehicle.gear; }` |
| keydown 핸들러 (110행 부근) | `if (e.code === 'KeyM') { audio.toggleMute(); return; }` 추가(다른 분기들과 같은 위치, input.preventDefault 전에) |
| `prevGear` 초기화 | 차량 생성 직후 `let prevGear = vehicle.gear;`(초기 0=N). 시작 직후 의도치 않은 변속음 방지 |

> `audio.update`/`onShift`는 ctx 미생성·음소거 시 무동작이므로, 시작 전(오버레이 단계) 호출돼도 안전하게 설계한다. 단 일관성을 위해 update 호출은 `updateVehicle`(주행 중) 안에만 둔다.

## 단위 테스트 설계 가이드 (`src/render/audio.test.js`, 다음 단계)
Web Audio 노드는 jsdom/node에서 직접 테스트 어렵다 → **순수 로직 + DI 모킹**에 집중.

1. **`rpmToPlaybackRate`** (순수):
   - `rpmToPlaybackRate(0)` ≈ `ENGINE_RATE_MIN`, `rpmToPlaybackRate(maxRpm)` ≈ `ENGINE_RATE_MAX`.
   - 단조 증가: `rpmToPlaybackRate(1000) < rpmToPlaybackRate(4000) < rpmToPlaybackRate(7000)`.
   - 경계 clamp: 음수→MIN, maxRpm 초과→MAX. 모든 결과가 `[ENGINE_RATE_MIN, ENGINE_RATE_MAX]` 범위 안.
   - `maxRpm` 인자 정합(절반 rpm은 두 배율의 중간 근처) 확인.
   - `ENGINE_RATE_MIN`/`ENGINE_RATE_MAX` 상수값(0.6/2.2) 확인.
   - (기존 `rpmToFreq`/`ENGINE_FREQ_*` 케이스는 **삭제** — import 자체가 없어짐.)
2. **음소거 토글**: `createAudio`에 mock `AudioContextCtor` 주입 → `toggleMute()` 두 번이면 원상복귀, `muted` getter 반영, `setMuted(true)` 후 `update`/`onShift`가 소리 노드를 만들지 않음(혹은 masterGain 0 설정 호출) 검증.
3. **엔진 루프 소스**: 엔진 디코드 성공(mock `decodeAudioData`가 버퍼 반환 + `fetch` 성공 stub)이 반영된 뒤, `createBufferSource`로 만든 엔진 소스가 `loop === true`이고 `start`가 **1회만** 호출되는지 검증.
4. **on→off gain 처리**: mock ctx로 `update(rpm, true)` 후 `update(rpm, false)` 시 engineGain 타깃이 양수→0으로 가는지(목 메서드 호출 인자) 검증.
5. **playbackRate 변조**: `update(rpm, true)` 시 엔진 소스 `playbackRate.setTargetAtTime`이 호출되는지 검증.
6. **디코드 전 no-op**: 엔진 소스 준비 전(디코드 미완료) `update()` 호출이 throw하지 않고 소스/주파수 조작을 하지 않음.
7. **변속 폴백 경로**: `shiftBuffer` 미설정 상태에서 `onShift()`가 클릭 버퍼 생성 경로(예 `ctx.createBuffer` 호출)를 타는지 검증. 샘플 로드 실패가 throw하지 않음.
8. **resume idempotent**: `resume()` 2회 호출 시 AudioContext가 1개만 생성되고 엔진 소스 `start`가 1회만 호출(그래프 한 번만 구성).

> 비동기 디코드 타이밍: 엔진 소스는 `decodeAudioData` Promise resolve 이후 생성되므로, 소스 검증 테스트는 `resume()` 후 microtask flush(예 `await Promise.resolve()` 여러 번 또는 `await audio._ready`류 훅)가 필요. 구현 시 디코드 완료를 await할 수 있는 테스트 훅 제공을 고려.
> Mock AudioContext: `createGain`/`createBuffer`/`createBufferSource`/`decodeAudioData`/`currentTime`/`sampleRate`/`destination`/`resume`/`state`를 가진 스텁 객체(오실레이터는 더 이상 불필요). `AudioBufferSourceNode` 목은 `buffer`/`loop`/`playbackRate`(AudioParam)/`start`/`stop`/`connect`를 가져야 한다. AudioParam은 `setTargetAtTime`/`setValueAtTime` 스파이를 가진 `{ value }` 객체.

## 영향 범위

| 파일 | 변경 | 비고 |
| --- | --- | --- |
| `src/render/audio.js` | **수정** | 엔진을 sawtooth osc → engine.ogg 루프 소스 + `rpmToPlaybackRate`로 교체. 변속음/음소거/resume 구조 유지. 공개 API 동일 |
| `src/render/audio.test.js` | **수정** | `rpmToFreq`→`rpmToPlaybackRate`, 엔진 루프 소스/playbackRate/디코드 전 no-op 케이스로 교체. 변속/음소거/resume idempotent 유지 |
| `src/render/sounds/engine.ogg` | **신규(에셋)** | 실제 엔진 녹음 9.04s/스테레오 44.1kHz. CC BY-SA 4.0(출처표기 필요) |
| `src/render/sounds/shift.ogg` | (기존 에셋) | 짧은 변속음. 부재 시 클릭 폴백 |
| `README` | **추가** | CREDITS 섹션(엔진음 출처표기) — 아래 참조 |
| `src/main.js` | (기존 결선 유지) | import, `audio.resume()`(오버레이 click), `audio.update`/변속 감지, `KeyM` 토글, `prevGear`. API 동일하므로 변경 불필요 |
| `mds/INDEX.md` | (커밋 단계 일괄) | 이 노트에서는 수정하지 않음 |

## 출처표기 (CREDITS) — README에 추가 필요
엔진음은 CC BY-SA 4.0이므로 저작자/출처/라이선스 표기 의무가 있다. README에 다음 취지의 CREDITS 섹션을 추가한다(구현/문서 단계에서 처리).
```
## Credits
- Engine sound: "225 Slant Six" by Scheinwerfermann,
  via Wikimedia Commons, licensed under CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:225_Slant_Six.ogg
```

## 비고 / 결정 사항
- 엔진 사운드는 실제 녹음 루프 + `playbackRate` 변조(사실감·저소음). 기존 sawtooth 오실레이터는 "시끄럽다" 피드백으로 폐기.
- 엔진 on/off는 소스 재시작이 아니라 `engineGain` 엔벨로프로 제어(소스는 1회 start 후 계속 루프).
- 엔진 디코드 실패 시 폴백 없음(무음). 변속음은 절차적 클릭 폴백 유지.
- 음소거는 masterGain 0(노드 dispose가 아님) → 즉시·가역.
- AudioContext는 한 번만 생성(전역 1개). 컨텍스트 정책상 첫 제스처 전 생성 시 `suspended`일 수 있으므로 `resume()` 필수.
- 코딩 스타일: ES 모듈, camelCase, UPPER_SNAKE 상수, 2-space, 한국어 주석(CGs 관례).
