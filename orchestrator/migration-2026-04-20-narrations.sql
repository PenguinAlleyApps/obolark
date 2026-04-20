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
