// ══════════════════════════════════════════════════════════════
// render/gearstick.js — 우측 하단 기어봉(H 패턴) UI (2D 캔버스)
// 위치 매핑은 순수 함수, 그리기는 캔버스 2D.
// ══════════════════════════════════════════════════════════════

// 기어 → H 패턴 격자 위치 (col 0~2, row -1=위/0=중앙/1=아래) ───────
export function gearKnobPosition(gear) {
  switch (gear) {
    case 1:  return { col: 0, row: -1 };
    case 2:  return { col: 0, row: 1 };
    case 3:  return { col: 1, row: -1 };
    case 4:  return { col: 1, row: 1 };
    case 5:  return { col: 2, row: -1 };
    case -1: return { col: 2, row: 1 };  // R
    default: return { col: 1, row: 0 };  // N
  }
}

const COLS = [34, 75, 116];   // 열 x 픽셀
const ROWS = { '-1': 46, '0': 86, '1': 126 }; // 행 y 픽셀
const LABELS = [
  { g: 1, t: '1' }, { g: 2, t: '2' }, { g: 3, t: '3' },
  { g: 4, t: '4' }, { g: 5, t: '5' }, { g: -1, t: 'R' },
];

export function createGearstick(opts = {}) {
  const w = opts.width ?? 150, h = opts.height ?? 170;
  const canvas = document.createElement('canvas');
  canvas.id = 'gearstick';
  canvas.width = w; canvas.height = h;
  canvas.style.cssText =
    `position:fixed;right:16px;bottom:16px;top:auto;left:auto;width:${w}px;height:${h}px;` +
    'background:rgba(20,20,24,0.72);border:2px solid rgba(255,255,255,0.35);' +
    'border-radius:10px;z-index:30';
  const ctx = canvas.getContext('2d');

  function pos(col, row) {
    return { x: COLS[col], y: ROWS[String(row)] };
  }

  function draw(gear, clutchIn) {
    ctx.clearRect(0, 0, w, h);

    // 게이트 라인 (H 패턴): 중앙 가로 레일 + 각 열 세로
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const cy = ROWS['0'];
    ctx.beginPath();
    ctx.moveTo(COLS[0], cy); ctx.lineTo(COLS[2], cy);    // 중앙 레일
    for (let c = 0; c < 3; c++) { ctx.moveTo(COLS[c], ROWS['-1']); ctx.lineTo(COLS[c], ROWS['1']); }
    ctx.stroke();

    // 기어 라벨
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const { g, t } of LABELS) {
      const kp = gearKnobPosition(g);
      const p = pos(kp.col, kp.row);
      ctx.fillText(t, p.x, p.y - 18);
    }
    ctx.fillText('N', COLS[1], cy - 18);

    // 기어봉 노브 (현재 기어 위치). 클러치 밟으면 초록(변속 가능)
    const kp = gearKnobPosition(gear);
    const p = pos(kp.col, kp.row);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(COLS[1], cy); ctx.lineTo(p.x, p.y); ctx.stroke(); // 봉
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = clutchIn ? '#43d17a' : '#cc4444';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    // 클러치 상태 안내
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(clutchIn ? '클러치 ON · 변속 가능' : '클러치(Shift) 밟기', w / 2, h - 12);
  }

  return { canvas, draw };
}
