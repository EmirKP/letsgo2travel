-- =========================================================
-- LetsGo2Travel Flight Meta-Search — karşılaştırma kaynak kataloğu
-- 12.08.2026
--
-- Bu kayıtlar tüketici sayfası kazımaz ve etkin connector varmış gibi davranmaz.
-- Ucuzabilet, Turna ve Obilet yalnız resmî partner/API erişimiyle etkinleştirilir.
-- =========================================================

begin;

insert into public.flight_sources as current_source (
  id, name, source_type, official_domain, integration_method,
  integration_status, permission_status, enabled, allowed_domains,
  supports_one_way, supports_round_trip, supports_multi_city,
  supports_baggage, supports_fare_rules, supports_revalidation,
  supports_installments, supported_currencies, cache_ttl_seconds
)
values
  ('ucuzabilet', 'Ucuzabilet', 'ota', 'ucuzabilet.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['ucuzabilet.com', 'www.ucuzabilet.com'],
    false, false, false, false, false, false, false, '{}'::text[], 300),
  ('turna', 'Turna', 'ota', 'turna.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['turna.com', 'www.turna.com'],
    false, false, false, false, false, false, false, '{}'::text[], 300),
  ('obilet', 'Obilet', 'ota', 'obilet.com', 'partner_api',
    'partner_access_required', 'not_requested', false,
    array['obilet.com', 'www.obilet.com'],
    false, false, false, false, false, false, false, '{}'::text[], 300)
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  official_domain = excluded.official_domain,
  allowed_domains = excluded.allowed_domains,
  updated_at = now();

comment on table public.flight_sources is
  'Yalnız resmî veya yazılı yetkili connector kaynakları etkinleştirilir; katalog kaydı tek başına canlı entegrasyon sayılmaz.';

commit;
