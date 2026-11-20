#!/usr/bin/env bash
# Kerf – zlatník: spuštění na Linuxu / macOS (stejné kroky jako spustit-zlatnik.bat).
# Potřebuje Python 3.11+ a Node.js 22+. Data: ~/.kerf/kerf.db
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
PORT="${PORT:-8080}"
PY="$ROOT/.venv/bin/python"

command -v python3 >/dev/null || { echo "[CHYBA] Chybí Python 3.11+"; exit 1; }
command -v npm >/dev/null || { echo "[CHYBA] Chybí Node.js 22+"; exit 1; }

if [ ! -x "$PY" ]; then
  echo "[1/4] Vytvářím Python prostředí …"
  python3 -m venv .venv
fi

if [ ! -f .venv/.zlatnik-installed ]; then
  echo "[2/4] Instaluji serverové balíčky (jen poprvé) …"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q cryptography \
    -e packages/kerf-core -e packages/kerf-auth -e packages/kerf-api -e packages/kerf-chat \
    -e packages/kerf-cli -e packages/kerf-tess -e packages/kerf-v1 -e packages/kerf-cad-core
  touch .venv/.zlatnik-installed
else
  echo "[2/4] Serverové balíčky už jsou nainstalované."
fi

HEAD="$(git rev-parse HEAD 2>/dev/null || echo none)"
BUILT="$(cat web/dist/.zlatnik-build 2>/dev/null || echo missing)"
if [ ! -f web/dist/index.html ] || [ "$BUILT" != "$HEAD" ]; then
  echo "[3/4] Sestavuji webové rozhraní …"
  (
    cd web
    [ -d node_modules ] || npm ci --no-audit --no-fund
    node ../scripts/init-config.mjs >/dev/null 2>&1 || true
    node ../scripts/build-docs-manifest.mjs >/dev/null 2>&1 || true
    node ../scripts/build-compare-manifest.mjs >/dev/null 2>&1 || true
    node ../scripts/build-roadmap-manifest.mjs >/dev/null 2>&1 || true
    npx vite build
  )
  echo "$HEAD" > web/dist/.zlatnik-build
else
  echo "[3/4] Webové rozhraní je aktuální."
fi

echo "[4/4] Připravuji databázi a spouštím server na http://localhost:$PORT …"
"$PY" -m kerf_core.db.migrations.runner
export KERF_FRONTEND_DIST="$ROOT/web/dist"
exec "$ROOT/.venv/bin/kerf-server" --host 127.0.0.1 --port "$PORT"
