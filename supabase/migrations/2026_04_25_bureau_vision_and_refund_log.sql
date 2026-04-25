-- 2026_04_25_bureau_vision_and_refund_log.sql
-- Bureau vision bucket (signed-URL only) + refund idempotency log.

-- 1. Storage bucket for buyer-uploaded delivery proofs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bureau-vision',
  'bureau-vision',
  false,                                          -- private; signed URLs only
  2097152,                                        -- 2MB per file
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: only service role writes; signed URLs read.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'service-role-write-bureau-vision'
  ) then
    create policy "service-role-write-bureau-vision" on storage.objects
      for insert with check (auth.role() = 'service_role' and bucket_id = 'bureau-vision');
  end if;
end $$;

-- 2. Refund idempotency log — one row per refund attempt.
create table if not exists public.bureau_refund_log (
  id              bigserial primary key,
  orig_tx_hash    text not null unique,           -- the original x402 receipt tx
  refund_tx_hash  text,                           -- the Circle-issued refund tx (null until settled)
  payer_eoa       text not null,
  amount_usdc     numeric(38,18) not null,
  wallet_id_used  text not null,
  status          text not null default 'pending'
                  check (status in ('pending','settled','failed')),
  warden          text not null default 'THEMIS',
  initiated_at    timestamptz not null default now(),
  settled_at      timestamptz,
  failure_reason  text
);

create index if not exists idx_refund_log_orig_tx
  on public.bureau_refund_log (orig_tx_hash);

create index if not exists idx_refund_log_status
  on public.bureau_refund_log (status, initiated_at desc);

-- 3. Narrations table extension — add `provider` column for VFX gate.
alter table public.narrations
  add column if not exists provider text default 'gemini';
