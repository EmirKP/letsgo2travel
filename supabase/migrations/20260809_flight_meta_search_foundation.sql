-- =========================================================
-- LETSGO2TRAVEL - UÇUŞ META-ARAMA FAZ 1 TEMELİ
--
-- Bu migration yalnızca yeni tablolar/fonksiyonlar ekler. Mevcut biletler ve
-- flight_price_alerts tablolarına dokunmaz. Sağlayıcı credential değerleri bu
-- şemada tutulmaz; yalnızca VDS/server secret ortamında bulunmalıdır.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.flight_sources (
  id text primary key
    check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 100),
  source_type text not null
    check (source_type in ('ota', 'airline', 'affiliate')),
  official_domain text not null
    check (official_domain ~ '^[a-z0-9.-]+$'),
  integration_method text not null default 'partner_api'
    check (integration_method in ('partner_api', 'affiliate_api', 'ndc', 'json_feed', 'xml_feed')),
  integration_status text not null default 'partner_access_required'
    check (integration_status in (
      'partner_access_required',
      'credentials_required',
      'configured',
      'active',
      'paused',
      'error'
    )),
  permission_status text not null default 'not_requested'
    check (permission_status in ('not_requested', 'applied', 'approved', 'rejected', 'expired')),
  enabled boolean not null default false,
  allowed_domains text[] not null default '{}'::text[],
  supports_one_way boolean not null default false,
  supports_round_trip boolean not null default false,
  supports_multi_city boolean not null default false,
  supports_baggage boolean not null default false,
  supports_fare_rules boolean not null default false,
  supports_revalidation boolean not null default false,
  supports_installments boolean not null default false,
  supported_currencies text[] not null default '{}'::text[],
  cache_ttl_seconds integer not null default 300
    check (cache_ttl_seconds between 0 and 86400),
  request_limit_per_minute integer
    check (request_limit_per_minute is null or request_limit_per_minute between 1 and 10000),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  average_response_ms integer check (average_response_ms is null or average_response_ms >= 0),
  success_rate numeric(5,2) check (success_rate is null or success_rate between 0 and 100),
  searches_today integer not null default 0 check (searches_today >= 0),
  offers_today integer not null default 0 check (offers_today >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (integration_status = 'active' and permission_status = 'approved'))
);

insert into public.flight_sources (
  id, name, source_type, official_domain, integration_method,
  integration_status, permission_status, enabled, allowed_domains
)
values
  ('enuygun', 'Enuygun', 'ota', 'enuygun.com', 'partner_api',
    'partner_access_required', 'not_requested', false, array['enuygun.com', 'www.enuygun.com']),
  ('ucuzabilet', 'Ucuzabilet', 'ota', 'ucuzabilet.com', 'partner_api',
    'partner_access_required', 'not_requested', false, array['ucuzabilet.com', 'www.ucuzabilet.com']),
  ('airline-direct', 'Doğrudan havayolu', 'airline', 'letsgo2travel.com.tr', 'ndc',
    'partner_access_required', 'not_requested', false, array[]::text[])
on conflict (id) do nothing;

