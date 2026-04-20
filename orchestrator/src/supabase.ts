/**
 * Supabase client for the orchestrator. Uses service_role on the worker side
 * (full RW), anon on the read-path inside the Next.js app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL missing');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
