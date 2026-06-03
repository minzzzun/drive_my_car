// ══════════════════════════════════════════════════════════════
// render/hud.js — 주행 HUD (RPM 게이지/기어/속도/점수/타이머)
// ══════════════════════════════════════════════════════════════

// RPM → 게이지 채움 비율 (순수) ───────────────────────────────────
export function rpmToFraction(rpm, maxRpm = 7000) {
  return Math.max(0, Math.min(1, rpm / maxRpm));
}

export function createHud(opts = {}) {
  const maxRpm = opts.maxRpm ?? 7000;
  const el = document.createElement('div');
  el.id = 'hud';
  el.style.cssText =
    'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);' +
    'background:rgba(0,0,0,0.62);color:#fff;padding:12px 20px;border-radius:12px;' +
    'font-family:system-ui,sans-serif;text-align:center;z-index:20;pointer-events:none;min-width:360px';
  el.innerHTML =
    '<div id="hud-line1" style="font-size:16px;margin-bottom:6px"></div>' +
    '<div style="height:8px;background:#333;border-radius:4px;overflow:hidden">' +
    '<div id="hud-rpm" style="height:100%;width:0;background:linear-gradient(90deg,#4caf50,#ffc107,#f44336)"></div></div>' +
    '<div id="hud-line2" style="font-size:13px;margin-top:6px;opacity:.85"></div>' +
    '<div style="font-size:11px;opacity:.55;margin-top:4px">W 액셀 · S 브레이크 · A/D 조향 · Shift 클러치 · E/Q 기어 · Enter 시동</div>';
  document.body.appendChild(el);

  const line1 = el.querySelector('#hud-line1');
  const rpmBar = el.querySelector('#hud-rpm');
  const line2 = el.querySelector('#hud-line2');

  function update(vehicle, score) {
    const kmh = Math.abs(vehicle.speed) * 3.6;
    const eng = !vehicle.on ? (vehicle.stalled ? '🔴 시동꺼짐' : '⚪ OFF') : '🟢 ON';
    line1.innerHTML =
      `기어 <b style="font-size:20px">${vehicle.gearName}</b> &nbsp; ` +
      `${Math.round(vehicle.rpm)} RPM &nbsp; <b>${kmh.toFixed(0)}</b> km/h &nbsp; ${eng}` +
      (vehicle.rollover ? ' &nbsp; ⚠️ 전복' : '');
    rpmBar.style.width = `${rpmToFraction(vehicle.rpm, maxRpm) * 100}%`;
    const cpTotal = score.totalCheckpoints;
    line2.innerHTML =
      `점수 <b>${score.score}</b> &nbsp;|&nbsp; ` +
      `체크포인트 ${Math.min(score.nextCheckpoint + 1, cpTotal)}/${cpTotal} &nbsp;|&nbsp; ` +
      `⏱ ${Math.max(0, score.timeLeft).toFixed(1)}s`;
  }

  return { el, update };
}
