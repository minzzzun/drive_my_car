import * as THREE from 'three';
import {
  CHUNK_SIZE, RENDER_DIST, SEG_L0, SEG_L1, SEG_L2, SEG_L3,
  terrainHeight, quantizeHeight, getSeg, heightToColorHex,
} from './terrain.js';
import {
  DEFAULT_CHECKPOINTS, generateCourseWaypoints, createRoad, placeCheckpoints,
} from './road.js';
import { buildCourse } from './render/road.js';
import { buildCar, updateCarTransform } from './render/carMesh.js';
import { createInput, onKeyDown, onKeyUp, readControls } from './input.js';
import { createVehicle, stepVehicle } from './vehicle/vehicle.js';

// ══════════════════════════════════════════════════════════════
// 상수 (지형 상수·함수는 terrain.js 에서 import)
// ══════════════════════════════════════════════════════════════
const EYE_HEIGHT = 1.2;  // 운전석 눈높이 (차량 원점 위)

// ══════════════════════════════════════════════════════════════
// 청크 생성 — PlaneGeometry + 계단형 높이 양자화
// ══════════════════════════════════════════════════════════════
const _chunkColor = new THREE.Color();   // 색상 변환용 임시 객체

function createChunk(cx, cz, seg) {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos    = geo.attributes.position.array;
  const colors = new Float32Array(pos.length);

  for (let i = 0; i < pos.length; i += 3) {
    const wx  = cx * CHUNK_SIZE + pos[i];
    const wz  = cz * CHUNK_SIZE + pos[i + 2];
    const raw = terrainHeight(wx, wz);
    // ★ 핵심: 높이를 step 단위로 반올림 → 계단형 사각 지형
    const h   = quantizeHeight(raw, seg);
    pos[i + 1] = h;
    _chunkColor.setHex(heightToColorHex(h));
    colors[i] = _chunkColor.r; colors[i + 1] = _chunkColor.g; colors[i + 2] = _chunkColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();

  const mat  = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  return { mesh, mat, seg };
}

// ══════════════════════════════════════════════════════════════
// Three.js 초기화
// ══════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.010);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 700);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sunLight = new THREE.DirectionalLight(0xfffde7, 1.3);
sunLight.position.set(300, 500, 200);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d6b3d, 0.45));

// ══════════════════════════════════════════════════════════════
// 코스(도로 + 체크포인트) 생성
// ══════════════════════════════════════════════════════════════
const courseWaypoints = generateCourseWaypoints({ count: 24, start: { x: 0, z: 0 } });
const road            = createRoad(courseWaypoints);
const checkpoints     = placeCheckpoints(road, DEFAULT_CHECKPOINTS);
const { group: courseGroup } = buildCourse(road, checkpoints);
scene.add(courseGroup);

// ══════════════════════════════════════════════════════════════
// 입력 + 시작 오버레이 (포인터 락은 커서 숨김 용도)
// ══════════════════════════════════════════════════════════════
const input   = createInput();
const overlay = document.getElementById('overlay');
let started   = false;

overlay.addEventListener('click', function() {
  started = true;
  overlay.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
});

document.addEventListener('keydown', function(e) {
  if (e.code === 'KeyF') { toggleWireframe(); return; }
  if (onKeyDown(input, e.code)) e.preventDefault();
});
document.addEventListener('keyup', function(e) { onKeyUp(input, e.code); });
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// ══════════════════════════════════════════════════════════════
// 와이어프레임 토글
// ══════════════════════════════════════════════════════════════
let wireframeOn = false;

function toggleWireframe() {
  wireframeOn = !wireframeOn;
  for (const chunk of loadedChunks.values()) chunk.mat.wireframe = wireframeOn;
  const btn = document.getElementById('wireframe-btn');
  btn.classList.toggle('active', wireframeOn);
  const label = wireframeOn ? '⬡ 와이어프레임 OFF' : '⬡ 와이어프레임 ON';
  btn.innerHTML = label + ' &nbsp;<span style="opacity:0.55;font-size:11px">[F]</span>';
}
document.getElementById('wireframe-btn').addEventListener('click', toggleWireframe);

// ══════════════════════════════════════════════════════════════
// 세계 관리 (청크 스트리밍)
// ══════════════════════════════════════════════════════════════
const loadedChunks = new Map();

function disposeChunk(chunk) {
  chunk.mesh.geometry.dispose();
  chunk.mat.dispose();
}

