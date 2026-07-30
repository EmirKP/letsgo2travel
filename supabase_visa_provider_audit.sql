-- LetsGo2Travel — Schengen sağlayıcı erişim denetimi
-- Supabase SQL Editor içinde tek sefer çalıştırın.
-- Mevcut vize tablolarını silmez.

create table if not exists public.visa_provider_test_targets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  provider_code text not null,
  provider_name text not null,
  label text not null,
  covered_countries text[] not null default '{}'::text[],
  probe_url text not null,
  official_url text not null,
  mode text not null default 'external_provider' check (mode in ('external_provider','direct_state_portal')),
  enabled boolean not null default true,
  queued_at timestamptz,
  locked_until timestamptz,
  locked_by text,
  last_outcome text check (last_outcome is null or last_outcome in ('accessible','verification_required','blocked','provider_unavailable','error')),
  last_http_status integer,
  last_checked_at timestamptz,
  last_message text,
  last_final_url text,
  last_title text,
  last_evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visa_provider_test_runs (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.visa_provider_test_targets(id) on delete cascade,
  worker_name text,
  outcome text not null check (outcome in ('accessible','verification_required','blocked','provider_unavailable','error')),
  http_status integer,
  final_url text,
  page_title text,
  message text,
  evidence_url text,
  duration_ms integer,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists visa_provider_test_targets_queue_idx
  on public.visa_provider_test_targets(queued_at, enabled)
  where queued_at is not null and enabled = true;

create index if not exists visa_provider_test_runs_target_idx
  on public.visa_provider_test_runs(target_id, checked_at desc);

alter table public.visa_provider_test_targets enable row level security;
alter table public.visa_provider_test_runs enable row level security;

create or replace function public.claim_visa_provider_tests(p_worker_name text, p_limit integer default 2)
returns setof public.visa_provider_test_targets
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.visa_provider_test_targets
    where enabled = true
      and queued_at is not null
      and (locked_until is null or locked_until < now())
    order by queued_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 5))
  )
  update public.visa_provider_test_targets t
  set locked_until = now() + interval '4 minutes',
      locked_by = left(p_worker_name, 80),
      updated_at = now()
  from candidates c
  where t.id = c.id
  returning t.*;
end;
$$;

revoke all on function public.claim_visa_provider_tests(text, integer) from public, anon, authenticated;
grant execute on function public.claim_visa_provider_tests(text, integer) to service_role;

insert into public.visa_provider_test_targets
  (code, provider_code, provider_name, label, covered_countries, probe_url, official_url, mode)
values
  ('idata-de', 'idata', 'iDATA', 'iDATA Almanya randevu portalı', array['DE'], 'https://de-tr-appointment.idata.com.tr/tr', 'https://www.idata.com.tr/', 'external_provider'),
  ('idata-it', 'idata', 'iDATA', 'iDATA İtalya ana portalı', array['IT'], 'https://www.idata.com.tr/ita/tr', 'https://www.idata.com.tr/', 'external_provider'),
  ('vfs-global', 'vfs', 'VFS Global', 'VFS Global Türkiye randevu akışı', array['AT','BE','BG','HR','CZ','DK','EE','FI','FR','IS','LV','LT','LU','MT','NL','NO','PL','SI','SE','CH','LI'], 'https://visa.vfsglobal.com/tur/tr/nld/book-your-appointment', 'https://visa.vfsglobal.com/tur/tr/nld/', 'external_provider'),
  ('bls-spain', 'bls', 'BLS International', 'BLS İspanya Türkiye portalı', array['ES'], 'https://turkey.blsspainvisa.com/', 'https://turkey.blsspainvisa.com/', 'external_provider'),
  ('bls-slovakia', 'bls', 'BLS International', 'BLS Slovakya Türkiye portalı', array['SK'], 'https://blsslovakiavisa.com/turkey/', 'https://blsslovakiavisa.com/turkey/', 'external_provider'),
  ('kosmos-greece', 'kosmos', 'Kosmos Vize Hizmetleri', 'Kosmos Yunanistan portalı', array['GR'], 'https://web01.kosmosvize.com.tr/', 'https://web01.kosmosvize.com.tr/', 'external_provider'),
  ('asvisa-hungary', 'asvisa', 'AS Visa', 'AS Visa Macaristan randevu portalı', array['HU'], 'https://appointment.as-visa.com/en/ankara-hungary-individual-appointment', 'https://www.as-visa.com/', 'external_provider'),
  ('romania-evisa', 'romania_evisa', 'Romanya e-Viza', 'Romanya resmî e-Viza portalı', array['RO'], 'https://eviza.mae.ro/?lang=en-US', 'https://eviza.mae.ro/?lang=en-US', 'direct_state_portal'),
  ('portugal-embassy', 'portugal_embassy', 'Portekiz Büyükelçiliği', 'Portekiz Ankara Büyükelçiliği vize portalı', array['PT'], 'https://ancara.embaixadaportugal.mne.gov.pt/en/', 'https://ancara.embaixadaportugal.mne.gov.pt/en/', 'direct_state_portal')
on conflict (code) do update set
  provider_code = excluded.provider_code,
  provider_name = excluded.provider_name,
  label = excluded.label,
  covered_countries = excluded.covered_countries,
  probe_url = excluded.probe_url,
  official_url = excluded.official_url,
  mode = excluded.mode,
  updated_at = now();
