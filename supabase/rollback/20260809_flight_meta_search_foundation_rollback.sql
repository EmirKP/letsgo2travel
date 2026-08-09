-- LetsGo2Travel Uçuş Meta-Arama Faz 1 — MANUEL rollback
--
-- DİKKAT: Bu dosya yalnız Faz 1 tablolarındaki verinin silinmesi kabul ediliyorsa
-- ve canlı şema yedeği alındıysa elle çalıştırılmalıdır. Supabase migration
-- dizinine konmamıştır; `db push` tarafından otomatik uygulanmamalıdır.

begin;

drop function if exists public.claim_flight_search_jobs(text, integer);
drop function if exists public.consume_flight_search_quota(text, integer, integer);

drop table if exists public.flight_source_audit_logs;
drop table if exists public.flight_search_rate_limits;
drop table if exists public.flight_worker_heartbeats;
drop table if exists public.connector_health_logs;
drop table if exists public.flight_redirect_events;
drop table if exists public.flight_offer_revalidations;
drop table if exists public.flight_offers;
drop table if exists public.flight_segments;
drop table if exists public.flight_itineraries;
drop table if exists public.flight_search_jobs;
drop table if exists public.flight_search_legs;
drop table if exists public.flight_searches;
drop table if exists public.flight_source_permissions;
drop table if exists public.flight_sources;

drop function if exists public.set_flight_meta_updated_at();

-- pgcrypto ve extensions şeması başka özellikler tarafından kullanılabileceği
-- için bilinçli olarak kaldırılmaz.

commit;
