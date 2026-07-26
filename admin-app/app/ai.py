# AI 질의 — 옵시디언 지식 번들(knowledge/kb.json) 기반 Claude API 질의응답
import json
import os
from pathlib import Path

KB_PATH = Path(__file__).resolve().parent.parent / "knowledge" / "kb.json"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
MAX_TOKENS = int(os.environ.get("AI_MAX_TOKENS", "1500"))
MAX_HISTORY = 10  # 최근 대화 유지 수 (질문+답변 쌍 기준 5쌍)

_kb = None


def kb():
    global _kb
    if _kb is None:
        _kb = json.loads(KB_PATH.read_text(encoding="utf-8")) if KB_PATH.exists() else {
            "generatedAt": None, "common": [], "divisions": {}}
    return _kb


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def build_context(division_key: str | None) -> str:
    """division_key 지정 시 해당 사업단 전체 문서, 미지정(총괄 '전체') 시 공통+각 사업단 원장만."""
    k = kb()
    parts = []
    for d in k["common"]:
        parts.append(f"<문서 경로=\"{d['file']}\">\n{d['text']}\n</문서>")
    if division_key and division_key in k["divisions"]:
        for d in k["divisions"][division_key]:
            parts.append(f"<문서 경로=\"{d['file']}\">\n{d['text']}\n</문서>")
    elif not division_key:
        for docs in k["divisions"].values():
            for d in docs:
                if d["file"].startswith("원장/"):
                    parts.append(f"<문서 경로=\"{d['file']}\">\n{d['text']}\n</문서>")
    return "\n\n".join(parts)


SYSTEM_BASE = """당신은 호원대학교 앵커(RISE)사업단의 성과관리 어시스턴트입니다.
아래 <지식> 안의 옵시디언 성과관리 문서만을 근거로 답합니다.

규칙:
- 수치를 답할 때는 반드시 근거 문서 경로를 함께 표기한다 (예: 근거: 원장/맛잡고.md).
- 검증 상태를 구분한다: 🟢확정값만 보고서에 사용 가능, 🔴미검증/🟡검토중은 잠정값임을 명시한다.
- 지식에 없는 내용은 추측하지 말고 "자료에 없음"이라고 답하고, 어떤 문서를 인박스에 넣으면 되는지 안내한다.
- 연계 프로그램(실적 양측 계상·예산 집행측만)과 유사중복(평가 감점 대상)을 혼동하지 않는다.
- 한국어로, 실무자가 보고서에 바로 쓸 수 있게 간결하고 정확하게 답한다."""


def ask(question: str, division_key: str | None, history: list) -> str:
    """history: [{"role":"user"|"assistant","content":str}, ...] 최근 순서대로."""
    import anthropic  # 지연 import — 키 없으면 호출 자체가 안 됨
    client = anthropic.Anthropic()
    context = build_context(division_key)
    scope = division_key or "전체(총괄)"
    system = [
        {"type": "text", "text": SYSTEM_BASE},
        {"type": "text",
         "text": f"[질의 범위: {scope} 사업단]\n<지식 생성시각={kb().get('generatedAt')}>\n{context}\n</지식>",
         "cache_control": {"type": "ephemeral"}},  # 동일 범위 반복 질문 시 캐시로 비용 절감
    ]
    msgs = [m for m in history[-MAX_HISTORY:] if m.get("role") in ("user", "assistant") and m.get("content")]
    msgs.append({"role": "user", "content": question})
    resp = client.messages.create(model=MODEL, max_tokens=MAX_TOKENS, system=system, messages=msgs)
    return "".join(b.text for b in resp.content if b.type == "text")
