// render/audio.js — 사운드 시스템 (엔진 샘플 루프 + 변속음 샘플) (M11)
// 설계노트: mds/design/audio.md
//
// DOM/THREE 비의존(AudioContext 외 외부 의존 없음). 결선은 main.js가 담당.
//   - 엔진음: 실제 엔진 녹음(engine.ogg)을 AudioBufferSourceNode(loop=true)로
//     끊김 없이 재생하고, rpm에 비례해 playbackRate를 변조. on/off는 소스 재시작이
//     아니라 engineGain 엔벨로프로 제어. 디코드 실패 시 무음(폴백 없음).
//   - 변속음: shift.ogg 샘플 1회 재생, 부재/실패 시 절차적 클릭(노이즈 버스트) 폴백
//   - AudioContext는 사용자 제스처(resume) 시점에 생성, 음소거는 masterGain 0

// 에셋 URL — Vite가 빌드 시 해시된 정적 URL 문자열로 변환.
// (실제 fetch/디코드는 resume() 내부에서 수행 → 테스트(node)에서는 stub로 제어)
import engineUrlAsset from './sounds/engine.ogg';
import shiftUrlAsset from './sounds/shift.ogg';

// ── 순수 로직: RPM → 재생속도 배율 매핑 ──────────────────────
export const ENGINE_RATE_MIN = 0.6; // idle 근처 재생속도 배율(저음 럼블)
export const ENGINE_RATE_MAX = 2.2; // 레드라인 근처 재생속도 배율(고음 회전)

// IDLE~MAX RPM을 엔진 샘플 재생속도 배율로 선형 매핑. 경계 밖은 clamp.
export function rpmToPlaybackRate(rpm, maxRpm = 7000) {
  const t = Math.min(1, Math.max(0, rpm / maxRpm)); // 0~1 clamp
  return ENGINE_RATE_MIN + t * (ENGINE_RATE_MAX - ENGINE_RATE_MIN);
}

const ENGINE_GAIN_ON = 0.45; // 엔진 on 시 목표 gain(샘플 기반, 공회전 과하지 않게)
const RATE_SMOOTH = 0.04; // playbackRate setTargetAtTime 시간상수
const GAIN_SMOOTH = 0.08; // 엔진 gain 페이드 시간상수
const CLICK_DURATION = 0.04; // 폴백 클릭 길이(초)

export function createAudio(opts = {}) {
  const {
    AudioContextCtor,
    engineUrl = engineUrlAsset,
    shiftUrl = shiftUrlAsset,
    maxRpm = 7000,
  } = opts;

  let ctx = null; // AudioContext (resume 시 생성)
  let engineSrc = null; // 엔진 루프 소스(디코드 완료 후 생성)
  let engineGain = null; // 엔진 페이드 gain
  let masterGain = null; // 음소거/전역 볼륨
  let started = false; // 그래프 1회 구성 플래그
  let shiftBuffer = null; // 디코드된 변속음 버퍼
  let muted = false; // 음소거 상태

  // 주입 우선, 없으면 브라우저 전역에서 탐색.
  function resolveCtor() {
    if (AudioContextCtor) return AudioContextCtor;
    if (typeof window !== 'undefined') {
      return window.AudioContext || window.webkitAudioContext || null;
    }
    return null;
  }

  // 마스터 gain 값을 현재 음소거 상태에 맞게 적용.
  function applyMute() {
    if (!masterGain) return;
    const target = muted ? 0 : 1;
    masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
  }

  // 엔진 샘플 비동기 로드 → 디코드 성공 시 루프 소스 1회 생성/start.
  // 실패 시 엔진음은 무음(폴백 없음). 게임 진행엔 지장 없음.
  async function loadEngineSample() {
    if (!engineUrl || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(engineUrl);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      const engineBuffer = await ctx.decodeAudioData(arr);
      // 그래프가 아직 구성돼 있고(이미 dispose 안 됨) 소스가 없을 때만 1회 생성.
      if (!engineGain || engineSrc) return;
      engineSrc = ctx.createBufferSource();
      engineSrc.buffer = engineBuffer;
      engineSrc.loop = true;
      engineSrc.playbackRate.value = rpmToPlaybackRate(0, maxRpm);
      engineSrc.connect(engineGain);
      engineSrc.start();
    } catch (e) {
      // 부재/디코드 실패 → 엔진 무음(게임 진행 막지 않음)
      console.warn('[audio] 엔진음 로드 실패, 엔진 무음:', e);
    }
  }

  // 변속음 샘플 비동기 로드(실패는 흡수 → 클릭 폴백).
  async function loadShiftSample() {
    if (!shiftUrl || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(shiftUrl);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      shiftBuffer = await ctx.decodeAudioData(arr);
    } catch (e) {
      // 부재/디코드 실패 → 폴백 클릭 사용(게임 진행 막지 않음)
      console.warn('[audio] 변속음 로드 실패, 절차적 클릭 폴백 사용:', e);
    }
  }

  // 첫 호출 시 ctx 생성 + 그래프 구성, 이후엔 resume만(idempotent).
  function resume() {
    const Ctor = resolveCtor();
    if (!Ctor) return; // Web Audio 미지원 환경
    if (!ctx) {
      ctx = new Ctor();
    }
    if (!started) {
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      engineGain = ctx.createGain();
      engineGain.gain.value = 0; // 시작은 무음(off)
      engineGain.connect(masterGain);

      started = true;
      // 엔진/변속 샘플 로드 시작(비동기, 실패해도 무방).
      // 엔진 소스는 디코드 완료 후 콜백에서 생성/start된다.
      loadEngineSample();
      loadShiftSample();
    }
    if (ctx.resume) ctx.resume();
  }

  // 매 프레임: rpm→playbackRate 변조 + on/off gain 엔벨로프.
  // ctx 미생성/음소거/엔진 소스 미준비(디코드 전)면 무동작.
  function update(rpm, on) {
    if (!ctx || !started) return;
    if (muted) return;
    if (!engineSrc) return; // 디코드 전 no-op
    const rate = rpmToPlaybackRate(rpm, maxRpm);
    engineSrc.playbackRate.setTargetAtTime(rate, ctx.currentTime, RATE_SMOOTH);
    const target = on ? ENGINE_GAIN_ON : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, GAIN_SMOOTH);
  }

  // 변속 1회 재생: 샘플 버퍼 있으면 재생, 없으면 절차적 클릭. 음소거/미시작이면 무동작.
  function onShift() {
    if (!ctx || !started) return;
    if (muted) return;
    if (shiftBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = shiftBuffer;
      src.connect(masterGain);
      src.start();
      return;
    }
    playClick();
  }

  // 절차적 클릭(노이즈 버스트): 짧은 화이트노이즈 + 빠른 감쇠 gain 엔벨로프.
  function playClick() {
    const n = Math.max(1, Math.floor(ctx.sampleRate * CLICK_DURATION));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.4, ctx.currentTime);
    clickGain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    src.connect(clickGain);
    clickGain.connect(masterGain);
    src.start();
  }

  function setMuted(value) {
    muted = !!value;
    applyMute();
  }

  function toggleMute() {
    setMuted(!muted);
  }

  return {
    resume,
    update,
    onShift,
    setMuted,
    toggleMute,
    get muted() {
      return muted;
    },
    get _ctx() {
      return ctx;
    },
  };
}
