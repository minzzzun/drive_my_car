// render/hud.js 순수 함수 테스트 (M8)
import { describe, it, expect } from 'vitest';
import { rpmToFraction } from './hud.js';

describe('rpmToFraction', () => {
  it('0 → 0, max → 1', () => {
    expect(rpmToFraction(0, 7000)).toBe(0);
    expect(rpmToFraction(7000, 7000)).toBe(1);
  });
  it('절반', () => {
    expect(rpmToFraction(3500, 7000)).toBeCloseTo(0.5, 6);
  });
  it('초과는 1로 clamp, 음수는 0', () => {
    expect(rpmToFraction(9000, 7000)).toBe(1);
    expect(rpmToFraction(-100, 7000)).toBe(0);
  });
});
