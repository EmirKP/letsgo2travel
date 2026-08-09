begin;

drop function if exists public.commit_flight_offer_revalidation(
  uuid, timestamptz, text, bigint, bigint, bigint, text, jsonb, text, text, timestamptz, timestamptz
);

drop index if exists public.flight_search_rate_limits_updated_idx;

-- Forward migration'ın sakladığı, secret içermeyen snapshot kullanılır. Böylece
-- rollback, migration öncesinde kurulmuş bir partner connector'ını veya adminin
-- sonradan verdiği operasyonel kararı tahmin ederek ezmez.
do $$
declare
  v_backup record;
  v_source public.flight_sources%rowtype;
begin
  select * into v_backup
  from public.flight_provider_migration_backups
  where migration_key = '20260809190000'
    and source_id = 'enuygun';

  if not found then
    raise exception 'flight provider rollback snapshot is missing' using errcode = '55000';
  end if;

  if v_backup.inserted_permission_id is not null then
    delete from public.flight_source_permissions
    where id = v_backup.inserted_permission_id;
  end if;

  if v_backup.source_existed and v_backup.source_snapshot is not null then
    select * into v_source
    from jsonb_populate_record(null::public.flight_sources, v_backup.source_snapshot);

    update public.flight_sources as current_source
    set
      name = v_source.name,
      source_type = v_source.source_type,
      official_domain = v_source.official_domain,
      integration_method = v_source.integration_method,
      integration_status = case
        when v_backup.bootstrap_placeholder
          and current_source.integration_status = 'active'
          and current_source.permission_status = 'public_documented'
          and current_source.enabled = true
        then v_source.integration_status
        else current_source.integration_status
      end,
      permission_status = case
        when v_backup.bootstrap_placeholder
          and current_source.integration_status = 'active'
          and current_source.permission_status = 'public_documented'
          and current_source.enabled = true
        then v_source.permission_status
        else current_source.permission_status
      end,
      enabled = case
        when v_backup.bootstrap_placeholder
          and current_source.integration_status = 'active'
          and current_source.permission_status = 'public_documented'
          and current_source.enabled = true
        then v_source.enabled
        else current_source.enabled
      end,
      allowed_domains = v_source.allowed_domains,
      supports_one_way = v_source.supports_one_way,
      supports_round_trip = v_source.supports_round_trip,
      supports_multi_city = v_source.supports_multi_city,
      supports_baggage = v_source.supports_baggage,
      supports_fare_rules = v_source.supports_fare_rules,
      supports_revalidation = v_source.supports_revalidation,
      supports_installments = v_source.supports_installments,
      supported_currencies = v_source.supported_currencies,
      cache_ttl_seconds = v_source.cache_ttl_seconds,
      request_limit_per_minute = v_source.request_limit_per_minute,
      updated_at = now()
    where id = 'enuygun';
  else
    -- Foundation dışı kurulumlarda kaynak satırı silinmez; geçmiş offer/job FK'ları
    -- korunarak güvenli ve pasif bir placeholder'a çevrilir.
    update public.flight_sources
    set
      integration_method = 'partner_api',
      integration_status = 'partner_access_required',
      permission_status = 'not_requested',
      enabled = false,
      supports_one_way = false,
      supports_round_trip = false,
      supports_multi_city = false,
      supports_baggage = false,
      supports_fare_rules = false,
      supports_revalidation = false,
      supports_installments = false,
      supported_currencies = '{}'::text[],
      request_limit_per_minute = null,
      updated_at = now()
    where id = 'enuygun';
  end if;
end;
$$;

-- Enum-check'ler yalnız yeni değerleri kullanan başka bir kaynak yoksa eski
-- foundation sözleşmesine daraltılır; aksi halde geçerli admin verisi korunur.
do $$
begin
  if not exists (
    select 1 from public.flight_sources where integration_method = 'public_mcp'
  ) then
    alter table public.flight_sources
      drop constraint if exists flight_sources_integration_method_check;
    alter table public.flight_sources
      add constraint flight_sources_integration_method_check
      check (integration_method in ('partner_api', 'affiliate_api', 'ndc', 'json_feed', 'xml_feed'));
  end if;

  if not exists (
    select 1 from public.flight_sources where permission_status = 'public_documented'
  ) then
    alter table public.flight_sources
      drop constraint if exists flight_sources_permission_status_check;
    alter table public.flight_sources
      add constraint flight_sources_permission_status_check
      check (permission_status in ('not_requested', 'applied', 'approved', 'rejected', 'expired'));
  end if;

  if not exists (
    select 1 from public.flight_source_permissions where status = 'public_documented'
  ) then
    alter table public.flight_source_permissions
      drop constraint if exists flight_source_permissions_status_check;
    alter table public.flight_source_permissions
      add constraint flight_source_permissions_status_check
      check (status in ('not_requested', 'applied', 'approved', 'rejected', 'expired'));
  end if;
end;
$$;

do $$
begin
  alter table public.flight_sources
    drop constraint if exists flight_sources_enabled_permission_check;
  if exists (
    select 1 from public.flight_sources where permission_status = 'public_documented'
  ) then
    alter table public.flight_sources
      add constraint flight_sources_enabled_permission_check
      check (
        not enabled
        or (
          integration_status = 'active'
          and permission_status in ('approved', 'public_documented')
        )
      );
  else
    alter table public.flight_sources
      add constraint flight_sources_enabled_permission_check
      check (
        not enabled
        or (integration_status = 'active' and permission_status = 'approved')
      );
  end if;
end;
$$;

-- Rollback katalogdaki inert Trip/Kiwi/eDreams/Mytrip satırlarını değiştirmez;
-- böylece migration öncesinde var olan partner yapılandırmaları asla kapatılmaz.
drop table if exists public.flight_provider_migration_backups;

commit;
