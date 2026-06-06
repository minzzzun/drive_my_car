// ══════════════════════════════════════════════════════════════
// render/hud.js — 주행 + 배송 HUD
//   line1(운전): RPM 게이지/기어/속도/엔진
//   line2(배송): 단계/목표/거리/적재/완료건수 (M14b 순수 운송)
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
    '<style>#hud-line1 b:first-of-type{font-size:20px}</style>' +
    '<div id="hud-line1" style="font-size:16px;margin-bottom:6px"></div>' +
    '<div style="height:8px;background:#333;border-radius:4px;overflow:hidden">' +
    '<div id="hud-rpm" style="height:100%;width:0;background:linear-gradient(90deg,#4caf50,#ffc107,#f44336)"></div></div>' +
    '<div id="hud-line2" style="font-size:13px;margin-top:6px;opacity:.85"></div>' +
    '<div style="font-size:11px;opacity:.55;margin-top:4px">W 액셀 · S 브레이크 · A/D 조향 · Shift 클러치 · E/Q 기어 · Enter 시동 · 4 시점 · ESC 메뉴</div>';
  document.body.appendChild(el);

  const line1 = el.querySelector('#hud-line1');
  const rpmBar = el.querySelector('#hud-rpm');
  const line2 = el.querySelector('#hud-line2');

  // ── 토스트(도착 안내) — 화면 상단에 잠깐 뜨는 메시지 ──────────────
  const toast = document.createElement('div');
  toast.id = 'hud-toast';
  toast.style.cssText =
    'position:fixed;left:50%;top:80px;transform:translateX(-50%);' +
    'background:rgba(20,30,40,0.9);color:#fff;padding:12px 24px;border-radius:10px;' +
    'font-family:system-ui,sans-serif;font-size:18px;text-align:center;z-index:40;' +
    'pointer-events:none;opacity:0;transition:opacity .25s';
  document.body.appendChild(toast);
  let toastTimer = null;

  // missionView = { phase, label, distance, hasCargo, completed, total }
  function update(vehicle, missionView) {
    // ── line1: 운전 피드백 (유지) ──
    const kmh = Math.abs(vehicle.speed) * 3.6;
    const eng = !vehicle.on ? (vehicle.stalled ? '🔴 시동꺼짐' : '⚪ OFF') : '🟢 ON';
    line1.innerHTML =
      `기어 <b>${vehicle.gearName}</b> &#160; ` +
      `${Math.round(vehicle.rpm)} RPM &#160; <b>${kmh.toFixed(0)}</b> km/h &#160; ${eng}` +
      (vehicle.rollover ? ' &#160; ⚠️ 전복' : '');
    rpmBar.style.width = `${rpmToFraction(vehicle.rpm, maxRpm) * 100}%`;

    // ── line2: 배송 정보 ──
    const mv = missionView ?? {};
    const cargo = mv.hasCargo ? '🟩 적재됨' : '⬜ 빈차';
    const done = `${mv.completed ?? 0}/${mv.total ?? 0}`;
    if (mv.phase === 'done') {
      line2.innerHTML =
        `✅ 모든 배송 완료 &#160;|&#160; ${done}`;
    } else {
      const icon = mv.phase === 'toDropoff' ? '🏁 배송지로' : '📦 적재지로';
      line2.innerHTML =
        `${icon} <b>${mv.label ?? ''}</b> &#160;|&#160; ` +
        `${Math.round(mv.distance ?? 0)} m &#160;|&#160; ` +
        `${cargo} &#160;|&#160; ${done}`;
    }
  }

  // ── 토스트 표시(픽업/배송완료 등 일시 안내) ──────────────────────
  function showToast(text, ms = 2000) {
    toast.innerHTML = text;
    toast.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      toast.style.opacity = '0';
    }, ms);
  }

  return { el, update, showToast };
}
