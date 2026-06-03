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

// 다이나믹 지형 (산 최대 ~75, 계곡 깊음) — 원본 공식 그대로 ────────
export function terrainHeight(wx, wz) {
  const warpX = (smoothNoise(wx * 0.0018 + 1.7,  wz * 0.0018)       - 0.5) * 180;
  const warpZ = (smoothNoise(wx * 0.0018,          wz * 0.0018 + 4.3) - 0.5) * 180;
  const wx2 = wx + warpX, wz2 = wz + warpZ;
  const continent = smoothNoise(wx2 * 0.0028, wz2 * 0.0028);
  const ridge     = ridgedNoise(wx2 * 0.0055, wz2 * 0.0055);
  const hill      = smoothNoise(wx2 * 0.018,  wz2 * 0.018);
  let h = continent * 22
        + ridge * Math.pow(continent, 0.4) * 65
        + hill * 14
        + smoothNoise(wx * 0.055, wz * 0.055) * 4
        - 20;
  return h;
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
