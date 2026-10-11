begin;

-- Only hashes and the reserved canonical ID are retained, not another copy of
-- the user's text/photo. A committed receipt survives topic removal as a tombstone.
create table public.community_question_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  photo_hash text check (photo_hash ~ '^[a-f0-9]{64}$'),
  topic_id uuid not null unique default gen_random_uuid(),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.community_question_requests enable row level security;
revoke all on public.community_question_requests from public,anon,authenticated;
grant all on public.community_question_requests to service_role;

create function public.reserve_community_question(p_user uuid,p_request uuid,p_payload_hash text,p_photo_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.community_question_requests; t public.forum_topics;
begin
  if coalesce(auth.role(),'')<>'service_role' or p_user is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_request is null or coalesce(p_payload_hash,'')!~'^[a-f0-9]{64}$'
    or p_photo_hash is not null and p_photo_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_request::text,717));
  select * into r from public.community_question_requests where user_id=p_user and request_id=p_request;
  if found then
    if r.payload_hash<>p_payload_hash or r.photo_hash is distinct from p_photo_hash then raise exception 'Request changed' using errcode='23505'; end if;
    if r.committed_at is not null then
      select * into t from public.forum_topics where id=r.topic_id and author_id=p_user;
      if not found then raise exception 'Topic removed' using errcode='P0002'; end if;
      return jsonb_build_object('id',r.topic_id,'committed',true,'status',t.status);
    end if;
  else
    insert into public.community_question_requests(user_id,request_id,payload_hash,photo_hash)
      values(p_user,p_request,p_payload_hash,p_photo_hash) returning * into r;
  end if;
  return jsonb_build_object('id',r.topic_id,'committed',false);
end $$;

create function public.complete_community_question(p_user uuid,p_request uuid,p_payload_hash text,
  p_title text,p_body text,p_category text,p_country_slug text,p_author_name text,p_status text,p_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.community_question_requests; t public.forum_topics;
begin
  if coalesce(auth.role(),'')<>'service_role' or p_user is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_request::text,717));
  select * into r from public.community_question_requests where user_id=p_user and request_id=p_request;
  if not found then raise exception 'Reservation required' using errcode='P0002'; end if;
  if r.payload_hash is distinct from p_payload_hash then raise exception 'Request changed' using errcode='23505'; end if;
  if r.committed_at is not null then
    select * into t from public.forum_topics where id=r.topic_id and author_id=p_user;
    if not found then raise exception 'Topic removed' using errcode='P0002'; end if;
    return jsonb_build_object('id',t.id,'status',t.status);
  end if;
  if coalesce(char_length(p_title),0) not between 5 and 160 or coalesce(char_length(p_body),0) not between 10 and 4000
    or coalesce(p_status,'') not in ('pending','published') or nullif(p_slug,'') is null
    or nullif(p_category,'') is null or coalesce(char_length(p_author_name),0) not between 1 and 80
    then raise exception 'Invalid topic' using errcode='22023'; end if;
  insert into public.forum_topics(id,slug,title,content,category,country_slug,author_id,author_name,status)
    values(r.topic_id,p_slug,p_title,p_body,p_category,p_country_slug,p_user,p_author_name,
      case when r.photo_hash is not null then 'pending' else p_status end) returning * into t;
  if r.photo_hash is not null then
    insert into public.forum_topic_photos(topic_id,user_id,storage_path)
      values(t.id,p_user,p_user::text||'/'||t.id::text||'.jpg');
  end if;
  update public.community_question_requests set committed_at=now() where user_id=p_user and request_id=p_request;
  return jsonb_build_object('id',t.id,'status',t.status);
end $$;

revoke all on function public.reserve_community_question(uuid,uuid,text,text),
  public.complete_community_question(uuid,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_community_question(uuid,uuid,text,text),
  public.complete_community_question(uuid,uuid,text,text,text,text,text,text,text,text) to service_role;

-- Unpublished forum submissions appear only to their author. Public profiles, the
-- discovery feed and follower views retain the published-only boundary.
create or replace function public.community_profile_posts(p_key text,p_viewer uuid)
returns table(id uuid,title text,body text,country_slug text,created_at timestamptz,author_id uuid,author_name text)
language sql stable security definer set search_path='' as $$
  select t.id,t.title,t.content,t.country_slug,t.created_at,t.author_id,t.author_name
  from public.forum_topics t
  where (t.status='published' or t.status in ('pending','hidden','rejected','closed') and t.author_id=p_viewer)
    and not public.community_users_blocked(p_viewer,t.author_id)
    and public.community_topic_profile_key(t.id,t.author_id,t.seed_key,t.author_name,t.status,t.is_paywalled,t.category)=p_key;
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
    'isOfficial',public.community_account_is_official(ident.user_id),
    'bio',ident.bio,'isStarter',ident.is_starter,'isOwn',coalesce(ident.user_id=p_viewer,false),
    'showAvatar',case when ident.user_id=p_viewer then ident.show_avatar else null end,
    'isFollowing',exists(select 1 from public.community_profile_follows f where f.follower_id=p_viewer and f.target_key=p_key),
    'followerCount',(select count(*) from public.community_profile_connections(p_key,p_viewer,true)),
    'followingCount',(select count(*) from public.community_profile_connections(p_key,p_viewer,false)),
    'postCount',(select count(*) from public.community_profile_posts(p_key,p_viewer)),
    'answerCount',(select count(*) from public.community_profile_answers(p_key,p_viewer)),'safetyTarget',v_safety);
  if p_section = 'posts' then
    select count(*) into v_total from public.community_profile_posts(p_key,p_viewer);
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'countrySlug',q.country_slug,'createdAt',q.created_at,'status',q.status,'hasPhoto',q.has_photo) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_items from (select p.*,t.status,exists(select 1 from public.forum_topic_photos photo where photo.topic_id=p.id and photo.user_id=p.author_id and photo.storage_path=p.author_id::text||'/'||p.id::text||'.jpg') has_photo from public.community_profile_posts(p_key,p_viewer) p join public.forum_topics t on t.id=p.id order by p.created_at desc,p.id desc limit 20 offset v_offset) q;
  elsif p_section = 'answers' then
    select count(*) into v_total from public.community_profile_answers(p_key,p_viewer);
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'questionId',a.question_id,'questionTitle',a.question_title,'body',a.body,'createdAt',a.created_at) order by a.created_at desc,a.id desc),'[]'::jsonb)
    into v_items from (select * from public.community_profile_answers(p_key,p_viewer) order by created_at desc,id desc limit 20 offset v_offset) a;
  else
    select count(*) into v_total from public.community_profile_connections(p_key,p_viewer,p_section='followers');
    select coalesce(jsonb_agg(jsonb_build_object('key',c.profile_key,'userId',c.user_id,'username',c.username,'avatarPath',c.avatar_path,
      'isOfficial',public.community_account_is_official(c.user_id)) order by c.created_at desc,c.profile_key),'[]'::jsonb)
    into v_items from (select * from public.community_profile_connections(p_key,p_viewer,p_section='followers') order by created_at desc,profile_key limit 20 offset v_offset) c;
  end if;
  return jsonb_build_object('profile',v_profile,'items',v_items,'nextOffset',case when v_offset+20 < v_total then v_offset+20 else null end);
end;
$$;


notify pgrst, 'reload schema';
commit;
