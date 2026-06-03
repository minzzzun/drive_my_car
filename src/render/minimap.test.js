// render/minimap.js 순수 투영 함수 테스트 (M8)
import { describe, it, expect } from 'vitest';
import { computeBounds, worldToMinimap } from './minimap.js';

describe('computeBounds', () => {
  it('경계 + 여백', () => {
    const wp = [{ x: 0, z: 0 }, { x: 100, z: 50 }, { x: -20, z: 80 }];
    const b = computeBounds(wp, 10);
    expect(b.minX).toBe(-30);
    expect(b.maxX).toBe(110);
    expect(b.minZ).toBe(-10);
    expect(b.maxZ).toBe(90);
  });
});

describe('worldToMinimap', () => {
  const view = { bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, size: 200 };
  it('좌하단(minX,minZ) → 좌하단 픽셀, +Z는 화면 위', () => {
    const p = worldToMinimap(0, 0, view);
    expect(p.mx).toBeCloseTo(0, 6);
    expect(p.my).toBeCloseTo(200, 6); // z=0이 아래
  });
  it('우상단(maxX,maxZ) → 우상단 픽셀', () => {
    const p = worldToMinimap(100, 100, view);
    expect(p.mx).toBeCloseTo(200, 6);
    expect(p.my).toBeCloseTo(0, 6);
  });
  it('중앙', () => {
    const p = worldToMinimap(50, 50, view);
    expect(p.mx).toBeCloseTo(100, 6);
    expect(p.my).toBeCloseTo(100, 6);
  });
  it('종횡비 보존(세로로 긴 코스)', () => {
    const v2 = { bounds: { minX: 0, maxX: 50, minZ: 0, maxZ: 100 }, size: 200 };
    // scale = 200/100 = 2, 가로 폭 50*2=100 → 좌우 여백 (200-100)/2=50
    const p = worldToMinimap(0, 0, v2);
    expect(p.mx).toBeCloseTo(50, 6);
  });
});
