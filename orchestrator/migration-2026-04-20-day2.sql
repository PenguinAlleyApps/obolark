-- Obolark v2 · Day 2 migration (Apr 20, 2026)
-- Adds `narrations` (Gemini Oracle) + `featherless_runs` (Open-Weight Civic Service provenance)
-- Idempotent. Paste into Supabase Studio SQL Editor for project ijorjbcttweqcnuivwou.

-- ──────────────────────────────────────────────────────────────────────────
-- Table: narrations
-- Gemini 3.1 Flash Live Preview Oracle outputs. One row per SUMMON.
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
-- Table: featherless_runs
-- Provenance of each Featherless OSS-model call. Ember-glyph UI reads this.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featherless_runs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_code TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INT,
  tokens_out INT,
  prompt TEXT,
  content TEXT,
  tx_hash TEXT,
  cost_usdc NUMERIC(10, 6) DEFAULT 0.002
);

CREATE INDEX IF NOT EXISTS idx_featherless_runs_created_at ON featherless_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_featherless_runs_agent_code ON featherless_runs(agent_code);

ALTER TABLE featherless_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow anon read featherless_runs" ON featherless_runs;
CREATE POLICY "allow anon read featherless_runs" ON featherless_runs FOR SELECT USING (true);

-- ──────────────────────────────────────────────────────────────────────────
-- orchestration_runs · new provider column for AISA/Featherless tracking
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE orchestration_runs
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'aisa';

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_provider ON orchestration_runs(provider);
