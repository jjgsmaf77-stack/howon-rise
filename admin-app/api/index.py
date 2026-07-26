# Vercel 서버리스 진입점 — FastAPI 앱(ASGI)을 그대로 노출
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402,F401
