-- =========================================================
-- LetsGo2Travel Flight Meta-Search — canlı sağlayıcı kataloğu
-- 09.08.2026
--
-- İlk canlı connector yalnız Wingie Enuygun Group'un resmî, herkese açık ve
-- kimlik doğrulama istemeyen MCP uçuş araçlarını kullanır. Tüketici sayfası
-- kazıma/scraping yapılmaz. Diğer satıcılar yazılı partner erişimi gelene kadar
-- katalogda kapalı kalır.
-- =========================================================

begin;

alter table public.flight_sources
  drop constraint if exists flight_sources_integration_method_check;
alter table public.flight_sources
  add constraint flight_sources_integration_method_check
  check (integration_method in (
    'partner_api', 'affiliate_api', 'ndc', 'json_feed', 'xml_feed', 'public_mcp'
  ));

alter table public.flight_sources
  drop constraint if exists flight_sources_permission_status_check;
alter table public.flight_sources
  add constraint flight_sources_permission_status_check
  check (permission_status in (
    'not_requested', 'applied', 'approved', 'public_documented', 'rejected', 'expired'
  ));

alter table public.flight_source_permissions
  drop constraint if exists flight_source_permissions_status_check;
alter table public.flight_source_permissions
  add constraint flight_source_permissions_status_check
  check (status in (
    'not_requested', 'applied', 'approved', 'public_documented', 'rejected', 'expired'
  ));

alter table public.flight_sources
  drop constraint if exists flight_sources_check;
alter table public.flight_sources
  drop constraint if exists flight_sources_enabled_permission_check;
alter table public.flight_sources
  add constraint flight_sources_enabled_permission_check
  check (
    not enabled
    or (
      integration_status = 'active'
      and permission_status in ('approved', 'public_documented')
    )
  );

create index if not exists flight_search_rate_limits_updated_idx
  on public.flight_search_rate_limits (updated_at);

-- Foundation sürümü yalnız `approved` izinlerini claim ediyordu. Mevcut
-- kurulumlarda da public_documented kaynakların worker'a verilebilmesi için
-- fonksiyon bu migration içinde yeniden tanımlanır.
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

  delete from public.flight_search_rate_limits
  where updated_at < now() - interval '1 day';

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

