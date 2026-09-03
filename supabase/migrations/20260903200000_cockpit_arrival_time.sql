-- Build 14: Uçuşun planlanan varış zamanı. Dynamic Island yalnız kullanıcının
-- kaydettiği bu zamanla kalan süreyi gösterir; canlı uçuş/boarding bilgisi
-- olduğu iddia edilmez.
alter table public.trips
  add column if not exists arrival_at timestamptz;

alter table public.trips
  add column if not exists app_language text not null default 'tr'
  check (app_language in ('tr', 'en'));

alter table public.trips
  drop constraint if exists trips_arrival_after_departure;

alter table public.trips
  add constraint trips_arrival_after_departure
  check (arrival_at is null or departure_at is null or arrival_at > departure_at);

comment on column public.trips.arrival_at is
  'Kullanıcının girdiği planlanan varış zamanı; canlı uçuş durumu değildir.';

comment on column public.trips.app_language is
  'Uçuş hatırlatması ve Live Activity metinlerinin oluşturulduğu uygulama dili.';
