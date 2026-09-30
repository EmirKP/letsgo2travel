begin;
-- Rank all opted-in, unblocked profiles before limiting the response. Only the
-- server supplies aliases from the app's canonical ISO country catalogue.
create or replace function public.get_explorer_league(p_country_aliases jsonb, p_limit integer default 100)
returns table (username text, visited_count bigint, points bigint, level text)
language sql stable security definer set search_path = '' as $$
  with counts as (
    select p.id, p.username,
      (select count(distinct a.value)
       from unnest(coalesce(p.visited_countries, '{}'::text[])) v(code)
       join jsonb_each_text(p_country_aliases) a on a.key = upper(trim(v.code))) as country_count
    from public.profiles p
    where p.opt_in_leaderboard is true and nullif(trim(p.username), '') is not null
      and not exists (select 1 from public.leaderboard_blocks b where b.user_id = p.id)
  )
  select c.username, c.country_count, c.country_count * 10,
    case when c.country_count >= 25 then 'Dünya Gezgini'
      when c.country_count >= 10 then 'Balkan Kaşifi'
      when c.country_count >= 5 then 'Rota Meraklısı' else 'Yeni Kaşif' end
  from counts c
  order by c.country_count desc, lower(c.username), c.id
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;
revoke all on function public.get_explorer_league(jsonb, integer) from public, anon, authenticated;
grant execute on function public.get_explorer_league(jsonb, integer) to service_role;
create index if not exists profiles_explorer_opt_in_idx on public.profiles(id) where opt_in_leaderboard is true;
notify pgrst, 'reload schema';
commit;
