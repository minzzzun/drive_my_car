// render/gearstick.js 기어 위치 매핑 테스트 (H 패턴)
import { describe, it, expect } from 'vitest';
import { gearKnobPosition } from './gearstick.js';

describe('gearKnobPosition (H 패턴)', () => {
  it('중립은 중앙 열·중앙 행', () => {
    expect(gearKnobPosition(0)).toEqual({ col: 1, row: 0 });
  });
  it('1단 좌상, 2단 좌하', () => {
    expect(gearKnobPosition(1)).toEqual({ col: 0, row: -1 });
    expect(gearKnobPosition(2)).toEqual({ col: 0, row: 1 });
  });
  it('3단 중상, 4단 중하', () => {
    expect(gearKnobPosition(3)).toEqual({ col: 1, row: -1 });
    expect(gearKnobPosition(4)).toEqual({ col: 1, row: 1 });
  });
  it('5단 우상, R 우하', () => {
    expect(gearKnobPosition(5)).toEqual({ col: 2, row: -1 });
    expect(gearKnobPosition(-1)).toEqual({ col: 2, row: 1 });
  });
});
