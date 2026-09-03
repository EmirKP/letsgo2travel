-- Ulke toplulugu akisinin kullandigi tablolar daha once yalnizca elle
-- calistirilan supabase_belgeli_gezgin.sql dosyasinda bulunuyordu. Bu nedenle
-- yeni/temiz bagli projelerde API country_questions tablosunu bulamayip 500
-- donuyordu. Bu migration mevcut veriyi silmeden eksik yapilari tamamlar.

begin;

create extension if not exists pgcrypto;

create table if not exists public.country_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  country_code text not null,
  title text not null,
  body text not null,
  category text not null default 'general',
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.country_questions
  add column if not exists user_id uuid,
  add column if not exists country_code text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists category text default 'general',
  add column if not exists status text default 'visible',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.country_questions alter column user_id drop not null;
alter table public.country_questions alter column category set default 'general';
alter table public.country_questions alter column status set default 'visible';
alter table public.country_questions alter column created_at set default now();
alter table public.country_questions alter column updated_at set default now();

alter table public.country_questions drop constraint if exists country_questions_user_id_fkey;
alter table public.country_questions
  add constraint country_questions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create table if not exists public.country_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.country_questions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  country_code text not null,
  body text not null,
  status text not null default 'visible',
  helpful_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.country_answers
  add column if not exists question_id uuid,
  add column if not exists user_id uuid,
  add column if not exists country_code text,
  add column if not exists body text,
  add column if not exists status text default 'visible',
  add column if not exists helpful_count integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.country_answers alter column user_id drop not null;
alter table public.country_answers alter column status set default 'visible';
alter table public.country_answers alter column helpful_count set default 0;
alter table public.country_answers alter column created_at set default now();
alter table public.country_answers alter column updated_at set default now();

alter table public.country_answers drop constraint if exists country_answers_user_id_fkey;
alter table public.country_answers
  add constraint country_answers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.country_answers drop constraint if exists country_answers_question_id_fkey;
alter table public.country_answers
  add constraint country_answers_question_id_fkey
  foreign key (question_id) references public.country_questions(id) on delete cascade;

-- Cevap yetkisi ve puan kaydi da ayni forum akisinin parcasidir. Bu iki tablo
-- yoksa soru okunabilse bile cevap verme ve dogrulama akisi calismaz.
create table if not exists public.country_experience_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  can_answer boolean not null default false,
  can_comment boolean not null default false,
  can_create_warning boolean not null default false,
  source_verification_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, country_code)
);

alter table public.country_experience_permissions
  add column if not exists user_id uuid,
  add column if not exists country_code text,
  add column if not exists can_answer boolean default false,
  add column if not exists can_comment boolean default false,
  add column if not exists can_create_warning boolean default false,
  add column if not exists source_verification_id uuid,
  add column if not exists created_at timestamptz default now();

create unique index if not exists country_experience_permissions_user_country_idx
  on public.country_experience_permissions (user_id, country_code);

create table if not exists public.user_points_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  points integer not null default 0,
  country_code text,
  related_id uuid,
  created_at timestamptz not null default now()
);

alter table public.user_points_log
  add column if not exists user_id uuid,
  add column if not exists action_type text,
  add column if not exists points integer default 0,
  add column if not exists country_code text,
  add column if not exists related_id uuid,
  add column if not exists created_at timestamptz default now();

create index if not exists country_questions_visible_created_idx
  on public.country_questions (created_at desc)
  where status = 'visible';

create index if not exists country_answers_visible_question_idx
  on public.country_answers (question_id, created_at)
  where status = 'visible';

alter table public.country_questions enable row level security;
alter table public.country_answers enable row level security;
alter table public.country_experience_permissions enable row level security;
alter table public.user_points_log enable row level security;

-- Uygulama bu tablolara kimligi sunucuda dogruladiktan sonra service_role ile
-- erisir. Anon anahtarla dogrudan tablo erisimi verilmez; API yalniz guvenli
-- beyaz-listeli alanlari yayinlar.
drop policy if exists "Everyone can view visible questions" on public.country_questions;
drop policy if exists "Everyone can view visible answers" on public.country_answers;
revoke all on public.country_questions from anon, authenticated;
revoke all on public.country_answers from anon, authenticated;
revoke all on public.country_experience_permissions from anon, authenticated;
revoke all on public.user_points_log from anon, authenticated;
grant all on public.country_questions to service_role;
grant all on public.country_answers to service_role;
grant all on public.country_experience_permissions to service_role;
grant all on public.user_points_log to service_role;

notify pgrst, 'reload schema';

commit;
