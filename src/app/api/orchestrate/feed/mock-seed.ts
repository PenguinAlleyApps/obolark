/**
 * Mock seed for /api/orchestrate/feed.
 *
 * Deleted by Atlas once the Supabase read is wired up. Kept in its own
 * file so the route handler stays short + easy to diff against the real
 * implementation.
 */

export type RunStatus =
  | 'pending'
  | 'paying'
  | 'waiting_response'
  | 'post_processing'
  | 'completed'
  | 'failed';

export type Run = {
  id: number;
  created_at: string;
  tick_round: number;
  buyer_code: string;
  buyer_codename: string;
  seller_code: string;
  seller_codename: string;
  seller_endpoint: string;
  price_usdc: string;
  status: RunStatus;
  seller_response_preview: string | null;
  post_process_output: string | null;
  tx_hash: string | null;
  feedback_tx_hash: string | null;
  duration_ms: number | null;
};

export type InboxEntry = {
  agent_code: string;
  agent_codename: string;
  last_output: string | null;
  last_output_preview: string | null;
  last_tx_hash: string | null;
  last_at: string | null;
  status: 'idle' | 'working' | 'pending';
  total_paid_usdc: number;
  total_received_usdc: number;
  lifetime_runs: number;
};

export type FeedResponse = {
  state: {
    enabled: boolean;
    tick_round: number;
    hourly_tick_count: number;
    hourly_usdc_spent: number;
    lifetime_ticks: number;
    last_tick_at: string | null;
  };
  runs: Run[];
  inbox: Record<string, InboxEntry>;
};

function isoSecondsAgo(s: number): string {
  return new Date(Date.now() - s * 1000).toISOString();
}

