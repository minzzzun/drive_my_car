# Seed 명세 — 수동 운전 시뮬레이션 게임

> Ouroboros SDD Seed. 이 문서는 **명세의 단일 진실 원천(SSoT)**이다. 구현/검증은 이 Seed의 ACCEPTANCE_CRITERIA를 충족해야 한다.
> 생성: 2026-06-03 · 방식: 직접 소크라테스 인터뷰(Path B, MCP 백엔드 환경오류로 폴백) · 상태: seed-ready

---

## GOAL

LOD_demo의 절차적 지형 위에 도로를 깔고, **1종 수동(5단) 자동차를 1인칭 시점으로 운전**해 순차 배치된 체크포인트를 통과하는 **운전면허 시험형 WebGL 게임**을 만든다. 클러치·브레이크·액셀과 기어 변속, 시동 꺼짐을 사실적으로 시뮬레이션하고, 위반 시 감점·게임오버하는 채점 시스템과 우상단 상공뷰 미니맵을 제공한다.

## CONSTRAINTS

- Three.js ^0.184.0 + Vite ^8.0.10, ES 모듈, `"type": "module"` (LOD_demo 스택 그대로)
- **물리 엔진 사용 금지** — 커스텀 물리(순수 벡터/스칼라 수학)로 구현 (CGs 무엔진 관례)
- 구동계/RPM/stall/채점/지형/도로 핵심 로직은 **Three.js 비의존 순수 함수**로 분리해 단위 테스트 가능해야 함
- 테스트 러너: **Vitest** (TDD: 테스트 설계 → 구현 → 그린 → 커밋)
- 코딩 스타일: camelCase 변수/함수, UPPER_SNAKE 상수, 2-space 들여쓰기, **한국어 주석**
- 1인칭 운전석 시점 (LOD_demo의 PointerLockControls 자유시점을 차량 부착 시점으로 대체)
- 기능 단위마다 `git add` + `git commit`
- 설계/완료 문서는 `mds/`에 저장하고 `mds/INDEX.md`로 목차화. 작업 진입 규약: CLAUDE.md → INDEX.md → 관련 문서 → 진행

## ACCEPTANCE_CRITERIA

- 5단 수동 변속(N-1-2-3-4-5-R) — 기어업/다운으로 단 변경, 기어비에 따른 속도-RPM 관계 반영
- 클러치/브레이크/액셀 3개 페달 입력으로 차량 구동
- **사실적 시동 꺼짐(stall)**: ① 출발 시 클러치를 너무 빨리 떼면 RPM이 아이들 이하로 죽어 stall ② 주행 중 기어 대비 속도가 너무 낮은데 클러치를 떼고 있으면 stall ③ 정지 시 클러치를 밟지 않으면 stall
- 단일 경로 도로를 LOD_demo 지형 위에 생성하고, 체크포인트 4~5개를 순차 배치
- 1인칭 운전석 시점으로 주행
- 우상단 상공뷰 미니맵에 차량 위치·도로·체크포인트 표시
- **채점**: 100점에서 시작 — 시동꺼짐 -5, 도로 이탈 -10, 경미 충돌 -10, 체크포인트 제한시간(기본 45초) 초과 -10
- **즉시 실패**: 차량 전복(rollover) 또는 대형 충돌 시 점수와 무관하게 즉시 게임오버
- **탈락**: 점수가 70점 미만이 되면 즉시 게임오버(불합격)
- **승리(합격)**: 모든 체크포인트를 통과하고 최종 점수 70점 이상 유지
- HUD에 RPM·현재 기어·속도·현재 점수·체크포인트 남은 제한시간 표시
- 핵심 순수 로직(terrain/road/engine/gearbox/dynamics/scoring)에 대한 Vitest 단위 테스트가 모두 통과

## ONTOLOGY

