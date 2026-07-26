# 호원RISE 성과 입력관리 v2 (admin-app)

사업단 담당자용 실적 입력·수정 시스템. FastAPI + SQLModel + Jinja2 (빌드 단계 없음).
옵시디언 성과관리 볼트의 3층 구조(프로그램 카드 → 사업단 원장 → 종합)와 1:1 대응.

## 로컬 실행

```
cd admin-app
pip install -r requirements.txt
uvicorn app.main:app --port 8090
```

- 첫 실행 시 SQLite(`data/admin.db`) 생성 + 시드(8개 사업단, 지표 48개, 맛잡고 실적 2건)
- 초기 계정: `admin` / `admin1234` (환경변수 `ADMIN_INITIAL_PW`로 변경 가능) — **배포 후 즉시 비밀번호 변경**

## 주요 기능

- 사업단별 프로그램 카드 CRUD — 표준 서식(프로그램명/유형/교육기관/참여학생/교육시간/만족도 3종 세트/예산/지표매핑/증빙)
- 지출 기록(B안): 지급요청 공문 1건=1행, 검증 토글(🔴/🟢), 음수(환수) 허용
- 검증 상태 워크플로: 🔴추출완료 → 🟡검토완료 → 🟢입력반영
- 성과지표 '26 목표 대비 + 수기 보정 입력
- 계정: 담당자는 자기 사업단만 수정 (관리자 전체)
- 변경이력(audit log) 전건 기록
- `/api/export/data2` — 대시보드 data2.js와 동일 형태 JSON (집계 규칙 동일: 만족도 가중평균·척도 정규화, '확인' 태그 제외)

## Railway 배포

1. Railway 새 프로젝트 → GitHub 저장소 `jjgsmaf77-stack/howon-rise` 연결
2. Settings → Root Directory = `admin-app`
3. Variables: `SESSION_SECRET`(무작위 문자열), `ADMIN_INITIAL_PW`, (Postgres 쓰면 `DATABASE_URL` 자동)
4. Postgres 플러그인 추가 권장 (없으면 SQLite — 재배포 시 데이터 소실 주의, Volume 필요)
5. 배포 후 도메인을 대시보드 `admin/index.html` 리다이렉트 대상으로 교체

## 옵시디언 볼트와의 관계

- 인박스 PDF 분석(Claude) → 볼트 카드 생성 → 확정분을 이 시스템에 입력(또는 API로 반영)
- 담당자 웹 수정분은 변경이력으로 추적 → 주기적으로 볼트와 대조
- 대시보드는 `/api/export/data2`를 소스로 쓸 수 있음 (build_data2.js 볼트 방식과 택1)
