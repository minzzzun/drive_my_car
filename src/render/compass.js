// ══════════════════════════════════════════════════════════════
// render/compass.js — 목표 방향 나침반(상단 고정 회전 화살표) (M19a)
//
// 현재 배송 목표가 화면 밖/멀리 있어도 방향·거리를 항상 알려준다.
//   · 상단 중앙 고정 div, 화살표를 bearing(rad)만큼 회전(정면=↑).
//   · 단계 색은 비콘과 통일(적재=파랑, 배송=주황빨강).
//   · done/목표 없음(visible:false) → 숨김.
// 설계: mds/design/m19-arrow-lights.md §"렌더 — 상단 고정 나침반".
// ══════════════════════════════════════════════════════════════

const PICKUP_COLOR  = '#33aaff';  // 적재(toPickup) — 비콘과 동색
const DROPOFF_COLOR = '#ff5533';  // 배송(toDropoff)

export function createCompass() {
  const el = document.createElement('div');
  el.id = 'compass';
  el.style.cssText =
    'position:fixed;left:50%;top:18px;transform:translateX(-50%);' +
    'background:rgba(0,0,0,0.55);color:#fff;padding:8px 14px;border-radius:10px;' +
    'font-family:system-ui,sans-serif;text-align:center;z-index:25;pointer-events:none;display:none';
  el.innerHTML =
    '<div id="compass-arrow" style="font-size:26px;line-height:1;transition:transform .1s">▲</div>' +
    '<div id="compass-dist" style="font-size:13px;margin-top:2px;opacity:.85"></div>';
  document.body.appendChild(el);

  const arrow = el.querySelector('#compass-arrow');
  const dist = el.querySelector('#compass-dist');

  // v = { bearing, distance, phase, visible, label }
  function update(v) {
    if (!v || !v.visible) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    // 정면(bearing=0)이면 ↑, 우측 양수 = 화면 시계방향 회전.
    arrow.style.transform = 'rotate(' + (v.bearing * 180 / Math.PI) + 'deg)';
    arrow.style.color = v.phase === 'toDropoff' ? DROPOFF_COLOR : PICKUP_COLOR;
    dist.textContent = Math.round(v.distance ?? 0) + ' m' + (v.label ? ' · ' + v.label : '');
  }

  return { el, update };
}
