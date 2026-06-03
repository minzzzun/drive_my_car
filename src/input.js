// ══════════════════════════════════════════════════════════════
// input.js — 키보드 → controls 매핑 (순수 로직)
// DOM 이벤트 부착은 main.js. 여기선 상태/매핑만.
// ══════════════════════════════════════════════════════════════

export const KEYMAP = {
  throttle:  ['KeyW'],
  brake:     ['KeyS'],
  left:      ['KeyA'],
  right:     ['KeyD'],
  clutch:    ['ShiftLeft', 'ShiftRight'],
  shiftUp:   ['KeyE'],
  shiftDown: ['KeyQ'],
  ignition:  ['Enter'],
};

const ALL_MAPPED = new Set(Object.values(KEYMAP).flat());

export function createInput() {
  return { down: new Set(), pendingShift: 0, pendingIgnition: false };
}

function has(input, codes) {
  return codes.some((c) => input.down.has(c));
}

// keydown — 엣지 기록. 매핑된 키면 true 반환(preventDefault 용도). ──
export function onKeyDown(input, code) {
  if (!ALL_MAPPED.has(code)) return false;
  const wasDown = input.down.has(code);
  input.down.add(code);
  if (!wasDown) {
    if (KEYMAP.shiftUp.includes(code))   input.pendingShift = 1;
    if (KEYMAP.shiftDown.includes(code)) input.pendingShift = -1;
    if (KEYMAP.ignition.includes(code))  input.pendingIgnition = true;
  }
  return true;
}

export function onKeyUp(input, code) {
  input.down.delete(code);
  return ALL_MAPPED.has(code);
}

// 현재 입력 → controls. 엣지(shift/ignition)는 소비. ───────────────
export function readControls(input) {
  const left  = has(input, KEYMAP.left);
  const right = has(input, KEYMAP.right);
  const controls = {
    throttle:    has(input, KEYMAP.throttle) ? 1 : 0,
    brake:       has(input, KEYMAP.brake) ? 1 : 0,
    clutchPedal: has(input, KEYMAP.clutch) ? 1 : 0,
    steer:       (right ? 1 : 0) - (left ? 1 : 0),
    shift:       input.pendingShift,
    ignition:    input.pendingIgnition,
  };
  input.pendingShift = 0;
  input.pendingIgnition = false;
  return controls;
}
