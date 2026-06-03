# 📚 문서 목차 (INDEX)

> 작업 진입 규약: **CLAUDE.md → 이 INDEX → 관련 문서 → 진행**. 새 문서를 추가하면 여기에 한 줄로 등록한다.

## 명세 (spec) — SSoT
- [seed.md](spec/seed.md) — Ouroboros Seed 명세. GOAL·제약·ACCEPTANCE_CRITERIA·온톨로지·확정된 게임 디자인 결정.

## 설계 (design)
- [terrain.md](design/terrain.md) — terrain.js 순수 모듈 설계(노이즈·높이·LOD·색상).
- [road.md](design/road.md) — road.js 순수 기하 설계(중심선·체크포인트·isOnRoad).
- [drivetrain.md](design/drivetrain.md) — engine.js + gearbox.js 설계(RPM·클러치·stall·기어비).

## 완료 노트 (done)
- [m0-scaffold.md](done/m0-scaffold.md) — M0 스캐폴드: Vitest 추가, 앱 빌드/테스트 검증.
- [m1-terrain.md](done/m1-terrain.md) — M1 terrain.js 추출 + 단위 테스트 13건, main.js 중복 제거.
- [m2-road.md](done/m2-road.md) — M2 road.js + 도로/체크포인트 렌더, 단위 테스트 22건.
- [m3-drivetrain.md](done/m3-drivetrain.md) — M3 engine.js+gearbox.js, 단위 테스트 23건(stall 시나리오 포함).

## 진행 현황 (마일스톤)
| # | 마일스톤 | 상태 | 문서 |
|---|---|---|---|
| M-S | Ouroboros 인터뷰 → Seed 명세 | ✅ 완료 | [spec/seed.md](spec/seed.md) |
| M0 | 프로젝트 스캐폴드 (Vite+Three+Vitest, 1인칭 자유시점) | ✅ 완료 | [done/m0-scaffold.md](done/m0-scaffold.md) |
| M1 | terrain.js 추출 + 테스트 | ✅ 완료 | [done/m1-terrain.md](done/m1-terrain.md) |
| M2 | road.js 도로/체크포인트 + 테스트 | ✅ 완료 | [done/m2-road.md](done/m2-road.md) |
| M3 | engine.js + gearbox.js 구동계 + 테스트 | ✅ 완료 | [done/m3-drivetrain.md](done/m3-drivetrain.md) |
| M4 | dynamics.js + vehicle.js 동역학 + 테스트 | 🔜 진행중 | — |
| M5 | input.js + 1인칭 운전석 카메라 | ⬜ | — |
| M6 | carMesh.js + 주행 통합 | ⬜ | — |
| M7 | scoring.js 감점/게임오버 + 테스트 | ⬜ | — |
| M8 | minimap.js + hud.js | ⬜ | — |
| M9 | 마감 + 검증 | ⬜ | — |
