// gearbox.js 단위 테스트 (M3)
import { describe, it, expect } from 'vitest';
import {
  WHEEL_RADIUS, FINAL_DRIVE, GEARS,
  gearName, shiftUp, shiftDown, totalRatio,
  engineRpmFromSpeed, speedFromEngineRpm,
} from './gearbox.js';

describe('gearName', () => {
  it('기어 표기', () => {
    expect(gearName(-1)).toBe('R');
    expect(gearName(0)).toBe('N');
    expect(gearName(1)).toBe('1');
    expect(gearName(5)).toBe('5');
  });
});

describe('shiftUp / shiftDown', () => {
  it('순차 변속 (R-N-1-2-3-4-5)', () => {
    expect(shiftUp(-1)).toBe(0);  // R → N
    expect(shiftUp(0)).toBe(1);   // N → 1
    expect(shiftUp(4)).toBe(5);   // 4 → 5
    expect(shiftDown(1)).toBe(0); // 1 → N
    expect(shiftDown(0)).toBe(-1);// N → R
  });
  it('범위 clamp', () => {
    expect(shiftUp(5)).toBe(5);    // 최고단 유지
    expect(shiftDown(-1)).toBe(-1);// 후진 유지
  });
});

describe('totalRatio', () => {
  it('중립은 0', () => {
    expect(totalRatio(0)).toBe(0);
  });
  it('전진 기어는 양수, 고단일수록 작아짐', () => {
    expect(totalRatio(1)).toBeGreaterThan(totalRatio(5));
    expect(totalRatio(5)).toBeGreaterThan(0);
  });
  it('FINAL_DRIVE 반영', () => {
    expect(totalRatio(4)).toBeCloseTo(1.0 * FINAL_DRIVE, 9); // 4단 기어비 1.0
  });
});

describe('engineRpmFromSpeed', () => {
  it('중립에서는 0', () => {
    expect(engineRpmFromSpeed(20, 0)).toBe(0);
  });
  it('속도가 클수록 RPM 증가(같은 기어)', () => {
    expect(engineRpmFromSpeed(20, 2)).toBeGreaterThan(engineRpmFromSpeed(10, 2));
  });
  it('같은 속도면 저단이 고단보다 RPM 높음', () => {
    expect(engineRpmFromSpeed(15, 1)).toBeGreaterThan(engineRpmFromSpeed(15, 5));
  });
  it('후진은 음의 속도에서 양의 RPM', () => {
    expect(engineRpmFromSpeed(-5, -1)).toBeGreaterThan(0);
  });
});

describe('rpm ↔ speed 왕복', () => {
  it('engineRpmFromSpeed → speedFromEngineRpm 복원', () => {
    const v = 12;
    const rpm = engineRpmFromSpeed(v, 3);
    expect(speedFromEngineRpm(rpm, 3)).toBeCloseTo(v, 6);
  });
});

describe('상수', () => {
  it('GEARS 순서/바퀴 반경', () => {
    expect(GEARS).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    expect(WHEEL_RADIUS).toBeGreaterThan(0);
  });
});
