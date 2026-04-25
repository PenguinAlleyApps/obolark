#!/usr/bin/env bash
# scripts/smoke-bureau-stretch.sh — 26-warden smoke against running dev (or prod with $BASE).
#
# Usage:
#   USE_REAL_PROVIDERS=true BASE=http://localhost:3001 bash scripts/smoke-bureau-stretch.sh
#   USE_REAL_PROVIDERS=true BASE=https://obolark.vercel.app bash scripts/smoke-bureau-stretch.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3001}"
PASS=0; FAIL=0; LOG=/tmp/smoke-stretch.log
: > "$LOG"

hit() {
  local path="$1" body="$2" name="$3"
  local out
  out=$(curl -s -X POST "$BASE$path" -H 'x-preview: true' -H 'Content-Type: application/json' -d "$body" || echo '{"degraded":"transport_fail"}')
  local degraded
  degraded=$(echo "$out" | jq -r '.degraded // "error"')
  if [[ "$degraded" == "false" ]]; then
    echo "PASS $name"; PASS=$((PASS+1))
  else
    local reason detail
    reason=$(echo "$out" | jq -r '.reason // .degradedReason // "unknown"')
    detail=$(echo "$out" | jq -r '.detail // .degradedDetail // ""')
    echo "FAIL $name :: reason=$reason detail=${detail:0:120}"; FAIL=$((FAIL+1))
  fi
  echo "$name :: $out" >> "$LOG"
}

# 22 existing wardens
for w in research design-review qa security-scan audit gemini-oracle \
         bureau/atlas bureau/hermes bureau/iris bureau/artemis bureau/urania \
         bureau/plutus bureau/poseidon bureau/helios bureau/prometheus \
         bureau/aegis bureau/apollo bureau/calliope bureau/themis bureau/proteus \
         bureau/hephaestus bureau/hestia; do
  hit "/api/$w" '{"subject":"smoke-stretch test"}' "$w"
done

# 4 new STRETCH wardens
hit "/api/bureau/argos-vision"   '{"subject":"verify delivery","image_uris":["https://picsum.photos/400/300"]}'                              "bureau/argos-vision"
hit "/api/bureau/themis-ledger"  '{"subject":"weigh order","image_uris":["https://picsum.photos/400/300"],"orig_tx_hash":"0xPREVIEW"}'        "bureau/themis-ledger"
hit "/api/bureau/hermes-emissary"'{"subject":"check balance","wallet_id":"preview-wallet"}'                                                   "bureau/hermes-emissary"
hit "/api/bureau/moros-arbiter"  '{"subject":"arbitrate","claims":[{"warden":"CERBERUS","claim":"PASS"},{"warden":"THANATOS","claim":"CAST-BACK"}]}' "bureau/moros-arbiter"

echo "---"
echo "PASS: $PASS / $((PASS+FAIL))"
echo "FAIL: $FAIL"
[[ $FAIL -eq 0 ]] || { echo "SMOKE FAIL — see $LOG"; exit 1; }
