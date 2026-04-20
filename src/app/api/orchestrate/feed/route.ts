/**
 * GET /api/orchestrate/feed — Live Orchestration feed.
 *
 * Contract (locked MVP, CONDITIONAL-GO 2026-04-20):
 *   {
 *     state: { enabled, tick_round, hourly_tick_count, hourly_usdc_spent,
 *              lifetime_ticks, last_tick_at },
 *     runs: Run[],     // chronological, newest first, last 20
 *     inbox: Record<agent_code, InboxEntry>
 *   }
 *
 * Mock mode is gated by OBOLARK_MOCK_ORCH=1 so Pixel's UI can smoke-test
 * without Supabase. If Supabase env vars are absent or the query errors,
 * we fall back to emptyFeed() — the UI handles the empty state visually.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mockFeed, emptyFeed, type FeedResponse, type Run, type InboxEntry } from './mock-seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAnonClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function liveFeed(): Promise<FeedResponse | null> {
  const sb = getAnonClient();
  if (!sb) return null;

  const [feedRes, stateRes, inboxRes] = await Promise.all([
    sb.from('v_orchestration_feed').select('*').limit(20),
    sb.from('orchestrator_state').select('*').eq('id', 1).single(),
    sb
      .from('agent_inbox')
      .select(
        'agent_code,agent_codename,last_output,last_output_preview,last_tx_hash,last_at,status,total_paid_usdc,total_received_usdc,lifetime_runs',
      ),
  ]);
  if (feedRes.error || stateRes.error || inboxRes.error) return null;

  const runs: Run[] = (feedRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    created_at: String(r.created_at),
    tick_round: Number(r.tick_round),
    buyer_code: String(r.buyer_code),
    buyer_codename: String(r.buyer_codename),
    seller_code: String(r.seller_code),
    seller_codename: String(r.seller_codename),
    seller_endpoint: String(r.seller_endpoint),
    price_usdc: String(r.price_usdc),
    status: r.status as Run['status'],
    seller_response_preview:
      typeof r.seller_response_preview === 'string'
        ? (r.seller_response_preview as string).slice(0, 140)
        : null,
    post_process_output:
      typeof r.post_process_output === 'string' ? (r.post_process_output as string) : null,
    tx_hash: (r.tx_hash as string | null) ?? null,
    feedback_tx_hash: (r.feedback_tx_hash as string | null) ?? null,
    duration_ms: (r.duration_ms as number | null) ?? null,
  }));

  const inbox: Record<string, InboxEntry> = {};
  for (const row of inboxRes.data ?? []) {
    inbox[String(row.agent_code)] = {
      agent_code: String(row.agent_code),
      agent_codename: String(row.agent_codename),
      last_output: (row.last_output as string | null) ?? null,
      last_output_preview: (row.last_output_preview as string | null) ?? null,
      last_tx_hash: (row.last_tx_hash as string | null) ?? null,
      last_at: (row.last_at as string | null) ?? null,
      status: (row.status as InboxEntry['status']) ?? 'idle',
      total_paid_usdc: Number(row.total_paid_usdc ?? 0),
      total_received_usdc: Number(row.total_received_usdc ?? 0),
      lifetime_runs: Number(row.lifetime_runs ?? 0),
    };
  }

  const s = stateRes.data as Record<string, unknown>;
  return {
    state: {
      enabled: Boolean(s.enabled),
      tick_round: Number(s.tick_round ?? 0),
      hourly_tick_count: Number(s.hourly_tick_count ?? 0),
      hourly_usdc_spent: Number(s.hourly_usdc_spent ?? 0),
      lifetime_ticks: Number(s.lifetime_ticks ?? 0),
      last_tick_at: (s.last_tick_at as string | null) ?? null,
    },
    runs,
    inbox,
  };
}

export async function GET() {
  try {
    if (process.env.OBOLARK_MOCK_ORCH === '1') {
      return NextResponse.json(mockFeed(), {
        headers: { 'cache-control': 'no-store' },
      });
    }
    const live = await liveFeed();
    return NextResponse.json(live ?? emptyFeed(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json(emptyFeed(), {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