create table if not exists public.flight_source_permissions (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.flight_sources(id) on delete cascade,
  status text not null
    check (status in ('not_requested', 'applied', 'approved', 'rejected', 'expired')),
  reference text check (reference is null or char_length(reference) <= 200),
  valid_from timestamptz,
  valid_until timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create index if not exists flight_source_permissions_source_idx
  on public.flight_source_permissions (source_id, created_at desc);

create table if not exists public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  access_token_hash text not null unique
    check (access_token_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  criteria_version smallint not null default 1 check (criteria_version > 0),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'object'),
  trip_type text not null check (trip_type in ('one_way', 'round_trip')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'queued'
    check (status in ('queued', 'searching', 'partial', 'completed', 'no_sources', 'failed', 'expired')),
  source_count integer not null default 0 check (source_count >= 0),
  completed_source_count integer not null default 0 check (completed_source_count >= 0),
  failed_source_count integer not null default 0 check (failed_source_count >= 0),
  itinerary_count integer not null default 0 check (itinerary_count >= 0),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists flight_searches_user_created_idx
  on public.flight_searches (user_id, created_at desc)
  where user_id is not null;
create index if not exists flight_searches_fingerprint_idx
  on public.flight_searches (request_fingerprint, created_at desc);
create index if not exists flight_searches_expiry_idx
  on public.flight_searches (expires_at);

create table if not exists public.flight_search_legs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  leg_order smallint not null check (leg_order between 0 and 8),
  origin_code text not null check (origin_code ~ '^[A-Z]{3}$'),
  destination_code text not null check (destination_code ~ '^[A-Z]{3}$'),
  departure_date date not null,
  created_at timestamptz not null default now(),
  unique (search_id, leg_order),
  check (origin_code <> destination_code)
);

create table if not exists public.flight_search_jobs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  source_id text not null references public.flight_sources(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'no_results', 'failed', 'integration_required', 'dead_letter')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  scheduled_at timestamptz not null default now(),
  locked_by text check (locked_by is null or char_length(locked_by) between 1 and 80),
  locked_until timestamptz,
  lease_token_hash text check (lease_token_hash is null or lease_token_hash ~ '^[a-f0-9]{64}$'),
  report_idempotency_key uuid,
  result_count integer not null default 0 check (result_count >= 0),
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (search_id, source_id)
);

create index if not exists flight_search_jobs_claim_idx
  on public.flight_search_jobs (status, scheduled_at, created_at)
  where status in ('queued', 'running');
create index if not exists flight_search_jobs_search_idx
  on public.flight_search_jobs (search_id, source_id);

create table if not exists public.flight_itineraries (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  itinerary_key text not null check (itinerary_key ~ '^[a-f0-9]{64}$'),
  total_duration_minutes integer not null check (total_duration_minutes between 1 and 10080),
  stop_count smallint not null check (stop_count between 0 and 12),
  marketing_airlines text[] not null default '{}'::text[],
  operating_airlines text[] not null default '{}'::text[],
  transfer_airports text[] not null default '{}'::text[],
  has_airport_change boolean not null default false,
  has_self_transfer boolean not null default false,
  has_overnight_layover boolean not null default false,
  ranking_tags text[] not null default '{}'::text[],
  ranking_explanation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(ranking_explanation) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (search_id, itinerary_key),
  unique (id, search_id)
);

create index if not exists flight_itineraries_search_idx
  on public.flight_itineraries (search_id, total_duration_minutes, stop_count);

create table if not exists public.flight_segments (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.flight_itineraries(id) on delete cascade,
  segment_order smallint not null check (segment_order between 0 and 31),
  leg_index smallint not null default 0 check (leg_index between 0 and 8),
  marketing_airline text not null check (marketing_airline ~ '^[A-Z0-9]{2,3}$'),
  marketing_flight_number text not null check (char_length(marketing_flight_number) between 1 and 12),
  operating_airline text check (operating_airline is null or operating_airline ~ '^[A-Z0-9]{2,3}$'),
  origin_code text not null check (origin_code ~ '^[A-Z]{3}$'),
  destination_code text not null check (destination_code ~ '^[A-Z]{3}$'),
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  departure_local text not null check (char_length(departure_local) between 20 and 40),
  arrival_local text not null check (char_length(arrival_local) between 20 and 40),
  departure_terminal text check (departure_terminal is null or char_length(departure_terminal) <= 20),
  arrival_terminal text check (arrival_terminal is null or char_length(arrival_terminal) <= 20),
  cabin_class text not null
    check (cabin_class in ('economy', 'premium_economy', 'business', 'first')),
  aircraft text check (aircraft is null or char_length(aircraft) <= 80),
  self_transfer boolean not null default false,
  created_at timestamptz not null default now(),
  unique (itinerary_id, segment_order),
  check (arrival_at > departure_at),
  check (origin_code <> destination_code)
);

