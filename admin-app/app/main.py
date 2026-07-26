# 호원RISE 성과 입력관리 v2 — FastAPI 단일 서비스 (서버렌더링)
# 실행: uvicorn app.main:app --port 8090   (admin-app/ 디렉터리에서)
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from sqlmodel import SQLModel, Session, create_engine, select

from .models import (Division, Indicator, Program, Spending, User, AuditLog,
                     STATUS_FLOW, PROGRAM_CATEGORIES, BUDGET_ITEMS, TANKER, EXEC_TYPES, now_utc)
from .auth import hash_password, verify_password
from . import seed as seed_mod
from . import aggregate as agg

BASE = Path(__file__).resolve().parent.parent
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE / 'data' / 'admin.db'}")
if DATABASE_URL.startswith("postgres://"):  # Railway 구형 스킴 보정
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
IS_SQLITE = DATABASE_URL.startswith("sqlite")
if IS_SQLITE:
    (BASE / "data").mkdir(exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if IS_SQLITE else {})

# 세션 서명 키: 환경변수 필수. 미설정 시 매 기동마다 무작위 생성(하드코딩 키 위조 방지).
# 무작위 키는 재기동 시 기존 세션을 무효화하므로(재로그인 필요), 운영에서는 SESSION_SECRET를 반드시 지정.
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_hex(32)
    print("⚠️  SESSION_SECRET 미설정 — 임시 무작위 키 사용(재기동 시 재로그인 필요). 운영 배포 전 환경변수 지정 권장.")
# 대시보드 내보내기 토큰: 설정 시 /api/export/data2를 ?key=로 공개 허용, 미설정 시 로그인 필수.
EXPORT_TOKEN = os.environ.get("EXPORT_TOKEN")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        seed_mod.seed(s)
    yield


app = FastAPI(title="호원RISE 성과 입력관리", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET,
                   https_only=COOKIE_SECURE, same_site="lax")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")

STATUS_ICON = {"추출완료": "🔴", "검토완료": "🟡", "입력반영": "🟢"}
templates.env.globals.update(STATUS_ICON=STATUS_ICON, STATUS_FLOW=STATUS_FLOW, CATEGORIES=PROGRAM_CATEGORIES,
                             BUDGET_ITEMS=BUDGET_ITEMS, TANKER=TANKER, EXEC_TYPES=EXEC_TYPES)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # 인증 리다이렉트(307 + Location)는 그대로 리다이렉트 처리
    loc = (exc.headers or {}).get("Location") if exc.headers else None
    if loc:
        return RedirectResponse(loc, status_code=exc.status_code)
    # 그 외 4xx/5xx는 간단한 안내 페이지 (입력 폼 검증 오류 등)
    msg = exc.detail if isinstance(exc.detail, str) else "요청을 처리할 수 없습니다."
    html = templates.get_template("error.html").render(request=request, code=exc.status_code, message=msg)
    return HTMLResponse(html, status_code=exc.status_code)


def db():
    with Session(engine) as s:
        yield s


# ---------- 인증/권한 ----------
def current_user(request: Request, s: Session) -> Optional[User]:
    uid = request.session.get("uid")
    if uid is None:
        return None
    return s.get(User, uid)


def require_user(request: Request, s: Session) -> User:
    u = current_user(request, s)
    if not u:
        raise HTTPException(status_code=307, headers={"Location": "/login"})
    return u


def can_edit(u: User, division_key: str) -> bool:
    return u.is_admin or u.division_key == division_key


def require_division(s: Session, key: str) -> Division:
    d = s.get(Division, key)
    if not d:
        raise HTTPException(404, "존재하지 않는 사업단입니다")
    return d


def audit(s: Session, u: User, action: str, entity: str, entity_id, detail: str = ""):
    s.add(AuditLog(username=u.username, action=action, entity=entity,
                   entity_id=str(entity_id), detail=detail[:800]))


# ---------- 집계 (build_data2.js와 동일 규칙 — app/aggregate.py) ----------
def division_summary(s: Session, d: Division) -> dict:
    programs = s.exec(select(Program).where(Program.division_key == d.key)).all()
    spendings = s.exec(select(Spending).where(Spending.division_key == d.key)).all()
    out = agg.summarize(d, programs, spendings)
    out.update(division=d, programs=programs, spendings=spendings)
    return out


# ---------- 화면 ----------
@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html", {"error": None})


