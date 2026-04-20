#!/bin/bash
# Probe AISA models with a 2-token prompt. Record status + latency + error.
KEY=$(grep '^AISA_API_KEY=' /c/Users/luisg/Projects/obolark/.env.local | cut -d'=' -f2- | tr -d '"\r')
OUT_DIR=/c/Users/luisg/Projects/obolark/logs/aisa-tests
mkdir -p "$OUT_DIR"
SUMMARY="$OUT_DIR/_summary.tsv"
echo -e "model\tstatus\tlatency_ms\terror_snippet" > "$SUMMARY"

probe() {
  local model="$1"
  local extra_headers="$2"
  local safe=$(echo "$model" | tr '/:' '__')
  local out="$OUT_DIR/${safe}.json"
  local start=$(date +%s%3N)
  local http_code
  if [ -n "$extra_headers" ]; then
    http_code=$(curl -sS -o "$out" -w "%{http_code}" --max-time 30 \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      $extra_headers \
      "https://api.aisa.one/v1/chat/completions" \
      -d "{\"model\":\"$model\",\"max_tokens\":10,\"messages\":[{\"role\":\"user\",\"content\":\"say OK\"}]}")
  else
    http_code=$(curl -sS -o "$out" -w "%{http_code}" --max-time 30 \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      "https://api.aisa.one/v1/chat/completions" \
      -d "{\"model\":\"$model\",\"max_tokens\":10,\"messages\":[{\"role\":\"user\",\"content\":\"say OK\"}]}")
  fi
  local end=$(date +%s%3N)
  local lat=$((end-start))
  local snippet=""
  if [ "$http_code" != "200" ]; then
    snippet=$(head -c 300 "$out" | tr '\n\t' '  ')
  fi
  echo -e "${model}\t${http_code}\t${lat}\t${snippet}" | tee -a "$SUMMARY"
}

for m in \
  "gpt-5" \
  "gpt-5-mini" \
  "gpt-5.2" \
  "gpt-5.2-chat-latest" \
  "gpt-5.3-codex" \
  "gpt-5.4" \
  "gpt-4.1" \
  "gpt-4.1-mini" \
  "gpt-4o" \
  "gpt-4o-mini" \
  "gpt-oss-120b" \
  "claude-opus-4-7" \
  "claude-opus-4-6" \
  "claude-opus-4-5-20251101" \
  "claude-opus-4-1-20250805" \
  "claude-sonnet-4-6" \
  "claude-sonnet-4-6-thinking" \
  "claude-sonnet-4-5-20250929" \
  "claude-sonnet-4-20250514" \
  "claude-haiku-4-5-20251001" \
  "gemini-3.1-pro-preview" \
  "gemini-3-pro-preview" \
  "gemini-3-flash-preview" \
  "gemini-2.5-pro" \
  "gemini-2.5-flash" \
  "gemini-2.5-flash-lite" \
  "deepseek-v3.2" \
  "deepseek-v3.1" \
  "deepseek-r1" \
  "kimi-k2.5" \
  "kimi-k2-thinking" \
  "qwen3-max" \
  "qwen3.6-plus" \
  "qwen3-coder-plus" \
  "glm-5" \
  "MiniMax-M2.5" \
  "seed-2-0-pro-260328" \
  "seed-2-0-mini-260215" \
  "seed-1-8-251228"
do
  probe "$m" ""
  sleep 0.3
done
echo "---DONE---"
cat "$SUMMARY"
