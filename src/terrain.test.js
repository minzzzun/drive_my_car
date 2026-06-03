// terrain.js 단위 테스트 (M1)
import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, SEG_L0, SEG_L1, SEG_L2, SEG_L3,
  rand2D, lerp, smoothNoise, ridgedNoise,
  terrainHeight, quantizeHeight, getSeg, heightToColorHex,
} from './terrain.js';

describe('rand2D', () => {
  it('같은 입력은 같은 값(결정론)', () => {
    expect(rand2D(12, 7)).toBe(rand2D(12, 7));
  });
  it('범위는 [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const v = rand2D(i * 1.3, i * 2.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('lerp', () => {
  it('양 끝과 중점', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('smoothNoise', () => {
  it('정수 격자점에서는 rand2D와 일치(보간 fract=0)', () => {
    expect(smoothNoise(3, 5)).toBeCloseTo(rand2D(3, 5), 12);
  });
  it('결정론 + 범위 [0,1]', () => {
    expect(smoothNoise(1.5, 2.5)).toBe(smoothNoise(1.5, 2.5));
    const v = smoothNoise(1.5, 2.5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('ridgedNoise', () => {
  it('범위 [0,1]', () => {
    for (let i = 0; i < 30; i++) {
      const v = ridgedNoise(i * 0.7, i * 1.1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('terrainHeight', () => {
  it('결정론(동일 좌표 동일 값)', () => {
    expect(terrainHeight(123, -45)).toBe(terrainHeight(123, -45));
  });
  it('합리적 범위(-40 ~ 90)', () => {
    for (let x = -500; x <= 500; x += 137) {
      for (let z = -500; z <= 500; z += 149) {
        const h = terrainHeight(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThan(-40);
        expect(h).toBeLessThan(90);
      }
    }
  });
});

describe('quantizeHeight', () => {
  it('seg에 따른 step 단위 반올림', () => {
    // seg=8 → step = 64/8 = 8
    expect(quantizeHeight(13, 8)).toBe(16); // round(1.625)*8
    expect(quantizeHeight(3, 8)).toBe(0);   // round(0.375)*8
    // seg=64 → step = 1 (거의 원본)
    expect(quantizeHeight(7.2, 64)).toBe(7);
  });
});

describe('getSeg (LOD)', () => {
  it('플레이어 청크와의 Chebyshev 거리로 결정', () => {
    expect(getSeg(0, 0, 0, 0)).toBe(SEG_L0); // d=0
    expect(getSeg(1, 0, 0, 0)).toBe(SEG_L1); // d=1
    expect(getSeg(1, 1, 0, 0)).toBe(SEG_L1); // 대각 d=1
    expect(getSeg(2, 2, 0, 0)).toBe(SEG_L2); // d=2
    expect(getSeg(5, 1, 0, 0)).toBe(SEG_L3); // d=5
  });
});

describe('heightToColorHex', () => {
  it('높이 구간별 색상 단계', () => {
    expect(heightToColorHex(-10)).toBe(0x14408a); // 깊은 물
    expect(heightToColorHex(-3)).toBe(0x2e7abf);  // 얕은 물
    expect(heightToColorHex(0.5)).toBe(0xd4bc7d);  // 모래
    expect(heightToColorHex(5)).toBe(0x2d8a28);    // 풀
    expect(heightToColorHex(15)).toBe(0x3a6b22);   // 진한 풀
    expect(heightToColorHex(30)).toBe(0x7a6b52);   // 바위
    expect(heightToColorHex(45)).toBe(0x8a8080);   // 회색 바위
    expect(heightToColorHex(60)).toBe(0xfafafa);   // 설산
  });
});

describe('상수', () => {
  it('CHUNK_SIZE와 LOD 세그먼트', () => {
    expect(CHUNK_SIZE).toBe(64);
    expect([SEG_L0, SEG_L1, SEG_L2, SEG_L3]).toEqual([64, 32, 8, 4]);
  });
});
