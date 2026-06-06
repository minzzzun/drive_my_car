// ══════════════════════════════════════════════════════════════
// render/beacon.js — 목적지 3D 비콘 (THREE 의존, 렌더 레이어)
//
// 현재 목표(pickup/dropoff) 1곳을 멀리서도 보이게 가리키는 단일 비콘.
//   · 긴 반투명 수직 빔(원경에서도 식별) + 상단 핀 + 바닥 도착 링.
//   · fog 영향 배제(fog:false), depthWrite:false 로 반투명 깊이 아티팩트 완화.
//   · main 이 currentTarget 으로 위치/색을 갱신(update)하고, 없으면 숨긴다.
// 설계: mds/design/m15-improvements.md §항목#3
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';

export const BEACON_HEIGHT        = 120;       // 빔 높이(m) — 원경 가시성
export const BEACON_PICKUP_COLOR  = 0x33aaff;  // 파랑(적재) — 미니맵과 동색
export const BEACON_DROPOFF_COLOR = 0xff5533;  // 주황빨강(배송)

const BEAM_RADIUS  = 1.2;   // 빔 반경(m)
const PIN_Y        = 10;    // 핀 높이(지면 위, m)
const ARRIVE_RING  = 6;     // 바닥 링 반경(도착 반경과 동일, m)

// 비콘 생성 — { group, update(target, phase), dispose } 반환. ───────
export function createBeacon() {
  const group = new THREE.Group();
  group.visible = false;

  // 수직 빔 — 가늘고 매우 길게. 원점이 바닥에 닿도록 y = height/2.
  const beamGeo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEACON_HEIGHT, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: BEACON_PICKUP_COLOR,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = BEACON_HEIGHT / 2;
  group.add(beam);

  // 상단 핀 — 역삼각뿔(끝이 아래를 향하게 뒤집어 핀처럼). 불투명.
  const pinGeo = new THREE.ConeGeometry(1.6, 4, 16);
  const pinMat = new THREE.MeshBasicMaterial({ color: BEACON_PICKUP_COLOR, fog: false });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.rotation.x = Math.PI;       // 뾰족한 끝이 아래로
  pin.position.y = PIN_Y;
  group.add(pin);

  // 바닥 링 — 도착 반경 시각화. 지면에 눕힘.
  const ringGeo = new THREE.RingGeometry(ARRIVE_RING - 0.4, ARRIVE_RING, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: BEACON_PICKUP_COLOR,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;          // 지면 살짝 위(z-fighting 방지)
  group.add(ring);

  const _color = new THREE.Color();

  // 목표/단계 갱신 — target={x,z}|{x,y,z}|null, phase 로 색 결정. ────
  //   target 없음/done → 숨김. 있으면 위치 이동 + 색 일괄 갱신.
  function update(target, phase) {
    if (!target || phase === 'done') {
      group.visible = false;
      return;
    }
    group.visible = true;
    const baseY = Number.isFinite(target.y) ? target.y : 0;
    group.position.set(target.x, baseY, target.z);

    const hex = phase === 'toDropoff' ? BEACON_DROPOFF_COLOR : BEACON_PICKUP_COLOR;
    _color.setHex(hex);
    beamMat.color.copy(_color);
    pinMat.color.copy(_color);
    ringMat.color.copy(_color);
  }

  function dispose() {
    beamGeo.dispose(); beamMat.dispose();
    pinGeo.dispose();  pinMat.dispose();
    ringGeo.dispose(); ringMat.dispose();
  }

  return { group, update, dispose };
}
