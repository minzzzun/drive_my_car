# 📚 문서 목차 (INDEX)

> 작업 진입 규약: **CLAUDE.md → 이 INDEX → 관련 문서 → 진행**. 새 문서를 추가하면 여기에 한 줄로 등록한다.

## 명세 (spec) — SSoT
- [seed.md](spec/seed.md) — Ouroboros Seed 명세. GOAL·제약·ACCEPTANCE_CRITERIA·온톨로지·확정된 게임 디자인 결정.

## 설계 (design)
- _(아직 없음 — 각 마일스톤 시작 시 `design/<feature>.md` 추가)_

## 완료 노트 (done)
- [m0-scaffold.md](done/m0-scaffold.md) — M0 스캐폴드: Vitest 추가, 앱 빌드/테스트 검증.

## 진행 현황 (마일스톤)
| # | 마일스톤 | 상태 | 문서 |
|---|---|---|---|
| M-S | Ouroboros 인터뷰 → Seed 명세 | ✅ 완료 | [spec/seed.md](spec/seed.md) |
| M0 | 프로젝트 스캐폴드 (Vite+Three+Vitest, 1인칭 자유시점) | ✅ 완료 | [done/m0-scaffold.md](done/m0-scaffold.md) |
| M1 | terrain.js 추출 + 테스트 | 🔜 진행중 | — |
| M2 | road.js 도로/체크포인트 + 테스트 | ⬜ | — |
| M3 | engine.js + gearbox.js 구동계 + 테스트 | ⬜ | — |
| M4 | dynamics.js + vehicle.js 동역학 + 테스트 | ⬜ | — |
| M5 | input.js + 1인칭 운전석 카메라 | ⬜ | — |
| M6 | carMesh.js + 주행 통합 | ⬜ | — |
| M7 | scoring.js 감점/게임오버 + 테스트 | ⬜ | — |
| M8 | minimap.js + hud.js | ⬜ | — |
| M9 | 마감 + 검증 | ⬜ | — |
