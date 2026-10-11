begin;

-- Scores project reviewed evidence, not map marks or the legacy points ledger.
-- Preserve historic records; repeated or revoked approvals cannot inflate scores.
create or replace function public.get_verified_explorer_scores(p_country_aliases jsonb)
returns table (user_id uuid, username text, visited_count bigint, points bigint, level text, hidden boolean)
language sql stable security definer set search_path = '' as $$
  with counts as (
    select p.id, p.username, count(distinct a.value) as country_count,
      exists(select 1 from public.leaderboard_blocks b where b.user_id=p.id) as blocked
    from public.profiles p
    left join public.travel_verifications v on v.user_id=p.id
      and v.status='approved' and v.verification_method='document'
    left join jsonb_each_text(p_country_aliases) a on a.key=upper(trim(v.country_code))
    where p.opt_in_leaderboard is true and nullif(trim(p.username),'') is not null
    group by p.id,p.username
  )
  select c.id,c.username,c.country_count,c.country_count*10,
    case when c.country_count>=25 then 'Dünya Gezgini'
      when c.country_count>=10 then 'Balkan Kaşifi'
      when c.country_count>=5 then 'Rota Meraklısı' else 'Yeni Kaşif' end,
    c.blocked from counts c;
$$;

create or replace function public.get_verified_explorer_league(p_country_aliases jsonb,p_limit integer default 100)
returns table (username text,visited_count bigint,points bigint,level text)
language sql stable security definer set search_path = '' as $$
  select s.username,s.visited_count,s.points,s.level
  from public.get_verified_explorer_scores(p_country_aliases) s
  where not s.hidden and s.visited_count>0
  order by s.points desc,lower(s.username),s.user_id
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;

-- Installed clients calling the old RPC receive the same corrected scores.
create or replace function public.get_explorer_league(p_country_aliases jsonb,p_limit integer default 100)
returns table (username text,visited_count bigint,points bigint,level text)
language sql stable security definer set search_path = '' as $$
  select * from public.get_verified_explorer_league(p_country_aliases,p_limit);
$$;

revoke all on function public.get_verified_explorer_scores(jsonb),public.get_verified_explorer_league(jsonb,integer),public.get_explorer_league(jsonb,integer) from public,anon,authenticated;
grant execute on function public.get_verified_explorer_scores(jsonb),public.get_verified_explorer_league(jsonb,integer),public.get_explorer_league(jsonb,integer) to service_role;
create index if not exists travel_verifications_league_approved_idx on public.travel_verifications(user_id,country_code) where status='approved' and verification_method='document';
notify pgrst,'reload schema';
commit;
