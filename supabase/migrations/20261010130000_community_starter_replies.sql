-- Apply before deploying clients/API that read forum_replies.seed_key.
-- Starter replies are editorial examples, never synthetic auth accounts.
begin;
alter table public.forum_replies add column if not exists seed_key text;
alter table public.forum_replies alter column user_id drop not null;
create unique index if not exists forum_replies_seed_key_unique
  on public.forum_replies(seed_key) where seed_key is not null;
alter table public.forum_replies drop constraint if exists forum_reply_starter_identity;
alter table public.forum_replies add constraint forum_reply_starter_identity
  check (seed_key is null or (user_id is null and seed_key ~ '^starter-reply-20261010-[0-9]{2}-[0-9]{2}$'));

create or replace function public.protect_forum_reply_seed_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if (TG_OP = 'INSERT' and new.seed_key is not null)
      or (TG_OP = 'UPDATE' and (new.seed_key is distinct from old.seed_key or old.seed_key is not null)) then
      raise exception 'Starter content is managed by the service' using errcode = '42501';
    end if;
    if new.user_id is null then
      raise exception 'Authorless content is managed by the service' using errcode = '42501';
    end if;
  end if;
  if new.seed_key is not null and not exists (
    select 1 from public.forum_topics t where t.id = new.topic_id
      and t.seed_key ~ '^starter-20260930-[0-9]{2}$' and t.author_id is null
  ) then
    raise exception 'Starter replies require a starter discussion' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_forum_reply_seed_key_trigger on public.forum_replies;
create trigger protect_forum_reply_seed_key_trigger before insert or update on public.forum_replies
for each row execute function public.protect_forum_reply_seed_key();
notify pgrst, 'reload schema';
commit;
