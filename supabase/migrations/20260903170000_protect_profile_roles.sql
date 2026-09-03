-- Profil satiri kullanicinin kendi tercihlerini saklar; `role` ise bir yetki
-- siniridir. RLS satiri korur fakat tek basina hangi kolonun degisebilecegini
-- sinirlamaz. Bu migration istemciye yalniz guvenli profil kolonlarini acar ve
-- rol degisikligini veritabani tetikleyicisiyle ikinci kez korur.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles tablosu bulunamadi';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    raise exception 'public.profiles.role kolonu bulunamadi';
  end if;
end;
$$;

alter table public.profiles enable row level security;

-- Eski/genis bir UPDATE policy'si bulunsa bile authenticated kullanici sadece
-- kendi satirini degistirebilir. Permissive policy mevcut olmayan kurulumlarda
-- da guvenli profil guncellemelerinin calismasini saglar.
drop policy if exists "Profiles authenticated update own" on public.profiles;
create policy "Profiles authenticated update own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Profiles authenticated update own boundary" on public.profiles;
create policy "Profiles authenticated update own boundary"
on public.profiles
as restrictive
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Tablo seviyesindeki UPDATE izni kolon seviyesindeki bir REVOKE'u ezer.
-- Once tablo ve mevcut tum kolon izinlerini kaldir, sonra yalniz self-service
-- alanlarini geri ver. Opsiyonel kolonlar yalniz kurulumda varsa grant edilir.
do $$
declare
  v_column text;
  v_allowed_columns constant text[] := array[
    'username',
    'full_name',
    'avatar_url',
    'visited_countries',
    'wishlist_countries',
    'opt_in_leaderboard',
    'updated_at'
  ];
begin
  revoke update on table public.profiles from public, anon, authenticated;

  for v_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
  loop
    execute format(
      'revoke update (%I) on table public.profiles from public, anon, authenticated',
      v_column
    );
  end loop;

  foreach v_column in array v_allowed_columns
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = v_column
    ) then
      execute format(
        'grant update (%I) on table public.profiles to authenticated',
        v_column
      );
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_profile_role_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jwt_role text := auth.role()::text;
  v_privileged boolean :=
    v_jwt_role = 'service_role'
    or (
      coalesce(v_jwt_role, '') = ''
      and current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
    );
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Normal kayit akisi rol vermediyse en dusuk yetkiyi uygula; istemcinin
    -- yuksek yetkili bir rolle profil olusturmasina izin verme.
    if new.role is null then
      new.role := 'user';
    elsif new.role is distinct from 'user' then
      raise exception using
        errcode = '42501',
        message = 'profiles.role yalnizca guvenilir sunucu tarafindan atanabilir';
    end if;
  else
    if new.id is distinct from old.id then
      raise exception using
        errcode = '42501',
        message = 'profiles.id istemci tarafindan degistirilemez';
    end if;
    if new.role is distinct from old.role then
      raise exception using
        errcode = '42501',
        message = 'profiles.role yalnizca guvenilir sunucu tarafindan degistirilebilir';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_role_boundary() from public, anon, authenticated;
grant execute on function public.enforce_profile_role_boundary() to service_role;

drop trigger if exists zz_profiles_role_boundary on public.profiles;
create trigger zz_profiles_role_boundary
before insert or update on public.profiles
for each row
execute function public.enforce_profile_role_boundary();

comment on function public.enforce_profile_role_boundary() is
  'Authenticated kullanicilarin profiles.role atamasini veya degistirmesini engeller; service_role yonetim yolunu korur.';

-- Basit PostgreSQL view'lari varsayilan olarak guncellenebilir olabilir. Bu
-- iki genel-okuma view'i profiles tablosunun sahibi adina yazma yolu haline
-- gelmemeli; aksi halde istemci taban kolon izinlerini/RLS sinirini dolanabilir.
-- SELECT izinlerine dokunma, yalniz DML yuzeyini kesin olarak kapat.
do $$
begin
  if to_regclass('public.l2t_public_profiles') is not null then
    execute 'revoke insert, update, delete on table public.l2t_public_profiles from public, anon, authenticated';
  end if;
  if to_regclass('public.l2t_public_leaderboard') is not null then
    execute 'revoke insert, update, delete on table public.l2t_public_leaderboard from public, anon, authenticated';
  end if;
end;
$$;

