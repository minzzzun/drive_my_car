import * as THREE from 'three';
import { CHUNK_SIZE } from './terrain.js';
import { createMission, currentTarget, stepMission, jobsFromPoints } from './mission.js';
import { buildCar, updateCarTransform } from './render/carMesh.js';
import { createMinimap } from './render/minimap.js';
import { createHud } from './render/hud.js';
import { createGearstick } from './render/gearstick.js';
import { createInput, onKeyDown, onKeyUp, readControls } from './input.js';
import { createVehicle, stepVehicle, CLUTCH_SHIFT_MAX } from './vehicle/vehicle.js';
import { MAX_RPM } from './vehicle/engine.js';
import { createAudio } from './render/audio.js';
import { createBeacon } from './render/beacon.js';
import { getMap } from './maps/index.js';
import { getCarType, DEFAULT_CAR_ID } from './vehicle/carTypes.js';

// ══════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════
let EYE_HEIGHT = 1.2;  // 운전석 눈높이 (차량 원점 위) — 선택 차종에 따라 변경

// ══════════════════════════════════════════════════════════════
// Three.js 초기화
// ══════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 700);

// ══════════════════════════════════════════════════════════════
// 게임 상태 (startGame 에서 맵 선택 후 채워짐)
// ══════════════════════════════════════════════════════════════
let map        = null;   // 현재 맵 (인터페이스 객체)
let vehicle    = null;
let mission    = null;   // 배송 미션 상태
let minimap    = null;
let beacon     = null;   // 목적지 3D 비콘

// ══════════════════════════════════════════════════════════════
// 입력 + 시작 오버레이 (포인터 락은 커서 숨김 용도)
// ══════════════════════════════════════════════════════════════
const input   = createInput();
const overlay = document.getElementById('overlay');
let started   = false;
let paused    = false;

// 시작 화면 맵 선택 (기본 'natural'). 카드 클릭으로 변경.
let selectedMapId = 'natural';
const mapCards = overlay.querySelectorAll('.map-card');
mapCards.forEach(function(card) {
  card.addEventListener('click', function(e) {
    // 카드 클릭은 '선택'만 — overlay 의 시작 클릭과 충돌하지 않게 버블링 차단
    e.stopPropagation();
    if (started) return;  // 게임 시작 후엔 맵 변경 불가(새로고침 필요)
    selectedMapId = card.dataset.map;
    mapCards.forEach(function(c) { c.classList.toggle('selected', c === card); });
  });
});

// 시작 화면 차종 선택 (기본 sedan). 카드 클릭으로 변경.
let selectedCarId = DEFAULT_CAR_ID;
const carCards = overlay.querySelectorAll('.car-card');
carCards.forEach(function(card) {
  card.addEventListener('click', function(e) {
    e.stopPropagation();
    if (started) return;  // 게임 시작 후엔 차종 변경 불가(새로고침 필요)
    selectedCarId = card.dataset.car;
    carCards.forEach(function(c) { c.classList.toggle('selected', c === card); });
  });
});

// 사운드 시스템 (엔진음 + 변속음). AudioContext는 사용자 제스처(오버레이 click)에서 생성.
const audio = createAudio({ maxRpm: MAX_RPM });

// 오버레이 클릭 → 시작 또는 (일시정지에서) 재개
overlay.addEventListener('click', function() {
  if (!started) startGame(selectedMapId, selectedCarId);  // 최초 클릭에서 선택한 맵/차종으로 초기화
  started = true;
  paused = false;
  overlay.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
  audio.resume();  // 사용자 제스처 시점에 AudioContext 생성/resume + 변속음 로드 시작
});

// 주행 중 일시정지 → 오버레이(설정창) 표시 + 포인터 락 해제
function pauseGame() {
  if (!started || paused || !mission) return;
  paused = true;
  overlay.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock?.();
  // #10 일시정지 — 엔진음 정지(시간 멈춤) + 관성 제거(재개 시 정지 상태로)
  audio.suspend();
  if (vehicle) { vehicle.dyn.speed = 0; vehicle.speed = 0; }
}

document.addEventListener('keydown', function(e) {
  if (e.code === 'Escape') { pauseGame(); return; }
  if (e.code === 'KeyM') { audio.toggleMute(); return; }
  if (e.code === 'Digit4' || e.code === 'Numpad4') {
    cameraMode = cameraMode === 'first' ? 'third' : 'first';
    return;
  }
  if (onKeyDown(input, e.code)) e.preventDefault();
});
document.addEventListener('keyup', function(e) { onKeyUp(input, e.code); });
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// ESC로 포인터 락이 풀리면(브라우저 기본 동작) 자동 일시정지
document.addEventListener('pointerlockchange', function() {
  if (!document.pointerLockElement) pauseGame();
});

