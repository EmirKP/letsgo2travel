begin;

-- Public community biographies are separate from private travel/account data.
create table if not exists public.community_profile_bios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bio text not null default '' check (char_length(bio) <= 300),
  show_avatar boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.community_profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  target_key text not null,
  target_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_key),
  check (target_key ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or target_key ~ '^starter:[a-z0-9][a-z0-9._]{1,59}$'),
  check ((target_user_id is not null and target_key = 'user:' || target_user_id::text and target_user_id <> follower_id)
    or (target_user_id is null and target_key like 'starter:%'))
);
create index if not exists community_profile_followers_idx on public.community_profile_follows(target_key, created_at desc, follower_id);
alter table public.community_profile_bios enable row level security;
alter table public.community_profile_follows enable row level security;
revoke all on public.community_profile_bios, public.community_profile_follows from public, anon, authenticated;
grant all on public.community_profile_bios, public.community_profile_follows to service_role;

-- Only known service-managed starter rows have public editorial identities.
-- Null authors left behind by account deletion never become starter profiles.
create or replace function public.community_topic_profile_key(p_id uuid, p_author uuid, p_seed text, p_name text,
  p_status text, p_paywalled boolean, p_category text)
returns text language sql immutable set search_path = '' as $$
  select case when p_author is not null then 'user:' || p_author::text
    when p_seed ~ '^starter-20260930-(0[1-9]|1[0-5])$'
      and p_id::text = 'f09a2026-0930-4000-8000-' || lpad(right(p_seed,2),12,'0')
      and p_status = 'published' and p_paywalled is false and p_category = 'Ülke Bazlı Sorunlar'
      and p_name ~ '^[a-z0-9][a-z0-9._]{1,59}$' then 'starter:' || p_name end;
$$;
create or replace function public.community_reply_profile_key(p_id uuid, p_author uuid, p_seed text, p_name text,
  p_topic uuid, p_parent_key text)
returns text language sql immutable set search_path = '' as $$
  select case when p_author is not null then 'user:' || p_author::text
    when p_seed ~ '^starter-reply-20261010-(0[1-9]|1[0-5])-(0[1-9]|1[0-6])$'
      and p_id::text = 'f09a2026-1010-4000-8000-' || lpad(split_part(p_seed,'-',4),10,'0') || right(p_seed,2)
      and p_topic::text = 'f09a2026-0930-4000-8000-' || lpad(split_part(p_seed,'-',4),12,'0')
      and p_parent_key like 'starter:%' and p_name ~ '^[a-z0-9][a-z0-9._]{1,59}$' then 'starter:' || p_name end;
$$;

create or replace function public.community_profile_identity(p_key text, p_viewer uuid)
returns table (profile_key text, user_id uuid, username text, avatar_path text, bio text, is_starter boolean, show_avatar boolean)
language sql stable security definer set search_path = '' as $$
  select 'user:' || p.id::text, p.id, left(p.username,80),
    case when b.show_avatar is true or p_viewer = p.id then u.raw_user_meta_data->>'l2t_avatar_path' end,
    coalesce(b.bio,''), false, coalesce(b.show_avatar,false)
  from public.profiles p join auth.users u on u.id = p.id
  left join public.community_profile_bios b on b.user_id = p.id
  where p_key = 'user:' || p.id::text and nullif(trim(p.username),'') is not null
    and u.deleted_at is null and not public.community_users_blocked(p_viewer,p.id)
  union all
  select p_key, null::uuid, substring(p_key from 9), null::text, '', true, false
  where p_key ~ '^starter:[a-z0-9][a-z0-9._]{1,59}$' and (
    exists(select 1 from public.forum_topics t where public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category) = p_key)
    or exists(select 1 from public.forum_replies r join public.forum_topics t on t.id = r.topic_id
      where r.status = 'published' and public.community_reply_profile_key(r.id,r.user_id,r.seed_key,r.author_name,r.topic_id,
        public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category)) = p_key)
  );
$$;

create or replace function public.community_profile_posts(p_key text, p_viewer uuid)
returns table(id uuid,title text,body text,country_slug text,created_at timestamptz,author_id uuid,author_name text)
language sql stable security definer set search_path = '' as $$
  select t.id,t.title,t.content,t.country_slug,t.created_at,t.author_id,t.author_name
  from public.forum_topics t
  where t.status = 'published' and not public.community_users_blocked(p_viewer,t.author_id)
    and public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category) = p_key;
$$;
create or replace function public.community_profile_answers(p_key text, p_viewer uuid)
returns table(id uuid,question_id uuid,question_title text,body text,created_at timestamptz,author_id uuid,author_name text)
language sql stable security definer set search_path = '' as $$
  select r.id,t.id,t.title,r.content,r.created_at,r.user_id,r.author_name
  from public.forum_replies r join public.forum_topics t on t.id = r.topic_id
  where r.status = 'published' and t.status = 'published'
    and not public.community_users_blocked(p_viewer,r.user_id) and not public.community_users_blocked(p_viewer,t.author_id)
    and public.community_reply_profile_key(r.id,r.user_id,r.seed_key,r.author_name,r.topic_id,
      public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category)) = p_key
    and (not public.is_forum_topic_paywalled(t.id) or public.is_public_forum_preview_reply(r.id,t.id)
      or (p_viewer is not null and public.has_forum_topic_unlock(t.id,p_viewer)));
