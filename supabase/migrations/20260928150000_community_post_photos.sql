-- Optional, private photos on canonical forum topics. Text-only topics need no row.
begin;

create table if not exists public.forum_topic_photos (
  topic_id uuid primary key references public.forum_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check (storage_path = user_id::text || '/' || topic_id::text || '.jpg')
);
create index if not exists forum_topic_photos_owner on public.forum_topic_photos(user_id);
alter table public.forum_topic_photos enable row level security;
revoke all on public.forum_topic_photos from anon, authenticated;
grant all on public.forum_topic_photos to service_role;

create or replace function public.validate_forum_topic_photo()
returns trigger language plpgsql set search_path = '' as $$
declare v_author uuid; v_status text;
begin
  select author_id, status into v_author, v_status from public.forum_topics where id = new.topic_id for share;
  if v_author is distinct from new.user_id or v_status is distinct from 'pending' then
    raise exception 'Photo requires its owner''s pending topic' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists forum_topic_photo_owner on public.forum_topic_photos;
create trigger forum_topic_photo_owner before insert or update on public.forum_topic_photos
for each row execute function public.validate_forum_topic_photo();

-- Only service routes read/write objects. They verify canonical publication and
-- viewer blocks on every read, so hiding/deleting content revokes future access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-post-photos', 'community-post-photos', false, 300000, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 300000, allowed_mime_types = array['image/jpeg'];

-- Override any broader existing storage policy for normal API clients.
drop policy if exists "Community photos require service routes" on storage.objects;
create policy "Community photos require service routes" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'community-post-photos')
with check (bucket_id <> 'community-post-photos');

notify pgrst, 'reload schema';
commit;
