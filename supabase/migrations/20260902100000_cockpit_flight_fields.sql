-- =====================================================================
-- KOKPİT UÇUŞ ALANLARI (Live Activity için hazırlık) — UYGULANMADI
-- ---------------------------------------------------------------------
-- Yalnız NULLABLE kolon EKLER; hiçbir veri silmez/değiştirmez.
-- Uygulandıktan sonra mobil form havalimanı seçiminden origin/destination
-- IATA + havayolu/uçuş numarası saklayabilir ve Live Activity kalkış/varış
-- IATA'yı gerçek kayıttan gösterir. Kod bu kolonlara migration uygulanana
-- kadar YAZMAZ (mevcut üretimle geriye dönük uyumlu).
-- =====================================================================
begin;

alter table public.trips add column if not exists origin_iata text
  check (origin_iata is null or origin_iata ~ '^[A-Z]{3}$');
alter table public.trips add column if not exists destination_iata text
  check (destination_iata is null or destination_iata ~ '^[A-Z]{3}$');
alter table public.trips add column if not exists airline text
  check (airline is null or char_length(airline) <= 80);
alter table public.trips add column if not exists flight_number text
  check (flight_number is null or flight_number ~ '^[A-Z0-9]{2,8}$');

commit;
