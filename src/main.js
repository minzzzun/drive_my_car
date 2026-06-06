import * as THREE from 'three';
import { CHUNK_SIZE } from './terrain.js';
import { createScore, stepScore, CHECKPOINT_TIME } from './scoring.js';
import { buildCar, updateCarTransform } from './render/carMesh.js';
import { createMinimap } from './render/minimap.js';
import { createHud } from './render/hud.js';
import { createGearstick } from './render/gearstick.js';
import { createInput, onKeyDown, onKeyUp, readControls } from './input.js';
import { createVehicle, stepVehicle, CLUTCH_SHIFT_MAX } from './vehicle/vehicle.js';
import { MAX_RPM } from './vehicle/engine.js';
import { createAudio } from './render/audio.js';
import { getMap } from './maps/index.js';

// ══════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════
const EYE_HEIGHT = 1.2;  // 운전석 눈높이 (차량 원점 위)

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
let checkpoints = [];     // 채점/체크포인트 목표
let vehicle    = null;
let score      = null;
let minimap    = null;

// ══════════════════════════════════════════════════════════════
// 입력 + 시작 오버레이 (포인터 락은 커서 숨김 용도)
// ══════════════════════════════════════════════════════════════
const input   = createInput();
const overlay = document.getElementById('overlay');
let started   = false;
let paused    = false;

// 사운드 시스템 (엔진음 + 변속음). AudioContext는 사용자 제스처(오버레이 click)에서 생성.
const audio = createAudio({ maxRpm: MAX_RPM });

// 오버레이 클릭 → 시작 또는 (일시정지에서) 재개
overlay.addEventListener('click', function() {
  if (!started) startGame('natural');  // 최초 클릭에서 맵 초기화 (M12c 전: natural 고정)
  started = true;
  paused = false;
  overlay.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
  audio.resume();  // 사용자 제스처 시점에 AudioContext 생성/resume + 변속음 로드 시작
});

// 주행 중 일시정지 → 오버레이(설정창) 표시 + 포인터 락 해제
function pauseGame() {
  if (!started || paused || !score || score.state !== 'driving') return;
  paused = true;
  overlay.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock?.();
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
// 차량 메시 (1인칭 주행) — 위치/스폰은 startGame 에서 설정
// ══════════════════════════════════════════════════════════════
const car = buildCar();
scene.add(car);

// 채점 엣지 감지용 이전값
let prevOnRoad = true;
let prevCollide = false;

const CHECKPOINT_RADIUS = 6;   // 체크포인트 진입 반경
const COLLISION_TILT    = 0.5; // 경미 충돌로 보는 기울기(전복 미만)

// 테스트용: 점수 제도(감점/게임오버) 임시 비활성. true 로 바꾸면 채점 복구.
const SCORING_ENABLED = false;

// 카메라 시점: 'first'(1인칭) | 'third'(3인칭). 숫자 4로 토글.
let cameraMode = 'first';

let clutchIn = false;  // 기어봉 UI 표시용 (클러치 충분히 밟힘)
let prevGear = 0;  // 변속 감지용(초기 0=N) — 시작 직후 의도치 않은 변속음 방지

function updateVehicle(dt) {
  const controls = readControls(input);
  clutchIn = (1 - controls.clutchPedal) <= CLUTCH_SHIFT_MAX;
  vehicle = stepVehicle(vehicle, controls, dt, map.heightAt);
  const d = vehicle.dyn;

  // ── 사운드: 엔진음(매 프레임) + 변속음(기어 변화 순간 1회) ──────
  audio.update(vehicle.rpm, vehicle.on);
  if (vehicle.gear !== prevGear) {
    audio.onShift();
    prevGear = vehicle.gear;
  }

  // ── 채점 엣지 이벤트 감지 (테스트용으로 임시 비활성 가능) ──────
  if (SCORING_ENABLED) {
    const onRoad  = map.isOnRoad(d.x, d.z);
    const tilt    = Math.max(Math.abs(d.roll), Math.abs(d.pitch));
    const collide = tilt > COLLISION_TILT && !vehicle.rollover && Math.abs(vehicle.speed) > 2;
    const target  = checkpoints[score.nextCheckpoint];
    const reached = !!target && Math.hypot(d.x - target.x, d.z - target.z) < CHECKPOINT_RADIUS;

    score = stepScore(score, {
      rollover: vehicle.rollover,
      majorCollision: false,
      stalled: vehicle.justStalled,
      offRoad: prevOnRoad && !onRoad,
      collision: !prevCollide && collide,
      reachedCheckpoint: reached,
    }, dt);

    prevOnRoad = onRoad;
    prevCollide = collide;
  }

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
  hud.update(vehicle, score);
  minimap.draw(vehicle.dyn, score);
  gearstick.draw(vehicle.gear, clutchIn);

  if (SCORING_ENABLED && score.state !== 'driving' && result.style.display === 'none') {
    const pass = score.state === 'passed';
    result.style.display = 'flex';
    result.innerHTML =
      `<div>${pass ? '🎉 합격!' : '❌ 불합격'}<br>` +
      `<span style="font-size:20px">최종 점수 ${score.score}점</span><br>` +
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

function startGame(mapId = 'natural') {
  map = getMap(mapId);

  // 코스/목표·정적 씬(코스 메시·조명·배경·포그) 구성
  checkpoints = map.getGoals();
  map.buildStatic(scene);

  // 스폰(위치+heading+y) — 차량/카메라 배치
  const spawn = map.getSpawn();
  vehicle = createVehicle({ x: spawn.x, z: spawn.z, y: spawn.y, heading: spawn.heading });
  prevGear = vehicle.gear;

  // 채점 상태
  score = createScore({ totalCheckpoints: checkpoints.length, timeLimit: CHECKPOINT_TIME });

  // 미니맵(통일 데이터 소비) 생성/부착
  minimap = createMinimap(map.getMinimapData());
  document.body.appendChild(minimap.canvas);

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

  if (started && !paused && score && score.state === 'driving') updateVehicle(dt);

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
