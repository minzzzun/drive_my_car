// render/audio.js 사운드 시스템 테스트 (M11) — TDD RED 단계
// 설계노트: mds/design/audio.md
//
// ⚠️ 엔진 합성 방식 교체(2026-06): 절차적 sawtooth → 실제 엔진 샘플 루프.
//   - rpmToFreq / ENGINE_FREQ_MIN / ENGINE_FREQ_MAX  →  (삭제)
//   - rpmToPlaybackRate / ENGINE_RATE_MIN / ENGINE_RATE_MAX  →  (신규)
//   - 엔진은 AudioBufferSourceNode(loop=true)를 디코드 완료 후 1회 start.
//     on/off는 소스 stop이 아니라 engineGain 엔벨로프로 제어.
//     rpm 변조는 frequency가 아니라 playbackRate.setTargetAtTime.
//
// 가정한 export 시그니처(설계노트 "공개 API" + "단위 테스트 설계 가이드" 기준):
//   - export function createAudio(opts = {}) => {
//       resume(), update(rpm, on), onShift(),
//       setMuted(bool), toggleMute(), get muted(), get _ctx()
//     }
//     opts = { AudioContextCtor?, shiftUrl?, maxRpm? }
//   - export function rpmToPlaybackRate(rpm, maxRpm = 7000)
//   - export const ENGINE_RATE_MIN  // ≈ 0.6
//   - export const ENGINE_RATE_MAX  // ≈ 2.2
//
// 환경: vitest 기본(node) 환경이라 window/DOM/Web Audio가 없다.
//   → 가짜 AudioContext(AudioContextCtor)를 주입해 모킹한다.
//   → fetch는 stub해서 엔진/변속 두 에셋 로드를 각각 제어한다.
//
// 비동기 디코드 타이밍 주의:
//   엔진 소스는 resume() 안에서 fetch → arrayBuffer → decodeAudioData가
//   resolve된 "이후"에 생성/start된다. 즉 resume()은 동기로 끝나지만 소스는
//   여러 microtask 뒤에 준비된다. 따라서 엔진 소스 검증 전에는
//   flushPromises()로 대기 중인 Promise 체인을 비워야 한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAudio,
  rpmToPlaybackRate,
  ENGINE_RATE_MIN,
  ENGINE_RATE_MAX,
} from './audio.js';

// 보류 중인 microtask/Promise 체인을 충분히 비운다(여러 await 단계 대비).
async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// ── 가짜 Web Audio 노드/컨텍스트 ───────────────────────────────

// AudioParam 모킹: { value } + setTargetAtTime / setValueAtTime 스파이
function makeParam(initial = 0) {
  return {
    value: initial,
    setTargetAtTime: vi.fn(function (target) {
      // 실제 Web Audio처럼 즉시 value를 바꾸진 않지만,
      // 테스트 편의를 위해 타깃을 기록만 한다(호출 인자로 검증).
      this._lastTarget = target;
    }),
    setValueAtTime: vi.fn(function (v) {
      this.value = v;
    }),
  };
}

class FakeGainNode {
  constructor() {
    this.gain = makeParam(1);
    this.connect = vi.fn();
    this.disconnect = vi.fn();
  }
}

// 엔진 루프 소스 + 변속/클릭 소스 공용. playbackRate는 AudioParam 목.
class FakeBufferSourceNode {
  constructor() {
    this.buffer = null;
    this.loop = false;
    this.playbackRate = makeParam(1);
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    this.start = vi.fn();
    this.stop = vi.fn();
  }
}

class FakeAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = new Float32Array(length);
  }
  getChannelData() {
    return this._data;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'suspended';
    this.destination = { _isDestination: true };

    this.createGain = vi.fn(() => new FakeGainNode());
    this.createBufferSource = vi.fn(() => new FakeBufferSourceNode());
    this.createBuffer = vi.fn(
      (ch, len, sr) => new FakeAudioBuffer(ch, len, sr)
    );
    this.decodeAudioData = vi.fn(
      async () => new FakeAudioBuffer(2, 400000, 44100)
    );
    this.resume = vi.fn(async () => {
      this.state = 'running';
    });
  }
}

// ── fetch stub 헬퍼 ──────────────────────────────────────────
// 에셋 URL에 따라 성공/실패를 다르게 줄 수 있게 한다.
//   엔진 디코드 성공 시나리오 / 실패(무음) 시나리오를 구분 테스트.
function fakeOkResponse() {
  return {
    ok: true,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  };
}

// 기본: 모든 fetch 성공(엔진/변속 둘 다 디코드 가능). 개별 테스트에서 재정의.
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => fakeOkResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

