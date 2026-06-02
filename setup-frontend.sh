#!/usr/bin/env bash
# ============================================================
#  밀로's 플레이어 — 프론트엔드 딸깍 세팅
#  - npm install + build
#  - rollup ARM64 옵셔널 의존성 버그 자동 복구
#  - .env 는 건드리지 않음 (직접 관리)
# ============================================================
set -e

cd "$(dirname "$0")/frontend"

echo "==> 프론트엔드 디렉토리: $(pwd)"

# ── Node 확인 ─────────────────────────────────────────────
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm 이 없습니다. 먼저 Node.js 18+ 설치하세요."
  exit 1
fi
echo "==> Node: $(node -v) / npm: $(npm -v)"

# ── 설치 ──────────────────────────────────────────────────
echo "==> npm install"
npm install

# ── 빌드 (실패 시 rollup 버그 자동 복구 후 재시도) ────────
echo "==> 빌드 시도"
if ! npm run build; then
  echo ""
  echo "⚠️  빌드 실패 — rollup 옵셔널 의존성 버그로 추정, 클린 재설치 후 재시도합니다."
  rm -rf node_modules package-lock.json
  npm install
  npm run build
fi

echo ""
echo "✅ 프론트엔드 세팅 완료 (dist/ 생성됨)"
echo ""

# ── nginx 재시작 ──────────────────────────────────────────
echo "==> nginx 재시작 (dist/ 서빙)"
sudo systemctl restart nginx
echo "==> 상태 확인"
sudo systemctl status nginx --no-pager -l | head -8 || true
echo ""
echo "  ※ nginx가 frontend/dist/ 를 가리키는지 확인하세요."
echo "  ※ .env (VITE_YT_API_KEY 등) 는 빌드 전에 준비되어 있어야 반영됩니다."