- **ONTOLOGY_NAME**: ManualDrivingSim
- **ONTOLOGY_DESCRIPTION**: 수동 변속 차량의 구동 상태, 코스(도로+체크포인트), 채점 세션을 표현하는 도메인 모델
- **ONTOLOGY_FIELDS**:
  - `vehicle.position`: object — 차량 월드 좌표 {x,y,z}
  - `vehicle.heading`: number — 진행 방향(yaw, rad)
  - `vehicle.roll`: number — 좌우 기울기(rad), 전복 판정용
  - `vehicle.pitch`: number — 앞뒤 기울기(rad), 전복 판정용
  - `vehicle.speed`: number — 전진 속도(m/s)
  - `vehicle.gear`: number — 현재 기어 (-1=R, 0=N, 1~5)
  - `vehicle.rpm`: number — 엔진 회전수
  - `vehicle.engineOn`: boolean — 시동 상태(꺼지면 false)
  - `vehicle.clutch`: number — 클러치 입력 0(완전 분리)~1(완전 결합)
  - `inputs.throttle`: number — 액셀 0~1
  - `inputs.brake`: number — 브레이크 0~1
  - `inputs.steer`: number — 조향 -1~1
  - `road.centerline`: array — 도로 중심선 점열
  - `road.width`: number — 도로 폭
  - `checkpoint.index`: number — 순서
  - `checkpoint.timeLimit`: number — 제한시간(초)
  - `score.value`: number — 현재 점수(100 시작)
  - `score.state`: string — 'driving' | 'passed' | 'failed'

## EVALUATION_PRINCIPLES

- `realism`:클러치·RPM·stall·기어비가 실제 수동 운전 감각과 일관되는가:0.3
- `testability`:핵심 로직이 순수 함수로 분리되어 단위 테스트로 검증되는가:0.25
- `correctness`:채점/게임오버/승리 규칙이 명세대로 정확히 동작하는가:0.25
- `style-fidelity`:CGs 코딩 관례(스택·네이밍·한국어 주석)를 따르는가:0.1
- `playability`:1인칭 주행·HUD·미니맵이 실제로 플레이 가능한가:0.1

## EXIT_CONDITIONS

- `all-green`:모든 마일스톤의 Vitest 단위 테스트 통과:npm test 전체 그린
- `playable`:npm run dev로 1인칭 수동 운전·변속·stall·채점·미니맵이 동작:수동 확인 통과
- `spec-conformance`:ACCEPTANCE_CRITERIA 전 항목 충족:체크리스트 전부 충족

## BROWNFIELD CONTEXT

- **PROJECT_TYPE**: brownfield (LOD_demo 복사 기반)
- **CONTEXT_REFERENCES**:
  - `/Users/kimminjun/Desktop/CGs/LOD_demo/src/main.js`:primary:절차적 지형·청크 LOD·1인칭 카메라·렌더 루프의 원본
  - `/Users/kimminjun/Desktop/CGs/test1/src/main.js`:reference:차량 메시(섀시+캐빈+바퀴) 구성 참고
  - `/Users/kimminjun/Desktop/CGs/CLAUDE.md`:reference:CGs 스택/스타일/셰이더 방침
- **EXISTING_PATTERNS**: ES 모듈 | requestAnimationFrame 렌더 루프 + clock.getDelta() 클램프(0.05) | 청크 스트리밍 + 거리 기반 LOD | 한국어 주석 + 2-space | `_`접두 임시 벡터 | UPPER_SNAKE 상수
- **EXISTING_DEPENDENCIES**: three ^0.184.0 | vite ^8.0.10

---

## 확정된 게임 디자인 결정 (인터뷰 결과)

| 항목 | 결정 |
|---|---|
| 기어 | 5단 + 후진(R) + 중립(N) |
| 코스 | 단일 경로, 체크포인트 4~5개 순차 통과 |
| 조작 키 | (잠정) W/S=액셀·브레이크, A/D=조향, Shift=클러치, E/Q=기어↑↓ — 플레이하며 조정 |
| 시동꺼짐 | 사실적(반클러치 구간 + RPM 모델) |
| 감점 배점 | 면허식: 시동꺼짐 -5, 도로이탈 -10, 경미충돌 -10, 시간초과 -10 |
| 즉시 실패 | 전복 / 대형 충돌 |
| 합격 기준 | 100점 시작, 70점 미만 탈락 |
| 제한시간 | 체크포인트별 개별 제한(기본 45초), 초과 시 감점 후 계속 |
| 승리 조건 | 모든 체크포인트 통과 + 70점 이상 유지 |

## 구현 튜닝 영역 (실행 단계에서 결정 — 명세를 바꾸지 않음)

- 엔진 RPM 정확 수치(아이들 RPM, 레드라인, 기어비 표)
- 전복 판정 각도 임계(roll/pitch)와 지속시간
- 도로 폭, 체크포인트 정확 개수(4 vs 5)·좌표, 코스 길이
- 차량 가속/제동/조향 감도 상수
