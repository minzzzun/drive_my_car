# M11 완료 — 사운드 시스템 (엔진음 + 변속음)

> 엔진음 = 실제 엔진 샘플 루프 + RPM 비례 playbackRate. 변속음 = 샘플 1회 재생(부재 시 절차적 클릭 폴백). 음소거(M).

## 구현

- `src/render/audio.js` (신규) — `createAudio({ AudioContextCtor, shiftUrl, maxRpm })` → `{ resume, update(rpm,on), onShift, setMuted, toggleMute, muted, _ctx }`.
  - 엔진음: `AudioBufferSourceNode(loop=true, buffer=engine.ogg)` → engineGain → masterGain → destination. 디코드 후 1회 start, on/off는 gain 엔벨로프, RPM은 `rpmToPlaybackRate`로 playbackRate 변조.
  - 순수 함수: `rpmToPlaybackRate(rpm, maxRpm)` (단조·clamp), 상수 `ENGINE_RATE_MIN=0.6`, `ENGINE_RATE_MAX=2.2`, `ENGINE_GAIN_ON=0.45`.
  - 변속음: shift.ogg 디코드 후 1회 재생, 실패 시 절차적 클릭(노이즈 버스트) 폴백.
  - AudioContext는 사용자 제스처(resume, 오버레이 click)에서 생성 — 자동재생 정책 대응. 음소거는 masterGain 0.
- `src/main.js` 결선 — 오버레이 click에서 `audio.resume()`, `updateVehicle`에서 `audio.update(rpm,on)` + `prevGear` 비교로 `onShift()`, keydown `KeyM` → `toggleMute()`.
- `README.md` — 조작표에 M(음소거) 추가 + 🎵 사운드 크레딧 섹션.

## 에셋 (Wikimedia Commons)

- `src/render/sounds/engine.ogg` — "225 Slant Six" by Scheinwerfermann, **CC BY-SA 4.0**. 원본 9초(시동→가속 녹음)에서 **볼륨 안정 구간(6.5~8.5s)만 ffmpeg로 추출 + 등전력 크로스페이드**해 1.6초 이음새 없는 루프로 가공(RMS -15~-10dB 균일).
- `src/render/sounds/shift.ogg` — "Clickick switch", Public domain. 0.68초 클릭.

## 테스트

- `src/render/audio.test.js` (신규) — rpmToPlaybackRate(단조/clamp/범위/상수), 엔진 루프 소스(loop=true·1회 start·디코드 전 no-op·실패 시 무음), gain 엔벨로프, playbackRate 변조, 음소거 토글, resume idempotent, 변속음 폴백. FakeAudioContext DI + flushPromises.
- 전체: **151 passed** (audio 23). `npm run build` 성공(engine/shift.ogg 번들 포함).

## 비고 / 후속

- 엔진음이 단조롭게 느껴지면 추후 다른 정상(idle) 샘플 교체 또는 절차적(삼각파+로우패스) 전환 가능.

## 설계

- [design/audio.md](../design/audio.md)