function updateWorld(px, pz) {
  const pcx = Math.floor(px / CHUNK_SIZE);
  const pcz = Math.floor(pz / CHUNK_SIZE);

  for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
    for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
      const cx  = pcx + dx, cz = pcz + dz;
      const key = `${cx},${cz}`;
      const seg = getSeg(cx, cz, pcx, pcz);
      const ex  = loadedChunks.get(key);

      if (!ex) {
        const chunk = createChunk(cx, cz, seg);
        chunk.polyCount = Math.floor(chunk.mesh.geometry.index.count / 3);
        if (wireframeOn) chunk.mat.wireframe = true;
        scene.add(chunk.mesh);
        loadedChunks.set(key, chunk);
      } else if (ex.seg !== seg) {
        scene.remove(ex.mesh);
        disposeChunk(ex);
        const chunk = createChunk(cx, cz, seg);
        chunk.polyCount = Math.floor(chunk.mesh.geometry.index.count / 3);
        if (wireframeOn) chunk.mat.wireframe = true;
        scene.add(chunk.mesh);
        loadedChunks.set(key, chunk);
      }
    }
  }

  const toDelete = [];
  for (const [key, chunk] of loadedChunks) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.abs(cx - pcx) > RENDER_DIST + 1 || Math.abs(cz - pcz) > RENDER_DIST + 1) {
      scene.remove(chunk.mesh);
      disposeChunk(chunk);
      toDelete.push(key);
    }
  }
  toDelete.forEach(function(k) { loadedChunks.delete(k); });
}

// ══════════════════════════════════════════════════════════════
// 차량 (1인칭 주행)
// ══════════════════════════════════════════════════════════════
const _spawn = road.waypoints[0];
const _next  = road.waypoints[1] ?? { x: _spawn.x, z: _spawn.z + 1 };
const spawnHeading = Math.atan2(_next.x - _spawn.x, _next.z - _spawn.z);
let vehicle = createVehicle({
  x: _spawn.x,
  z: _spawn.z,
  y: terrainHeight(_spawn.x, _spawn.z),
  heading: spawnHeading,
});

// 차량 메시
const car = buildCar();
scene.add(car);

const _fwd = new THREE.Vector3();

function updateVehicle(dt) {
  const controls = readControls(input);
  vehicle = stepVehicle(vehicle, controls, dt, terrainHeight);

  // 차량 메시 변환
  updateCarTransform(car, vehicle.dyn);

  // 1인칭 운전석 카메라 (운전석 위치에서 전방 주시)
  const d = vehicle.dyn;
  const fx = Math.sin(d.heading), fz = Math.cos(d.heading);
  camera.position.set(d.x + fx * 0.2, d.y + EYE_HEIGHT, d.z + fz * 0.2);
  _fwd.set(fx, -Math.sin(d.pitch) * 0.5, fz);
  camera.lookAt(
    camera.position.x + _fwd.x,
    camera.position.y + _fwd.y,
    camera.position.z + _fwd.z,
  );
}

// ══════════════════════════════════════════════════════════════
// 임시 주행 HUD (정식 RPM/기어/속도 게이지는 M8)
// ══════════════════════════════════════════════════════════════
const driveHud = document.createElement('div');
driveHud.id = 'drive-hud';
driveHud.style.cssText =
  'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);' +
  'background:rgba(0,0,0,0.6);color:#fff;padding:10px 18px;border-radius:10px;' +
  'font-family:system-ui,sans-serif;font-size:15px;text-align:center;z-index:20;pointer-events:none';
document.body.appendChild(driveHud);

function updateHUD() {
  const v = vehicle;
  const kmh = Math.abs(v.speed) * 3.6;
  const eng = !v.on ? (v.stalled ? '🔴 시동꺼짐' : '⚪ 시동꺼짐') : '🟢 ON';
  driveHud.innerHTML =
    `기어 <b>${v.gearName}</b> &nbsp;|&nbsp; ${Math.round(v.rpm)} RPM &nbsp;|&nbsp; ` +
    `${kmh.toFixed(0)} km/h &nbsp;|&nbsp; ${eng}` +
    (v.rollover ? ' &nbsp;|&nbsp; ⚠️ 전복' : '') +
    `<br><span style="opacity:.6;font-size:11px">W 액셀 · S 브레이크 · A/D 조향 · Shift 클러치 · E/Q 기어 · Enter 시동</span>`;
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
// 초기화 + 루프
// ══════════════════════════════════════════════════════════════
updateWorld(_spawn.x, _spawn.z);
camera.position.set(_spawn.x, terrainHeight(_spawn.x, _spawn.z) + EYE_HEIGHT, _spawn.z);

const clock = new THREE.Clock();
let lastCX = Infinity, lastCZ = Infinity;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started) updateVehicle(dt);

  const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
  const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
  if (pcx !== lastCX || pcz !== lastCZ) {
    updateWorld(camera.position.x, camera.position.z);
    lastCX = pcx; lastCZ = pcz;
  }

  updateHUD();
  renderer.render(scene, camera);
}

animate();
