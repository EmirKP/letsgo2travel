-- =========================================================
-- LETSGO2TRAVEL - SPRINT 7
-- SEO UYUMLU FORUM ÖNİZLEMESİ + BULANIK PAYWALL
--
-- Güvenlik ilkesi:
-- * Anonim ziyaretçi ve Google aynı ilk 2 yayımlanmış cevabı görür.
-- * 3. cevaptan sonrası anonim HTML/JSON içinde gönderilmez.
-- * Kilitli içerik yalnızca oturum + ülke kilidi kontrolünden sonra döner.
-- =========================================================

begin;

alter table public.forum_topics
add column if not exists is_paywalled boolean not null default false;

update public.forum_topics
set is_paywalled = true
where category ilike '%vize%';

create index if not exists idx_forum_topics_paywall
on public.forum_topics (is_paywalled, country_slug)
where status = 'published';

create table if not exists public.forum_country_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_slug text not null check (length(trim(country_slug)) between 2 and 100),
  source text not null default 'league_join',
  unlocked_at timestamptz not null default now(),
  primary key (user_id, country_slug)
);

create index if not exists idx_forum_country_unlocks_country
on public.forum_country_unlocks (country_slug, unlocked_at desc);

alter table public.forum_country_unlocks enable row level security;

drop policy if exists "Users read own forum unlocks"
on public.forum_country_unlocks;

create policy "Users read own forum unlocks"
on public.forum_country_unlocks
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own forum unlocks"
on public.forum_country_unlocks;

create policy "Users insert own forum unlocks"
on public.forum_country_unlocks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

revoke all on public.forum_country_unlocks from anon;
grant select, insert on public.forum_country_unlocks to authenticated;
grant all on public.forum_country_unlocks to service_role;

-- Yeni veya kategori değiştirilmiş vize konularını otomatik kilitli işaretler.
create or replace function public.set_forum_topic_paywall_flag()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category ilike '%vize%' then
    new.is_paywalled := true;
  end if;
  return new;
end;
$$;

drop trigger if exists forum_topic_paywall_flag_trigger
on public.forum_topics;

create trigger forum_topic_paywall_flag_trigger
before insert or update of category, is_paywalled
on public.forum_topics
for each row
execute function public.set_forum_topic_paywall_flag();

-- Konu kilitli mi? RLS içinde aynı sorguyu tekrar etmemek için yardımcı fonksiyon.
create or replace function public.is_forum_topic_paywalled(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select t.is_paywalled and t.country_slug is not null
      from public.forum_topics as t
      where t.id = p_topic_id
        and t.status = 'published'
    ),
    false
  );
$$;

