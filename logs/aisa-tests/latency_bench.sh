#!/bin/bash
# Latency bench: ~200-token real output on realistic prompt.
KEY=$(grep '^AISA_API_KEY=' /c/Users/luisg/Projects/obolark/.env.local | cut -d'=' -f2- | tr -d '"\r')
OUT=/c/Users/luisg/Projects/obolark/logs/aisa-tests/bench
mkdir -p "$OUT"
SUMMARY="$OUT/_bench.tsv"
echo -e "model\tstatus\tlatency_ms\tout_tokens\tpreview" > "$SUMMARY"

PROMPT='List exactly 5 benefits of agentic micropayments in 1 sentence each. Number them 1-5.'

bench() {
  local model="$1"
  local safe=$(echo "$model" | tr '/:' '__')
  local out="$OUT/${safe}.json"
  local start=$(date +%s%3N)
  local http_code
  http_code=$(curl -sS -o "$out" -w "%{http_code}" --max-time 60 \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    "https://api.aisa.one/v1/chat/completions" \
    -d "{\"model\":\"$model\",\"max_tokens\":300,\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}")
  local end=$(date +%s%3N)
  local lat=$((end-start))
  local toks=$(python3 -c "import json; d=json.load(open(r'$out')); print(d.get('usage',{}).get('completion_tokens','?'))" 2>/dev/null || echo "?")
  local preview=$(python3 -c "import json; d=json.load(open(r'$out')); c=d.get('choices',[{}])[0].get('message',{}).get('content',''); print(c.replace(chr(10),' ')[:120])" 2>/dev/null || echo "")
  echo -e "${model}\t${http_code}\t${lat}\t${toks}\t${preview}" | tee -a "$SUMMARY"
}

for m in \
  "gpt-5" \
  "gpt-5-mini" \
  "gpt-5.2" \
  "gpt-5.4" \
  "gpt-4.1" \
  "gpt-4.1-mini" \
  "gpt-4o" \
  "claude-opus-4-7" \
  "claude-opus-4-6" \
  "claude-opus-4-5-20251101" \
  "claude-sonnet-4-6" \
  "claude-sonnet-4-5-20250929" \
  "claude-haiku-4-5-20251001" \
  "gemini-3.1-pro-preview" \
  "gemini-3-pro-preview" \
  "gemini-3-flash-preview" \
  "gemini-2.5-flash" \
  "gemini-2.5-flash-lite" \
  "deepseek-v3.2" \
  "deepseek-v3.1" \
  "kimi-k2.5" \
  "qwen3-max" \
  "qwen3-coder-plus" \
  "glm-5" \
  "seed-2-0-pro-260328" \
  "seed-2-0-mini-260215" \
  "seed-1-8-251228"
do
  bench "$m"
  sleep 0.3
done
echo "---BENCH DONE---"
