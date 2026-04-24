#!/usr/bin/env bash
# Keep src/app/bureau/_styles/ in sync with public/refresh/ (source of truth).
set -euo pipefail
cd "$(dirname "$0")/.."
cp public/refresh/colors_and_type.css src/app/bureau/_styles/colors_and_type.css
cp public/refresh/ambient-fx.css src/app/bureau/_styles/ambient-fx.css
echo "[sync] bureau styles mirrored."
