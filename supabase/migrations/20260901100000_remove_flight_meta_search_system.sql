-- =====================================================================
-- DESTRUCTIVE MIGRATION 1/3: Uçuş meta-arama sisteminin DB nesneleri
-- ---------------------------------------------------------------------
-- KAPSAM (yalnız uçuş arama/karşılaştırma/worker/provider sistemi):
--   Tablolar: flight_offer_revalidations, flight_redirect_events,
--     flight_offers, flight_segments, flight_itineraries,
--     flight_search_jobs, flight_search_legs, flight_searches,
--     flight_source_permissions, flight_source_audit_logs,
--     connector_health_logs, flight_worker_heartbeats,
--     flight_search_rate_limits, flight_provider_migration_backups,
--     flight_sources
--   Fonksiyonlar: claim_flight_search_jobs, consume_flight_search_quota,
--     commit_flight_offer_revalidation, set_flight_meta_updated_at
--   (Trigger'lar tablolarla birlikte düşer.)
--
-- KAPSAM DIŞI / KORUNUR: trips (manuel uçuş + PNR), tüm visa_* nesneleri,
--   mail_delivery_logs, subscribers, biletler (ayrı migration),
--   flight_price_alerts (ayrı migration), tüm topluluk/analytics tabloları.
--
-- ÖNKOŞULLAR (uygulamadan önce, ayrı production onayıyla):
--   1) Read-only sayım raporu alınmış olmalı (aşağıdaki NOTICE bloğu).
--   2) Tamamlanmış, bütünlüğü doğrulanmış, izole clone üzerinde restore
--      testi geçmiş ŞİFRELİ managed backup mevcut olmalı.
--   3) Flight-worker container'ları durdurulmuş, in-flight iş kalmamış
--      ve yeni job üretilmediği doğrulanmış olmalı.
--   4) Yeni uygulama kodu (410 tombstone'lu) deploy edilmiş olmalı.
--   5) Bu migration'ı adlandıran exact production onayı alınmış olmalı.
--
-- GÜVENLİK KURALLARI: CASCADE kullanılmaz. Korunan tablolara dokunulmaz.
-- Beklenmeyen bağımlılık varsa migration hata verip durur (RESTRICT).
-- GERİ DÖNÜŞ: yalnız yedekten restore.
-- =====================================================================

begin;

-- Ön kontrol: korunan nesneler yerinde olmalı; değilse dur.
do $$
begin
  if to_regclass('public.trips') is null then
    raise exception 'ABORT: korunan public.trips tablosu bulunamadi - yanlis veritabani olabilir';
  end if;
end $$;

-- Sayım raporu (log'a düşer; migration öncesi/sonrası karşılaştırma için)
do $$
declare
  t text;
  c bigint;
begin
  foreach t in array array[
    'flight_offer_revalidations','flight_redirect_events','flight_offers',
    'flight_segments','flight_itineraries','flight_search_jobs',
    'flight_search_legs','flight_searches','flight_source_permissions',
    'flight_source_audit_logs','connector_health_logs',
    'flight_worker_heartbeats','flight_search_rate_limits',
    'flight_provider_migration_backups','flight_sources'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('select count(*) from public.%I', t) into c;
      raise notice 'SILINECEK TABLO % satir sayisi: %', t, c;
    else
      raise notice 'TABLO YOK (atlandi): %', t;
    end if;
  end loop;
end $$;

-- Bağımlı (child) tablolardan parent'lara doğru, CASCADE'siz düşür.
drop table if exists public.flight_offer_revalidations;
drop table if exists public.flight_redirect_events;
drop table if exists public.flight_offers;
drop table if exists public.flight_segments;
drop table if exists public.flight_itineraries;
drop table if exists public.flight_search_jobs;
drop table if exists public.flight_search_legs;
drop table if exists public.flight_searches;
drop table if exists public.flight_source_permissions;
drop table if exists public.flight_source_audit_logs;
drop table if exists public.connector_health_logs;
drop table if exists public.flight_worker_heartbeats;
drop table if exists public.flight_search_rate_limits;
drop table if exists public.flight_provider_migration_backups;
drop table if exists public.flight_sources;

-- Fonksiyonlar: ad bazında tüm overload'ları exact imzayla düşür.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'claim_flight_search_jobs',
        'consume_flight_search_quota',
        'commit_flight_offer_revalidation',
        'set_flight_meta_updated_at'
      )
  loop
    execute format('drop function %s', r.sig);
    raise notice 'SILINDI: %', r.sig;
  end loop;
end $$;

-- Son kontrol: korunanlar hâlâ yerinde.
do $$
begin
  if to_regclass('public.trips') is null then
    raise exception 'ABORT: trips tablosu kayboldu - transaction geri alinacak';
  end if;
  if to_regclass('public.visa_worker_heartbeats') is null then
    raise notice 'UYARI: visa_worker_heartbeats bulunamadi (bu ortamda hic kurulmamis olabilir)';
  end if;
end $$;

commit;
