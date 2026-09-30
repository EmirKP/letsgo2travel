begin;
-- No synthetic auth accounts or credentials. Starter personas are display
-- names attached to clearly identifiable, separately removable seed rows.
alter table public.forum_topics add column if not exists seed_key text;
alter table public.forum_topics alter column author_id drop not null;
create unique index if not exists forum_topics_seed_key_unique on public.forum_topics(seed_key) where seed_key is not null;
alter table public.forum_topics drop constraint if exists forum_topic_author_or_seed;
-- Account deletion legitimately clears author_id on ordinary topics as well
-- as replies to starter topics. A CHECK cannot distinguish that trusted
-- cleanup from client writes (NOT VALID still checks future updates).
-- Enforce authorship at the privilege-aware trigger boundary instead.
create or replace function public.protect_forum_seed_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if (TG_OP = 'INSERT' and new.seed_key is not null)
      or (TG_OP = 'UPDATE' and (new.seed_key is distinct from old.seed_key or old.seed_key is not null)) then
      raise exception 'Starter content is managed by the service' using errcode = '42501';
    end if;
    if new.author_id is null then
      raise exception 'Authorless content is managed by the service' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_forum_seed_key_trigger on public.forum_topics;
create trigger protect_forum_seed_key_trigger before insert or update on public.forum_topics
for each row execute function public.protect_forum_seed_key();
notify pgrst, 'reload schema';
commit;
