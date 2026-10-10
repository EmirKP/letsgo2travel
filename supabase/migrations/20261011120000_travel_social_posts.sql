begin;

-- Additive social media model, kept separate from questions/paywalled answers.
-- No client has direct access: service RPCs enforce viewer identity and blocks.
create table public.travel_social_posts (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 caption text not null check(char_length(caption)<=2200),
 visibility text not null check(visibility in ('public','followers')),
 place jsonb, photo_hash text not null check(photo_hash ~ '^[0-9a-f]{64}$'),
 storage_path text not null unique,
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now(), deleted_at timestamptz,
 check(storage_path=user_id::text || '/' || id::text || '.jpg'),
 check(place is null or (jsonb_typeof(place)='object' and char_length(place->>'name') between 1 and 120))
);
create index travel_social_posts_feed on public.travel_social_posts(created_at desc,id desc) where deleted_at is null;
create index travel_social_posts_owner on public.travel_social_posts(user_id,created_at desc);
create table public.travel_social_likes (
 post_id uuid references public.travel_social_posts(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create table public.travel_social_comments (
 id uuid primary key, post_id uuid not null references public.travel_social_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 2000),
 parent_id uuid references public.travel_social_comments(id) on delete cascade,
 status text not null check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now()
);
create index travel_social_comments_post on public.travel_social_comments(post_id,created_at,id);
create table public.travel_social_collections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 60), created_at timestamptz not null default now(),
 unique(user_id,name)
);
create table public.travel_social_saves (
 collection_id uuid references public.travel_social_collections(id) on delete cascade,
 post_id uuid references public.travel_social_posts(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(collection_id,post_id)
);
create table public.travel_social_reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 post_id uuid not null references public.travel_social_posts(id) on delete cascade,
 comment_id uuid references public.travel_social_comments(id) on delete cascade,
 reason text not null check(reason in ('spam','harassment','inappropriate','other')),
 details text not null default '' check(char_length(details)<=1000), resolved_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.community_notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 comments boolean not null default true,replies boolean not null default true,follows boolean not null default true,
 price_alert_email boolean not null default true,price_alert_push boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.community_social_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('comment','reply','follow')),
 post_id uuid references public.travel_social_posts(id) on delete cascade,
 comment_id uuid references public.travel_social_comments(id) on delete cascade,
 created_at timestamptz not null default now(), read_at timestamptz,
 check(user_id<>actor_id)
);
create index community_social_notifications_inbox on public.community_social_notifications(user_id,created_at desc);
create unique index community_social_notifications_comment_unique on public.community_social_notifications(user_id,comment_id,kind) where comment_id is not null;

