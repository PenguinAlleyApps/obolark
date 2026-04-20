-- Obolark Orchestrator · Supabase schema
-- Three tables that power the live A2A orchestration layer.
-- Run this migration once in the Supabase SQL editor.

-- ──────────────────────────────────────────────────────────────────────────
-- Table 1: orchestration_runs
-- One row per tick. Captures the full workflow from buyer-decide to
-- post-process output. The dashboard pulls the latest N rows for the
-- "Current Orchestration" marquee + VII·Orchestrations tab.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestration_runs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Roles
  buyer_code TEXT NOT NULL,
  buyer_codename TEXT NOT NULL,
  seller_code TEXT NOT NULL,
  seller_codename TEXT NOT NULL,
  seller_endpoint TEXT NOT NULL,

  -- Economics
  price_usdc TEXT NOT NULL,
  amount_base_units TEXT,
  tx_hash TEXT,
  feedback_tx_hash TEXT,

  -- Content
  prompt_to_seller TEXT NOT NULL,
  seller_response TEXT,
  seller_response_preview TEXT,
  post_process_output TEXT,

  -- Status lifecycle: pending → paying → waiting_response → post_processing → completed | failed
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT,

  -- Traces
  tick_round INTEGER NOT NULL,
  duration_ms INTEGER,
  claude_tokens_in INTEGER,
  claude_tokens_out INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_created_at ON orchestration_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_buyer ON orchestration_runs(buyer_code);
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_status ON orchestration_runs(status);
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_tick_round ON orchestration_runs(tick_round DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- Table 2: agent_inbox
-- One row per agent containing their latest completed output. Overwrites
-- per-agent on each completed tick. The dashboard IV·Agents tab + VII tab
-- read this for "current work" + output excerpt cards.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_inbox (
  agent_code TEXT PRIMARY KEY,
  agent_codename TEXT NOT NULL,
  last_run_id BIGINT REFERENCES orchestration_runs(id),
  last_output TEXT,
  last_output_preview TEXT,
  last_tx_hash TEXT,
  last_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle',
  total_paid_usdc NUMERIC(10, 6) DEFAULT 0,
  total_received_usdc NUMERIC(10, 6) DEFAULT 0,
  lifetime_runs INTEGER DEFAULT 0
);

-- Seed all 23 agents (22 SCA + BUYER-EOA) into the inbox.
INSERT INTO agent_inbox (agent_code, agent_codename, status) VALUES
  ('PAco', 'HADES', 'idle'),
  ('ATLAS', 'ATLAS', 'idle'),
  ('PIXEL', 'DAEDALUS', 'idle'),
  ('SENTINEL', 'CERBERUS', 'idle'),
  ('PHANTOM', 'THANATOS', 'idle'),
  ('ARGUS', 'ARGUS', 'idle'),
  ('GUARDIAN', 'AEGIS', 'idle'),
  ('RADAR', 'ORACLE', 'idle'),
  ('COMPASS', 'HERMES', 'idle'),
  ('ECHO', 'IRIS', 'idle'),
  ('HUNTER', 'ARTEMIS', 'idle'),
  ('LENS', 'APOLLO', 'idle'),
  ('FRAME', 'URANIA', 'idle'),
  ('REEL', 'CALLIOPE', 'idle'),
  ('LEDGER', 'PLUTUS', 'idle'),
  ('SHIELD', 'THEMIS', 'idle'),
  ('HARBOR', 'POSEIDON', 'idle'),
  ('DISCOVERY', 'PROTEUS', 'idle'),
  ('FOREMAN', 'HEPHAESTUS', 'idle'),
  ('SCOUT', 'HESTIA', 'idle'),
  ('WATCHMAN', 'HELIOS', 'idle'),
  ('PIONEER', 'PROMETHEUS', 'idle'),
  ('BUYER-EOA', 'BUYER-EOA', 'idle')
ON CONFLICT (agent_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Table 3: orchestrator_state
-- Singleton row with kill-switch + counters. Enables/disables the loop +
-- tracks hourly spending / tick budget for Argus's audit cron.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestrator_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  paused_reason TEXT,
  last_tick_at TIMESTAMPTZ,
  tick_round INTEGER NOT NULL DEFAULT 0,

  -- Rolling hourly budget (rolling 60-min window)
  hourly_tick_count INTEGER NOT NULL DEFAULT 0,
  hourly_usdc_spent NUMERIC(10, 6) NOT NULL DEFAULT 0,
  hourly_window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Lifetime totals
  lifetime_ticks INTEGER NOT NULL DEFAULT 0,
  lifetime_usdc_spent NUMERIC(10, 6) NOT NULL DEFAULT 0,
  lifetime_claude_tokens_in BIGINT NOT NULL DEFAULT 0,
  lifetime_claude_tokens_out BIGINT NOT NULL DEFAULT 0,

  -- Guards (configurable via Supabase UI)
  hourly_tick_ceiling INTEGER NOT NULL DEFAULT 40,
  hourly_usdc_ceiling NUMERIC(10, 6) NOT NULL DEFAULT 0.05,
  deposit_floor_usdc NUMERIC(10, 6) NOT NULL DEFAULT 0.1,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO orchestrator_state (id, enabled) VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS: enable read-only for anon (dashboard reads), write only for service role
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE orchestration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow anon read orchestration_runs" ON orchestration_runs;
CREATE POLICY "allow anon read orchestration_runs" ON orchestration_runs FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow anon read agent_inbox" ON agent_inbox;
CREATE POLICY "allow anon read agent_inbox" ON agent_inbox FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow anon read orchestrator_state" ON orchestrator_state;
CREATE POLICY "allow anon read orchestrator_state" ON orchestrator_state FOR SELECT USING (true);

-- Service role has full access by default in Supabase (bypasses RLS).

-- ──────────────────────────────────────────────────────────────────────────
-- Helper view: v_orchestration_feed
-- Convenience view used by the dashboard marquee + VII tab.
-- ──────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_orchestration_feed;
CREATE VIEW v_orchestration_feed AS
SELECT
  r.id,
  r.created_at,
  r.tick_round,
  r.buyer_code,
  r.buyer_codename,
  r.seller_code,
  r.seller_codename,
  r.seller_endpoint,
  r.price_usdc,
  r.status,
  r.seller_response_preview,
  r.post_process_output,
  r.tx_hash,
  r.feedback_tx_hash,
  r.duration_ms
FROM orchestration_runs r
ORDER BY r.created_at DESC
LIMIT 50;


-- ──────────────────────────────────────────────────────────────────────────
-- narrations
-- The Oracle's divinations (Gemini-narrated). Ephemeral — expires_at used
-- by a future cleanup cron. Bullets stored as text[] so the UI can render
-- them as separate typewriter lines without re-splitting.
-- Added 2026-04-20 (Day 2, Obolark v2 hackathon — Gemini partner track).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS narrations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bullets TEXT[] NOT NULL,
  reputation_touched TEXT[] DEFAULT '{}',
  cited_hashes TEXT[] DEFAULT '{}',
  grounding_sources JSONB DEFAULT '[]',
  cost_usdc NUMERIC(10, 6) DEFAULT 0.001,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);
CREATE INDEX IF NOT EXISTS idx_narrations_created_at ON narrations(created_at DESC);
ALTER TABLE narrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow anon read narrations" ON narrations;
CREATE POLICY "allow anon read narrations" ON narrations FOR SELECT USING (true);

-- ──────────────────────────────────────────────────────────────────────────
-- featherless_runs
-- Provenance for /api/featherless-route calls. Tracks which Featherless
-- model served each agent_code on behalf of which payer. Used by the
-- Open-Weight Civic Service panel (Tab VIII sibling). Best-effort —
-- failures inside the route are swallowed so x402 settlement is never
-- blocked by Supabase hiccups.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featherless_runs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_code TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_chars INTEGER DEFAULT 0,
  content_chars INTEGER DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  payer TEXT,
  tx_hash TEXT,
  degraded BOOLEAN DEFAULT false,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_featherless_runs_created_at ON featherless_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_featherless_runs_agent_code ON featherless_runs(agent_code);
ALTER TABLE featherless_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow anon read featherless_runs" ON featherless_runs;
CREATE POLICY "allow anon read featherless_runs" ON featherless_runs FOR SELECT USING (true);