function randomHash(): string {
  const chars = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

export function mockFeed(): FeedResponse {
  const liveHash = '0x7a1b4c9f0a3e2d51' + '0'.repeat(48);
  const h1 = randomHash();
  const h2 = randomHash();
  const h3 = randomHash();
  const h4 = randomHash();

  const runs: Run[] = [
    {
      id: 4217, created_at: isoSecondsAgo(3), tick_round: 7,
      buyer_code: 'ECHO', buyer_codename: 'HERMES',
      seller_code: 'RADAR', seller_codename: 'ORACLE',
      seller_endpoint: '/api/research', price_usdc: '0.003',
      status: 'waiting_response',
      seller_response_preview:
        'USDC adoption on Arc climbed 14% WoW — driven by nanopayment rails. Competitor stable at flat.',
      post_process_output: null,
      tx_hash: liveHash, feedback_tx_hash: null, duration_ms: null,
    },
    {
      id: 4216, created_at: isoSecondsAgo(38), tick_round: 7,
      buyer_code: 'HUNTER', buyer_codename: 'CHARON',
      seller_code: 'COMPASS', seller_codename: 'SIBYL',
      seller_endpoint: '/api/qa', price_usdc: '0.004',
      status: 'completed',
      seller_response_preview:
        'Strategic brief: shift outbound to US-EST morning block; yield +22% vs MXN afternoon send.',
      post_process_output:
        'Strategic brief: shift outbound to US-EST morning block; yield +22% vs MXN afternoon send. Hunter compiled this into a 3-send cadence. A/B split: 50/50 week 1, graduate to 70/30 week 2 if open-rate delta >8%.',
      tx_hash: h1, feedback_tx_hash: randomHash(), duration_ms: 8420,
    },
    {
      id: 4215, created_at: isoSecondsAgo(87), tick_round: 7,
      buyer_code: 'PIXEL', buyer_codename: 'HEPHAESTUS',
      seller_code: 'SENTINEL', seller_codename: 'ARGOS',
      seller_endpoint: '/api/qa', price_usdc: '0.004',
      status: 'completed',
      seller_response_preview:
        'Accessibility pass on VII tab: 3 contrast fails in muted footnotes, 1 aria-label missing on LED cluster.',
      post_process_output:
        'Accessibility pass on VII tab: 3 contrast fails, 1 aria-label missing. Pixel patched 4/4 within the same tick.',
      tx_hash: h2, feedback_tx_hash: randomHash(), duration_ms: 7120,
    },
    {
      id: 4214, created_at: isoSecondsAgo(142), tick_round: 6,
      buyer_code: 'ATLAS', buyer_codename: 'DAEDALUS',
      seller_code: 'PHANTOM', seller_codename: 'NEMESIS',
      seller_endpoint: '/api/security-scan', price_usdc: '0.005',
      status: 'completed',
      seller_response_preview:
        'SCA scan: 0 criticals, 2 mediums (dep drift in viem 2.48→2.51). Patched by Atlas mid-tick.',
      post_process_output:
        'SCA scan: 0 criticals, 2 mediums. Atlas auto-patched the viem drift and re-ran — clean.',
      tx_hash: h3, feedback_tx_hash: randomHash(), duration_ms: 9110,
    },
    {
      id: 4213, created_at: isoSecondsAgo(198), tick_round: 6,
      buyer_code: 'ARGUS', buyer_codename: 'MINOS',
      seller_code: 'RADAR', seller_codename: 'ORACLE',
      seller_endpoint: '/api/research', price_usdc: '0.003',
      status: 'completed',
      seller_response_preview:
        'Zero-gap audit: 1 missing spec on orchestrator back-pressure. Ledger-logged for Atlas.',
      post_process_output:
        'Zero-gap audit: 1 gap filed. Argus opened a tracker; Atlas acknowledged within 18s.',
      tx_hash: h4, feedback_tx_hash: randomHash(), duration_ms: 6640,
    },
    {
      id: 4212, created_at: isoSecondsAgo(256), tick_round: 6,
      buyer_code: 'ECHO', buyer_codename: 'HERMES',
      seller_code: 'COMPASS', seller_codename: 'SIBYL',
      seller_endpoint: '/api/research', price_usdc: '0.003',
      status: 'completed',
      seller_response_preview:
        'Narrative density for Bureau Ledger landing: 0.74 (target 0.65+). Shipping as-is.',
      post_process_output:
        'Narrative density 0.74 — green-lit. Echo copied the top 3 lines to the marquee rotation.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 5910,
    },
    {
      id: 4211, created_at: isoSecondsAgo(321), tick_round: 5,
      buyer_code: 'HUNTER', buyer_codename: 'CHARON',
      seller_code: 'RADAR', seller_codename: 'ORACLE',
      seller_endpoint: '/api/research', price_usdc: '0.003',
      status: 'completed',
      seller_response_preview:
        'Partner landscape: 11 verified orgs in Agentic Economy bracket. 2 dropped for NXDOMAIN.',
      post_process_output:
        'Verified 11 orgs. Hunter queued 11 email drafts — all passing the no-voice-contact gate.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 10120,
    },
    {
      id: 4210, created_at: isoSecondsAgo(402), tick_round: 5,
      buyer_code: 'PIXEL', buyer_codename: 'HEPHAESTUS',
      seller_code: 'SENTINEL', seller_codename: 'ARGOS',
      seller_endpoint: '/api/qa', price_usdc: '0.004',
      status: 'failed',
      seller_response_preview: null, post_process_output: null,
      tx_hash: null, feedback_tx_hash: null, duration_ms: null,
    },
    {
      id: 4209, created_at: isoSecondsAgo(486), tick_round: 5,
      buyer_code: 'ATLAS', buyer_codename: 'DAEDALUS',
      seller_code: 'RADAR', seller_codename: 'ORACLE',
      seller_endpoint: '/api/research', price_usdc: '0.003',
      status: 'completed',
      seller_response_preview:
        'Supabase realtime pricing: $25/mo over 500MB. Stay on free tier for submission.',
      post_process_output:
        'Atlas held on free-tier, instrumented daily size check. Crosses $450MB → migration alert.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 7390,
    },
    {
      id: 4208, created_at: isoSecondsAgo(560), tick_round: 5,
      buyer_code: 'ARGUS', buyer_codename: 'MINOS',
      seller_code: 'SENTINEL', seller_codename: 'ARGOS',
      seller_endpoint: '/api/qa', price_usdc: '0.004',
      status: 'completed',
      seller_response_preview:
        'Runtime Verification Gate: 14/14 routes return 200 on Vercel preview, no 500s in 30m.',
      post_process_output: 'All 14 routes green. Argus cleared the deploy stamp.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 6230,
    },
    {
      id: 4207, created_at: isoSecondsAgo(640), tick_round: 4,
      buyer_code: 'ECHO', buyer_codename: 'HERMES',
      seller_code: 'PHANTOM', seller_codename: 'NEMESIS',
      seller_endpoint: '/api/security-scan', price_usdc: '0.005',
      status: 'completed',
      seller_response_preview:
        'Copy deck scan: no PII leakage. 1 superlative flagged ("best-in-class") — softened.',
      post_process_output:
        'Phantom softened 1 phrase. Echo approved. Copy deck locked for Thursday send.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 5470,
    },
    {
      id: 4206, created_at: isoSecondsAgo(712), tick_round: 4,
      buyer_code: 'HUNTER', buyer_codename: 'CHARON',
      seller_code: 'COMPASS', seller_codename: 'SIBYL',
      seller_endpoint: '/api/qa', price_usdc: '0.004',
      status: 'completed',
      seller_response_preview:
        'Outbound yield model: ROI breakeven at send #14. Stop-loss at send #20.',
      post_process_output:
        'Model green, Hunter wired stop-loss into outbound scheduler. First 14 queued.',
      tx_hash: randomHash(), feedback_tx_hash: randomHash(), duration_ms: 7990,
    },
  ];

  const inbox: Record<string, InboxEntry> = {
    ECHO: {
      agent_code: 'ECHO', agent_codename: 'HERMES',
      last_output: runs[0].seller_response_preview,
      last_output_preview: runs[0].seller_response_preview,
      last_tx_hash: runs[0].tx_hash, last_at: runs[0].created_at,
      status: 'working',
      total_paid_usdc: 0.042, total_received_usdc: 0, lifetime_runs: 14,
    },
    HUNTER: {
      agent_code: 'HUNTER', agent_codename: 'CHARON',
      last_output: runs[1].post_process_output,
      last_output_preview: runs[1].seller_response_preview,
      last_tx_hash: runs[1].tx_hash, last_at: runs[1].created_at,
      status: 'idle',
      total_paid_usdc: 0.024, total_received_usdc: 0, lifetime_runs: 8,
    },
    PIXEL: {
      agent_code: 'PIXEL', agent_codename: 'HEPHAESTUS',
      last_output: runs[2].post_process_output,
      last_output_preview: runs[2].seller_response_preview,
      last_tx_hash: runs[2].tx_hash, last_at: runs[2].created_at,
      status: 'idle',
      total_paid_usdc: 0.028, total_received_usdc: 0, lifetime_runs: 9,
    },
    ATLAS: {
      agent_code: 'ATLAS', agent_codename: 'DAEDALUS',
      last_output: runs[3].post_process_output,
      last_output_preview: runs[3].seller_response_preview,
      last_tx_hash: runs[3].tx_hash, last_at: runs[3].created_at,
      status: 'idle',
      total_paid_usdc: 0.019, total_received_usdc: 0, lifetime_runs: 6,
    },
    ARGUS: {
      agent_code: 'ARGUS', agent_codename: 'MINOS',
      last_output: runs[4].post_process_output,
      last_output_preview: runs[4].seller_response_preview,
      last_tx_hash: runs[4].tx_hash, last_at: runs[4].created_at,
      status: 'idle',
      total_paid_usdc: 0.012, total_received_usdc: 0, lifetime_runs: 4,
    },
  };

  return {
    state: {
      enabled: true,
      tick_round: 7,
      hourly_tick_count: 28,
      hourly_usdc_spent: 0.0912,
      lifetime_ticks: 412,
      last_tick_at: runs[0].created_at,
    },
    runs,
    inbox,
  };
}

export function emptyFeed(): FeedResponse {
  return {
    state: {
      enabled: false,
      tick_round: 0,
      hourly_tick_count: 0,
      hourly_usdc_spent: 0,
      lifetime_ticks: 0,
      last_tick_at: null,
    },
    runs: [],
    inbox: {},
  };
}