do $$ declare t text; begin
 foreach t in array array['travel_social_posts','travel_social_likes','travel_social_comments','travel_social_collections','travel_social_saves','travel_social_reports','community_notification_preferences','community_social_notifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.social_post_visible(p public.travel_social_posts,v uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p.deleted_at is null
 and (p.status='published' or p.user_id=v and p.status='pending')
 and not public.community_users_blocked(v,p.user_id)
 and exists(select 1 from public.community_profile_identity('user:'||p.user_id::text,v))
 and (p.visibility='public' or p.user_id=v or exists(select 1 from public.community_profile_follows f where f.follower_id=v and f.target_user_id=p.user_id));
$$;
create function public.social_comment_visible(c public.travel_social_comments,v uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (c.status='published' or c.user_id=v and c.status='pending')
 and not public.community_users_blocked(v,c.user_id)
 and exists(select 1 from public.community_profile_identity('user:'||c.user_id::text,v))
 and (c.parent_id is null or not exists(
  with recursive ancestors as (
   select parent.id,parent.parent_id,parent.user_id,parent.status,parent.post_id from public.travel_social_comments parent where parent.id=c.parent_id
   union all select parent.id,parent.parent_id,parent.user_id,parent.status,parent.post_id from public.travel_social_comments parent join ancestors child on parent.id=child.parent_id
  ) select 1 from ancestors where status<>'published' or post_id<>c.post_id or public.community_users_blocked(v,user_id)
  or not exists(select 1 from public.community_profile_identity('user:'||user_id::text,v))
 ));
$$;
create function public.social_author_json(u uuid,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key',i.profile_key,'userId',i.user_id,'username',i.username,'avatarPath',i.avatar_path)
 from public.community_profile_identity('user:'||u::text,v) i;
$$;
create function public.social_post_json(p public.travel_social_posts,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'author',public.social_author_json(p.user_id,v),'caption',p.caption,
 'visibility',p.visibility,'place',p.place,'createdAt',p.created_at,'status',p.status,
 'photoUrl','/api/country-community/social/'||p.id::text||'/photo','isOwn',coalesce(p.user_id=v,false),
 'likeCount',(select count(*) from public.travel_social_likes l where l.post_id=p.id and not public.community_users_blocked(v,l.user_id)),
 'commentCount',(select count(*) from public.travel_social_comments c where c.post_id=p.id and public.social_comment_visible(c,v)),
 'liked',exists(select 1 from public.travel_social_likes l where l.post_id=p.id and l.user_id=v),
 'saved',exists(select 1 from public.travel_social_saves s join public.travel_social_collections col on col.id=s.collection_id where s.post_id=p.id and col.user_id=v),
 'collectionIds',(select coalesce(jsonb_agg(s.collection_id),'[]'::jsonb) from public.travel_social_saves s join public.travel_social_collections col on col.id=s.collection_id where s.post_id=p.id and col.user_id=v));
$$;
create function public.social_comment_json(c public.travel_social_comments,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'author',public.social_author_json(c.user_id,v),'body',c.body,'parentId',c.parent_id,
 'createdAt',c.created_at,'status',c.status,'isOwn',coalesce(c.user_id=v,false));
$$;

create function public.read_travel_social(p_viewer uuid,p_input jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_section text:=coalesce(p_input->>'section','feed'); v_post public.travel_social_posts;
 v_id uuid; v_offset int:=greatest(0,least(coalesce((p_input->>'offset')::int,0),10000)); v_items jsonb; v_count int;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if v_section in ('collections','preferences','notifications') or p_input->>'feed'='following' or p_input ? 'collectionId' then
  if p_viewer is null then raise exception 'Sign in required' using errcode='42501'; end if;
 end if;
 if v_section='preferences' then
  return coalesce((select jsonb_build_object('comments',comments,'replies',replies,'follows',follows,'price_alert_email',price_alert_email,'price_alert_push',price_alert_push) from public.community_notification_preferences where user_id=p_viewer),'{"comments":true,"replies":true,"follows":true,"price_alert_email":true,"price_alert_push":true}'::jsonb);
 elsif v_section='collections' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',col.id,'name',col.name,'postCount',
   (select count(*) from public.travel_social_saves s join public.travel_social_posts p on p.id=s.post_id where s.collection_id=col.id and public.social_post_visible(p,p_viewer))) order by col.created_at,col.id),'[]'::jsonb)
   from public.travel_social_collections col where col.user_id=p_viewer);
 elsif v_section='notifications' then
  select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]'::jsonb) into v_items from (
   select n.id,n.created_at,jsonb_build_object('id',n.id,'kind',n.kind,'author',public.social_author_json(n.actor_id,p_viewer),'postId',n.post_id,'commentId',n.comment_id,'createdAt',n.created_at,'readAt',n.read_at) item
   from public.community_social_notifications n left join public.community_notification_preferences pref on pref.user_id=n.user_id
   where n.user_id=p_viewer and not public.community_users_blocked(p_viewer,n.actor_id)
   and (case n.kind when 'comment' then coalesce(pref.comments,true) when 'reply' then coalesce(pref.replies,true) else coalesce(pref.follows,true) end)
   and public.social_author_json(n.actor_id,p_viewer) is not null
   and (n.post_id is null or exists(select 1 from public.travel_social_posts p where p.id=n.post_id and public.social_post_visible(p,p_viewer)))
   and (n.comment_id is null or exists(select 1 from public.travel_social_comments c where c.id=n.comment_id and public.social_comment_visible(c,p_viewer)))
   order by n.created_at desc,n.id desc limit 21 offset v_offset
  ) x;
 elsif p_input ? 'postId' then
  v_id:=(p_input->>'postId')::uuid;
  select * into v_post from public.travel_social_posts p where p.id=v_id and public.social_post_visible(p,p_viewer);
  if not found then return null; end if;
  if v_section='photo' then return jsonb_build_object('userId',v_post.user_id,'storagePath',v_post.storage_path); end if;
  select coalesce(jsonb_agg(x.item order by x.created_at,x.id),'[]'::jsonb) into v_items from (
   select c.id,c.created_at,public.social_comment_json(c,p_viewer) item from public.travel_social_comments c
   where c.post_id=v_id and public.social_comment_visible(c,p_viewer) order by c.created_at,c.id limit 21 offset v_offset
  ) x;
  return jsonb_build_object('post',public.social_post_json(v_post,p_viewer),'comments',jsonb_build_object('items',case when jsonb_array_length(v_items)>20 then v_items-20 else v_items end,
   'nextOffset',case when jsonb_array_length(v_items)>20 then v_offset+20 else null end));
 else
  if p_input ? 'collectionId' and not exists(select 1 from public.travel_social_collections where id=(p_input->>'collectionId')::uuid and user_id=p_viewer) then return null; end if;
  select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]'::jsonb) into v_items from (
   select p.id,p.created_at,public.social_post_json(p,p_viewer) item from public.travel_social_posts p
   where public.social_post_visible(p,p_viewer)
   and (not(p_input ? 'authorRef') or p_input->>'authorRef'='user:'||p.user_id::text)
   and (coalesce(p_input->>'feed','discover')<>'following' or exists(select 1 from public.community_profile_follows f where f.follower_id=p_viewer and f.target_user_id=p.user_id))
   and (not(p_input ? 'collectionId') or exists(select 1 from public.travel_social_saves s where s.post_id=p.id and s.collection_id=(p_input->>'collectionId')::uuid))
   order by p.created_at desc,p.id desc limit 21 offset v_offset
  ) x;
 end if;
 v_count:=jsonb_array_length(v_items);
 return jsonb_build_object('items',case when v_count>20 then v_items-20 else v_items end,'nextOffset',case when v_count>20 then v_offset+20 else null end);
