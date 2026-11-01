-- Six-digit invitations are five-minute leases, issued and accepted only by
-- the authenticated server API. A shared lease survives reloads/devices.
-- The short display code is service-only; clients cannot read or enumerate it.
create table if not exists public.trip_short_invites (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[0-9]{6}$'),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  invited_role text not null check (invited_role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  use_count integer not null default 0 check (use_count between 0 and 12),
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
alter table public.trip_short_invites enable row level security;
revoke all on public.trip_short_invites from public, anon, authenticated;

-- Keep only a code hash after its lease disappears. No trip foreign key:
-- deleting a trip must not let its old code join a different trip immediately.
create table if not exists public.trip_invite_code_history (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  reserved_until timestamptz not null
);
create index if not exists trip_invite_code_history_expiry_idx on public.trip_invite_code_history(reserved_until);
alter table public.trip_invite_code_history enable row level security;
revoke all on public.trip_invite_code_history from public, anon, authenticated;

-- Safe when applying this migration again after an earlier local revision.
insert into public.trip_invite_code_history(code_hash,reserved_until)
  select code_hash,expires_at+interval '7 days' from public.trip_short_invites
  where expires_at+interval '7 days' > now()
on conflict(code_hash) do update set reserved_until=greatest(public.trip_invite_code_history.reserved_until,excluded.reserved_until);

create table if not exists public.trip_invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.trip_invite_attempts enable row level security;
revoke all on public.trip_invite_attempts from public, anon, authenticated;

-- Seven-day legacy links must not remain an alternate route around the new
-- five-minute lifetime. Existing trip memberships are deliberately untouched.
update public.trip_invites set revoked_at = now()
where revoked_at is null and expires_at > created_at + interval '5 minutes';

create or replace function public.create_short_trip_invite(
  p_trip_id uuid, p_actor uuid, p_code text, p_code_hash text, p_role text
)
returns table(invite_code text, expires_at timestamptz, server_now timestamptz, invited_role text)
language plpgsql security definer set search_path = public
as $$
declare
  current_invite public.trip_short_invites%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  -- Issuance and acceptance share this lock. The small critical section also
  -- makes expiration cleanup and collision detection atomic across trips.
  perform pg_advisory_xact_lock(6101101);
  perform 1 from public.trips t join public.trip_members m on m.trip_id = t.id
    where t.id = p_trip_id and t.user_id = p_actor and m.user_id = p_actor and m.role = 'owner'
    for update of t;
  if not found then raise exception 'trip_forbidden'; end if;
  select s.* into current_invite from public.trip_short_invites s where s.trip_id = p_trip_id;
  if current_invite.expires_at > now() and current_invite.use_count < 12 then
    return query select current_invite.invite_code, current_invite.expires_at, now(), current_invite.invited_role;
    return;
  end if;
  if p_code !~ '^[0-9]{6}$' or p_code_hash !~ '^[0-9a-f]{64}$' or p_role not in ('editor','viewer') then
    raise exception 'invite_input_invalid';
  end if;
  -- Do not immediately reuse the same trip's previous code at rotation.
  if current_invite.invite_code = p_code then raise exception 'invite_code_collision'; end if;
  if exists(select 1 from public.trip_short_invites s where s.invite_code = p_code and s.expires_at > now()) then
    raise exception 'invite_code_collision';
  end if;
  if exists(select 1 from public.trip_invite_code_history h where h.code_hash=p_code_hash and h.reserved_until > now()) then
    raise exception 'invite_code_collision';
  end if;
  delete from public.trip_invite_code_history h where h.reserved_until <= now();
  delete from public.trip_short_invites s where s.expires_at <= now() or s.trip_id = p_trip_id;
  update public.trip_invites set revoked_at = now() where trip_id = p_trip_id and revoked_at is null;
  insert into public.trip_short_invites(trip_id,invite_code,code_hash,created_by,invited_role,created_at,expires_at)
    values(p_trip_id,p_code,p_code_hash,p_actor,p_role,now(),now()+interval '5 minutes')
    returning * into current_invite;
  insert into public.trip_invite_code_history(code_hash,reserved_until)
    values(p_code_hash,current_invite.expires_at+interval '7 days');
  return query select current_invite.invite_code, current_invite.expires_at, now(), current_invite.invited_role;
end;
$$;

create or replace function public.accept_shared_trip_invite(p_token_hash text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  selected_invite public.trip_short_invites%rowtype;
  attempt_row public.trip_invite_attempts%rowtype;
  joined_trip uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_user_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid'); end if;
  -- Durable, per-account throttling works across API workers. Return errors
  -- rather than raising, so invalid guesses cannot roll back the counter.
  perform pg_advisory_xact_lock(hashtext('trip-invite-attempt:' || p_user_id::text));
  insert into public.trip_invite_attempts(user_id) values(p_user_id) on conflict do nothing;
  select * into attempt_row from public.trip_invite_attempts where user_id = p_user_id for update;
  if attempt_row.window_start <= now()-interval '5 minutes' then
    update public.trip_invite_attempts set window_start=now(), attempts=0 where user_id=p_user_id;
    attempt_row.attempts := 0;
  end if;
  if attempt_row.attempts >= 5 then
    return jsonb_build_object('status','rate_limited','retryAfter',greatest(1,ceil(extract(epoch from (attempt_row.window_start+interval '5 minutes'-now())))::integer));
  end if;
  update public.trip_invite_attempts set attempts=attempts+1 where user_id=p_user_id;
  perform pg_advisory_xact_lock(6101101);
  select * into selected_invite from public.trip_short_invites where code_hash=p_token_hash and expires_at > now() for update;
  if selected_invite.trip_id is not null then
    if exists(select 1 from public.trip_members where trip_id=selected_invite.trip_id and user_id=p_user_id) then
      return jsonb_build_object('status','joined','tripId',selected_invite.trip_id);
    end if;
    if selected_invite.use_count >= 12 then return jsonb_build_object('status','invalid'); end if;
    insert into public.trip_members(trip_id,user_id,role,added_by)
      values(selected_invite.trip_id,p_user_id,selected_invite.invited_role,selected_invite.created_by);
    update public.trip_short_invites set use_count=use_count+1 where trip_id=selected_invite.trip_id;
    return jsonb_build_object('status','joined','tripId',selected_invite.trip_id);
  end if;
  -- Parseable legacy URLs only work if their server lease is still valid and
  -- already satisfies the new TTL. The migration revokes prior seven-day links.
  if exists(select 1 from public.trip_invites where token_hash=p_token_hash and revoked_at is null
      and expires_at > now() and expires_at <= created_at+interval '5 minutes' and use_count < max_uses) then
    joined_trip := public.accept_trip_invite(p_token_hash,p_user_id);
    return jsonb_build_object('status','joined','tripId',joined_trip);
  end if;
  return jsonb_build_object('status','invalid');
end;
$$;

create or replace function public.delete_shared_trip(p_trip_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  -- Share the invitation lock so no concurrent join can race a deletion.
  perform pg_advisory_xact_lock(6101101);
  perform 1 from public.trips t join public.trip_members m on m.trip_id=t.id
    where t.id=p_trip_id and t.user_id=p_actor and m.user_id=p_actor and m.role='owner' for update of t;
  if not found then raise exception 'trip_forbidden'; end if;
  -- One transactional delete; dependent votes, members, invites and expenses
  -- use their existing ON DELETE CASCADE foreign keys.
  delete from public.trips where id=p_trip_id and user_id=p_actor;
end;
$$;

revoke all on function public.create_short_trip_invite(uuid,uuid,text,text,text),
  public.accept_shared_trip_invite(text,uuid), public.delete_shared_trip(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.create_short_trip_invite(uuid,uuid,text,text,text),
  public.accept_shared_trip_invite(text,uuid), public.delete_shared_trip(uuid,uuid) to service_role;
