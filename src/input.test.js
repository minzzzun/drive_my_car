// input.js 단위 테스트 (M5)
import { describe, it, expect } from 'vitest';
import { createInput, onKeyDown, onKeyUp, readControls } from './input.js';

describe('레벨 입력', () => {
  it('W → throttle, S → brake, Shift → clutchPedal', () => {
    const inp = createInput();
    onKeyDown(inp, 'KeyW');
    onKeyDown(inp, 'KeyS');
    onKeyDown(inp, 'ShiftLeft');
    const c = readControls(inp);
    expect(c.throttle).toBe(1);
    expect(c.brake).toBe(1);
    expect(c.clutchPedal).toBe(1);
  });
  it('keyup 하면 해제', () => {
    const inp = createInput();
    onKeyDown(inp, 'KeyW');
    onKeyUp(inp, 'KeyW');
    expect(readControls(inp).throttle).toBe(0);
  });
});

describe('조향', () => {
  it('A → -1, D → +1', () => {
    const l = createInput(); onKeyDown(l, 'KeyA');
    expect(readControls(l).steer).toBe(-1);
    const r = createInput(); onKeyDown(r, 'KeyD');
    expect(readControls(r).steer).toBe(1);
  });
  it('동시에 누르면 0', () => {
    const inp = createInput();
    onKeyDown(inp, 'KeyA');
    onKeyDown(inp, 'KeyD');
    expect(readControls(inp).steer).toBe(0);
  });
});

describe('변속/시동 (엣지, one-shot)', () => {
  it('E → shift +1, 다음 read는 0', () => {
    const inp = createInput();
    onKeyDown(inp, 'KeyE');
    expect(readControls(inp).shift).toBe(1);
    expect(readControls(inp).shift).toBe(0);
  });
  it('Q → shift -1', () => {
    const inp = createInput();
    onKeyDown(inp, 'KeyQ');
    expect(readControls(inp).shift).toBe(-1);
  });
  it('Enter → ignition true, 다음 read는 false', () => {
    const inp = createInput();
    onKeyDown(inp, 'Enter');
    expect(readControls(inp).ignition).toBe(true);
    expect(readControls(inp).ignition).toBe(false);
  });
});

describe('매핑 안 된 키', () => {
  it('무시되고 controls에 영향 없음', () => {
    const inp = createInput();
    const handled = onKeyDown(inp, 'KeyZ');
    expect(handled).toBe(false);
    const c = readControls(inp);
    expect(c.throttle).toBe(0);
    expect(c.shift).toBe(0);
  });
});
