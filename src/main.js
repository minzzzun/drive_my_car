import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// ══════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════
const CHUNK_SIZE    = 64;
const RENDER_DIST   = 4;

// LOD = 세그먼트 수 (많을수록 고해상도 / 계단 단위 = CHUNK_SIZE/seg)
const SEG_L0 = 64;  // d=0: 1단위 계단 (발 밑 — 매우 세밀)
const SEG_L1 = 32;  // d=1: 2단위 계단
const SEG_L2 = 8;   // d=2: 8단위 큰 계단 — 사각형 뚜렷
const SEG_L3 = 4;   // d≥3: 16단위 — 멀리서 보면 큼직한 블록

const PLAYER_HEIGHT = 1.8;
const MOVE_SPEED    = 15;
const JUMP_FORCE    = 10;
const GRAVITY       = -25;

// ══════════════════════════════════════════════════════════════
// 노이즈 (Value Noise, 외부 라이브러리 없음)
// ══════════════════════════════════════════════════════════════
function rand2D(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(rand2D(ix,     iy    ), rand2D(ix + 1, iy    ), ux),
    lerp(rand2D(ix,     iy + 1), rand2D(ix + 1, iy + 1), ux),
    uy
  );
}

function ridgedNoise(x, y) {
  const n = smoothNoise(x, y) * 2 - 1;
  return 1 - Math.abs(n);
}

// 다이나믹 지형 (산 최대 ~75, 계곡 깊음)
function terrainHeight(wx, wz) {
  const warpX = (smoothNoise(wx * 0.0018 + 1.7,  wz * 0.0018)       - 0.5) * 180;
  const warpZ = (smoothNoise(wx * 0.0018,          wz * 0.0018 + 4.3) - 0.5) * 180;
  const wx2 = wx + warpX, wz2 = wz + warpZ;
  const continent = smoothNoise(wx2 * 0.0028, wz2 * 0.0028);
  const ridge     = ridgedNoise(wx2 * 0.0055, wz2 * 0.0055);
  const hill      = smoothNoise(wx2 * 0.018,  wz2 * 0.018);
  let h = continent * 22
        + ridge * Math.pow(continent, 0.4) * 65
        + hill * 14
        + smoothNoise(wx * 0.055, wz * 0.055) * 4
        - 20;
  return h;
}

// ══════════════════════════════════════════════════════════════
// 높이 → 색상 (8단계)
// ══════════════════════════════════════════════════════════════
const _col = new THREE.Color();

function heightToRGB(h) {
  if      (h < -6)  _col.setHex(0x14408a);
  else if (h <  0)  _col.setHex(0x2e7abf);
  else if (h <  1)  _col.setHex(0xd4bc7d);
  else if (h <  9)  _col.setHex(0x2d8a28);
  else if (h < 20)  _col.setHex(0x3a6b22);
  else if (h < 35)  _col.setHex(0x7a6b52);
  else if (h < 50)  _col.setHex(0x8a8080);
  else               _col.setHex(0xfafafa);
  return [_col.r, _col.g, _col.b];
}