create table if not exists public.flight_offers (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  itinerary_id uuid not null,
  source_id text not null references public.flight_sources(id) on delete restrict,
  source_offer_ref text not null check (char_length(source_offer_ref) between 1 and 200),
  report_id uuid not null,
  fare_family text not null default '' check (char_length(fare_family) <= 80),
  total_price_minor bigint not null check (total_price_minor > 0),
  per_person_price_minor bigint check (per_person_price_minor is null or per_person_price_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_price_minor bigint check (original_price_minor is null or original_price_minor > 0),
  original_currency text check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
  taxes_minor bigint check (taxes_minor is null or taxes_minor >= 0),
  mandatory_fees_minor bigint check (mandatory_fees_minor is null or mandatory_fees_minor >= 0),
  price_completeness text not null
    check (price_completeness in ('complete', 'partial', 'unknown')),
  is_conditional_price boolean not null default false,
  condition_summary text check (condition_summary is null or char_length(condition_summary) <= 300),
  conditional_prices jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conditional_prices) = 'array' and jsonb_array_length(conditional_prices) <= 20),
  baggage jsonb not null default '{}'::jsonb check (jsonb_typeof(baggage) = 'object'),
  fare_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(fare_rules) = 'object'),
  installment_options text[] not null default '{}'::text[],
  benefits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(benefits) = 'array' and jsonb_array_length(benefits) <= 20),
  is_direct_airline boolean not null default false,
  sponsored boolean not null default false,
  checkout_url text check (checkout_url is null or char_length(checkout_url) <= 2000),
  available boolean not null default true,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flight_offers_itinerary_search_fk
    foreign key (itinerary_id, search_id)
    references public.flight_itineraries(id, search_id)
    on delete cascade,
  unique (id, search_id),
  unique (id, search_id, source_id)
);

create unique index if not exists flight_offers_source_identity_idx
  on public.flight_offers (search_id, source_id, report_id, source_offer_ref, fare_family, itinerary_id);
create index if not exists flight_offers_itinerary_price_idx
  on public.flight_offers (itinerary_id, currency, total_price_minor)
  where available = true;
create index if not exists flight_offers_search_idx
  on public.flight_offers (search_id, source_id);

