// ══════════════════════════════════════════════════════════════
// terrain.js — 절차적 지형 (순수 로직, Three.js 비의존)
// LOD_demo/src/main.js 에서 추출. 지형 공식은 원본과 동일.
// ══════════════════════════════════════════════════════════════

// 상수 ───────────────────────────────────────────────────────────
export const CHUNK_SIZE  = 64;
export const RENDER_DIST = 4;

// LOD = 세그먼트 수 (많을수록 고해상도 / 계단 단위 = CHUNK_SIZE/seg)
export const SEG_L0 = 64;  // d=0: 1단위 계단 (발 밑 — 매우 세밀)
export const SEG_L1 = 32;  // d=1: 2단위 계단
export const SEG_L2 = 8;   // d=2: 8단위 큰 계단
export const SEG_L3 = 4;   // d≥3: 16단위 블록

// 노이즈 (Value Noise, 외부 라이브러리 없음) ─────────────────────
export function rand2D(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export function lerp(a, b, t) { return a + (b - a) * t; }

export function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(rand2D(ix,     iy    ), rand2D(ix + 1, iy    ), ux),
    lerp(rand2D(ix,     iy + 1), rand2D(ix + 1, iy + 1), ux),
    uy
  );
}

export function ridgedNoise(x, y) {
  const n = smoothNoise(x, y) * 2 - 1;
  return 1 - Math.abs(n);
}

// 난이도 램프: 코스 진행(출발 z=0에서 멀어질수록) 0→1 ──────────────
export const RAMP_DISTANCE = 600;  // 이 거리(z)에 걸쳐 난이도가 0→1

export function difficultyAt(wx, wz) {
  return Math.max(0, Math.min(1, wz / RAMP_DISTANCE));
}

// 지형 높이 — 출발 구간은 거의 평지, 진행할수록 점점 험준 ────────────
export function terrainHeight(wx, wz) {
  const diff = difficultyAt(wx, wz);
  // 항상 깔리는 완만한 기본 굴곡 (±4) — 출발 구간은 사실상 평지
  const gentle = (smoothNoise(wx * 0.004, wz * 0.004) - 0.5) * 8;
  // 난이도에 비례해 커지는 험준 성분 (능선 + 언덕)
  const ridge = ridgedNoise(wx * 0.0055, wz * 0.0055);
  const hill  = smoothNoise(wx * 0.02,  wz * 0.02);
  const rugged = (ridge * 30 + hill * 12) * diff;
  return gentle + rugged;
}

// 높이를 step(=CHUNK_SIZE/seg) 단위로 반올림 → 계단형 사각 지형 ───
export function quantizeHeight(raw, seg) {
  const step = CHUNK_SIZE / seg;
  return Math.round(raw / step) * step;
}

// LOD 결정 — 플레이어 청크와의 Chebyshev 거리 ───────────────────
export function getSeg(cx, cz, pcx, pcz) {
  const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
  if (d === 0) return SEG_L0;
  if (d === 1) return SEG_L1;
  if (d === 2) return SEG_L2;
  return           SEG_L3;
}

// 높이 → 색상 hex (8단계). 렌더 레이어가 THREE.Color로 래핑 ───────
export function heightToColorHex(h) {
  if      (h < -6) return 0x14408a; // 깊은 물
  else if (h <  0) return 0x2e7abf; // 얕은 물
  else if (h <  1) return 0xd4bc7d; // 모래
  else if (h <  9) return 0x2d8a28; // 풀
  else if (h < 20) return 0x3a6b22; // 진한 풀
  else if (h < 35) return 0x7a6b52; // 바위
  else if (h < 50) return 0x8a8080; // 회색 바위
  else             return 0xfafafa; // 설산
}