// ─────────────────────────────────────────────────────────────
// 1) rpmToPlaybackRate 순수 함수
// ─────────────────────────────────────────────────────────────
describe('rpmToPlaybackRate', () => {
  it('rpm=0 → ENGINE_RATE_MIN, rpm=maxRpm → ENGINE_RATE_MAX', () => {
    expect(rpmToPlaybackRate(0, 7000)).toBeCloseTo(ENGINE_RATE_MIN, 6);
    expect(rpmToPlaybackRate(7000, 7000)).toBeCloseTo(ENGINE_RATE_MAX, 6);
  });

  it('단조 증가 (낮은 rpm < 높은 rpm)', () => {
    expect(rpmToPlaybackRate(1000, 7000)).toBeLessThan(
      rpmToPlaybackRate(4000, 7000)
    );
    expect(rpmToPlaybackRate(4000, 7000)).toBeLessThan(
      rpmToPlaybackRate(7000, 7000)
    );
  });

  it('음수는 MIN으로 clamp, maxRpm 초과는 MAX로 clamp', () => {
    expect(rpmToPlaybackRate(-500, 7000)).toBeCloseTo(ENGINE_RATE_MIN, 6);
    expect(rpmToPlaybackRate(99999, 7000)).toBeCloseTo(ENGINE_RATE_MAX, 6);
  });

  it('모든 결과가 [ENGINE_RATE_MIN, ENGINE_RATE_MAX] 범위 안', () => {
    for (const rpm of [-1000, 0, 700, 3500, 7000, 20000]) {
      const r = rpmToPlaybackRate(rpm, 7000);
      expect(r).toBeGreaterThanOrEqual(ENGINE_RATE_MIN);
      expect(r).toBeLessThanOrEqual(ENGINE_RATE_MAX);
    }
  });

  it('설계노트 기본 재생속도 배율 범위(0.6~2.2)', () => {
    expect(ENGINE_RATE_MIN).toBeCloseTo(0.6, 6);
    expect(ENGINE_RATE_MAX).toBeCloseTo(2.2, 6);
  });

  it('maxRpm 인자가 매핑에 반영(절반 rpm은 두 배율의 중간 근처)', () => {
    const mid = rpmToPlaybackRate(3500, 7000);
    expect(mid).toBeCloseTo((ENGINE_RATE_MIN + ENGINE_RATE_MAX) / 2, 6);
  });
});

// ─────────────────────────────────────────────────────────────
// 2) 음소거 토글
// ─────────────────────────────────────────────────────────────
describe('음소거 토글', () => {
  it('초기 상태는 음소거 아님', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    expect(audio.muted).toBe(false);
  });

  it('toggleMute() 두 번이면 원상복귀', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.toggleMute();
    expect(audio.muted).toBe(true);
    audio.toggleMute();
    expect(audio.muted).toBe(false);
  });

  it('setMuted(true) → muted getter true, setMuted(false) → 복귀', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.setMuted(true);
    expect(audio.muted).toBe(true);
    audio.setMuted(false);
    expect(audio.muted).toBe(false);
  });

  it('resume 후 setMuted(true) 시 masterGain 값이 0으로 향함', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    const ctx = audio._ctx ?? null;
    audio.setMuted(true);
    // 구현이 즉시 value=0 또는 setTargetAtTime/setValueAtTime(0)로 처리할 수 있다.
    expect(audio.muted).toBe(true);
    if (ctx) {
      const gains = ctx.createGain.mock.results.map((r) => r.value);
      const anyZeroed = gains.some(
        (g) =>
          g.gain.value === 0 ||
          g.gain.setTargetAtTime.mock.calls.some((c) => c[0] === 0) ||
          g.gain.setValueAtTime.mock.calls.some((c) => c[0] === 0)
      );
      expect(anyZeroed).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 3) resume idempotent / 시작 전 안전
// ─────────────────────────────────────────────────────────────
describe('시작 전 안전 + resume idempotent', () => {
  it('ctx 생성 전 update() 호출이 throw하지 않음', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    expect(() => audio.update(3000, true)).not.toThrow();
  });

  it('ctx 생성 전 onShift() 호출이 throw하지 않음', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    expect(() => audio.onShift()).not.toThrow();
  });

  it('resume() 두 번 호출해도 throw하지 않음', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    expect(() => {
      audio.resume();
      audio.resume();
    }).not.toThrow();
  });

  it('resume() 2회여도 AudioContext는 1개, 엔진 소스 start는 1회만', async () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    audio.resume();
    await flushPromises(); // 엔진 디코드 완료 → 소스 생성/start
    const ctx = audio._ctx;
    expect(ctx).toBeTruthy();
    // 엔진 루프 소스: 생성된 bufferSource 중 loop=true인 것.
    const loopSources = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .filter((s) => s.loop === true);
    expect(loopSources.length).toBe(1);
    expect(loopSources[0].start).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 4) 엔진 루프 소스 (디코드 후 생성/start)
