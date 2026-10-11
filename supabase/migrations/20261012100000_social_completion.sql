-- Resume-safe social interactions, owner-managed comments and complete inbox.
begin;
alter table public.travel_social_comments add column deleted_at timestamptz, add column edited_at timestamptz;
alter table public.travel_social_posts add column editorial boolean not null default false;
-- Existing RLS remains enabled; direct clients still have no table or RPC privileges.
create or replace function public.social_post_json(p public.travel_social_posts,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'author',public.social_author_json(p.user_id,v),'caption',p.caption,
 'visibility',p.visibility,'place',p.place,'createdAt',p.created_at,'status',p.status,'editorial',p.editorial,
 'photoUrl','/api/country-community/social/'||p.id::text||'/photo','isOwn',coalesce(p.user_id=v,false),
 'likeCount',(select count(*) from public.travel_social_likes l where l.post_id=p.id and not public.community_users_blocked(v,l.user_id)),
 'commentCount',(select count(*) from public.travel_social_comments c where c.post_id=p.id and c.deleted_at is null and public.social_comment_visible(c,v)),
 'liked',exists(select 1 from public.travel_social_likes l where l.post_id=p.id and l.user_id=v),
 'saved',exists(select 1 from public.travel_social_saves s join public.travel_social_collections col on col.id=s.collection_id where s.post_id=p.id and col.user_id=v),
 'collectionIds',(select coalesce(jsonb_agg(s.collection_id),'[]'::jsonb) from public.travel_social_saves s join public.travel_social_collections col on col.id=s.collection_id where s.post_id=p.id and col.user_id=v));
$$;
create or replace function public.social_comment_json(c public.travel_social_comments,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'author',public.social_author_json(c.user_id,v),'body',case when c.deleted_at is not null then '' else c.body end,'isDeleted',c.deleted_at is not null,'editedAt',c.edited_at,'parentId',c.parent_id,
 'createdAt',c.created_at,'status',c.status,'isOwn',coalesce(c.user_id=v,false));
$$;


create or replace function public.read_travel_social(p_viewer uuid,p_input jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_section text:=coalesce(p_input->>'section','feed'); v_post public.travel_social_posts;
 v_id uuid; v_offset int:=greatest(0,least(coalesce((p_input->>'offset')::int,0),10000)); v_items jsonb; v_count int; v_unread int; v_focus_offset int;
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
   and (n.comment_id is null or exists(select 1 from public.travel_social_comments c where c.id=n.comment_id and c.deleted_at is null and public.social_comment_visible(c,p_viewer)))
   order by n.created_at desc,n.id desc limit 21 offset v_offset
  ) x;
  select count(*) into v_unread from public.community_social_notifications n
   left join public.community_notification_preferences pref on pref.user_id=n.user_id
   where n.read_at is null and n.user_id=p_viewer and not public.community_users_blocked(p_viewer,n.actor_id)
   and (case n.kind when 'comment' then coalesce(pref.comments,true) when 'reply' then coalesce(pref.replies,true) else coalesce(pref.follows,true) end)
   and public.social_author_json(n.actor_id,p_viewer) is not null
   and (n.post_id is null or exists(select 1 from public.travel_social_posts p where p.id=n.post_id and public.social_post_visible(p,p_viewer)))
   and (n.comment_id is null or exists(select 1 from public.travel_social_comments c where c.id=n.comment_id and c.deleted_at is null and public.social_comment_visible(c,p_viewer)));
  v_count:=jsonb_array_length(v_items);
  return jsonb_build_object('items',case when v_count>20 then v_items-20 else v_items end,
   'nextOffset',case when v_count>20 then v_offset+20 else null end,'unreadCount',v_unread);
 elsif p_input ? 'postId' then
  v_id:=(p_input->>'postId')::uuid;
  select * into v_post from public.travel_social_posts p where p.id=v_id and public.social_post_visible(p,p_viewer);
  if not found then return null; end if;
  if v_section='photo' then return jsonb_build_object('userId',v_post.user_id,'storagePath',v_post.storage_path); end if;
  if p_input ? 'commentId' then
   select ((ranked.position-1)/20)*20 into v_focus_offset from (
    select c.id,row_number() over(order by c.created_at,c.id)::int position from public.travel_social_comments c
    where c.post_id=v_id and public.social_comment_visible(c,p_viewer)
   ) ranked where ranked.id=(p_input->>'commentId')::uuid;
   if v_focus_offset is null then return null; end if;
   v_offset:=v_focus_offset;
  end if;
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
   and (p_input ? 'collectionId' or coalesce(p_input->>'feed','discover')<>'following' or exists(select 1 from public.community_profile_follows f where f.follower_id=p_viewer and f.target_user_id=p.user_id))
   and (not(p_input ? 'collectionId') or exists(select 1 from public.travel_social_saves s where s.post_id=p.id and s.collection_id=(p_input->>'collectionId')::uuid))
   order by p.created_at desc,p.id desc limit 21 offset v_offset
  ) x;
 end if;
 v_count:=jsonb_array_length(v_items);
 return jsonb_build_object('items',case when v_count>20 then v_items-20 else v_items end,'nextOffset',case when v_count>20 then v_offset+20 else null end);
end $$;

create or replace function public.write_travel_social(p_viewer uuid,p_action text,p_input jsonb)
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
 if p_action in ('comment-edit','comment-delete') then
  select * into v_comment from public.travel_social_comments
   where id=(p_input->>'commentId')::uuid and post_id=v_id and user_id=p_viewer for update;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  if p_action='comment-delete' then
   update public.travel_social_comments set body='[deleted]',deleted_at=coalesce(deleted_at,now()) where id=v_comment.id;
  else
   if v_comment.deleted_at is not null or v_comment.status='hidden' then raise exception 'Not found' using errcode='P0002'; end if;
   if char_length(trim(coalesce(p_input->>'body','')))=0 or char_length(p_input->>'body')>2000 then raise exception 'Invalid comment' using errcode='22023'; end if;
   update public.travel_social_comments set body=trim(p_input->>'body'),edited_at=now(),
    status=case when p_input->>'status'='published' then 'published' else 'pending' end where id=v_comment.id;
  end if;
  return public.read_travel_social(p_viewer,jsonb_build_object('postId',v_id));
 elsif p_action='block' then
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
  if v_parent is not null and not exists(select 1 from public.travel_social_comments c where c.id=v_parent and c.post_id=v_id and c.status='published' and c.deleted_at is null and public.social_comment_visible(c,p_viewer)) then raise exception 'Reply unavailable' using errcode='22023'; end if;
  select * into v_comment from public.travel_social_comments where id=(p_input->>'requestId')::uuid;
  if found then
   if v_comment.deleted_at is not null then raise exception 'Comment deleted' using errcode='P0002'; end if;
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

commit;