-- Teklifin CAS güncellemesi ile fiyat-değişikliği audit'i aynı transaction'da
-- commit edilir. Böylece audit yazılamadığı halde yeni fiyatın yönlendirmeye
-- açılması ve kullanıcının ikinci onay adımının atlanması mümkün olmaz.
create or replace function public.commit_flight_offer_revalidation(
  p_offer_id uuid,
  p_expected_verified_at timestamptz,
  p_status text,
  p_previous_price_minor bigint,
  p_current_price_minor bigint,
  p_per_person_price_minor bigint,
  p_currency text,
  p_baggage jsonb,
  p_fare_family text,
  p_checkout_url text,
  p_checked_at timestamptz,
  p_expires_at timestamptz
)
returns table (committed boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_itinerary_id uuid;
  v_previous_baggage jsonb;
  v_previous_fare_family text;
  v_material_changed boolean;
begin
  if p_status not in ('available', 'price_changed', 'unavailable')
    or p_previous_price_minor is null or p_previous_price_minor <= 0
    or p_currency !~ '^[A-Z]{3}$'
    or p_checked_at is null or p_expires_at is null or p_expires_at <= p_checked_at
    or p_checked_at > now() + interval '2 minutes'
    or p_checked_at < now() - interval '10 minutes'
    or p_expires_at > p_checked_at + interval '30 minutes' then
    raise exception 'invalid revalidation input' using errcode = '22023';
  end if;

  select itinerary_id, baggage, fare_family
  into v_itinerary_id, v_previous_baggage, v_previous_fare_family
  from public.flight_offers
  where id = p_offer_id
    and total_price_minor = p_previous_price_minor
    and currency = p_currency
    and verified_at is not distinct from p_expected_verified_at
  for update;

  if v_itinerary_id is null then
    committed := false;
    return next;
    return;
  end if;

  if p_status in ('available', 'price_changed') then
    if p_current_price_minor is null or p_current_price_minor <= 0
      or p_per_person_price_minor is null or p_per_person_price_minor <= 0
      or p_baggage is null or jsonb_typeof(p_baggage) <> 'object'
      or p_fare_family is null or char_length(p_fare_family) > 80
      or p_checkout_url is null or char_length(p_checkout_url) > 2000 then
      raise exception 'invalid available revalidation input' using errcode = '22023';
    end if;

    v_material_changed := p_current_price_minor <> p_previous_price_minor
      or v_previous_baggage is distinct from p_baggage
      or v_previous_fare_family is distinct from p_fare_family;
    if (p_status = 'price_changed') <> v_material_changed then
      raise exception 'revalidation status does not match material terms' using errcode = '22023';
    end if;

    update public.flight_offers
    set
      total_price_minor = p_current_price_minor,
      per_person_price_minor = p_per_person_price_minor,
      currency = p_currency,
      price_completeness = 'partial',
      mandatory_fees_minor = null,
      taxes_minor = null,
      original_price_minor = null,
      original_currency = null,
      condition_summary = 'Kaynak toplamı; zorunlu ücret kapsamı resmî şemada ayrıştırılmıyor.',
      is_conditional_price = false,
      conditional_prices = '[]'::jsonb,
      baggage = p_baggage,
      fare_family = p_fare_family,
      fare_rules = '{}'::jsonb,
      installment_options = '{}'::text[],
      benefits = '[]'::jsonb,
      checkout_url = p_checkout_url,
      observed_at = p_checked_at,
      verified_at = p_checked_at,
      expires_at = p_expires_at,
      available = true
    where id = p_offer_id;
  else
    if p_current_price_minor is not null or p_checkout_url is not null then
      raise exception 'invalid unavailable revalidation input' using errcode = '22023';
    end if;

    update public.flight_offers
    set
      available = false,
      checkout_url = null,
      observed_at = p_checked_at,
      verified_at = p_checked_at,
      expires_at = p_expires_at
    where id = p_offer_id;
  end if;

  insert into public.flight_offer_revalidations (
    offer_id,
    status,
    previous_price_minor,
    current_price_minor,
    currency,
    error_code,
    checked_at,
    expires_at
  ) values (
    p_offer_id,
    p_status,
    p_previous_price_minor,
    p_current_price_minor,
    p_currency,
    case when p_status = 'unavailable' then 'offer_unavailable' else null end,
    p_checked_at,
    p_expires_at
  );

  update public.flight_itineraries
  set
    ranking_tags = '{}'::text[],
    ranking_explanation = jsonb_build_object('pending', true, 'reason', 'price_revalidated')
  where id = v_itinerary_id;

  committed := true;
  return next;
end;
$$;

-- Rollback, migration öncesindeki Enuygun operasyonel ayarlarını geri
-- yükleyebilsin; snapshot secret içermez ve yalnız service_role erişebilir.
create table if not exists public.flight_provider_migration_backups (
  migration_key text not null,
  source_id text not null,
  source_existed boolean not null,
  bootstrap_placeholder boolean not null,
  source_snapshot jsonb,
  permission_preexisting boolean not null,
  inserted_permission_id uuid,
  created_at timestamptz not null default now(),
  primary key (migration_key, source_id),
  check (source_snapshot is null or jsonb_typeof(source_snapshot) = 'object')
);

alter table public.flight_provider_migration_backups enable row level security;
revoke all on public.flight_provider_migration_backups from public, anon, authenticated;
grant all on public.flight_provider_migration_backups to service_role;

insert into public.flight_provider_migration_backups (
  migration_key,
  source_id,
  source_existed,
  bootstrap_placeholder,
  source_snapshot,
  permission_preexisting
)
select
  '20260809190000',
  target.source_id,
  src.id is not null,
  coalesce(
    src.integration_method = 'partner_api'
      and src.integration_status = 'partner_access_required'
      and src.permission_status = 'not_requested'
      and src.enabled = false,
    false
  ),
  case when src.id is null then null else to_jsonb(src) end,
  exists (
    select 1
    from public.flight_source_permissions as permission
    where permission.source_id = target.source_id
      and permission.status = 'public_documented'
      and permission.reference = 'https://mcp.enuygun.com/'
  )
from (values ('enuygun'::text)) as target(source_id)
left join public.flight_sources as src on src.id = target.source_id
on conflict (migration_key, source_id) do nothing;

insert into public.flight_sources as current_source (
  id,
  name,
  source_type,
  official_domain,
  integration_method,
  integration_status,
  permission_status,
  enabled,
  allowed_domains,
  supports_one_way,
  supports_round_trip,
  supports_multi_city,
  supports_baggage,
  supports_fare_rules,
  supports_revalidation,
  supports_installments,
  supported_currencies,
  cache_ttl_seconds,
  request_limit_per_minute
)
values (
  'enuygun',
  'Enuygun',
  'ota',
  'enuygun.com',
  'public_mcp',
  'active',
  'public_documented',
  true,
  array['enuygun.com', 'www.enuygun.com'],
  true,
  true,
  false,
  true,
  false,
  true,
  false,
  array['TRY'],
  300,
  60
)
on conflict (id) do update set
  name = excluded.name,
  official_domain = excluded.official_domain,
  integration_method = excluded.integration_method,
  integration_status = case
    when current_source.integration_method = 'partner_api'
      and current_source.integration_status = 'partner_access_required'
      and current_source.permission_status = 'not_requested'
      and current_source.enabled = false
    then excluded.integration_status
    else current_source.integration_status
  end,
  permission_status = case
    when current_source.integration_method = 'partner_api'
      and current_source.integration_status = 'partner_access_required'
      and current_source.permission_status = 'not_requested'
      and current_source.enabled = false
    then excluded.permission_status
    else current_source.permission_status
  end,
  enabled = case
    when current_source.integration_method = 'partner_api'
      and current_source.integration_status = 'partner_access_required'
      and current_source.permission_status = 'not_requested'
      and current_source.enabled = false
    then excluded.enabled
    else current_source.enabled
  end,
  allowed_domains = excluded.allowed_domains,
  supports_one_way = excluded.supports_one_way,
  supports_round_trip = excluded.supports_round_trip,
  supports_multi_city = excluded.supports_multi_city,
  supports_baggage = excluded.supports_baggage,
  supports_fare_rules = excluded.supports_fare_rules,
  supports_revalidation = excluded.supports_revalidation,
  supports_installments = excluded.supports_installments,
  supported_currencies = excluded.supported_currencies,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  request_limit_per_minute = coalesce(current_source.request_limit_per_minute, excluded.request_limit_per_minute),
  updated_at = now();

with inserted_permission as (
  insert into public.flight_source_permissions (
    source_id,
    status,
    reference,
    valid_from,
    notes
  )
  select
    'enuygun',
    'public_documented',
    'https://mcp.enuygun.com/',
    now(),
    'Resmî sayfa flight_search ve flight_allocate araçlarını Public JSON-RPC ve no authentication required olarak yayımlar.'
  where not exists (
    select 1
    from public.flight_source_permissions
    where source_id = 'enuygun'
      and status = 'public_documented'
      and reference = 'https://mcp.enuygun.com/'
  )
  returning id
)
update public.flight_provider_migration_backups as backup
set inserted_permission_id = inserted_permission.id
from inserted_permission
where backup.migration_key = '20260809190000'
  and backup.source_id = 'enuygun';

insert into public.flight_sources (
  id, name, source_type, official_domain, integration_method,
  integration_status, permission_status, enabled, allowed_domains,
  supports_one_way, supports_round_trip, supports_multi_city,
  supports_baggage, supports_fare_rules, supports_revalidation,
  supports_installments, supported_currencies, cache_ttl_seconds
)
values
  ('trip', 'Trip.com', 'ota', 'trip.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['trip.com', 'www.trip.com'], false, false, false, false, false, false, false, '{}'::text[], 300),
  ('kiwi', 'Kiwi.com', 'ota', 'kiwi.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['kiwi.com', 'www.kiwi.com'], false, false, false, false, false, false, false, '{}'::text[], 300),
  ('edreams', 'eDreams', 'ota', 'edreams.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['edreams.com', 'www.edreams.com', 'edreams.net'], false, false, false, false, false, false, false, '{}'::text[], 300),
  ('mytrip', 'Mytrip', 'ota', 'mytrip.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['mytrip.com', 'www.mytrip.com'], false, false, false, false, false, false, false, '{}'::text[], 300)
on conflict (id) do nothing;

revoke all on function public.commit_flight_offer_revalidation(
  uuid, timestamptz, text, bigint, bigint, bigint, text, jsonb, text, text, timestamptz, timestamptz
) from public;
grant execute on function public.commit_flight_offer_revalidation(
  uuid, timestamptz, text, bigint, bigint, bigint, text, jsonb, text, text, timestamptz, timestamptz
) to service_role;

comment on function public.commit_flight_offer_revalidation(
  uuid, timestamptz, text, bigint, bigint, bigint, text, jsonb, text, text, timestamptz, timestamptz
) is 'CAS teklif yenilemesi ve kullanıcı fiyat-onayı audit kaydını tek transaction içinde commit eder.';

commit;
