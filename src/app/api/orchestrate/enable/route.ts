/**
 * POST /api/orchestrate/enable — flip orchestrator_state.enabled = true.
 *
 * Header auth: `x-obolark-admin: ${ORCHESTRATOR_ADMIN_TOKEN}`.
 * The worker reads orchestrator_state at the top of every tick, so the
 * effect lands within one tick interval (≤60s).
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

  try {
    const sb = serviceClient();
    const { data, error } = await sb
      .from('orchestrator_state')
      .update({
        enabled: true,
        paused_reason: null,
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
