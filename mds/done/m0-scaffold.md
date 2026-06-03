# M0 — 프로젝트 스캐폴드 (완료)

## 한 일
- LOD_demo를 `driving_game`으로 복사(소스만, node_modules/.git/dist 제외)하고 git 저장소 신규 초기화.
- `package.json`: 이름 `driving-game`으로 변경, **Vitest** devDependency + `test`/`test:watch` 스크립트 추가.
- `tests/smoke.test.js`: 러너 동작 확인용 스모크 테스트.
- `mds/` 문서 구조(spec/design/done) + `CLAUDE.md` + `INDEX.md` 작성.

## 검증
- `npm install` → 61 패키지 설치 성공.
- `npm test` → 스모크 1건 통과 (Vitest v3.2.6).
- `npm run build` → Vite 빌드 성공 (복사한 LOD_demo 앱 정상 동작 확인).

## 현재 상태
- `src/main.js`는 아직 LOD_demo 원본(1인칭 자유시점 + 청크 LOD). M1부터 테스트 가능 모듈로 분해 시작.

## 다음
- M1: `terrain.js` 추출 + 결정론적 높이/LOD 단위 테스트.