$$;
create or replace function public.community_profile_connections(p_key text, p_viewer uuid, p_followers boolean)
returns table(profile_key text,user_id uuid,username text,avatar_path text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.profile_key,i.user_id,i.username,i.avatar_path,f.created_at
  from public.community_profile_follows f
  cross join lateral public.community_profile_identity(case when p_followers then 'user:' || f.follower_id::text else f.target_key end,p_viewer) i
  where (p_followers and f.target_key = p_key or not p_followers and p_key = 'user:' || f.follower_id::text)
    and not public.community_users_blocked(f.follower_id,f.target_user_id);
$$;

create or replace function public.get_community_profile(p_key text,p_viewer uuid default null,p_section text default 'posts',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ident record; v_profile jsonb; v_items jsonb; v_total bigint; v_offset integer; v_safety jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_section not in ('posts','answers','followers','following') then raise exception 'Invalid section' using errcode='22023'; end if;
  v_offset := greatest(0,least(coalesce(p_offset,0),100000));
  select * into ident from public.community_profile_identity(p_key,p_viewer);
  if not found then return null; end if;
  select jsonb_build_object('targetType',s.kind,'targetId',s.id,'authorId',s.author_id,'username',s.author_name) into v_safety
  from (select 'question' kind,q.id,q.author_id,q.author_name,q.created_at from public.community_profile_posts(p_key,p_viewer) q
    union all select 'answer',a.id,a.author_id,a.author_name,a.created_at from public.community_profile_answers(p_key,p_viewer) a) s
  order by s.created_at desc,s.id desc limit 1;
  v_profile := jsonb_build_object('key',ident.profile_key,'userId',ident.user_id,'username',ident.username,'avatarPath',ident.avatar_path,
    'bio',ident.bio,'isStarter',ident.is_starter,'isOwn',coalesce(ident.user_id=p_viewer,false),
    'showAvatar',case when ident.user_id=p_viewer then ident.show_avatar else null end,
    'isFollowing',exists(select 1 from public.community_profile_follows f where f.follower_id=p_viewer and f.target_key=p_key),
    'followerCount',(select count(*) from public.community_profile_connections(p_key,p_viewer,true)),
    'followingCount',(select count(*) from public.community_profile_connections(p_key,p_viewer,false)),
    'postCount',(select count(*) from public.community_profile_posts(p_key,p_viewer)),
    'answerCount',(select count(*) from public.community_profile_answers(p_key,p_viewer)),'safetyTarget',v_safety);
  if p_section = 'posts' then
    select count(*) into v_total from public.community_profile_posts(p_key,p_viewer);
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'countrySlug',q.country_slug,'createdAt',q.created_at) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_items from (select * from public.community_profile_posts(p_key,p_viewer) order by created_at desc,id desc limit 20 offset v_offset) q;
  elsif p_section = 'answers' then
    select count(*) into v_total from public.community_profile_answers(p_key,p_viewer);
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'questionId',a.question_id,'questionTitle',a.question_title,'body',a.body,'createdAt',a.created_at) order by a.created_at desc,a.id desc),'[]'::jsonb)
    into v_items from (select * from public.community_profile_answers(p_key,p_viewer) order by created_at desc,id desc limit 20 offset v_offset) a;
  else
    select count(*) into v_total from public.community_profile_connections(p_key,p_viewer,p_section='followers');
    select coalesce(jsonb_agg(jsonb_build_object('key',c.profile_key,'userId',c.user_id,'username',c.username,'avatarPath',c.avatar_path) order by c.created_at desc,c.profile_key),'[]'::jsonb)
    into v_items from (select * from public.community_profile_connections(p_key,p_viewer,p_section='followers') order by created_at desc,profile_key limit 20 offset v_offset) c;
  end if;
  return jsonb_build_object('profile',v_profile,'items',v_items,'nextOffset',case when v_offset+20 < v_total then v_offset+20 else null end);
end;
$$;

-- Serialize block and follow changes for a pair, preventing a race from restoring
-- a blocked relationship. Block creation removes both directions permanently.
create or replace function public.community_follow_block_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(least(new.user_id::text,new.blocked_user_id::text) || ':' || greatest(new.user_id::text,new.blocked_user_id::text),421));
  delete from public.community_profile_follows f where
    (f.follower_id=new.user_id and f.target_user_id=new.blocked_user_id) or (f.follower_id=new.blocked_user_id and f.target_user_id=new.user_id);
  return new;
end; $$;
drop trigger if exists community_follow_block_cleanup on public.community_user_blocks;
create trigger community_follow_block_cleanup before insert on public.community_user_blocks for each row execute function public.community_follow_block_lock();