// ══════════════════════════════════════════════════════════════
// 청크 생성 — PlaneGeometry + 계단형 높이 양자화
// ══════════════════════════════════════════════════════════════
function createChunk(cx, cz, seg) {
  const step = CHUNK_SIZE / seg;  // 계단 한 칸 크기 (사각형 단위)

  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos    = geo.attributes.position.array;
  const colors = new Float32Array(pos.length);

  for (let i = 0; i < pos.length; i += 3) {
    const wx  = cx * CHUNK_SIZE + pos[i];
    const wz  = cz * CHUNK_SIZE + pos[i + 2];
    const raw = terrainHeight(wx, wz);
    // ★ 핵심: 높이를 step 단위로 반올림 → 계단형 사각 지형
    const h   = Math.round(raw / step) * step;
    pos[i + 1] = h;
    const [r, g, b] = heightToRGB(h);
    colors[i] = r; colors[i + 1] = g; colors[i + 2] = b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();   // PlaneGeometry가 알아서 정상 계산

  const mat  = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  return { mesh, mat, seg };
}

// ══════════════════════════════════════════════════════════════
// LOD 결정
// ══════════════════════════════════════════════════════════════
function getSeg(cx, cz, pcx, pcz) {
  const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
  if (d === 0) return SEG_L0;
  if (d === 1) return SEG_L1;
  if (d === 2) return SEG_L2;
  return           SEG_L3;
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
// PointerLockControls
// ══════════════════════════════════════════════════════════════
const controls = new PointerLockControls(camera, renderer.domElement);
const overlay  = document.getElementById('overlay');

controls.addEventListener('lock',   function() { overlay.style.display = 'none'; });
controls.addEventListener('unlock', function() { overlay.style.display = 'flex'; });
overlay.addEventListener('click',   function() { controls.lock(); });

// ══════════════════════════════════════════════════════════════
// 입력 처리
// ══════════════════════════════════════════════════════════════
const keys = { w: false, s: false, a: false, d: false, space: false, shift: false };
let velY = 0, canJump = false;
let flyMode = false;

function toggleFly() {
  flyMode = !flyMode;
  velY = 0;
  document.getElementById('fly-badge').style.display = flyMode ? 'block' : 'none';
}

document.addEventListener('mousedown', function(e) {
  if (e.button === 2 && controls.isLocked) toggleFly();
});
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

document.addEventListener('keydown', function(e) {
  switch (e.code) {
    case 'KeyW':     keys.w     = true;  break;
    case 'KeyS':     keys.s     = true;  break;
    case 'KeyA':     keys.a     = true;  break;
    case 'KeyD':     keys.d     = true;  break;
    case 'ShiftLeft':
    case 'ShiftRight': keys.shift = true; break;
    case 'Space':
      keys.space = true;
      if (!flyMode && canJump) { velY = JUMP_FORCE; canJump = false; }
      e.preventDefault();
      break;
    case 'KeyF':
      toggleWireframe();
      break;
  }
});
document.addEventListener('keyup', function(e) {
  switch (e.code) {
    case 'KeyW':     keys.w     = false; break;
    case 'KeyS':     keys.s     = false; break;
    case 'KeyA':     keys.a     = false; break;
    case 'KeyD':     keys.d     = false; break;
    case 'ShiftLeft':
    case 'ShiftRight': keys.shift = false; break;
    case 'Space':    keys.space = false; break;
  }
});

// ══════════════════════════════════════════════════════════════
// 와이어프레임 토글
// ══════════════════════════════════════════════════════════════
let wireframeOn = false;

function toggleWireframe() {
  wireframeOn = !wireframeOn;
  for (const chunk of loadedChunks.values()) {
    chunk.mat.wireframe = wireframeOn;
  }
  const btn = document.getElementById('wireframe-btn');
  btn.classList.toggle('active', wireframeOn);
  const label = wireframeOn ? '⬡ 와이어프레임 OFF' : '⬡ 와이어프레임 ON';
  btn.innerHTML = label + ' &nbsp;<span style="opacity:0.55;font-size:11px">[F]</span>';
}
document.getElementById('wireframe-btn').addEventListener('click', toggleWireframe);

// ══════════════════════════════════════════════════════════════
// 세계 관리
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
// 플레이어
// ══════════════════════════════════════════════════════════════
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up    = new THREE.Vector3(0, 1, 0);

function updatePlayer(dt) {
  if (!controls.isLocked) return;

  const FLY_SPEED = MOVE_SPEED * 1.8;

  if (flyMode) {
    camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, _up);
    if (keys.w) camera.position.addScaledVector(_fwd,    FLY_SPEED * dt);
    if (keys.s) camera.position.addScaledVector(_fwd,   -FLY_SPEED * dt);
    if (keys.a) camera.position.addScaledVector(_right, -FLY_SPEED * dt);
    if (keys.d) camera.position.addScaledVector(_right,  FLY_SPEED * dt);
    if (keys.space) camera.position.y += FLY_SPEED * dt;
    if (keys.shift) camera.position.y -= FLY_SPEED * dt;
  } else {
    camera.getWorldDirection(_fwd);
    _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, _up);
    if (keys.w) camera.position.addScaledVector(_fwd,    MOVE_SPEED * dt);
    if (keys.s) camera.position.addScaledVector(_fwd,   -MOVE_SPEED * dt);
    if (keys.a) camera.position.addScaledVector(_right, -MOVE_SPEED * dt);
    if (keys.d) camera.position.addScaledVector(_right,  MOVE_SPEED * dt);
    velY += GRAVITY * dt;
    camera.position.y += velY * dt;
    const ground = terrainHeight(camera.position.x, camera.position.z) + PLAYER_HEIGHT;
    if (camera.position.y < ground) { camera.position.y = ground; velY = 0; canJump = true; }
  }
}

// ══════════════════════════════════════════════════════════════
// HUD
// ══════════════════════════════════════════════════════════════
const hudPos    = document.getElementById('hud-pos');
const hudChunk  = document.getElementById('hud-chunk');
const hudChunks = document.getElementById('hud-chunks');
const hudPoly   = document.getElementById('hud-poly');
const hudLod    = document.getElementById('hud-lod');

function updateHUD() {
  const p = camera.position;
  hudPos.textContent    = `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
  const pcx = Math.floor(p.x / CHUNK_SIZE);
  const pcz = Math.floor(p.z / CHUNK_SIZE);
  hudChunk.textContent  = `(${pcx}, ${pcz})`;
  hudChunks.textContent = loadedChunks.size;

  let poly = 0, l0 = 0, l1 = 0, l2 = 0, l3 = 0;
  for (const chunk of loadedChunks.values()) {
    poly += chunk.polyCount;
    if      (chunk.seg === SEG_L0) l0++;
    else if (chunk.seg === SEG_L1) l1++;
    else if (chunk.seg === SEG_L2) l2++;
    else                           l3++;
  }
  hudPoly.textContent = poly.toLocaleString();
  hudLod.textContent  = `🟢${l0}(1단) 🟡${l1}(2단) 🟠${l2}(8단) 🔴${l3}(16단)`;
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
updateWorld(0, 0);
camera.position.set(0, terrainHeight(0, 0) + PLAYER_HEIGHT, 0);

const clock    = new THREE.Clock();
let lastCX = Infinity, lastCZ = Infinity;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);

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
