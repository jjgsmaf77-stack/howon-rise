# Railway 배포 가이드 (입력관리 v2)

## A. Railway 대시보드로 배포 (권장 — 가장 간단)

1. https://railway.app 로그인 (GitHub 계정)
2. **New Project → Deploy from GitHub repo → `jjgsmaf77-stack/howon-rise`**
3. 생성된 서비스 → **Settings → Root Directory = `admin-app`** 입력 후 저장
4. 같은 프로젝트에 **New → Database → Add PostgreSQL** (자동으로 `DATABASE_URL` 주입됨)
5. 서비스 → **Variables** 탭에서 아래 3개 추가:
   - `SESSION_SECRET` = (긴 무작위 문자열 — 예: 아래 명령 결과)
   - `ADMIN_INITIAL_PW` = (강한 초기 비밀번호)
   - `COOKIE_SECURE` = `1`
6. **Settings → Networking → Generate Domain** → `xxx.up.railway.app` 주소 발급
7. 배포 완료 후 그 주소로 접속 → admin / (설정한 비밀번호) → **즉시 비밀번호 변경**

SESSION_SECRET 생성:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## B. Railway CLI로 배포

```bash
railway login                      # 브라우저 인증 (계정 소유자만 가능)
cd C:\Users\홍인기\dev\howon-rise\admin-app
railway init                       # 새 프로젝트 생성
railway add --database postgres    # Postgres 추가
railway variables --set SESSION_SECRET=<hex64> --set ADMIN_INITIAL_PW=<pw> --set COOKIE_SECURE=1
railway up                         # 배포
railway domain                     # 공개 도메인 발급
```

## 배포 후

발급된 주소를 알려주면 대시보드 `admin/index.html`의 `ADMIN_URL`에 넣어 커밋 →
성과관리 플랫폼의 "입력관리" 버튼이 실제 시스템으로 자동 연결됩니다.

## 보안 체크리스트
- [x] HTTPS (Railway 기본) + `COOKIE_SECURE=1`
- [x] SESSION_SECRET 무작위 지정
- [x] 초기 비밀번호 변경 (admin1234 금지)
- [x] 로그인 실패 8회/5분 차단 (무차별 대입 방어)
- [x] 비밀번호 PBKDF2 해싱 / 권한 분리 / audit log
- [ ] (후속) CSRF 토큰, 담당자별 계정 발급
