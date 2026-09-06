# -*- coding: utf-8 -*-
"""제출함 회수기 — 플랫폼에 제출된 결과보고서를 옵시디언 인박스로 내려받고 서버에서 정리한다.

파일별 절차: presigned 다운로드 → 크기 검증 → 인박스 저장 → Blob 삭제 → 상태 '분석완료'.
- 저장이 검증되기 전에는 절대 Blob을 삭제하지 않는다.
- Blob이 이미 없으면(이전 실행에서 회수 후 마킹만 실패) 상태만 정리한다 → 재실행이 안전(멱등).
- 마지막에 고아 Blob 정리: 업로드만 되고 등록되지 않은 채 24시간 지난 파일을 삭제.

사용: python pull_submissions.py   (설정: admin-app/.local/pull.env)
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
INBOX = r"C:\Users\홍인기\Desktop\POPULAR\LLM_Wiki\1_Raw\★★★2차년도 앵커사업단 성과관리★★★\00_분석전(인박스)"
ORPHAN_AGE_H = 24  # 이 시간보다 오래된 미등록 blob만 고아로 간주 (업로드 진행 중 보호)

cfg = {}
with open(os.path.join(HERE, "admin-app", ".local", "pull.env"), encoding="utf-8") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            cfg[k] = v
BASE, KEY = cfg["BASE_URL"].rstrip("/"), cfg["EXPORT_TOKEN"]


def api(path, payload=None):
    req = urllib.request.Request(BASE + path, method="POST" if payload is not None else "GET",
                                 headers={"Content-Type": "application/json"},
                                 data=json.dumps(payload).encode() if payload is not None else None)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def blob_op(ticket, op, pathname):
    return api("/api/blob", {"ticket": ticket, "op": op, "pathname": pathname})


def safe_name(division, filename):
    name = re.sub(r'[\\/:*?"<>|]', "_", filename).strip() or "파일"
    return f"[{division}] {name}"


def mark_analyzed(fid):
    api(f"/files/mark-analyzed?key={KEY}", {"ids": [fid]})


def process(f):
    label = f"[{f['division']}] {f['filename']}"
    if f["size"] <= 0:
        print(f"  ⚠️ {label}: 크기 정보가 없어 건너뜀 — 담당자에게 재제출 요청 필요 (플랫폼에서 취소 가능)")
        return False
    # 1) presigned 다운로드 (blob이 없으면 404 → 이전 실행에서 이미 회수된 건으로 판단, 상태만 정리)
    try:
        pre = blob_op(f["ticket"], "get", f["pathname"])
        url = pre.get("presignedUrl")
        if not url:
            raise RuntimeError(f"서명 실패: {pre}")
        with urllib.request.urlopen(url, timeout=1800) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            mark_analyzed(f["id"])
            print(f"  ◽ {label}: 저장소에 파일 없음(이미 회수됨) — 상태만 분석완료로 정리")
            return True
        raise
    # 2) 크기 검증 — 불일치 시 어떤 삭제도 하지 않음
    if len(data) != f["size"]:
        raise RuntimeError(f"크기 불일치: 받음 {len(data):,}B ≠ 신고 {f['size']:,}B")
    # 3) 인박스 저장 (+저장 검증)
    dest = os.path.join(INBOX, safe_name(f["division"], f["filename"]))
    base_, ext_ = os.path.splitext(dest)
    n = 1
    while os.path.exists(dest):
        dest = f"{base_} ({n}){ext_}"
        n += 1
    with open(dest, "wb") as out:
        out.write(data)
    if os.path.getsize(dest) != len(data):
        raise RuntimeError("저장 검증 실패")
    # 4) Blob 삭제 → 5) 상태 갱신 (이 순서여야 실패 시 재실행으로 복구 가능)
    blob_op(f["ticket"], "del", f["pathname"])
    mark_analyzed(f["id"])
    print(f"  ✅ {label} ({len(data)/1048576:.1f}MB) → 인박스 저장 · 서버 정리 완료")
    return True


def reconcile(maint, pending):
    """업로드만 되고 등록(complete)되지 않은 채 남은 고아 blob 정리."""
    try:
        blobs = blob_op(maint["ticket"], "list", maint["prefix"]).get("blobs", [])
    except Exception as e:
        print(f"  (고아 파일 점검 생략: {e})")
        return
    keep = {f["pathname"] for f in pending}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ORPHAN_AGE_H)
    removed = 0
    for b in blobs:
        if b["pathname"] in keep:
            continue
        try:
            up = datetime.fromisoformat(b["uploadedAt"].replace("Z", "+00:00"))
        except Exception:
            continue
        if up < cutoff:
            try:
                blob_op(maint["ticket"], "del", b["pathname"])
                removed += 1
            except Exception:
                pass
    if removed:
        print(f"  🧹 고아 파일 {removed}건 정리 (업로드 중단 잔여물)")


def main():
    if not os.path.isdir(INBOX):
        print(f"⚠️ 인박스 폴더가 없습니다: {INBOX}")
        sys.exit(1)
    resp = api(f"/files/pending?key={KEY}")
    pending = resp["files"]
    maint = resp.get("maintenance")
    if not pending:
        print("제출된 대기 파일이 없습니다.")
    else:
        print(f"대기 파일 {len(pending)}건 회수 시작")
        ok = 0
        for f in pending:
            try:
                if process(f):
                    ok += 1
            except Exception as e:
                print(f"  ⚠️ [{f['division']}] {f['filename']}: {e} — 서버에 그대로 남겨둠(다음 실행 때 재시도)")
        print(f"회수 완료: {ok}/{len(pending)}건")
    if maint:
        reconcile(maint, pending)
    if pending:
        print("이제 인박스 분석을 진행하세요.")


if __name__ == "__main__":
    main()