-- Konu sahibi veya ülkeyi açmış kullanıcı tam içeriği okuyabilir.
create or replace function public.has_forum_topic_unlock(
  p_topic_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null then false
    else exists (
      select 1
      from public.forum_topics as t
      where t.id = p_topic_id
        and t.status = 'published'
        and (
          t.author_id = p_user_id
          or exists (
            select 1
            from public.forum_country_unlocks as u
            where u.user_id = p_user_id
              and u.country_slug = t.country_slug
          )
        )
    )
  end;
$$;

-- Bir cevap, kronolojik olarak ilk iki yayımlanmış cevaptan biri mi?
-- SECURITY DEFINER kullanılması aynı tablo üzerindeki RLS tekrarını engeller.
create or replace function public.is_public_forum_preview_reply(
  p_reply_id uuid,
  p_topic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from (
      select r.id
      from public.forum_replies as r
      where r.topic_id = p_topic_id
        and r.status = 'published'
      order by r.created_at asc, r.id asc
      limit 2
    ) as preview
    where preview.id = p_reply_id
  );
$$;

-- Eski herkese-açık politika tüm cevapları sızdırıyordu; güvenli politika ile değiştir.
drop policy if exists "Replies are viewable by everyone"
on public.forum_replies;

drop policy if exists "Published forum replies access"
on public.forum_replies;

create policy "Published forum replies access"
on public.forum_replies
for select
to anon, authenticated
using (
  status = 'published'
  and (
    not public.is_forum_topic_paywalled(topic_id)
    or public.is_public_forum_preview_reply(id, topic_id)
    or public.has_forum_topic_unlock(topic_id, (select auth.uid()))
  )
);

-- SSR sayfası için yalnızca sayıları ve erişim durumunu döndürür.
-- Gizli cevap metinleri bu fonksiyonda kesinlikle bulunmaz.
create or replace function public.get_forum_topic_paywall_state(p_topic_id uuid)
returns table (
  total_replies bigint,
  visible_replies bigint,
  hidden_replies bigint,
  is_paywalled boolean,
  has_unlocked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint := 0;
  v_paywalled boolean := false;
  v_unlocked boolean := false;
begin
  select public.is_forum_topic_paywalled(p_topic_id)
  into v_paywalled;

  select count(*)
  into v_total
  from public.forum_replies as r
  where r.topic_id = p_topic_id
    and r.status = 'published';

  v_unlocked := public.has_forum_topic_unlock(p_topic_id, auth.uid());

  return query
  select
    v_total,
    case
      when v_paywalled and not v_unlocked then least(v_total, 2::bigint)
      else v_total
    end,
    case
      when v_paywalled and not v_unlocked then greatest(v_total - 2, 0::bigint)
      else 0::bigint
    end,
    v_paywalled,
    v_unlocked;
end;
$$;

-- Ücretsiz Kaşifler Ligi üyeliğiyle ülke kilidini kullanıcı hesabına kaydeder.
create or replace function public.unlock_forum_country(p_country_slug text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_country_slug text := lower(trim(p_country_slug));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_country_slug is null or length(v_country_slug) < 2 then
    raise exception 'invalid country slug' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.forum_topics as t
    where t.country_slug = v_country_slug
      and t.status = 'published'
      and t.is_paywalled = true
  ) then
    raise exception 'paywalled country not found' using errcode = 'P0002';
  end if;

  insert into public.forum_country_unlocks (user_id, country_slug, source)
  values (v_user_id, v_country_slug, 'league_join')
  on conflict (user_id, country_slug) do nothing;

  return true;
end;
$$;

-- Yalnızca kilidi açık kullanıcıya, SSR'da gösterilmeyen 3. ve sonraki cevapları döndürür.
create or replace function public.get_unlocked_forum_replies(p_topic_id uuid)
returns table (
  id uuid,
  topic_id uuid,
  author_name text,
  content text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_paywalled boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_paywalled := public.is_forum_topic_paywalled(p_topic_id);

  if v_paywalled and not public.has_forum_topic_unlock(p_topic_id, v_user_id) then
    raise exception 'FORUM_COUNTRY_LOCKED' using errcode = '42501';
  end if;

  if v_paywalled then
    return query
    select r.id, r.topic_id, r.author_name, r.content, r.created_at
    from public.forum_replies as r
    where r.topic_id = p_topic_id
      and r.status = 'published'
    order by r.created_at asc, r.id asc
    offset 2;
  else
    return query
    select r.id, r.topic_id, r.author_name, r.content, r.created_at
    from public.forum_replies as r
    where r.topic_id = p_topic_id
      and r.status = 'published'
    order by r.created_at asc, r.id asc;
  end if;
end;
$$;

revoke all on function public.is_forum_topic_paywalled(uuid) from public;
revoke all on function public.has_forum_topic_unlock(uuid, uuid) from public;
revoke all on function public.is_public_forum_preview_reply(uuid, uuid) from public;
revoke all on function public.get_forum_topic_paywall_state(uuid) from public;
revoke all on function public.unlock_forum_country(text) from public;
revoke all on function public.get_unlocked_forum_replies(uuid) from public;

grant execute on function public.is_forum_topic_paywalled(uuid)
to anon, authenticated, service_role;

grant execute on function public.has_forum_topic_unlock(uuid, uuid)
to anon, authenticated, service_role;

grant execute on function public.is_public_forum_preview_reply(uuid, uuid)
to anon, authenticated, service_role;

grant execute on function public.get_forum_topic_paywall_state(uuid)
to anon, authenticated, service_role;

grant execute on function public.unlock_forum_country(text)
to authenticated, service_role;

grant execute on function public.get_unlocked_forum_replies(uuid)
to authenticated, service_role;

commit;
