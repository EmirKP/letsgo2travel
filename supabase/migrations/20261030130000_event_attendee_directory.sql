begin;

-- Read-only, keyset-paged directory of people who explicitly joined an event.
-- Reuse the existing public-identity/block visibility boundary before limiting.
create or replace function public.event_community_attendees(
  p_user uuid, p_key text, p_query text default '', p_after timestamptz default null, p_after_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_user is null or coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(coalesce(p_query,'')) > 80 or (p_after is null) <> (p_after_id is null) then raise exception 'Invalid page' using errcode='22023'; end if;
  if not exists(select 1 from public.event_community_events where event_key=p_key) then return null; end if;
  with candidates as (
    select m.user_id,m.joined_at,public.event_community_person(m.user_id,p_user) person
    from public.event_community_members m where m.event_key=p_key
      and (p_after is null or (m.joined_at,m.user_id) > (p_after,p_after_id))
  ), visible as (
    select * from candidates where person is not null
      and strpos(lower(person->>'username'),lower(trim(coalesce(p_query,'')))) > 0
    order by joined_at,user_id limit 41
  ), page as (select * from visible order by joined_at,user_id limit 40)
  select jsonb_build_object(
    'attendees',coalesce((select jsonb_agg(person order by joined_at,user_id) from page),'[]'::jsonb),
    'nextAfter',case when (select count(*) from visible)>40 then
      (select jsonb_build_object('joinedAt',joined_at,'userId',user_id) from page order by joined_at desc,user_id desc limit 1)
      else null end
  ) into result;
  return result;
end; $$;
revoke all on function public.event_community_attendees(uuid,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.event_community_attendees(uuid,text,text,timestamptz,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
