# 호원RISE 입력관리 v2 — 데이터 모델
# 옵시디언 성과관리 볼트의 3층 구조와 1:1 대응한다.
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)

STATUS_FLOW = ["추출완료", "검토완료", "입력반영"]  # 🔴 → 🟡 → 🟢
PROGRAM_CATEGORIES = ["교육과정운영", "경연대회지도", "캠프", "특강·세미나",
                      "사회공헌·봉사", "행사·성과공유", "연구·조사", "인프라구축", "기타"]
SPREAD_TAGS = ["초광역", "사업단연계", "MOU", "언론보도", "행사"]


class Division(SQLModel, table=True):
    key: str = Field(primary_key=True)          # 보건, 컬쳐, ...
    code: str = ""                               # R26-T1-S1-HW-01
    full_name: str = ""
    lead: str = ""
    budget_total_m: float = 0                    # 편성 총계 (백만원)
    budget_main_m: float = 0
    budget_op_m: float = 0
    sort: int = 0


class Indicator(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    division_key: str = Field(foreign_key="division.key", index=True)
    grp: str = ""                                # 지자체➊, 자체➍ ...
    name: str = ""
    unit: str = ""
    base: str = ""                               # 기준값
    target26: str = ""                           # '26 목표(A)
    prev25: str = ""                             # '25 실적(B)
    manual26: str = ""                           # '26 실적 수기 보정(비프로그램성) — 비우면 자동집계만


class Program(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    division_key: str = Field(foreign_key="division.key", index=True)
    name: str = ""
    category: str = ""                           # PROGRAM_CATEGORIES
    org: str = ""                                # 교육기관
    period: str = ""                             # 2026-05-15 ~ 2026-06-15
    students: Optional[int] = None
    hours: str = ""                              # 18차시(6회)
    satisfaction: Optional[float] = None         # 만족도 3종 세트
    satisfaction_n: Optional[int] = None
    satisfaction_scale: int = 5
    budget_won: Optional[int] = None
    budget_item: str = ""
    indicator_tags: str = ""                     # 쉼표구분: "지자체➊ 연계교육, 자체➋ 대회수상률"
    extra: str = ""                              # 기타실적 (자유기술)
    approval_doc: str = ""                       # 내부결재 번호
    evidence: str = ""                           # 줄단위 "파일명 | p.N | 값설명"
    card_file: str = ""                          # 볼트 원본 카드 파일명 (왕복 추적용)
    status: str = "추출완료"                     # STATUS_FLOW
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Spending(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    division_key: str = Field(foreign_key="division.key", index=True)
    date: str = ""                               # 2026-06-25
    name: str = ""
    budget_item: str = ""
    amount_won: int = 0                          # 음수(환수·정정) 허용
    doc: str = ""                                # 근거문서(내부결재)
    program_id: Optional[int] = Field(default=None, foreign_key="program.id")
    verified: bool = False                       # 🟢 여부
    created_at: datetime = Field(default_factory=now_utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str = ""                      # pbkdf2$iters$salt$hash
    display_name: str = ""
    division_key: Optional[str] = None           # None = 전체 관리자
    is_admin: bool = False


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=now_utc)
    username: str = ""
    action: str = ""                             # create/update/delete/status
    entity: str = ""                             # program/spending/indicator/division
    entity_id: str = ""
    detail: str = ""                             # 변경 요약 (필드: 이전→이후)
