/**
 * POST /api/orchestrate/disable — flip orchestrator_state.enabled = false.
 *
 * Header auth: `x-obolark-admin: ${ORCHESTRATOR_ADMIN_TOKEN}`.
 * Optional JSON body: `{ "reason": "..." }` — stored on paused_reason.
 * Effect lands within one tick interval (≤60s).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE service creds missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  const expected = process.env.ORCHESTRATOR_ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'admin token not configured' }, { status: 500 });
  }
  const got = req.headers.get('x-obolark-admin');
  if (got !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let reason: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    if (typeof body?.reason === 'string') reason = body.reason.slice(0, 500);
  } catch { /* no body is fine */ }

  try {
    const sb = serviceClient();
    const { data, error } = await sb
      .from('orchestrator_state')
      .update({
        enabled: false,
        paused_reason: reason ?? 'manual_disable',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('enabled,paused_reason,updated_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, state: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
