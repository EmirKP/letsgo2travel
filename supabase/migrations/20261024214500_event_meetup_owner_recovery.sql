-- Forward-only repair after 20261024213000; never rewrite an applied migration.
-- A removed/soft-deleted public author cannot permanently reserve the one meetup
-- pin. Reclaim only when an opted-in member explicitly creates a new valid pin.
begin;

create or replace function public.event_community_action(p_user uuid,p_key text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_snapshot jsonb; v_message record; v_meetup record; v_id uuid; v_target uuid; v_name text; v_body text; v_start timestamptz; v_reason text; v_note text;
begin
  if p_user is null or coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_user and deleted_at is null) then raise exception 'Not authorized' using errcode='42501'; end if;
  -- Serialize per actor, so limits and idempotency hold across tabs and devices.
  perform pg_advisory_xact_lock(hashtextextended('event-community:'||p_user::text,0));
  select snapshot into v_snapshot from public.event_community_events where event_key=p_key for share;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if p_action='join' then
    if public.event_community_person(p_user,p_user) is null then raise exception 'Public profile required' using errcode='22023'; end if;
    if v_snapshot->>'status'<>'scheduled' or (v_snapshot->>'startsAt')::timestamptz<now()-interval '1 day' then raise exception 'Event closed' using errcode='22023'; end if;
    if not exists(select 1 from public.event_community_members where event_key=p_key and user_id=p_user)
      and (select count(*) from public.event_community_members where user_id=p_user)>=100 then raise exception 'Membership limit' using errcode='54000'; end if;
    insert into public.event_community_members(event_key,user_id) values(p_key,p_user) on conflict do nothing;
    return jsonb_build_object('success',true);
  elsif p_action='leave' then
    delete from public.event_community_members where event_key=p_key and user_id=p_user;
    delete from public.event_community_meetups where event_key=p_key and creator_id=p_user;
    return jsonb_build_object('success',true);
  end if;
  if not exists(select 1 from public.event_community_members where event_key=p_key and user_id=p_user) then raise exception 'Join required' using errcode='42501'; end if;
  if p_action='mute' then
    if jsonb_typeof(p_input->'muted')<>'boolean' then raise exception 'Invalid preference' using errcode='22023'; end if;
    update public.event_community_members set muted=(p_input->>'muted')::boolean where event_key=p_key and user_id=p_user;
  elsif p_action='message' then
    v_body=trim(p_input->>'body');
    if v_body is null or char_length(v_body) not between 1 and 1000 or v_body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'Invalid message' using errcode='22023'; end if;
    select * into v_message from public.event_community_messages where user_id=p_user and request_id=(p_input->>'requestId')::uuid;
    if found then
      if v_message.event_key<>p_key or v_message.body<>v_body then raise exception 'Request conflict' using errcode='23505'; end if;
      return jsonb_build_object('success',true,'id',v_message.id);
    end if;
    if exists(select 1 from public.event_community_messages where user_id=p_user and created_at>now()-interval '3 seconds')
      or (select count(*) from public.event_community_messages where user_id=p_user and created_at>now()-interval '1 hour')>=120 then raise exception 'Rate limit' using errcode='54000'; end if;
    insert into public.event_community_messages(event_key,user_id,request_id,body) values(p_key,p_user,(p_input->>'requestId')::uuid,v_body) returning id into v_id;
    return jsonb_build_object('success',true,'id',v_id);
  elsif p_action='meetup' then
    if v_snapshot->>'status'<>'scheduled' then raise exception 'Event closed' using errcode='22023'; end if;
    v_start=(p_input->>'startsAt')::timestamptz;
    v_body=trim(p_input->>'publicPlace');
    if v_start is null or v_start<now() or abs(extract(epoch from (v_start-(v_snapshot->>'startsAt')::timestamptz)))>259200
      or v_body is null or char_length(v_body) not between 5 and 180 then raise exception 'Invalid meetup' using errcode='22023'; end if;
    -- One pinned meetup per event, never overwrite another member's meetup.
    perform pg_advisory_xact_lock(hashtextextended('event-meetup:'||p_key,0));
    -- Account removal must not reserve the event's only pin forever. Check the
    -- actual profile/account, not a viewer-filtered identity: a block must never
    -- let another member replace an active creator's meetup.
    delete from public.event_community_meetups m where m.event_key=p_key
      and (m.creator_id is null or not exists (
        select 1 from auth.users u join public.profiles p on p.id=u.id
        where u.id=m.creator_id and u.deleted_at is null and nullif(trim(p.username),'') is not null));
    select * into v_meetup from public.event_community_meetups where event_key=p_key for update;
    if found then
      if v_meetup.creator_id is distinct from p_user then raise exception 'Meetup owner required' using errcode='42501'; end if;
      if v_meetup.starts_at=v_start and v_meetup.public_place=v_body then return jsonb_build_object('success',true,'id',v_meetup.id); end if;
      if v_meetup.updated_at>now()-interval '30 seconds' then raise exception 'Rate limit' using errcode='54000'; end if;
      update public.event_community_meetups set starts_at=v_start,public_place=v_body,updated_at=now() where id=v_meetup.id;
      delete from public.event_community_meetup_attendees where meetup_id=v_meetup.id;
      v_id=v_meetup.id;
    else
      insert into public.event_community_meetups(event_key,creator_id,starts_at,public_place) values(p_key,p_user,v_start,v_body) returning id into v_id;
    end if;
    insert into public.event_community_meetup_attendees(meetup_id,event_key,user_id) values(v_id,p_key,p_user) on conflict do nothing;
    return jsonb_build_object('success',true,'id',v_id);
  elsif p_action in ('meetup-join','meetup-delete','meetup-leave') then
    select * into v_meetup from public.event_community_meetups where event_key=p_key and id=(p_input->>'meetupId')::uuid for update;
    if not found or public.community_users_blocked(p_user,v_meetup.creator_id) then raise exception 'Meetup unavailable' using errcode='P0002'; end if;
    if p_action='meetup-delete' then
      if v_meetup.creator_id is distinct from p_user then raise exception 'Meetup owner required' using errcode='42501'; end if;
      delete from public.event_community_meetups where id=v_meetup.id;
    elsif p_action='meetup-join' then
      if v_snapshot->>'status'<>'scheduled' or v_meetup.starts_at<now() then raise exception 'Meetup closed' using errcode='22023'; end if;
      insert into public.event_community_meetup_attendees(meetup_id,event_key,user_id) values(v_meetup.id,p_key,p_user) on conflict do nothing;
    else delete from public.event_community_meetup_attendees where meetup_id=v_meetup.id and user_id=p_user; end if;
  elsif p_action in ('block','report') then
    if p_input->>'targetType'='meetup' then
      select creator_id,public.event_community_person(creator_id,p_user)->>'username' into v_target,v_name from public.event_community_meetups where event_key=p_key and id=(p_input->>'targetId')::uuid;
    elsif p_input->>'targetType'='message' then
      select user_id,public.event_community_person(user_id,p_user)->>'username' into v_target,v_name from public.event_community_messages where event_key=p_key and id=(p_input->>'targetId')::uuid and status='published';
    else raise exception 'Invalid target' using errcode='22023'; end if;
    if v_target is null or v_target=p_user then raise exception 'Invalid target' using errcode='22023'; end if;
    if p_action='block' then
      insert into public.community_user_blocks(user_id,blocked_user_id,blocked_name) values(p_user,v_target,left(coalesce(v_name,'Gezgin'),80)) on conflict do nothing;
      return jsonb_build_object('success',true,'userId',v_target);
    end if;
    v_reason=p_input->>'reason'; v_note=trim(coalesce(p_input->>'note',''));
    if v_reason is null or v_reason not in ('spam','harassment','hate','dangerous','personal_data','other') or char_length(v_note)>1000
      or (v_reason='other' and char_length(v_note)<5) then raise exception 'Invalid reason' using errcode='22023'; end if;
    select id into v_id from public.event_community_reports where user_id=p_user and status='open'
      and (message_id=(p_input->>'targetId')::uuid or meetup_id=(p_input->>'targetId')::uuid);
    if v_id is not null then return jsonb_build_object('success',true,'id',v_id); end if;
    if (select count(*) from public.event_community_reports where user_id=p_user and created_at>now()-interval '1 hour')>=20 then raise exception 'Rate limit' using errcode='54000'; end if;
    insert into public.event_community_reports(user_id,message_id,meetup_id,reason,note) values(p_user,
      case when p_input->>'targetType'='message' then (p_input->>'targetId')::uuid end,
      case when p_input->>'targetType'='meetup' then (p_input->>'targetId')::uuid end,v_reason,v_note) returning id into v_id;
    return jsonb_build_object('success',true,'id',v_id);
  else raise exception 'Invalid action' using errcode='22023'; end if;
  return jsonb_build_object('success',true);
end; $$;

revoke all on function public.event_community_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.event_community_action(uuid,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