@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...), s: Session = Depends(db)):
    u = s.exec(select(User).where(User.username == username)).first()
    if not u or not verify_password(password, u.password_hash):
        return templates.TemplateResponse(request, "login.html", {"error": "아이디 또는 비밀번호가 올바르지 않습니다."}, status_code=401)
    request.session["uid"] = u.id
    return RedirectResponse("/", status_code=303)


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@app.get("/", response_class=HTMLResponse)
def home(request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    divisions = s.exec(select(Division).order_by(Division.sort)).all()
    summaries = [division_summary(s, d) for d in divisions]
    totals = dict(
        programs=sum(len(x["programs"]) for x in summaries),
        students=sum(x["students"] for x in summaries),
        spent=sum(x["spent"] for x in summaries),
        budget_m=sum(x["division"].budget_total_m for x in summaries),
        unverified=sum(x["unverified"] for x in summaries),
        active=sum(1 for x in summaries if x["status"] == "진행"),
    )
    return templates.TemplateResponse(request, "home.html",
                                      {"user": u, "summaries": summaries, "totals": totals})


@app.get("/division/{key}", response_class=HTMLResponse)
def division_page(key: str, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    d = s.get(Division, key)
    if not d:
        raise HTTPException(404)
    indicators = s.exec(select(Indicator).where(Indicator.division_key == key).order_by(Indicator.id)).all()
    return templates.TemplateResponse(request, "division.html",
                                      {"user": u, "sm": division_summary(s, d), "indicators": indicators,
                                       "editable": can_edit(u, key)})


# ---------- 프로그램 CRUD ----------
def _num(v, label, *, is_int, min_val=None, max_val=None):
    """폼 숫자 파싱 — 실패 시 500이 아니라 422로 사용자에게 알림. 콤마 허용."""
    v = (v or "").replace(",", "").strip()
    if v == "":
        return None
    try:
        n = int(v) if is_int else float(v)
    except ValueError:
        raise HTTPException(422, f"{label}: 숫자를 입력하세요 (입력값 '{v}')")
    if min_val is not None and n < min_val:
        raise HTTPException(422, f"{label}: {min_val} 이상이어야 합니다")
    if max_val is not None and n > max_val:
        raise HTTPException(422, f"{label}: {max_val} 이하여야 합니다")
    return n


def program_from_form(form) -> dict:
    scale = _num(form.get("satisfaction_scale"), "만족도 척도", is_int=True) or 5
    budget_item = form.get("budget_item", "").strip()
    tanker = form.get("tanker", "").strip()
    if tanker and tanker not in TANKER:
        raise HTTPException(422, f"TANKer 주분류는 T/A/N/K 중 하나여야 합니다 (입력값 '{tanker}')")
    if budget_item == "간접비" and tanker:
        raise HTTPException(422, "간접비는 TANKer 분류 제외입니다 — 주분류를 비워주세요")
    tanker_sub = form.get("tanker_sub", "").strip()
    if tanker_sub and tanker_sub not in TANKER:
        raise HTTPException(422, "TANKer 부분류는 T/A/N/K 중 하나여야 합니다")
    exec_type = form.get("exec_type", "").strip()
    if exec_type and exec_type not in EXEC_TYPES:
        raise HTTPException(422, "집행방식은 자체운영/용역(수의계약)/용역(입찰) 중 선택입니다")
    return dict(
        name=form.get("name", "").strip(),
        category=form.get("category", ""),
        org=form.get("org", "").strip(),
        period=form.get("period", "").strip(),
        students=_num(form.get("students"), "참여학생수", is_int=True, min_val=0),
        hours=form.get("hours", "").strip(),
        satisfaction=_num(form.get("satisfaction"), "만족도 점수", is_int=False, min_val=0, max_val=scale),
        satisfaction_n=_num(form.get("satisfaction_n"), "응답자수", is_int=True, min_val=0),
        satisfaction_scale=scale,
        budget_won=_num(form.get("budget_won"), "소요예산", is_int=True, min_val=0),
        budget_item=budget_item,
        tanker=tanker,
        tanker_sub=tanker_sub,
        exec_type=exec_type,
        indicator_tags=form.get("indicator_tags", "").strip(),
        extra=form.get("extra", "").strip(),
        approval_doc=form.get("approval_doc", "").strip(),
        evidence=form.get("evidence", "").strip(),
    )


@app.get("/division/{key}/program/new", response_class=HTMLResponse)
def program_new(key: str, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    if not can_edit(u, key):
        raise HTTPException(403)
    return templates.TemplateResponse(request, "program_form.html",
                                      {"user": u, "division": s.get(Division, key), "p": None})


@app.post("/division/{key}/program/new")
async def program_create(key: str, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    require_division(s, key)
    if not can_edit(u, key):
        raise HTTPException(403)
    form = await request.form()
    data = program_from_form(form)
    if not data["name"]:
        raise HTTPException(422, "프로그램명은 필수입니다")
    p = Program(division_key=key, **data)
    s.add(p)
    s.flush()
    audit(s, u, "create", "program", p.id, f"{key} · {p.name}")
    s.commit()
    return RedirectResponse(f"/division/{key}", status_code=303)


@app.get("/program/{pid}/edit", response_class=HTMLResponse)
def program_edit(pid: int, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    p = s.get(Program, pid)
    if not p:
        raise HTTPException(404)
    if not can_edit(u, p.division_key):
        raise HTTPException(403)
    return templates.TemplateResponse(request, "program_form.html",
                                      {"user": u, "division": s.get(Division, p.division_key), "p": p})


@app.post("/program/{pid}/edit")
async def program_update(pid: int, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    p = s.get(Program, pid)
    if not p:
        raise HTTPException(404)
    if not can_edit(u, p.division_key):
        raise HTTPException(403)
    form = await request.form()
    data = program_from_form(form)
    changes = [f"{k}: {getattr(p, k)!r}→{v!r}" for k, v in data.items() if getattr(p, k) != v]
    for k, v in data.items():
        setattr(p, k, v)
    p.updated_at = now_utc()
    audit(s, u, "update", "program", p.id, "; ".join(changes) or "(변경 없음)")
    s.commit()
    return RedirectResponse(f"/division/{p.division_key}", status_code=303)


@app.post("/program/{pid}/status")
def program_status(pid: int, request: Request, status: str = Form(...), s: Session = Depends(db)):
    u = require_user(request, s)
    p = s.get(Program, pid)
    if not p:
        raise HTTPException(404)
    if not can_edit(u, p.division_key):
        raise HTTPException(403)
    if status not in STATUS_FLOW:
        raise HTTPException(422)
    audit(s, u, "status", "program", p.id, f"{p.status}→{status}")
    p.status = status
    p.updated_at = now_utc()
    s.commit()
    return RedirectResponse(f"/division/{p.division_key}", status_code=303)


@app.post("/program/{pid}/delete")
def program_delete(pid: int, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    p = s.get(Program, pid)
    if not p:
        raise HTTPException(404)
    if not can_edit(u, p.division_key):
        raise HTTPException(403)
    audit(s, u, "delete", "program", p.id, f"{p.division_key} · {p.name}")
    key = p.division_key
    s.delete(p)
    s.commit()
    return RedirectResponse(f"/division/{key}", status_code=303)


# ---------- 지출 CRUD (B안) ----------
@app.post("/division/{key}/spending/new")
def spending_create(key: str, request: Request, date: str = Form(""), name: str = Form(...),
                    budget_item: str = Form(""), tanker: str = Form(""), exec_type: str = Form(""),
                    amount_won: str = Form(...), doc: str = Form(""),
                    s: Session = Depends(db)):
    u = require_user(request, s)
    require_division(s, key)
    if not can_edit(u, key):
        raise HTTPException(403)
    try:
        amount = int(amount_won.replace(",", "").strip())
    except ValueError:
        raise HTTPException(422, "금액은 숫자여야 합니다")
    if amount == 0:
        raise HTTPException(422, "금액 0원은 기록할 수 없습니다")
    tanker = tanker.strip()
    if tanker and tanker not in TANKER:
        raise HTTPException(422, "TANKer는 T/A/N/K 중 하나여야 합니다")
    if budget_item.strip() == "간접비" and tanker:
        raise HTTPException(422, "간접비는 TANKer 분류 제외입니다")
    if exec_type.strip() and exec_type.strip() not in EXEC_TYPES:
        raise HTTPException(422, "집행방식 값이 올바르지 않습니다")
    sp = Spending(division_key=key, date=date.strip(), name=name.strip(),
                  budget_item=budget_item.strip(), tanker=tanker, exec_type=exec_type.strip(),
                  amount_won=amount, doc=doc.strip())
    s.add(sp)
    s.flush()
    audit(s, u, "create", "spending", sp.id, f"{key} · {sp.name} · {amount:,}원")
    s.commit()
    return RedirectResponse(f"/division/{key}", status_code=303)


@app.post("/spending/{sid}/verify")
def spending_verify(sid: int, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    sp = s.get(Spending, sid)
    if not sp:
        raise HTTPException(404)
    if not can_edit(u, sp.division_key):
        raise HTTPException(403)
    sp.verified = not sp.verified
    audit(s, u, "status", "spending", sp.id, f"검증 {'🟢' if sp.verified else '🔴'}")
    s.commit()
    return RedirectResponse(f"/division/{sp.division_key}", status_code=303)


@app.post("/spending/{sid}/delete")
def spending_delete(sid: int, request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    sp = s.get(Spending, sid)
    if not sp:
        raise HTTPException(404)
    if not can_edit(u, sp.division_key):
        raise HTTPException(403)
    audit(s, u, "delete", "spending", sp.id, f"{sp.division_key} · {sp.name} · {sp.amount_won:,}원")
    key = sp.division_key
    s.delete(sp)
    s.commit()
    return RedirectResponse(f"/division/{key}", status_code=303)


# ---------- 지표 수정 (’26 목표 + 실적 보정 — 변경은 전부 audit 기록) ----------
@app.post("/indicator/{iid}/update")
def indicator_update(iid: int, request: Request, target26: str = Form(None), manual26: str = Form(None),
                     s: Session = Depends(db)):
    u = require_user(request, s)
    ind = s.get(Indicator, iid)
    if not ind:
        raise HTTPException(404)
    if not can_edit(u, ind.division_key):
        raise HTTPException(403)
    changes = []
    if target26 is not None and target26.strip() != ind.target26:
        changes.append(f"’26목표: {ind.target26!r}→{target26.strip()!r}")
        ind.target26 = target26.strip()
    if manual26 is not None and manual26.strip() != ind.manual26:
        changes.append(f"’26실적보정: {ind.manual26!r}→{manual26.strip()!r}")
        ind.manual26 = manual26.strip()
    if changes:
        audit(s, u, "update", "indicator", ind.id, f"{ind.grp} {ind.name} — " + "; ".join(changes))
        s.commit()
    return RedirectResponse(f"/division/{ind.division_key}", status_code=303)


# ---------- 사용자 관리 (관리자) ----------
@app.get("/users", response_class=HTMLResponse)
def users_page(request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    if not u.is_admin:
        raise HTTPException(403)
    users = s.exec(select(User)).all()
    divisions = s.exec(select(Division).order_by(Division.sort)).all()
    return templates.TemplateResponse(request, "users.html", {"user": u, "users": users, "divisions": divisions})


@app.post("/users/new")
def user_create(request: Request, username: str = Form(...), password: str = Form(...),
                display_name: str = Form(""), division_key: str = Form(""), s: Session = Depends(db)):
    u = require_user(request, s)
    if not u.is_admin:
        raise HTTPException(403)
    username = username.strip()
    if not username:
        raise HTTPException(422, "아이디를 입력하세요")
    if division_key and not s.get(Division, division_key):
        raise HTTPException(422, "존재하지 않는 사업단입니다")
    if s.exec(select(User).where(User.username == username)).first():
        raise HTTPException(422, "이미 있는 아이디입니다")
    s.add(User(username=username, password_hash=hash_password(password),
               display_name=display_name.strip(), division_key=division_key or None, is_admin=False))
    audit(s, u, "create", "user", username, f"담당: {division_key or '전체(조회)'}")
    s.commit()
    return RedirectResponse("/users", status_code=303)


@app.post("/users/{uid}/password")
def user_password(uid: int, request: Request, password: str = Form(...), s: Session = Depends(db)):
    u = require_user(request, s)
    target = s.get(User, uid)
    if not target:
        raise HTTPException(404)
    if not (u.is_admin or u.id == uid):
        raise HTTPException(403)
    target.password_hash = hash_password(password)
    audit(s, u, "update", "user", target.username, "비밀번호 변경")
    s.commit()
    return RedirectResponse("/users" if u.is_admin else "/", status_code=303)


# ---------- 변경 이력 ----------
@app.get("/audit", response_class=HTMLResponse)
def audit_page(request: Request, s: Session = Depends(db)):
    u = require_user(request, s)
    logs = s.exec(select(AuditLog).order_by(AuditLog.id.desc()).limit(300)).all()
    return templates.TemplateResponse(request, "audit.html", {"user": u, "logs": logs})


# ---------- 대시보드 내보내기 ----------
@app.get("/api/export/data2")
def export_data2(request: Request, key: str = "", s: Session = Depends(db)):
    # 인증: 로그인 세션 또는 EXPORT_TOKEN(?key=) 일치 시 허용. 둘 다 없으면 401.
    authed = current_user(request, s) is not None
    if not authed:
        if EXPORT_TOKEN and secrets.compare_digest(key, EXPORT_TOKEN):
            authed = True
    if not authed:
        raise HTTPException(401, "인증이 필요합니다 (로그인 또는 ?key=EXPORT_TOKEN)")
    divisions = s.exec(select(Division).order_by(Division.sort)).all()
    out_divs = []
    for d in divisions:
        sm = division_summary(s, d)
        inds = s.exec(select(Indicator).where(Indicator.division_key == d.key).order_by(Indicator.id)).all()
        out_divs.append(dict(
            key=d.key, code=d.code, fullName=d.full_name, lead=d.lead,
            budget=dict(totalM=d.budget_total_m, mainM=d.budget_main_m, opM=d.budget_op_m,
                        spentWon=sm["spent"], rate=sm["rate"]),
            programs=[dict(file=p.card_file, name=p.name, category=p.category, org=p.org, period=p.period,
                           students=p.students, hours=p.hours, satis=p.satisfaction,
                           satisN=p.satisfaction_n, satisScale=p.satisfaction_scale,
                           budget=p.budget_won, budgetItem=p.budget_item,
                           tanker=p.tanker, tankerSub=p.tanker_sub, execType=p.exec_type,
                           indicators=[t.strip() for t in p.indicator_tags.split(",") if t.strip()],
                           status=p.status, approval=p.approval_doc) for p in sm["programs"]],
            spending=[dict(date=x.date, name=x.name, item=x.budget_item, tanker=x.tanker,
                           execType=x.exec_type, amount=x.amount_won,
                           doc=x.doc, verified=x.verified) for x in sm["spendings"]],
            students=sm["students"],
            satisfaction=dict(avg=sm["satis_avg"], n=sm["satis_n"], scale=5, excluded=sm["satis_excluded"]),
            spread=sm["spread"], spreadPending=sm["spread_pending"],
            indicators=[dict(group=i.grp, name=i.name, unit=i.unit, target25=i.target25,
                             actual25=i.actual25, rate25=i.rate25, target=i.target26,
                             manual=i.manual26) for i in inds],
            unverified=sm["unverified"], status=sm["status"],
        ))
    totals = dict(
        budgetM=sum(d["budget"]["totalM"] for d in out_divs),
        spentWon=sum(d["budget"]["spentWon"] for d in out_divs),
        programs=sum(len(d["programs"]) for d in out_divs),
        students=sum(d["students"] for d in out_divs),
        unverified=sum(d["unverified"] for d in out_divs),
        activeDivisions=sum(1 for d in out_divs if d["status"] == "진행"),
    )
    totals["rate"] = agg.js_fixed(totals["spentWon"] / (totals["budgetM"] * 1e6) * 100, 2) if totals["budgetM"] else 0
    # 경고: build_data2.js:213-218과 동일 (자료접수 접미문 + 상시 집행률 주의 + 미검증 잠정값)
    warnings = []
    if totals["activeDivisions"] < 8:
        warnings.append(f"프로그램 자료 접수: {totals['activeDivisions']}/8 사업단 — 나머지 사업단 결과보고서 투입 필요")
    warnings.append("집행률은 인박스에 투입된 지출 문서만 반영 (비프로그램성 지출 미반영 시 실제보다 낮음)")
    if totals["unverified"]:
        warnings.append(f"미검증(🔴) 항목 {totals['unverified']}건 — 확정 전 수치는 잠정값")
    return JSONResponse(dict(
        generatedAt=now_utc().isoformat(), year=2026, yearLabel="2차년도(2026)",
        source="입력관리 시스템 (howon-rise-admin v2)",
        divisions=out_divs, totals=totals,
        warnings=warnings,
    ))


@app.get("/healthz")
def healthz():
    return {"ok": True}