-- Misafir favori/ziyaret aktarimi iki cihaz ayni anda profil degistirse bile
-- bir cihazdaki yeni ulkeyi ezmemeli. Kullanici kimligi parametre degil JWT'den
-- gelir; satir FOR UPDATE ile kilitlenir ve iki dizi tek transaction'da union
-- edilir.
create or replace function public.merge_mobile_profile_countries(
  p_wishlist text[] default '{}'::text[],
  p_visited text[] default '{}'::text[]
)
returns table (
  wishlist_countries text[],
  visited_countries text[],
  wishlist_added integer,
  visited_added integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_wishlist text[];
  v_old_visited text[];
  v_new_wishlist text[];
  v_new_visited text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Oturum gerekli';
  end if;

  select coalesce(p.wishlist_countries, '{}'::text[]),
         coalesce(p.visited_countries, '{}'::text[])
    into v_old_wishlist, v_old_visited
  from public.profiles as p
  where p.id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profil bulunamadi';
  end if;

  select coalesce(array_agg(s.item order by s.first_position), '{}'::text[])
    into v_new_wishlist
  from (
    select btrim(u.value) as item, min(u.position) as first_position
    from unnest(v_old_wishlist || coalesce(p_wishlist, '{}'::text[]))
      with ordinality as u(value, position)
    where nullif(btrim(u.value), '') is not null and length(btrim(u.value)) <= 16
    group by btrim(u.value)
    order by min(u.position)
    limit 250
  ) as s;

  select coalesce(array_agg(s.item order by s.first_position), '{}'::text[])
    into v_new_visited
  from (
    select btrim(u.value) as item, min(u.position) as first_position
    from unnest(v_old_visited || coalesce(p_visited, '{}'::text[]))
      with ordinality as u(value, position)
    where nullif(btrim(u.value), '') is not null and length(btrim(u.value)) <= 16
    group by btrim(u.value)
    order by min(u.position)
    limit 250
  ) as s;

  update public.profiles as p
  set wishlist_countries = v_new_wishlist,
      visited_countries = v_new_visited,
      updated_at = now()
  where p.id = v_user_id;

  return query select
    v_new_wishlist,
    v_new_visited,
    greatest(cardinality(v_new_wishlist) - cardinality(v_old_wishlist), 0),
    greatest(cardinality(v_new_visited) - cardinality(v_old_visited), 0);
end;
$$;

revoke all on function public.merge_mobile_profile_countries(text[], text[]) from public, anon;
grant execute on function public.merge_mobile_profile_countries(text[], text[]) to authenticated;

-- JSONB icindeki mobil rota anahtari icin eski tabloda ayri benzersiz kolon
-- yok. Ayni hesaptan iki cihaz eszamanli ilk kaydi gonderdiginde transaction
-- advisory lock ile SELECT+INSERT araligini kapat ve tek kaydi upsert et.
create or replace function public.upsert_mobile_user_trip(
  p_title text,
  p_destination text,
  p_mobile_kind text,
  p_client_key text,
  p_trip_data jsonb default '{}'::jsonb
)
returns setof public.user_trips
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip_id bigint;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Oturum gerekli';
  end if;
  if nullif(btrim(p_title), '') is null or length(btrim(p_title)) > 160
     or nullif(btrim(p_destination), '') is null or length(btrim(p_destination)) > 160
     or p_mobile_kind !~ '^[a-z0-9_-]{1,60}$'
     or p_client_key !~ '^[A-Za-z0-9._:-]{8,160}$'
     or jsonb_typeof(coalesce(p_trip_data, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_trip_data, '{}'::jsonb)::text) > 100000 then
    raise exception using errcode = '22023', message = 'Gecersiz mobil rota verisi';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_mobile_kind || ':' || p_client_key, 0)
  );

  select t.id into v_trip_id
  from public.user_trips as t
  where t.user_id = v_user_id
    and t.trip_data ->> 'mobile_kind' = p_mobile_kind
    and t.trip_data ->> 'client_key' = p_client_key
  order by t.created_at desc, t.id desc
  limit 1
  for update;

  v_payload := coalesce(p_trip_data, '{}'::jsonb) || jsonb_build_object(
    'mobile_kind', p_mobile_kind,
    'client_key', p_client_key
  );

  if v_trip_id is not null then
    return query
    update public.user_trips as t
    set title = btrim(p_title),
        destination = btrim(p_destination),
        trip_data = coalesce(t.trip_data, '{}'::jsonb) || v_payload
    where t.id = v_trip_id and t.user_id = v_user_id
    returning t.*;
  else
    return query
    insert into public.user_trips (user_id, title, destination, trip_data)
    values (v_user_id, btrim(p_title), btrim(p_destination), v_payload)
    returning *;
  end if;
end;
$$;

revoke all on function public.upsert_mobile_user_trip(text, text, text, text, jsonb) from public, anon;
grant execute on function public.upsert_mobile_user_trip(text, text, text, text, jsonb) to authenticated;

-- Web ve mobil forum ayni kilit kararini kullanir. Constraint eklenmeden once
-- bos veya 2-100 karakter siniri disindaki eski slug'lari genel konuya (NULL)
-- donustur; bozuk bir legacy satir tum migration'i durdurmasin.
update public.forum_topics
set country_slug = case
  when length(nullif(lower(btrim(country_slug)), '')) between 2 and 100
    then nullif(lower(btrim(country_slug)), '')
  else null
end
where country_slug is distinct from case
  when length(nullif(lower(btrim(country_slug)), '')) between 2 and 100
    then nullif(lower(btrim(country_slug)), '')
  else null
end;

alter table public.forum_topics
drop constraint if exists forum_topics_country_slug_shape;

alter table public.forum_topics
add constraint forum_topics_country_slug_shape
check (country_slug is null or length(btrim(country_slug)) between 2 and 100);

create or replace function public.set_forum_topic_paywall_flag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.country_slug := nullif(lower(btrim(new.country_slug)), '');
  if new.category ilike '%vize%' then
    new.is_paywalled := true;
  end if;
  return new;
end;
$$;

drop trigger if exists forum_topic_paywall_flag_trigger on public.forum_topics;
create trigger forum_topic_paywall_flag_trigger
before insert or update of category, is_paywalled, country_slug
on public.forum_topics
for each row
execute function public.set_forum_topic_paywall_flag();

-- Akis kartlarindaki cevap sayilari satir limitiyle kesilmemeli. Yalniz sayi
-- donduren bu RPC gizli cevap govdesi tasimaz ve service-role API tarafindan
-- en fazla 40 konu icin cagrilir.
create or replace function public.get_forum_reply_counts(p_topic_ids uuid[])
returns table (topic_id uuid, reply_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.topic_id, count(*)::bigint
  from public.forum_replies as r
  where r.status = 'published'
    and r.topic_id = any(coalesce(p_topic_ids, '{}'::uuid[]))
  group by r.topic_id;
$$;

revoke all on function public.get_forum_reply_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_forum_reply_counts(uuid[]) to service_role;

notify pgrst, 'reload schema';
