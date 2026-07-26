# 집계 규칙 — 대시보드 build_data2.js와 100% 동일해야 한다 (불변식 1).
# 각 함수 옆에 대응하는 build_data2.js 라인을 명시한다.
from decimal import Decimal, ROUND_HALF_UP


def js_fixed(value: float, digits: int) -> float:
    """JS Number.prototype.toFixed와 동일한 반올림(half-away-from-zero).
    Python 기본 round()는 banker's rounding이라 .X5 동률에서 대시보드와 갈리므로 사용 금지."""
    if value is None:
        return 0.0
    q = Decimal(1).scaleb(-digits)  # 10^-digits
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


SPREAD_KEYS = ["초광역", "사업단연계", "MOU", "언론보도", "행사"]
# build_data2.js countTag는 언론보도를 '언론' 부분문자열로 매칭한다(js:170).
SPREAD_MATCH = {"초광역": "초광역", "사업단연계": "사업단연계", "MOU": "MOU", "언론보도": "언론", "행사": "행사"}

# build_data2.js: 검증으로 인정하는 상태 (js:175 — 검토완료·입력반영 둘 다 검증)
VERIFIED_STATUSES = {"검토완료", "입력반영"}


def tags_of(program) -> list[str]:
    return [t.strip() for t in (program.indicator_tags or "").split(",") if t.strip()]


def summarize(division, programs, spendings) -> dict:
    """build_data2.js divisions[].* 필드와 동일 구조·동일 산식."""
    spent = sum(x.amount_won for x in spendings)
    budget_won = division.budget_total_m * 1_000_000

    # 만족도: 응답자수 있는 카드만, 척도 5점 정규화 가중평균 (js:157-160)
    rated = [p for p in programs if p.satisfaction is not None and p.satisfaction_n is not None]
    w_n = sum(p.satisfaction_n for p in rated)
    w_sum = sum((p.satisfaction / (p.satisfaction_scale or 5)) * 5 * p.satisfaction_n for p in rated)
    satis_avg = js_fixed(w_sum / w_n, 2) if w_n else None
    # excluded: 만족도는 있으나 응답자수가 None (js:162 — satisN == null만)
    satis_excluded = sum(1 for p in programs if p.satisfaction is not None and p.satisfaction_n is None)

    # 확산실적: '확인' 미포함 태그를 가진 '카드 수' (js:164-165, 프로그램당 최대 1)
    def count_tag(keyword):
        return sum(1 for p in programs
                   if any(keyword in t and "확인" not in t for t in tags_of(p)))
    spread = {k: count_tag(SPREAD_MATCH[k]) for k in SPREAD_KEYS}
    # 분류 미확정('확인' 포함) 카드 수 (js:173)
    spread_pending = sum(1 for p in programs
                         if any("분류확인" in t or "확인" in t for t in tags_of(p)))

    # 미검증: 검증 상태가 아닌 카드 + 미검증 지출 (js:175 — 검토완료·입력반영은 검증)
    unverified = sum(1 for p in programs if p.status not in VERIFIED_STATUSES) \
        + sum(1 for x in spendings if not x.verified)

    return dict(
        spent=spent,
        rate=js_fixed(spent / budget_won * 100, 1) if budget_won else 0,
        students=sum(p.students or 0 for p in programs),
        satis_avg=satis_avg, satis_n=w_n, satis_excluded=satis_excluded,
        spread=spread, spread_pending=spread_pending,
        unverified=unverified,
        status="진행" if (programs or spendings) else "자료대기",
    )
