-- LetsGo2Travel Vize Randevu Asistanı — Aşama 2
-- Supabase > SQL Editor içinde tek sefer çalıştırın.
-- Mevcut tabloları silmez; bildirim ve kanıt alanlarını genişletir.

alter table public.visa_appointment_notifications
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists action_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

create index if not exists visa_appointment_notifications_user_unread_idx
  on public.visa_appointment_notifications(user_id, created_at desc)
  where read_at is null;

-- Worker ekran görüntüleri özel (public olmayan) bucket içinde tutulur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visa-appointment-evidence',
  'visa-appointment-evidence',
  false,
  2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
