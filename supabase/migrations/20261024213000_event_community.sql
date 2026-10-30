-- Opt-in event companions. Apply after community safety/public-profile migrations.
-- No existing saved event is converted to an RSVP. All client access is via
-- authenticated handlers; service RPCs bind the actor after token verification.
begin;

create table if not exists public.event_community_events (
  event_key text primary key check (event_key ~ '^(curated:[0-9a-f-]{36}|ticketmaster:[A-Za-z0-9_-]{1,160}|predicthq:[A-Za-z0-9_-]{1,160})$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  previous_snapshot jsonb,
  version integer not null default 1,
  changed_at timestamptz,
  checked_at timestamptz not null default now()
);
create table if not exists public.event_community_members (
  event_key text not null references public.event_community_events(event_key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key(event_key,user_id)
);
create index if not exists event_community_member_owner on public.event_community_members(user_id,joined_at desc);
create table if not exists public.event_community_messages (
  id uuid primary key default gen_random_uuid(),
  event_key text not null references public.event_community_events(event_key) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index if not exists event_community_message_page on public.event_community_messages(event_key,created_at desc,id desc) where status='published';
create index if not exists event_community_message_rate on public.event_community_messages(user_id,created_at desc);
create table if not exists public.event_community_meetups (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique references public.event_community_events(event_key) on delete cascade,
  creator_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null,
  public_place text not null check(char_length(trim(public_place)) between 5 and 180),
  updated_at timestamptz not null default now()
);
create table if not exists public.event_community_meetup_attendees (
  meetup_id uuid not null references public.event_community_meetups(id) on delete cascade,
  event_key text not null,
  user_id uuid not null,
  primary key(meetup_id,user_id),
  foreign key(event_key,user_id) references public.event_community_members(event_key,user_id) on delete cascade
);
create table if not exists public.event_community_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.event_community_messages(id) on delete cascade,
  meetup_id uuid references public.event_community_meetups(id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','hate','dangerous','personal_data','other')),
  note text not null default '' check(char_length(note)<=1000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check ((message_id is not null)::integer + (meetup_id is not null)::integer = 1)
);
create unique index if not exists event_community_report_message_unique on public.event_community_reports(user_id,message_id) where status='open';
create unique index if not exists event_community_report_meetup_unique on public.event_community_reports(user_id,meetup_id) where status='open';

alter table public.event_community_events enable row level security;
alter table public.event_community_members enable row level security;
alter table public.event_community_messages enable row level security;
alter table public.event_community_meetups enable row level security;
alter table public.event_community_meetup_attendees enable row level security;
alter table public.event_community_reports enable row level security;
revoke all on public.event_community_events,public.event_community_members,public.event_community_messages,public.event_community_meetups,public.event_community_meetup_attendees,public.event_community_reports from public,anon,authenticated;
grant all on public.event_community_events,public.event_community_members,public.event_community_messages,public.event_community_meetups,public.event_community_meetup_attendees,public.event_community_reports to service_role;

create or replace function public.event_community_sync(p_key text,p_snapshot jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot)<>'object' or length(p_snapshot::text)>5000 or nullif(p_snapshot->>'title','') is null
    or nullif(p_snapshot->>'startsAt','') is null then raise exception 'Invalid event' using errcode='22023'; end if;
  insert into public.event_community_events(event_key,snapshot) values(p_key,p_snapshot)
  on conflict(event_key) do update set checked_at=now(),
    previous_snapshot=case when event_community_events.snapshot is distinct from excluded.snapshot then event_community_events.snapshot else event_community_events.previous_snapshot end,
    changed_at=case when event_community_events.snapshot is distinct from excluded.snapshot then now() else event_community_events.changed_at end,
    version=event_community_events.version+case when event_community_events.snapshot is distinct from excluded.snapshot then 1 else 0 end,
    snapshot=excluded.snapshot;
end; $$;

create or replace function public.event_community_person(p_user uuid,p_viewer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('key',i.profile_key,'userId',i.user_id,'username',i.username,'avatarPath',i.avatar_path)
  from public.community_profile_identity('user:'||p_user::text,p_viewer) i;
$$;

create or replace function public.event_community_read(p_user uuid,p_key text,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_event record; v_member record; v_messages jsonb; v_cursor jsonb; v_meetup jsonb; v_people jsonb; v_count bigint;
begin
  if p_user is null or coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_event from public.event_community_events where event_key=p_key;
  if not found then return null; end if;
  select * into v_member from public.event_community_members where event_key=p_key and user_id=p_user;
  select count(*) into v_count from public.event_community_members m where m.event_key=p_key
    and public.event_community_person(m.user_id,p_user) is not null;
  select coalesce(jsonb_agg(person order by joined_at,user_id),'[]'::jsonb) into v_people from
    (select m.joined_at,m.user_id,public.event_community_person(m.user_id,p_user) person from public.event_community_members m
     where m.event_key=p_key and not public.community_users_blocked(p_user,m.user_id) order by m.joined_at,m.user_id limit 40) s where person is not null;
  if v_member.user_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'body',s.body,'createdAt',s.created_at,'author',s.person) order by s.created_at,s.id),'[]'::jsonb)
      into v_messages from (select m.*,public.event_community_person(m.user_id,p_user) person from public.event_community_messages m
      where m.event_key=p_key and m.status='published' and m.user_id is not null and not public.community_users_blocked(p_user,m.user_id)
        and (p_before is null or (m.created_at,m.id)<(p_before,p_before_id)) order by m.created_at desc,m.id desc limit 50) s where s.person is not null;
    if jsonb_array_length(v_messages)=50 then v_cursor=jsonb_build_object('createdAt',v_messages->0->>'createdAt','id',v_messages->0->>'id'); end if;
    select jsonb_build_object('id',m.id,'startsAt',m.starts_at,'publicPlace',m.public_place,'updatedAt',m.updated_at,
      'creator',public.event_community_person(m.creator_id,p_user),'isOwn',m.creator_id=p_user,
      'joined',exists(select 1 from public.event_community_meetup_attendees a where a.meetup_id=m.id and a.user_id=p_user),
      'attendees',(select coalesce(jsonb_agg(person),'[]'::jsonb) from (select public.event_community_person(a.user_id,p_user) person from public.event_community_meetup_attendees a
        where a.meetup_id=m.id and not public.community_users_blocked(p_user,a.user_id) order by a.user_id limit 40) people where person is not null),
      'attendeeCount',(select count(*) from public.event_community_meetup_attendees a where a.meetup_id=m.id and not public.community_users_blocked(p_user,a.user_id)))
      into v_meetup from public.event_community_meetups m where m.event_key=p_key and m.creator_id is not null and not public.community_users_blocked(p_user,m.creator_id);
  end if;
  return jsonb_build_object('eventKey',p_key,'event',v_event.snapshot,'checkedAt',v_event.checked_at,'version',v_event.version,
    'change',case when v_event.previous_snapshot is null then null else jsonb_build_object('previous',v_event.previous_snapshot,'changedAt',v_event.changed_at) end,
    'joined',v_member.user_id is not null,'muted',coalesce(v_member.muted,false),'memberCount',v_count,'attendees',v_people,
    'messages',coalesce(v_messages,'[]'::jsonb),'nextBefore',v_cursor,'meetup',v_meetup);
end; $$;

create or replace function public.event_community_list(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_user is null or coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(item order by joined_at desc),'[]'::jsonb) into v_result from (
    select m.joined_at,jsonb_build_object('eventKey',e.event_key,'event',e.snapshot,'muted',m.muted,'joinedAt',m.joined_at,
      'memberCount',(select count(*) from public.event_community_members a where a.event_key=e.event_key and public.event_community_person(a.user_id,p_user) is not null)) item
    from public.event_community_members m join public.event_community_events e on e.event_key=m.event_key where m.user_id=p_user order by m.joined_at desc limit 100) s;
  return v_result;
end; $$;

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

create or replace function public.event_community_moderate(p_id uuid,p_status text,p_hide boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('resolved','dismissed') or p_status is null or p_hide and p_status<>'resolved' then raise exception 'Invalid status' using errcode='22023'; end if;
  select * into r from public.event_community_reports where id=p_id for update;
  if not found then return false; end if;
  if p_hide then
    if r.message_id is not null then update public.event_community_messages set status='hidden' where id=r.message_id;
    else delete from public.event_community_meetups where id=r.meetup_id; return true; end if;
  end if;
  update public.event_community_reports set status=p_status where id=p_id;
  return true;
end; $$;

revoke all on function public.event_community_sync(text,jsonb),public.event_community_person(uuid,uuid),public.event_community_read(uuid,text,timestamptz,uuid),public.event_community_list(uuid),public.event_community_action(uuid,text,text,jsonb),public.event_community_moderate(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.event_community_sync(text,jsonb),public.event_community_person(uuid,uuid),public.event_community_read(uuid,text,timestamptz,uuid),public.event_community_list(uuid),public.event_community_action(uuid,text,text,jsonb),public.event_community_moderate(uuid,text,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
