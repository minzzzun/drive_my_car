# 🌍 Open World LOD Demo

**Three.js**로 구현한 오픈 월드 지형 스트리밍 + LOD(Level of Detail) 체험 데모.

플레이어가 이동할수록 주변 청크가 동적으로 생성·삭제되며,  
거리에 따라 지형의 세밀함(LOD 레벨)이 자동으로 바뀝니다.

---

## 🖥️ 실행 방법

### 사전 준비
- [Node.js](https://nodejs.org/) 설치 필요 (v18 이상 권장)

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone <repo-url>
cd LOD_demo

# 2. 패키지 설치 (처음 한 번만)
npm install

# 3. 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 화면을 클릭하면 시작됩니다.

---

## 🎮 조작법

| 키 | 동작 |
|----|------|
| `W A S D` | 이동 |
| `마우스 이동` | 시점 회전 |
| `Space` | 점프 |
| `우클릭` | 비행 모드 ON/OFF 토글 |
| `Space` (비행 중) | 위로 상승 |
| `Shift` (비행 중) | 아래로 하강 |
| `F` | 와이어프레임 토글 |
| `ESC` | 마우스 잠금 해제 (메뉴로) |

---

## 📐 LOD 구현 방식

### LOD란?
> Level of Detail — 가까운 것은 정밀하게, 먼 것은 대충 그려서 성능을 아끼는 기법

### 이 데모의 LOD 방식

플레이어와의 거리(청크 단위)에 따라 **PlaneGeometry의 세그먼트 수**와 **높이 양자화 단계**가 달라집니다.

| LOD 레벨 | 거리 | 세그먼트 수 | 계단 크기 | 모습 |
|----------|------|------------|----------|------|
| L0 | 발 밑 (0칸) | 64분할 | 1단위 | 매우 세밀 |
| L1 | 1칸 밖 | 32분할 | 2단위 | 세밀 |
| L2 | 2칸 밖 | 8분할 | 8단위 | 계단 뚜렷 |
| L3 | 3칸+ 밖 | 4분할 | 16단위 | 큼직한 블록 |

```
계단 양자화 핵심 코드:
h = Math.round(raw / step) * step
→ 높이를 step 단위로 반올림 → 계단형 지형
```

### 청크 스트리밍
- 지형을 `64×64` 단위의 청크로 분할
- 플레이어 주변 반경 4칸 청크만 로드
- 청크 경계를 넘을 때만 `updateWorld()` 호출 (매 프레임 아님 → 성능 절약)
- 사라진 청크는 `geometry.dispose()` + `material.dispose()` 로 GPU 메모리 해제

---

## 📁 프로젝트 구조

```
LOD_demo/
├── index.html        # HUD, 오버레이, 버튼 등 UI
├── src/
│   ├── main.js       # 게임 전체 로직 (Three.js LOD + 청크 스트리밍)
│   └── style.css     # UI 스타일
└── package.json      # Vite + Three.js 의존성
```

---

## 🛠️ 기술 스택

| 항목 | 내용 |
|------|------|
| 렌더링 | [Three.js](https://threejs.org/) r0.184 |
| 빌드 도구 | [Vite](https://vitejs.dev/) v8 |
| 지형 생성 | Value Noise (외부 라이브러리 없음) |
| 카메라 조작 | `PointerLockControls` (1인칭 FPS) |
| 노이즈 기법 | Domain Warping + Ridged Noise + 다중 옥타브 |

---

## 🔧 주요 상수 (src/main.js에서 수정 가능)

```javascript
const CHUNK_SIZE  = 64;   // 청크 한 변 크기 (단위)
const RENDER_DIST = 4;    // 렌더링 반경 (청크 수)
const SEG_L0      = 64;  // 최고 LOD 세그먼트 수
const SEG_L3      = 4;   // 최저 LOD 세그먼트 수
const MOVE_SPEED  = 15;  // 이동 속도
const JUMP_FORCE  = 10;  // 점프 세기
```

---

## 📖 과제 배경

컴퓨터 그래픽스 수업 LOD/Tessellation 개념 실습 데모.  
Three.js의 `PlaneGeometry` + 높이 양자화로 Tessellation 효과를 시뮬레이션.