// ══════════════════════════════════════════════════════════════
// 차량 메시 (1인칭 주행) — 차종에 맞춰 startGame 에서 (재)생성
// ══════════════════════════════════════════════════════════════
let car = null;

// 카메라 시점: 'first'(1인칭) | 'third'(3인칭). 숫자 4로 토글.
let cameraMode = 'first';

let clutchIn = false;  // 기어봉 UI 표시용 (클러치 충분히 밟힘)
let prevGear = 0;  // 변속 감지용(초기 0=N) — 시작 직후 의도치 않은 변속음 방지

function updateVehicle(dt) {
  const controls = readControls(input);
  clutchIn = (1 - controls.clutchPedal) <= CLUTCH_SHIFT_MAX;
  // 충돌 클램프용 이전 위치 보관(stepVehicle 적분 전)
  const prevX = vehicle.dyn.x, prevZ = vehicle.dyn.z;
  vehicle = stepVehicle(vehicle, controls, dt, map.heightAt);
  const d = vehicle.dyn;

  // ── 건물 통과 차단 — 새 위치가 막혀 있으면 이전 위치로 복원 + 정지 ──
  // (자연 맵 isBlocked 는 항상 false → 영향 없음, 회귀 0)
  if (map.isBlocked(d.x, d.z)) {
    d.x = prevX;
    d.z = prevZ;
    d.y = map.heightAt(prevX, prevZ);
    d.speed = 0;
    vehicle.speed = 0;
  }

  // ── 사운드: 엔진음(매 프레임) + 변속음(기어 변화 순간 1회) ──────
  audio.update(vehicle.rpm, vehicle.on);
  if (vehicle.gear !== prevGear) {
    audio.onShift();
    prevGear = vehicle.gear;
  }

  // ── 배송 미션 전진 — 도착 시 토스트 안내(채점/감점 없음) ──────────
  const { state: nextMission, event } = stepMission(mission, { x: d.x, z: d.z });
  mission = nextMission;
  if (event === 'pickedUp') {
    const t = currentTarget(mission);   // 적재 후 현재 목표 = 배송지
    hud.showToast(`📦 짐을 실었습니다 — ${t ? t.label : ''}(으)로!`);
  } else if (event === 'delivered') {
    hud.showToast(`✅ 배송 완료! (${mission.completed}/${mission.total})`);
  }
  // event === 'allDone' 은 결과 오버레이(updateHUD)가 처리

  // 차체 '천장' 방향(지형 법선) — 차량 정렬·카메라 up·조향축 기준
  const n = map.normalAt(d.x, d.z);
  updateCarTransform(car, d, n);

  // 카메라 (1인칭 / 3인칭) — up을 차체 천장(법선)에 맞춰 차와 함께 기운다
  const fx = Math.sin(d.heading), fz = Math.cos(d.heading);
  camera.up.set(n.x, n.y, n.z);
  if (cameraMode === 'third') {
    // 차량 뒤 위쪽에서 바라보는 3인칭
    camera.position.set(d.x - fx * 9, d.y + 4.5, d.z - fz * 9);
    camera.lookAt(d.x + fx * 2, d.y + 1, d.z + fz * 2);
  } else {
    // 1인칭 운전석 (운전석 위치에서 전방 주시)
    camera.position.set(d.x + fx * 0.4, d.y + EYE_HEIGHT, d.z + fz * 0.4);
    camera.lookAt(d.x + fx * 5, d.y + EYE_HEIGHT, d.z + fz * 5);
  }
}

// ══════════════════════════════════════════════════════════════
// HUD + 미니맵 + 결과 오버레이
// ══════════════════════════════════════════════════════════════
const hud       = createHud();
const gearstick = createGearstick();
document.body.appendChild(gearstick.canvas);
// minimap 은 맵 데이터에 의존하므로 startGame 에서 생성/부착

const result = document.createElement('div');
result.id = 'result';
result.style.cssText =
  'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
  'background:rgba(0,0,0,0.72);color:#fff;font-family:system-ui,sans-serif;' +
  'font-size:28px;text-align:center;z-index:50';
document.body.appendChild(result);

