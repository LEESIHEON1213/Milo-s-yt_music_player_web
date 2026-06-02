#!/usr/bin/env bash
# ============================================================
#  밀로's 플레이어 — 백엔드 딸깍 세팅
#  - venv 생성 + Python 패키지 설치 + yt-dlp 설치
#  - .env 는 건드리지 않음 (직접 관리)
# ============================================================
set -e

cd "$(dirname "$0")/backend"

echo "==> 백엔드 디렉토리: $(pwd)"

# ── Python 확인 ───────────────────────────────────────────
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "❌ python3 가 없습니다. 먼저 Python 3.10+ 설치하세요."
  exit 1
fi
echo "==> Python: $($PY --version)"

# ── venv 생성 ─────────────────────────────────────────────
if [ ! -d venv ]; then
  echo "==> venv 생성 중..."
  $PY -m venv venv
else
  echo "==> 기존 venv 재사용"
fi

# venv 활성화 (OS 분기)
if [ -f venv/bin/activate ]; then
  source venv/bin/activate          # Linux / macOS
elif [ -f venv/Scripts/activate ]; then
  source venv/Scripts/activate      # Windows (Git Bash)
fi

# ── 패키지 설치 ───────────────────────────────────────────
echo "==> pip 업그레이드"
python -m pip install --upgrade pip >/dev/null

echo "==> requirements.txt 설치"
pip install -r requirements.txt

echo "==> yt-dlp 설치 (venv 내부)"
pip install -U yt-dlp

# ── yt-dlp 시스템 PATH 확인 ───────────────────────────────
# main.py 는 shutil.which("yt-dlp") 로 yt-dlp 를 찾습니다.
# venv 활성화된 상태로 uvicorn 을 띄우면 venv 의 yt-dlp 가 잡힙니다.
echo "==> yt-dlp 버전: $(yt-dlp --version 2>/dev/null || echo '확인 실패')"

echo ""
echo "✅ 백엔드 세팅 완료"
echo ""

# ── 서비스 재시작 ─────────────────────────────────────────
echo "==> ninamamuplayer 서비스 재시작"
sudo systemctl restart ninamamuplayer
echo "==> 상태 확인"
sudo systemctl status ninamamuplayer --no-pager -l | head -12 || true
echo ""
echo "  ※ .env (HTTP_PROXY 등) 가 없으면 서비스가 안 뜹니다 — 직접 준비하세요."
echo "  로그: sudo journalctl -u ninamamuplayer -f"
