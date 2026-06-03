# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **수동 운전 시뮬레이션 게임** — LOD_demo 절차적 지형 위에서 1종 수동 자동차를 1인칭으로 운전해 체크포인트를 통과하는 운전면허 시험형 WebGL 게임.

---

## ⚠️ 작업 진입 규약 (반드시 먼저)

무엇이든 작업하기 전에 **이 순서**를 따른다:

1. **`CLAUDE.md`** (이 문서) — 전체 규칙·명령·스타일 확인
2. **`mds/INDEX.md`** — 문서 목차에서 관련 항목 탐색
3. **관련 `.md` 문서** (`mds/spec/`, `mds/design/`, `mds/done/`) — 해당 기능의 명세·설계·완료 노트 확인
4. 그 후 작업 진행

명세의 단일 진실 원천(SSoT)은 **`mds/spec/seed.md`**. 구현은 그 ACCEPTANCE_CRITERIA를 충족해야 한다.

## 개발 방식

- **SDD**: `mds/spec/seed.md`의 명세를 기준으로 개발. 명세와 충돌하면 명세 우선.
- **TDD**: 기능마다 `기획 → 테스트 설계 → 구현 → 단위 테스트 통과` 사이클.
- **기능 단위 커밋**: 기능 하나를 완성(테스트 그린)할 때마다 `git add` + `git commit`.
- **문서화**: 새 기능 설계는 `mds/design/<feature>.md`, 완료 노트는 `mds/done/`에 남기고 `mds/INDEX.md`를 갱신.

## 명령어

```bash
npm install        # 의존성 설치 (three, vite, vitest)
npm run dev        # Vite 개발 서버 (localhost:5173) — 1인칭 주행 수동 확인
npm run build      # 프로덕션 번들 → dist/
npm test           # Vitest 단위 테스트 전체 실행
npm test -- <파일>  # 특정 테스트 파일만 실행 (예: npm test -- engine)
npm run test:watch # watch 모드 (TDD 중 사용)
```

## 아키텍처

LOD_demo의 모놀리식 `src/main.js`를 **테스트 가능한 단위로 분해**한다.

**순수 로직 (Three.js 비의존 · Vitest 단위 테스트 대상):**
- `src/terrain.js` — 노이즈 + `terrainHeight(wx,wz)` + LOD 청크 로직 (LOD_demo에서 추출, 결정론적)
- `src/road.js` — 도로 중심선 생성, 체크포인트 배치, `isOnRoad(x,z)` / 중심선까지 거리
- `src/vehicle/engine.js` — 엔진 RPM·클러치 결합·**stall 판정** (반클러치 + RPM 모델)
- `src/vehicle/gearbox.js` — 기어비(N/1~5/R), 변속, 기어-속도 정합
- `src/vehicle/dynamics.js` — 구동력→가속, 조향, 위치/heading 적분, roll·pitch(**전복 판정**)
- `src/vehicle/vehicle.js` — engine+gearbox+dynamics 조합 상태기계 `step(dt, inputs)`
- `src/scoring.js` — 감점 누적, 게임오버/승리 규칙, 체크포인트 타이머

**렌더/통합 (Three.js 의존 · 수동·통합 검증):**
- `src/render/scene.js` — Scene/카메라/조명 (LOD_demo 패턴)
- `src/render/carMesh.js` — 차량 메시 (test1 섀시+캐빈+바퀴 참조)
- `src/render/minimap.js` — 우상단 상공뷰 미니맵
- `src/render/hud.js` — RPM/기어/속도/점수/타이머 HUD
- `src/input.js` — 키 매핑 (클러치/브레이크/액셀/기어↑↓/조향)
- `src/main.js` — 전체 결선 + 렌더 루프 (1인칭 카메라를 차량에 부착)

> 순수 로직은 `import * as THREE` 하지 않는다. {x,y,z} 같은 평범한 객체/숫자만 입출력해 노드 환경에서 그대로 테스트한다. THREE 변환은 렌더 레이어에서만.

## 코딩 스타일 (CGs 패밀리 관례)

- ES 모듈, camelCase 변수/함수, **UPPER_SNAKE 상수**, `_`접두 임시 벡터
- **2-space 들여쓰기, 한국어 주석**
- 렌더 루프: `requestAnimationFrame` + `Math.min(clock.getDelta(), 0.05)` 클램프
- 셰이더가 필요하면 인라인 GLSL `#version 300 es`

## 핵심 게임 규칙 (요약 — 상세는 `mds/spec/seed.md`)

- 기어: 5단 + R + N / 페달: 클러치·브레이크·액셀
- 시동 꺼짐: 출발 시 클러치 급조작 / 주행 중 저RPM / 정지 시 클러치 미사용
- 채점: 100점 시작, 시동꺼짐 -5, 도로이탈/경미충돌/시간초과 각 -10
- 즉시 실패: 전복 / 대형 충돌 · 탈락: 70점 미만 · 승리: 전 체크포인트 통과 + 70점 이상
- 체크포인트 4~5개 순차, 개별 제한시간(기본 45초)