end $$;

create function public.social_notify(u uuid,a uuid,k text,p uuid default null,c uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if u is null or u=a or public.community_users_blocked(u,a) then return; end if;
 if not coalesce((select case k when 'comment' then comments when 'reply' then replies else follows end from public.community_notification_preferences where user_id=u),true) then return; end if;
 insert into public.community_social_notifications(user_id,actor_id,kind,post_id,comment_id) values(u,a,k,p,c) on conflict do nothing;
end $$;
create function public.social_follow_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.target_user_id is not null and not exists(select 1 from public.community_social_notifications where user_id=new.target_user_id and actor_id=new.follower_id and kind='follow' and created_at>now()-interval '1 day') then
  perform public.social_notify(new.target_user_id,new.follower_id,'follow');
 end if;
 return new;
end $$;
create trigger social_follow_notification after insert on public.community_profile_follows for each row execute function public.social_follow_notification();
create function public.social_comment_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; parent_owner uuid;
begin
 if new.status<>'published' then return new; end if;
 if tg_op='UPDATE' and old.status='published' then return new; end if;
 select user_id into owner_id from public.travel_social_posts where id=new.post_id and deleted_at is null and status='published';
 if owner_id is null then return new; end if;
 if new.parent_id is not null then
  select user_id into parent_owner from public.travel_social_comments where id=new.parent_id and post_id=new.post_id and status='published';
  if parent_owner is not null then perform public.social_notify(parent_owner,new.user_id,'reply',new.post_id,new.id); end if;
 end if;
 if owner_id is distinct from parent_owner then perform public.social_notify(owner_id,new.user_id,'comment',new.post_id,new.id); end if;
 return new;
end $$;
create trigger social_comment_notification after insert or update of status on public.travel_social_comments for each row execute function public.social_comment_notification();

create function public.write_travel_social(p_viewer uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_post public.travel_social_posts; v_comment public.travel_social_comments; v_id uuid; v_parent uuid; v_target uuid; v_name text;
 v_collection uuid; v_deleted timestamptz; v_prefs public.community_notification_preferences;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.community_profile_identity('user:'||p_viewer::text,p_viewer)) then raise exception 'Profile required' using errcode='22023'; end if;
 -- Serialize per user for quotas/idempotency; locks are transaction scoped.
 perform pg_advisory_xact_lock(hashtextextended(p_viewer::text,713));
 if p_action='create' then
  v_id:=(p_input->>'requestId')::uuid;
  select * into v_post from public.travel_social_posts where id=v_id;
  if found then
   if v_post.user_id<>p_viewer or v_post.caption is distinct from p_input->>'caption' or v_post.photo_hash is distinct from p_input->>'photoHash'
     or v_post.visibility is distinct from p_input->>'visibility' or v_post.place is distinct from nullif(p_input->'place','null') then raise exception 'Request ID already used' using errcode='23505'; end if;
   if v_post.deleted_at is not null then raise exception 'Post deleted' using errcode='P0002'; end if;
   return public.social_post_json(v_post,p_viewer);
  end if;
  if (select count(*) from public.travel_social_posts where user_id=p_viewer and created_at>now()-interval '1 hour')>=10 then raise exception 'Please try later' using errcode='54000'; end if;
  insert into public.travel_social_posts(id,user_id,caption,visibility,place,photo_hash,storage_path,status)
   values(v_id,p_viewer,p_input->>'caption',p_input->>'visibility',nullif(p_input->'place','null'),p_input->>'photoHash',p_viewer::text||'/'||v_id::text||'.jpg','pending') returning * into v_post;
  return public.social_post_json(v_post,p_viewer);
 elsif p_action='preferences' then
  insert into public.community_notification_preferences(user_id) values(p_viewer) on conflict do nothing;
  update public.community_notification_preferences set comments=coalesce((p_input->>'comments')::boolean,comments),replies=coalesce((p_input->>'replies')::boolean,replies),follows=coalesce((p_input->>'follows')::boolean,follows),price_alert_email=coalesce((p_input->>'price_alert_email')::boolean,price_alert_email),price_alert_push=coalesce((p_input->>'price_alert_push')::boolean,price_alert_push),updated_at=now() where user_id=p_viewer returning * into v_prefs;
  return jsonb_build_object('comments',v_prefs.comments,'replies',v_prefs.replies,'follows',v_prefs.follows,'price_alert_email',v_prefs.price_alert_email,'price_alert_push',v_prefs.price_alert_push);
 elsif p_action='notifications-read' then
  update public.community_social_notifications set read_at=coalesce(read_at,now()) where user_id=p_viewer and (not(p_input ? 'id') or id=(p_input->>'id')::uuid);
  return '{"success":true}'::jsonb;
 elsif p_action='collection-create' then
  if (select count(*) from public.travel_social_collections where user_id=p_viewer)>=100 then raise exception 'Collection limit reached' using errcode='54000'; end if;
  insert into public.travel_social_collections(user_id,name) values(p_viewer,trim(p_input->>'name')) on conflict(user_id,name) do update set name=excluded.name returning id into v_collection;
  return jsonb_build_object('id',v_collection,'name',trim(p_input->>'name'),'postCount',(select count(*) from public.travel_social_saves s join public.travel_social_posts p on p.id=s.post_id where s.collection_id=v_collection and public.social_post_visible(p,p_viewer)));
 end if;
 v_id:=(p_input->>'postId')::uuid;
 select * into v_post from public.travel_social_posts where id=v_id for update;
 if not found then raise exception 'Not found' using errcode='P0002'; end if;
 if p_action in ('delete','restore') then
  if v_post.user_id<>p_viewer then raise exception 'Not found' using errcode='P0002'; end if;
  if p_action='delete' then
   update public.travel_social_posts set deleted_at=coalesce(deleted_at,clock_timestamp()) where id=v_id returning deleted_at into v_deleted;
   return jsonb_build_object('undoUntil',v_deleted+interval '30 seconds');
  end if;
  if v_post.deleted_at is not null and v_post.deleted_at<clock_timestamp()-interval '30 seconds' then raise exception 'Undo expired' using errcode='22023'; end if;
  update public.travel_social_posts set deleted_at=null where id=v_id returning * into v_post;
  return public.social_post_json(v_post,p_viewer);
 end if;
 if not public.social_post_visible(v_post,p_viewer) or v_post.status<>'published' then raise exception 'Not found' using errcode='P0002'; end if;
 if p_action='block' then
  v_target:=v_post.user_id;
  if p_input ? 'commentId' then
   select c.user_id into v_target from public.travel_social_comments c where c.id=(p_input->>'commentId')::uuid and c.post_id=v_id and public.social_comment_visible(c,p_viewer);
   if not found then raise exception 'Not found' using errcode='P0002'; end if;
  end if;
  if v_target=p_viewer then raise exception 'Cannot block self' using errcode='22023'; end if;
  select username into v_name from public.community_profile_identity('user:'||v_target::text,p_viewer);
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  insert into public.community_user_blocks(user_id,blocked_user_id,blocked_name) values(p_viewer,v_target,v_name) on conflict(user_id,blocked_user_id) do nothing;
  return jsonb_build_object('success',true,'userId',v_target);
 elsif p_action='like' then
  if (p_input->>'active')::boolean then insert into public.travel_social_likes(post_id,user_id) values(v_id,p_viewer) on conflict do nothing;
  else delete from public.travel_social_likes where post_id=v_id and user_id=p_viewer; end if;
  return public.social_post_json(v_post,p_viewer);
 elsif p_action='comment' then
  v_parent:=nullif(p_input->>'parentId','')::uuid;
  if v_parent is not null and not exists(select 1 from public.travel_social_comments c where c.id=v_parent and c.post_id=v_id and c.status='published' and public.social_comment_visible(c,p_viewer)) then raise exception 'Reply unavailable' using errcode='22023'; end if;
  select * into v_comment from public.travel_social_comments where id=(p_input->>'requestId')::uuid;
  if found then
   if v_comment.user_id<>p_viewer or v_comment.post_id<>v_id or v_comment.body is distinct from p_input->>'body' or v_comment.parent_id is distinct from v_parent then raise exception 'Request ID already used' using errcode='23505'; end if;
   return public.social_comment_json(v_comment,p_viewer);
  end if;
  if (select count(*) from public.travel_social_comments where user_id=p_viewer and created_at>now()-interval '1 hour')>=60 then raise exception 'Please try later' using errcode='54000'; end if;
  insert into public.travel_social_comments(id,post_id,user_id,body,parent_id,status) values((p_input->>'requestId')::uuid,v_id,p_viewer,p_input->>'body',v_parent,case when p_input->>'status'='published' then 'published' else 'pending' end) returning * into v_comment;
  return public.social_comment_json(v_comment,p_viewer);
 elsif p_action='save' then
  v_collection:=(p_input->>'collectionId')::uuid;
  if not exists(select 1 from public.travel_social_collections where id=v_collection and user_id=p_viewer) then raise exception 'Not found' using errcode='P0002'; end if;
  if (p_input->>'active')::boolean then insert into public.travel_social_saves(collection_id,post_id) values(v_collection,v_id) on conflict do nothing;
  else delete from public.travel_social_saves where collection_id=v_collection and post_id=v_id; end if;
  return public.social_post_json(v_post,p_viewer);
 elsif p_action='report' then
  v_parent:=nullif(p_input->>'commentId','')::uuid;
  if v_parent is not null and not exists(select 1 from public.travel_social_comments c where c.id=v_parent and c.post_id=v_id and public.social_comment_visible(c,p_viewer)) then raise exception 'Not found' using errcode='P0002'; end if;
  if (select count(*) from public.travel_social_reports where user_id=p_viewer and created_at>now()-interval '1 day')>=20 then raise exception 'Please try later' using errcode='54000'; end if;
  if not exists(select 1 from public.travel_social_reports where user_id=p_viewer and post_id=v_id and comment_id is not distinct from v_parent and resolved_at is null) then
   insert into public.travel_social_reports(user_id,post_id,comment_id,reason,details) values(p_viewer,v_id,v_parent,p_input->>'reason',coalesce(p_input->>'details',''));
  end if;
  return '{"success":true}'::jsonb;
 end if;
 raise exception 'Invalid action' using errcode='22023';
end $$;

-- Admin routes authenticate a current moderator before invoking this private
-- RPC. Hiding and resolving are one transaction; failure keeps the report open.
create function public.moderate_travel_social_report(p_report uuid,p_hide boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.travel_social_reports; p public.travel_social_posts;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into r from public.travel_social_reports where id=p_report for update;
 if not found then raise exception 'Not found' using errcode='P0002'; end if;
 if p_hide then
  select * into p from public.travel_social_posts where id=r.post_id and deleted_at is null for update;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  if r.comment_id is not null then
   update public.travel_social_comments set status='hidden' where id=r.comment_id and post_id=r.post_id;
  else
   update public.travel_social_posts set status='hidden' where id=r.post_id;
  end if;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
 end if;
 update public.travel_social_reports set resolved_at=coalesce(resolved_at,now()) where id=r.id;
 return '{"success":true}'::jsonb;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('social_post_visible','social_comment_visible','social_author_json','social_post_json','social_comment_json','read_travel_social','write_travel_social','social_notify','social_follow_notification','social_comment_notification','moderate_travel_social_report') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('travel-social-photos','travel-social-photos',false,300000,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=300000,allowed_mime_types=array['image/jpeg'];
create policy "Social photos require service routes" on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'travel-social-photos') with check(bucket_id<>'travel-social-photos');

notify pgrst,'reload schema';
commit;