function updateHUD() {
  if (!vehicle) return;  // startGame 전엔 그릴 대상이 없음

  // ── 현재 목표 + 거리 → 배송 HUD ──
  const t = currentTarget(mission);
  const dist = t ? Math.hypot(vehicle.dyn.x - t.x, vehicle.dyn.z - t.z) : 0;
  hud.update(vehicle, {
    phase: mission.phase,
    label: t ? t.label : '',
    distance: dist,
    hasCargo: mission.hasCargo,
    completed: mission.completed,
    total: mission.total,
  });

  // ── 미니맵 마커: 현재 단계 목표를 pickup/dropoff 슬롯에 배치 ──
  let marker;
  if (!t) {
    marker = { pickup: null, dropoff: null, phase: 'done' };
  } else if (mission.phase === 'toPickup') {
    marker = { pickup: t, dropoff: null, phase: mission.phase };
  } else {
    marker = { pickup: null, dropoff: t, phase: mission.phase };
  }
  minimap.draw(vehicle.dyn, marker);

  // 목적지 3D 비콘 — 현재 목표 위치(지면 높이)·단계 색 갱신
  if (beacon) {
    if (t) beacon.update({ x: t.x, y: map.heightAt(t.x, t.z), z: t.z }, mission.phase);
    else beacon.update(null, 'done');
  }

  gearstick.draw(vehicle.gear, clutchIn);

  // ── 전체 배송 완료 안내(1회) — 탈락 없음, 자유주행은 계속 ──
  if (mission.phase === 'done' && result.style.display === 'none') {
    result.style.display = 'flex';
    result.innerHTML =
      `<div>🎉 모든 배송 완료!<br>` +
      `<span style="font-size:20px">${mission.completed}건 배송</span><br>` +
      `<span style="font-size:15px;opacity:.7">새로고침(F5)하여 다시 도전</span></div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// 리사이즈
// ══════════════════════════════════════════════════════════════
window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ══════════════════════════════════════════════════════════════
// 게임 초기화 (맵 선택 → 코스/스폰/세계/미니맵 구성)
// ══════════════════════════════════════════════════════════════
let lastCX = Infinity, lastCZ = Infinity;

function startGame(mapId = 'natural', carId = DEFAULT_CAR_ID) {
  map = getMap(mapId);

  // 차종 선택 → 성능치/외형/눈높이 반영
  const carType = getCarType(carId);
  EYE_HEIGHT = carType.mesh.eyeHeight ?? 1.2;

  // 차량 메시를 차종에 맞춰 (재)생성 — 재시작 대비 기존 메시 제거
  if (car) scene.remove(car);
  car = buildCar(carType.mesh);
  scene.add(car);

  // 정적 씬(코스 메시·조명·배경·포그) 구성
  map.buildStatic(scene);

  // 스폰(위치+heading+y) — 차량/카메라 배치
  const spawn = map.getSpawn();
  vehicle = createVehicle({ x: spawn.x, z: spawn.z, y: spawn.y, heading: spawn.heading }, carType.perf);
  prevGear = vehicle.gear;

  // 배송 미션(순수 운송) — 맵 배송지점 → 체이닝 job
  mission = createMission(jobsFromPoints(map.getDeliveryPoints()));
  result.style.display = 'none';

  // 미니맵(통일 데이터 소비) 생성/부착
  minimap = createMinimap(map.getMinimapData());
  document.body.appendChild(minimap.canvas);

  // 목적지 3D 비콘 — 재시작 대비 기존 제거 후 1회 생성/추가
  if (beacon) { scene.remove(beacon.group); beacon.dispose(); }
  beacon = createBeacon();
  scene.add(beacon.group);

  // 초기 세계 스트리밍 + 카메라 위치
  map.updateWorld(spawn.x, spawn.z, scene);
  camera.position.set(spawn.x, spawn.y + EYE_HEIGHT, spawn.z);
  lastCX = Math.floor(spawn.x / CHUNK_SIZE);
  lastCZ = Math.floor(spawn.z / CHUNK_SIZE);
}

// ══════════════════════════════════════════════════════════════
// 렌더 루프
// ══════════════════════════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started && !paused && mission) updateVehicle(dt);

  if (map) {
    const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
    const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
    if (pcx !== lastCX || pcz !== lastCZ) {
      map.updateWorld(camera.position.x, camera.position.z, scene);
      lastCX = pcx; lastCZ = pcz;
    }
  }

  updateHUD();
  renderer.render(scene, camera);
}

animate();