create or replace function public.set_community_profile_follow(p_viewer uuid,p_key text,p_follow boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare ident record; v_target uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_key = 'user:' || p_viewer::text then raise exception 'Cannot follow self' using errcode='22023'; end if;
  if p_key ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_target := substring(p_key from 6)::uuid;
    perform pg_advisory_xact_lock(hashtextextended(least(p_viewer::text,v_target::text) || ':' || greatest(p_viewer::text,v_target::text),421));
  end if;
  if not p_follow then
    delete from public.community_profile_follows where follower_id=p_viewer and target_key=p_key;
    return false;
  end if;
  if not exists(select 1 from public.community_profile_identity('user:' || p_viewer::text,p_viewer)) then raise exception 'Profile required' using errcode='22023'; end if;
  select * into ident from public.community_profile_identity(p_key,p_viewer);
  if not found then raise exception 'Profile unavailable' using errcode='22023'; end if;
  insert into public.community_profile_follows(follower_id,target_key,target_user_id) values(p_viewer,p_key,ident.user_id) on conflict do nothing;
  return true;
end; $$;

create or replace function public.update_community_profile(p_viewer uuid,p_bio text default null,p_show_avatar boolean default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if (p_bio is null and p_show_avatar is null) or char_length(p_bio)>300 then raise exception 'Invalid profile' using errcode='22023'; end if;
  insert into public.community_profile_bios(user_id,bio,show_avatar) values(p_viewer,coalesce(p_bio,''),coalesce(p_show_avatar,false))
  on conflict(user_id) do update set bio=coalesce(p_bio,community_profile_bios.bio),show_avatar=coalesce(p_show_avatar,community_profile_bios.show_avatar),updated_at=now();
  return true;
end; $$;

create or replace function public.get_community_following_feed(p_viewer uuid,p_offset integer default 0,p_slugs text[] default '{}',p_general boolean default false,p_search text default '',p_search_slugs text[] default '{}')
returns table(id uuid,author_id uuid,country_slug text,title text,content text,category text,author_name text,created_at timestamptz,seed_key text,is_paywalled boolean,status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select t.id,t.author_id,t.country_slug,t.title,t.content,t.category,t.author_name,t.created_at,t.seed_key,t.is_paywalled,t.status
    from public.forum_topics t where t.status='published' and not public.community_users_blocked(p_viewer,t.author_id)
    and exists(select 1 from public.community_profile_follows f where f.follower_id=p_viewer and f.target_key=public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category))
    and ((cardinality(p_slugs)=0 and not p_general) or t.country_slug=any(p_slugs) or (p_general and t.country_slug is null))
    and (p_search='' or t.title ilike '%' || p_search || '%' or t.content ilike '%' || p_search || '%' or t.author_name ilike '%' || p_search || '%' or t.country_slug=any(p_search_slugs))
    order by t.created_at desc,t.id desc limit 41 offset greatest(0,least(coalesce(p_offset,0),100000));
end; $$;

-- Batch author photos: server gets only the owned storage path, never arbitrary
-- OAuth URLs or full auth metadata. API signs and strips it before responding.
create or replace function public.community_author_photos(p_users uuid[],p_viewer uuid default null)
returns table(user_id uuid,avatar_path text) language sql stable security definer set search_path = '' as $$
  select u.id,u.raw_user_meta_data->>'l2t_avatar_path' from auth.users u
  where u.id=any(p_users) and u.deleted_at is null and not public.community_users_blocked(p_viewer,u.id)
    and exists(select 1 from public.community_profile_bios b where b.user_id=u.id and b.show_avatar is true)
    and exists(select 1 from public.profiles p where p.id=u.id);
$$;

revoke all on function public.community_topic_profile_key(uuid,uuid,text,text,text,boolean,text), public.community_reply_profile_key(uuid,uuid,text,text,uuid,text),
  public.community_profile_identity(text,uuid),public.community_profile_posts(text,uuid),public.community_profile_answers(text,uuid),public.community_profile_connections(text,uuid,boolean),
  public.get_community_profile(text,uuid,text,integer),public.set_community_profile_follow(uuid,text,boolean),public.community_follow_block_lock(),
  public.get_community_following_feed(uuid,integer,text[],boolean,text,text[]),public.community_author_photos(uuid[],uuid),public.update_community_profile(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.community_topic_profile_key(uuid,uuid,text,text,text,boolean,text), public.community_reply_profile_key(uuid,uuid,text,text,uuid,text),
  public.community_profile_identity(text,uuid),public.community_profile_posts(text,uuid),public.community_profile_answers(text,uuid),public.community_profile_connections(text,uuid,boolean),
  public.get_community_profile(text,uuid,text,integer),public.set_community_profile_follow(uuid,text,boolean),
  public.get_community_following_feed(uuid,integer,text[],boolean,text,text[]),public.community_author_photos(uuid[],uuid),public.update_community_profile(uuid,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
