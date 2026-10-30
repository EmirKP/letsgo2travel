-- Read-only metadata preflight. Use the explicitly selected Supabase project;
-- this file does not create objects, touch user data, or run any community RPC.
select required.name, to_regclass(required.name) is not null as present
from (values ('auth.users'),('public.profiles'),('public.travel_events'),
 ('public.community_user_blocks')) required(name);

select required.name, to_regprocedure(required.name) is not null as present
from (values ('public.community_users_blocked(uuid,uuid)'),
 ('public.community_profile_identity(text,uuid)')) required(name);

select table_schema,table_name,column_name,data_type
from information_schema.columns
where (table_schema='auth' and table_name='users' and column_name in ('id','deleted_at'))
 or (table_schema='public' and table_name='community_user_blocks' and column_name in ('user_id','blocked_user_id','blocked_name'))
order by table_schema,table_name,column_name;

select pg_get_function_result(to_regprocedure('public.community_profile_identity(text,uuid)')) as profile_identity_result;

select version,name from supabase_migrations.schema_migrations
where version in ('20261024213000','20261024214500') order by version;

select coalesce(position('Account removal must not reserve' in
 pg_get_functiondef(to_regprocedure('public.event_community_action(uuid,text,text,jsonb)')))>0,false)
 as meetup_owner_recovery_installed;

-- A pre-existing target object requires inspection before replaying. All six
-- target tables must report rls=true; anon/authenticated grants must be false.
select required.name, c.oid is not null as present, c.relrowsecurity as rls,
 case when c.oid is not null then has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') end as anon_access,
 case when c.oid is not null then has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') end as authenticated_access,
 case when c.oid is not null then has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') end as service_access
from (values ('public.event_community_events'),('public.event_community_members'),
 ('public.event_community_messages'),('public.event_community_meetups'),
 ('public.event_community_meetup_attendees'),('public.event_community_reports')) required(name)
left join pg_class c on c.oid=to_regclass(required.name);

select required.signature,p.oid is not null as present,p.prosecdef as security_definer,p.proconfig,
 case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
 case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute,
 case when p.oid is not null then has_function_privilege('service_role',p.oid,'EXECUTE') end as service_execute
from (values ('public.event_community_sync(text,jsonb)'),('public.event_community_person(uuid,uuid)'),
 ('public.event_community_read(uuid,text,timestamptz,uuid)'),('public.event_community_list(uuid)'),
 ('public.event_community_action(uuid,text,text,jsonb)'),('public.event_community_moderate(uuid,text,boolean)')) required(signature)
left join pg_proc p on p.oid=to_regprocedure(required.signature);
