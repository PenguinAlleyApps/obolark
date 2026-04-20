# Obolark Orchestrator — Atlas / Pixel Contract

**Last locked:** 2026-04-20 after CONDITIONAL-GO.

## HTTP endpoint Pixel consumes

`GET /api/orchestrate/feed` → `FeedResponse`

```ts
type FeedResponse = {
  state: {
    enabled: boolean;
    tick_round: number;
    hourly_tick_count: number;
    hourly_usdc_spent: number;   // decimal, 6dp
    lifetime_ticks: number;
    last_tick_at: string | null;  // ISO 8601
  };
  runs: Run[];                    // newest first, up to 20
  inbox: Record<string, InboxEntry>; // keyed by agent_code
};
```

`Run.status` is one of: `'pending' | 'paying' | 'waiting_response' | 'post_processing' | 'completed' | 'failed'`.

`Run.seller_response_preview` is **≤140 chars** (API route slices it defensively).

`InboxEntry.status` is one of: `'idle' | 'working' | 'pending'`.

If the worker hasn't populated Supabase yet, the route returns `emptyFeed()` — the UI handles this visually (no error surfaced).

## Supabase schema source of truth

`orchestrator/supabase-schema.sql`. Any column change ripples to:

1. The `v_orchestration_feed` view at the bottom of the SQL file.
2. The `Run` type in `src/app/api/orchestrate/feed/mock-seed.ts`.
3. The mapping in `src/app/api/orchestrate/feed/route.ts::liveFeed()`.

If you change `v_orchestration_feed` columns, **update this file + message Pixel** before merging.

## Agent briefs

`src/agents/briefs.json` is the single source of truth. The worker ships a copy at `orchestrator/src/briefs.data.json` — if you edit the root one, copy it over and redeploy:

```bash
cp src/agents/briefs.json orchestrator/src/briefs.data.json
```

## Worker environment variables (Railway)

| Var | Source | Purpose |
|-----|--------|---------|
| `SUPABASE_URL` | Supabase dashboard | Service connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard | Service RW access |
| `CIRCLE_API_KEY` | Circle dashboard | Dev-controlled wallets API |
| `CIRCLE_ENTITY_SECRET` | Circle dashboard | MPC signing |
| `AISA_API_KEY` | AISA.one | Claude gateway |
| `WALLETS_JSON_B64` | `base64 wallets.json` | 23 wallet records (contains walletIds; keep secret) |
| `AGENT_IDS_JSON` | `src/config/agent-ids.json` | ERC-8004 agentId map (public, optional override) |
| `TICK_INTERVAL_MS` | default 60000 | Override for faster/slower cadence |
| `MODEL_SELLER` | default `claude-haiku-4-5-20251001` | Seller-side Claude (AISA ids include date) |
| `MODEL_POSTPROCESS` | default `claude-haiku-4-5-20251001` | Post-process Claude |
| `TELEGRAM_BOT_TOKEN` | monorepo .env | Audit cron notifications |
| `TELEGRAM_CHAT_ID` | monorepo .env | CEO chat |
| `AUDIT_KILL_LIFETIME_USD` | default 1.0 | Emergency kill-switch threshold |

## Next.js (Vercel) environment variables

Set on the Obolark Vercel deploy for the feed/enable/disable routes:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (feed route, read-only)
- `SUPABASE_SERVICE_ROLE_KEY` (enable/disable routes, write)
- `ORCHESTRATOR_ADMIN_TOKEN` (any long random string; required header for enable/disable)

## Kill-switch

```bash
curl -X POST https://obolark.vercel.app/api/orchestrate/disable \
  -H "x-obolark-admin: $ORCHESTRATOR_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"reason":"emergency stop"}'
```

Re-enable:

```bash
curl -X POST https://obolark.vercel.app/api/orchestrate/enable \
  -H "x-obolark-admin: $ORCHESTRATOR_ADMIN_TOKEN"
```

The worker polls `orchestrator_state` at the top of every tick, so disable lands within one `TICK_INTERVAL_MS` (default 60 s).

## Hard guards

| Guard | Default | Location |
|-------|---------|----------|
| hourly_tick_ceiling | 40 | `orchestrator_state.hourly_tick_ceiling` |
| hourly_usdc_ceiling | 0.05 | `orchestrator_state.hourly_usdc_ceiling` |
| deposit_floor_usdc | 0.10 | `orchestrator_state.deposit_floor_usdc` |
| lifetime kill-switch | 1.0 USDC | `AUDIT_KILL_LIFETIME_USD` env (audit cron flips enabled=false) |

## x402 blocker

x402 `/verify` returns `authorization_validity_too_short`. The worker does **NOT** touch x402. All payments use Circle direct `createTransaction` (same pattern as `scripts/08-economy-driver.mjs`). Onchain settlement is indistinguishable from any other ERC-20 transfer from the buyer SCA.
