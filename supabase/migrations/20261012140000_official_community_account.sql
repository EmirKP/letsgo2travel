begin;

-- An official application badge is separate from documentary traveller verification.
-- raw_app_meta_data is service-managed; raw_user_meta_data and display names are not authority.
create or replace function public.community_account_is_official(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null
    and u.raw_app_meta_data->'official_account' = 'true'::jsonb
    and u.raw_app_meta_data->'editorial_account' = 'true'::jsonb);
$$;

-- The user authorized this existing branded application account only. If absent in
-- another environment, there is no account to award. A mismatching identity aborts.
do $$
begin
  if exists(select 1 from auth.users where id='4cb721f0-d84a-4a0e-9f83-b3e05b67ae88') then
    if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id='4cb721f0-d84a-4a0e-9f83-b3e05b67ae88' and p.username='letsgo2travel_app'
        and u.deleted_at is null and u.raw_app_meta_data->'editorial_account'='true'::jsonb) then
      raise exception 'Official application account identity mismatch';
    end if;
    update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('official_account',true)
      where id='4cb721f0-d84a-4a0e-9f83-b3e05b67ae88';
  end if;
end;
$$;

-- Keep existing identity/table-returning RPC signatures compatible with installed clients.
create or replace function public.community_official_authors(p_users uuid[],p_viewer uuid default null)
returns table(user_id uuid) language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where auth.role()='service_role' and cardinality(p_users)<=250 and u.id=any(p_users) and public.community_account_is_official(u.id)
    and exists(select 1 from public.community_profile_identity('user:'||u.id::text,p_viewer));
$$;

create or replace function public.social_author_json(u uuid,v uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('key',i.profile_key,'userId',i.user_id,'username',i.username,'avatarPath',i.avatar_path,
    'isOfficial',public.community_account_is_official(i.user_id))
  from public.community_profile_identity('user:'||u::text,v) i;
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
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'body',q.body,'countrySlug',q.country_slug,'createdAt',q.created_at) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_items from (select * from public.community_profile_posts(p_key,p_viewer) order by created_at desc,id desc limit 20 offset v_offset) q;
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

revoke all on function public.community_account_is_official(uuid),public.community_official_authors(uuid[],uuid),
  public.social_author_json(uuid,uuid),public.get_community_profile(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.community_account_is_official(uuid),public.community_official_authors(uuid[],uuid),
  public.social_author_json(uuid,uuid),public.get_community_profile(text,uuid,text,integer) to service_role;

commit;
