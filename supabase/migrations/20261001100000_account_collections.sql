-- Private bookmarks and notes shared by Android, iOS and web. Device settings,
-- search/location history, offline downloads and notification permission are excluded.
create table if not exists public.account_collections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('saved_places', 'saved_events')),
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, kind),
  constraint account_collection_shape check (
    jsonb_typeof(document) = 'object'
    and jsonb_typeof(document->'items') = 'object'
    and jsonb_typeof(document->'dayIds') = 'array'
    and octet_length(document::text) <= 800000
  )
);
alter table public.account_collections enable row level security;
revoke all on public.account_collections from public, anon, authenticated;
grant select on public.account_collections to authenticated;
drop policy if exists account_collections_owner_read on public.account_collections;
create policy account_collections_owner_read on public.account_collections for select to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.save_account_collection(p_owner_id uuid, p_kind text, p_expected_revision bigint, p_document jsonb)
returns table(document jsonb, revision bigint)
language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  item_count bigint;
begin
  if auth.uid() is null or p_owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Account ownership could not be verified';
  end if;
  if p_kind is null or p_kind not in ('saved_places', 'saved_events') or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_document->'items') is distinct from 'object'
    or jsonb_typeof(p_document->'dayIds') is distinct from 'array'
    or octet_length(p_document::text) > 800000 then
    raise exception using errcode = '22023', message = 'Invalid bookmark document';
  end if;
  select count(*) into item_count from pg_catalog.jsonb_object_keys(p_document->'items');
  if item_count > 1000 or pg_catalog.jsonb_array_length(p_document->'dayIds') > 1000
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_document->'items') k where length(k) < 1 or length(k) > 180 or k in ('__proto__','constructor','prototype'))
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_document->'dayIds') d where jsonb_typeof(d) <> 'string' or not ((p_document->'items') ? (d #>> '{}')))
    or (select count(distinct d) from pg_catalog.jsonb_array_elements(p_document->'dayIds') d) <> pg_catalog.jsonb_array_length(p_document->'dayIds')
    or (p_kind = 'saved_events' and pg_catalog.jsonb_array_length(p_document->'dayIds') > 0) then
    raise exception using errcode = '22023', message = 'Invalid bookmark items';
  end if;
  -- Serialise initial creation as well as later updates. No cross-account key
  -- or revision supplied by a caller can overwrite a different owner's row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text || ':' || p_kind, 0));
  select c.revision into current_revision from public.account_collections c where c.owner_id = p_owner_id and c.kind = p_kind for update;
  if coalesce(current_revision, 0) <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Bookmarks changed; read the current revision and retry';
  end if;
  insert into public.account_collections as c (owner_id, kind, document, revision)
    values (p_owner_id, p_kind, p_document, 1)
    on conflict (owner_id, kind) do update set document = excluded.document, revision = c.revision + 1, updated_at = clock_timestamp();
  return query select c.document, c.revision from public.account_collections c where c.owner_id = p_owner_id and c.kind = p_kind;
end;
$$;
revoke all on function public.save_account_collection(uuid, text, bigint, jsonb) from public, anon;
grant execute on function public.save_account_collection(uuid, text, bigint, jsonb) to authenticated;
notify pgrst, 'reload schema';