// ─────────────────────────────────────────────────────────────
describe('엔진 루프 소스', () => {
  it('엔진 디코드 성공 후 loop=true 소스가 1회만 start', async () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    expect(ctx.decodeAudioData).toHaveBeenCalled();
    const loopSources = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .filter((s) => s.loop === true);
    expect(loopSources.length).toBe(1);
    const engineSrc = loopSources[0];
    expect(engineSrc.buffer).toBeTruthy(); // 디코드된 엔진 버퍼가 할당됨
    expect(engineSrc.start).toHaveBeenCalledTimes(1);
  });

  it('엔진 디코드 실패 시 무음 — 루프 소스를 만들지 않음', async () => {
    // 모든 fetch 실패 → 엔진/변속 둘 다 미로드. 엔진은 폴백 없음(무음).
    globalThis.fetch = vi.fn(async () => {
      throw new Error('no network in test');
    });
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    const loopSources = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .filter((s) => s.loop === true);
    expect(loopSources.length).toBe(0);
  });

  it('디코드 전 update() 호출은 throw 없고 엔진 소스를 만들지 않음', () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    const ctx = audio._ctx;
    // flushPromises를 호출하지 않아 디코드 미완료 상태.
    const loopBefore = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .filter((s) => s.loop === true).length;
    expect(() => audio.update(3000, true)).not.toThrow();
    const loopAfter = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .filter((s) => s.loop === true).length;
    // update가 엔진 소스를 새로 만들지 않는다(소스는 디코드 콜백에서만 생성).
    expect(loopAfter).toBe(loopBefore);
  });
});

// ─────────────────────────────────────────────────────────────
// 5) 엔진 gain 엔벨로프 + playbackRate 변조
// ─────────────────────────────────────────────────────────────
describe('엔진 gain 엔벨로프 + playbackRate 변조', () => {
  it('update(rpm, true) → 엔진 gain 타깃이 양수', async () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises(); // 엔진 소스 준비
    const ctx = audio._ctx;
    audio.update(3000, true);

    // 엔진 gain(생성된 gain 노드 중 하나)의 setTargetAtTime/setValueAtTime에
    // 양수 타깃이 들어가야 한다.
    const gains = ctx.createGain.mock.results.map((r) => r.value);
    const wentPositive = gains.some((g) => {
      const targets = [
        ...g.gain.setTargetAtTime.mock.calls.map((c) => c[0]),
        ...g.gain.setValueAtTime.mock.calls.map((c) => c[0]),
      ];
      return targets.some((t) => t > 0);
    });
    expect(wentPositive).toBe(true);
  });

  it('update(rpm, false) → 엔진 gain 타깃이 0으로 향함', async () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    audio.update(3000, true);
    audio.update(3000, false);

    const gains = ctx.createGain.mock.results.map((r) => r.value);
    const wentZero = gains.some((g) => {
      const targets = [
        ...g.gain.setTargetAtTime.mock.calls.map((c) => c[0]),
        ...g.gain.setValueAtTime.mock.calls.map((c) => c[0]),
      ];
      return targets.some((t) => t === 0);
    });
    expect(wentZero).toBe(true);
  });

  it('update가 엔진 소스 playbackRate를 setTargetAtTime으로 변조', async () => {
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    audio.update(5000, true);
    const engineSrc = ctx.createBufferSource.mock.results
      .map((r) => r.value)
      .find((s) => s.loop === true);
    expect(engineSrc).toBeTruthy();
    expect(engineSrc.playbackRate.setTargetAtTime).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 6) 변속음 폴백 (절차적 클릭)
// ─────────────────────────────────────────────────────────────
describe('변속음 폴백', () => {
  it('shiftBuffer 미로드 상태에서 onShift()가 throw하지 않음', async () => {
    // 변속음 로드 실패 시나리오: fetch 전부 실패.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('no network in test');
    });
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    expect(() => audio.onShift()).not.toThrow();
  });

  it('onShift() 폴백 시 절차적 클릭 경로(노이즈 버퍼 + bufferSource 생성)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('no network in test');
    });
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    const sourcesBefore = ctx.createBufferSource.mock.calls.length;
    audio.onShift();
    // 폴백 클릭은 노이즈 버퍼를 만들고(BufferSource로 재생) start해야 한다.
    expect(ctx.createBuffer).toHaveBeenCalled();
    expect(ctx.createBufferSource.mock.calls.length).toBeGreaterThan(
      sourcesBefore
    );
    const src = ctx.createBufferSource.mock.results.at(-1).value;
    expect(src.start).toHaveBeenCalled();
  });

  it('음소거 상태에서 onShift()는 소리 노드를 만들지 않음', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('no network in test');
    });
    const audio = createAudio({ AudioContextCtor: FakeAudioContext });
    audio.resume();
    await flushPromises();
    const ctx = audio._ctx;
    audio.setMuted(true);
    const before = ctx.createBufferSource.mock.calls.length;
    audio.onShift();
    expect(ctx.createBufferSource.mock.calls.length).toBe(before);
  });
});
