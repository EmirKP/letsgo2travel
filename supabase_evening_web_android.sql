-- LetsGo2Travel web + Android güvenlik/veri yaşam döngüsü güncellemesi
-- Supabase Dashboard > SQL Editor içinde bir kez çalıştırın.
-- İdempotenttir; tekrar çalıştırılması mevcut kullanıcı içeriğini silmez.

begin;

-- Eski yönetim ekranının üretebildiği sahte worker sağlayıcısı ve test
-- eşleşmeleri canlı kullanıcıya gösterilmesin. Gerçek sağlayıcısı olmayan
-- takipler tekrar güvenli aktivasyon kuyruğuna alınır.
delete from public.visa_appointment_matches
where provider_message = 'Yönetim panelinden oluşturulan test uygunluk kaydı.';

update public.visa_appointment_tracks
set provider_code = null,
    provider_name = null,
    status = 'pending_activation',
    next_check_at = now() + interval '5 minutes',
    last_result = 'Gerçek sağlayıcı aktivasyonu bekleniyor',
    locked_until = null,
    locked_by = null,
    error_count = 0
where provider_code = 'demo'
   or last_result like 'Test uygunluk tarihi:%';

delete from public.visa_appointment_providers where code = 'demo';

-- Özel seyahat kanıtları en fazla 30 gün tutulur. Uygulama, karar verildiğinde
-- belgeyi daha erken siler; günlük cron süresi dolmuş bekleyen belgeleri temizler.
alter table public.travel_verifications
  add column if not exists evidence_expires_at timestamptz,
  add column if not exists proof_deleted_at timestamptz;

alter table public.travel_verifications
  alter column evidence_expires_at set default (now() + interval '30 days');

update public.travel_verifications
set evidence_expires_at = created_at + interval '30 days'
where evidence_path is not null
  and evidence_expires_at is null;

create index if not exists travel_verifications_evidence_expiry_idx
  on public.travel_verifications (evidence_expires_at)
  where evidence_path is not null;

-- İşlenmiş hesap silme talebinin denetim kaydı kullanıcı hesabı silindikten sonra
-- da kalabilsin. Not alanı işlem sonunda kişisel veriden arındırılır.
alter table public.kvkk_requests
  add column if not exists processed_at timestamptz;

alter table public.kvkk_requests
  alter column user_id drop not null;

alter table public.kvkk_requests
  drop constraint if exists kvkk_requests_user_id_fkey;

alter table public.kvkk_requests
  add constraint kvkk_requests_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Hesap silinirken konu zincirindeki diğer kullanıcı cevaplarını korumak için
-- yazar bağlantıları nullable + ON DELETE SET NULL yapılır. Uygulama silme öncesi
-- talep sahibinin metinlerini ve görünen adını anonimleştirir.
alter table public.forum_topics alter column author_id drop not null;
alter table public.forum_topics drop constraint if exists forum_topics_author_id_fkey;
alter table public.forum_topics
  add constraint forum_topics_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

alter table public.forum_replies alter column user_id drop not null;
alter table public.forum_replies drop constraint if exists forum_replies_user_id_fkey;
alter table public.forum_replies
  add constraint forum_replies_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.country_questions alter column user_id drop not null;
alter table public.country_questions drop constraint if exists country_questions_user_id_fkey;
alter table public.country_questions
  add constraint country_questions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.country_answers alter column user_id drop not null;
alter table public.country_answers drop constraint if exists country_answers_user_id_fkey;
alter table public.country_answers
  add constraint country_answers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.country_experience_comments alter column user_id drop not null;
alter table public.country_experience_comments drop constraint if exists country_experience_comments_user_id_fkey;
alter table public.country_experience_comments
  add constraint country_experience_comments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.country_warnings alter column user_id drop not null;
alter table public.country_warnings drop constraint if exists country_warnings_user_id_fkey;
alter table public.country_warnings
  add constraint country_warnings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Kaynak/iç not kolonları tarayıcıdaki anon anahtarla okunamaz. Halka açık vize
-- sayfaları gerekli alanları yalnızca sunucu tarafındaki service_role üzerinden alır.
alter table public.visa_center_pages enable row level security;
drop policy if exists "Herkes aktif vize sayfalarını görebilir" on public.visa_center_pages;
drop policy if exists "visa center pages public select" on public.visa_center_pages;
revoke select on public.visa_center_pages from anon, authenticated;
grant all on public.visa_center_pages to service_role;

notify pgrst, 'reload schema';

commit;
