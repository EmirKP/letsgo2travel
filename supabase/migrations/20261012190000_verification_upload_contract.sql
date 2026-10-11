-- Repair the deployed legacy verification schema without losing old proof paths.
begin;

alter table public.travel_verifications
  add column if not exists user_note text,
  add column if not exists evidence_path text,
  add column if not exists evidence_type text,
  add column if not exists evidence_bucket text not null default 'travel-evidence',
  add column if not exists evidence_expires_at timestamptz default (now() + interval '30 days');

-- Only the authenticated API may bind an object path to a review. Legacy
-- client INSERT policies validate proof_file_path but not the new evidence fields.
revoke insert,update,delete on public.travel_verifications from public,anon,authenticated;

-- Old proofs stay in their original private bucket. No object is copied or deleted.
update public.travel_verifications
set evidence_path = proof_file_path,
    evidence_type = proof_type,
    evidence_bucket = 'travel-proofs',
    evidence_expires_at = created_at + interval '30 days'
where evidence_path is null and proof_file_path is not null and proof_deleted_at is null;

create index if not exists travel_verifications_evidence_expiry_idx
  on public.travel_verifications(evidence_expires_at) where evidence_path is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('travel-evidence', 'travel-evidence', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- The existing service-only review function needs these award/audit tables.
create table if not exists public.user_country_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  country_name text,
  verification_id uuid references public.travel_verifications(id) on delete set null,
  unlocked_at timestamptz default now(),
  animation_seen_at timestamptz,
  is_active boolean default true,
  unique(user_id,country_code)
);
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  badge_label text not null,
  country_code text,
  awarded_at timestamptz default now(),
  unique(user_id,badge_key,country_code)
);
create table if not exists public.user_trust_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trust_level integer default 0,
  verified_country_count integer default 0,
  approved_content_count integer default 0,
  rejected_content_count integer default 0,
  updated_at timestamptz default now()
);
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  note text,
  created_at timestamptz default now()
);

alter table public.user_country_unlocks enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_trust_scores enable row level security;
alter table public.admin_audit_logs enable row level security;
revoke all on public.user_country_unlocks,public.user_badges,public.user_trust_scores,public.admin_audit_logs from anon,authenticated;
grant all on public.user_country_unlocks,public.user_badges,public.user_trust_scores,public.admin_audit_logs to service_role;

notify pgrst, 'reload schema';
commit;