create table if not exists public.flight_offer_revalidations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.flight_offers(id) on delete cascade,
  status text not null
    check (status in ('available', 'price_changed', 'unavailable', 'failed', 'unsupported')),
  previous_price_minor bigint check (previous_price_minor is null or previous_price_minor > 0),
  current_price_minor bigint check (current_price_minor is null or current_price_minor > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  checked_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists flight_offer_revalidations_offer_idx
  on public.flight_offer_revalidations (offer_id, checked_at desc);

create table if not exists public.flight_redirect_events (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete cascade,
  offer_id uuid not null references public.flight_offers(id) on delete cascade,
  source_id text not null references public.flight_sources(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  destination_host text not null check (char_length(destination_host) between 3 and 255),
  price_minor bigint not null check (price_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  constraint flight_redirect_offer_search_fk
    foreign key (offer_id, search_id)
    references public.flight_offers(id, search_id)
    on delete cascade,
  constraint flight_redirect_offer_source_fk
    foreign key (offer_id, search_id, source_id)
    references public.flight_offers(id, search_id, source_id)
    on delete cascade
);

create index if not exists flight_redirect_events_source_created_idx
  on public.flight_redirect_events (source_id, created_at desc);

create table if not exists public.connector_health_logs (
  id bigint generated always as identity primary key,
  source_id text not null references public.flight_sources(id) on delete cascade,
  worker_name text not null check (char_length(worker_name) between 1 and 80),
  status text not null
    check (status in ('healthy', 'degraded', 'down', 'quota_exceeded', 'integration_required')),
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  message text check (message is null or char_length(message) <= 500),
  checked_at timestamptz not null default now()
);

create index if not exists connector_health_logs_source_checked_idx
  on public.connector_health_logs (source_id, checked_at desc);

create table if not exists public.flight_worker_heartbeats (
  worker_name text primary key check (char_length(worker_name) between 1 and 80),
  worker_version text check (worker_version is null or char_length(worker_version) <= 40),
  status text not null default 'starting'
    check (status in ('starting', 'running', 'idle', 'error', 'stopping')),
  poll_interval_ms integer not null default 5000
    check (poll_interval_ms between 1000 and 3600000),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.flight_search_rate_limits (
  bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.flight_source_audit_logs (
  id bigint generated always as identity primary key,
  source_id text not null references public.flight_sources(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (char_length(actor_role) between 2 and 40),
  action text not null check (action in ('enabled', 'disabled')),
  old_enabled boolean not null,
  new_enabled boolean not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_flight_meta_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_sources',
    'flight_source_permissions',
    'flight_searches',
    'flight_search_jobs',
    'flight_itineraries',
    'flight_offers',
    'flight_worker_heartbeats',
    'flight_search_rate_limits'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_updated_at', v_table);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_flight_meta_updated_at()',
      v_table || '_updated_at',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.consume_flight_search_quota(
  p_bucket_key text,
  p_limit integer default 12,
  p_window_seconds integer default 60
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_window_started_at timestamptz;
begin
  if p_bucket_key !~ '^[a-f0-9]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit input' using errcode = '22023';
  end if;

  insert into public.flight_search_rate_limits (
    bucket_key, window_started_at, request_count, updated_at
  ) values (
    p_bucket_key, v_now, 1, v_now
  )
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when public.flight_search_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else public.flight_search_rate_limits.window_started_at
    end,
    request_count = case
      when public.flight_search_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else public.flight_search_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

create or replace function public.claim_flight_search_jobs(
  p_worker_name text,
  p_limit integer default 2
)
returns table (
  job_id uuid,
  search_id uuid,
  source_id text,
  request_payload jsonb,
  lease_token text,
  attempt_count smallint
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_job record;
  v_lease_token text;
begin
  if char_length(trim(p_worker_name)) not between 1 and 80
     or p_limit < 1 or p_limit > 10 then
    raise exception 'invalid claim input' using errcode = '22023';
  end if;

  update public.flight_searches
  set status = 'expired', completed_at = coalesce(completed_at, now())
  where status in ('queued', 'searching', 'partial')
    and expires_at <= now();

  update public.flight_search_jobs as j
  set
    status = 'integration_required',
    error_code = 'source_not_ready',
    error_message = 'Kaynak artık etkin, izinli ve hazır değil.',
    completed_at = now(),
    locked_by = null,
    locked_until = null,
    lease_token_hash = null
  from public.flight_sources as src
  where j.source_id = src.id
    and j.status in ('queued', 'running')
    and (
      src.enabled = false
      or src.integration_status <> 'active'
      or src.permission_status not in ('approved', 'public_documented')
    );

  update public.flight_search_jobs as j
  set
    status = 'dead_letter',
    error_code = 'search_expired',
    error_message = 'Arama oturumunun süresi doldu.',
    completed_at = now(),
    locked_by = null,
    locked_until = null,
    lease_token_hash = null
  from public.flight_searches as s
  where j.search_id = s.id
    and j.status in ('queued', 'running')
    and s.status = 'expired';

  update public.flight_search_jobs as j
  set
    status = 'dead_letter',
    error_code = 'attempts_exhausted',
    error_message = 'Görev yeniden deneme sınırını aştı.',
    completed_at = now(),
    locked_by = null,
    locked_until = null,
    lease_token_hash = null
  where j.status in ('queued', 'running')
    and j.attempt_count >= j.max_attempts
    and (j.status = 'queued' or j.locked_until < now());

  update public.flight_searches as s
  set
    status = case
      when exists (
        select 1 from public.flight_search_jobs as successful_job
        where successful_job.search_id = s.id
          and successful_job.status in ('completed', 'no_results')
      ) and (
        exists (
          select 1 from public.flight_search_jobs as failed_job
          where failed_job.search_id = s.id
            and failed_job.status in ('failed', 'integration_required', 'dead_letter')
        )
        or exists (
          select 1 from public.flight_search_jobs as partial_job
          where partial_job.search_id = s.id
            and partial_job.error_code = 'format_changed'
        )
      ) then 'partial'
      when exists (
        select 1 from public.flight_search_jobs as successful_job
        where successful_job.search_id = s.id
          and successful_job.status in ('completed', 'no_results')
      ) then 'completed'
      else 'failed'
    end,
    completed_source_count = (
      select count(*)::integer from public.flight_search_jobs as completed_job
      where completed_job.search_id = s.id
        and completed_job.status in ('completed', 'no_results')
    ),
    failed_source_count = (
      select count(*)::integer from public.flight_search_jobs as failed_job
      where failed_job.search_id = s.id
        and failed_job.status in ('failed', 'integration_required', 'dead_letter')
    ),
    completed_at = coalesce(s.completed_at, now())
  where s.status in ('queued', 'searching', 'partial')
    and s.completed_at is null
    and exists (
      select 1 from public.flight_search_jobs as any_job
      where any_job.search_id = s.id
    )
    and not exists (
      select 1 from public.flight_search_jobs as unfinished_job
      where unfinished_job.search_id = s.id
        and unfinished_job.status in ('queued', 'running')
    );

  delete from public.flight_searches
  where expires_at < now() - interval '7 days';

  for v_job in
    select j.id, j.search_id, j.source_id, j.attempt_count, s.criteria
    from public.flight_search_jobs as j
    join public.flight_searches as s on s.id = j.search_id
    join public.flight_sources as src on src.id = j.source_id
    where (
      (j.status = 'queued' and j.scheduled_at <= now())
      or (j.status = 'running' and j.locked_until < now())
    )
      and j.attempt_count < j.max_attempts
      and s.expires_at > now()
      and s.status in ('queued', 'searching', 'partial')
      and src.enabled = true
      and src.integration_status = 'active'
      and src.permission_status in ('approved', 'public_documented')
    order by j.scheduled_at asc, j.created_at asc
    for update of j skip locked
    limit p_limit
  loop
    v_lease_token := encode(gen_random_bytes(32), 'hex');

    update public.flight_search_jobs
    set
      status = 'running',
      attempt_count = v_job.attempt_count + 1,
      locked_by = trim(p_worker_name),
      locked_until = now() + interval '90 seconds',
      lease_token_hash = encode(digest(v_lease_token, 'sha256'), 'hex'),
      started_at = coalesce(started_at, now()),
      error_code = null,
      error_message = null
    where id = v_job.id;

    update public.flight_searches
    set status = case when status = 'queued' then 'searching' else status end,
        started_at = coalesce(started_at, now())
    where id = v_job.search_id;

    job_id := v_job.id;
    search_id := v_job.search_id;
    source_id := v_job.source_id;
    request_payload := v_job.criteria;
    lease_token := v_lease_token;
    attempt_count := v_job.attempt_count + 1;
    return next;
  end loop;
end;
$$;

-- Bütün yeni tablolar API-only tutulur. Böylece checkout_url, provider ref ve
-- capability-token hash'i PostgREST üzerinden istemciye açılamaz. Kullanıcı
-- sahipliği ve anonim opaque token kontrolü server API'de uygulanır.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_sources',
    'flight_source_permissions',
    'flight_searches',
    'flight_search_legs',
    'flight_search_jobs',
    'flight_itineraries',
    'flight_segments',
    'flight_offers',
    'flight_offer_revalidations',
    'flight_redirect_events',
    'connector_health_logs',
    'flight_worker_heartbeats',
    'flight_search_rate_limits',
    'flight_source_audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.consume_flight_search_quota(text, integer, integer) from public;
revoke all on function public.claim_flight_search_jobs(text, integer) from public;
grant execute on function public.consume_flight_search_quota(text, integer, integer) to service_role;
grant execute on function public.claim_flight_search_jobs(text, integer) to service_role;
grant usage, select on sequence public.connector_health_logs_id_seq,
  public.flight_source_audit_logs_id_seq
to service_role;

comment on table public.flight_sources is
  'Uçuş sağlayıcılarının secrets içermeyen operasyonel durumu.';
comment on table public.flight_searches is
  'Normalize edilmiş uçuş meta-arama oturumları; anonim okuma yalnız API token ile yapılır.';
comment on table public.flight_offers is
  'Bir itinerary için satıcı teklifleri. checkout_url doğrudan istemciye verilmez.';
comment on function public.claim_flight_search_jobs(text, integer) is
  'FOR UPDATE SKIP LOCKED ve tek kullanımlık lease token ile VDS görev talebi.';

commit;
