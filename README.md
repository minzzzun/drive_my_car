# 🚗 1종 수동 운전 시험 (WebGL)

LOD_demo의 절차적 지형 위에서 **1종 수동(5단) 자동차를 1인칭으로 운전**해 체크포인트를 순서대로 통과하는 운전면허 시험형 게임. 실제 수동 운전처럼 **클러치·브레이크·액셀 + 기어 변속 + 시동 꺼짐(stall)**을 시뮬레이션하고, 위반 시 감점·게임오버한다.

---

## 🖥️ 실행

```bash
npm install      # 의존성 설치 (three, vite, vitest)
npm run dev      # 개발 서버 → http://localhost:5173 (클릭하여 시작)
npm run build    # 프로덕션 번들
npm test         # 단위 테스트 (Vitest) 전체 실행
```

## 🎮 조작법

| 키 | 동작 |
|----|------|
| `Enter` | 시동 (중립 또는 클러치 밟은 상태에서) |
| `W` | 액셀 |
| `S` | 브레이크 |
| `A` / `D` | 좌/우 조향 |
| `Shift`(홀드) | 클러치 |
| `E` / `Q` | 기어 ↑ / ↓ (R-N-1-2-3-4-5) |
| `F` | 와이어프레임 토글 |

**출발 요령**: `Enter`로 시동 → `Shift`(클러치) 밟은 채 `E`로 1단 → 클러치를 천천히 떼면서(반클러치) `W`로 액셀. 너무 급하게 떼면 시동이 꺼진다.

## 📊 규칙

- **100점 시작.** 시동꺼짐 −5, 도로 이탈 −10, 경미 충돌 −10, 체크포인트 제한시간(45초) 초과 −10.
- **즉시 실패**: 차량 전복(대형사고). **탈락**: 점수 70점 미만.
- **합격**: 모든 체크포인트 통과 + 70점 이상 유지.
- 우상단 **상공뷰 미니맵**에 도로·체크포인트·차량 위치 표시.

## 🏗️ 아키텍처

순수 로직(Three.js 비의존, 단위 테스트 대상)과 렌더 레이어를 분리.

| 모듈 | 역할 |
|------|------|
| `src/terrain.js` | 절차적 지형 높이·LOD·색상 |
| `src/road.js` | 도로 중심선·체크포인트·`isOnRoad` |
| `src/vehicle/engine.js` | 엔진 RPM·클러치·시동 꺼짐 |
| `src/vehicle/gearbox.js` | 기어비·변속·속도↔RPM |
| `src/vehicle/dynamics.js` | 가속·조향·위치 적분·전복 판정 |
| `src/vehicle/vehicle.js` | 위 셋을 묶은 차량 상태기계 |
| `src/scoring.js` | 감점·게임오버·승리·타이머 |
| `src/input.js` | 키 → controls 매핑 |
| `src/render/*` | scene/road/carMesh/minimap/hud (Three.js·DOM) |
| `src/main.js` | 결선 + 렌더 루프 + 1인칭 카메라 |

설계/명세 문서는 `mds/` 참고 (`mds/INDEX.md`가 목차, `mds/spec/seed.md`가 명세 SSoT).

## 🛠️ 기술 스택

Three.js r0.184 · Vite v8 · ES 모듈 · Vitest · 커스텀 물리(물리 엔진 없음).

## 🧪 테스트

```bash
npm test                # 전체 (terrain/road/engine/gearbox/dynamics/vehicle/scoring/input/minimap/hud)
npm test -- engine      # 특정 모듈만
npm run test:watch      # watch (TDD)
```

## 📖 배경

LOD_demo(컴퓨터 그래픽스 수업 지형 스트리밍 데모)를 기반으로, Ouroboros SDD(명세 주도) + TDD 워크플로우로 개발.
