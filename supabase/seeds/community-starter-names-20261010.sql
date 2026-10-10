-- Display-name refinement for the 15 disclosed editorial discussions and their
-- 135 starter replies. No accounts, dates, counts or moderation states change.
-- Apply after the original topic/reply seeds (and optional date refinement).
-- Exact known IDs and seed keys, published state and null authorship limit scope.
begin;

create temporary table starter_name_map (
  old_name text primary key,
  new_name text unique not null,
  topic_number integer,
  reply_count integer
) on commit drop;
insert into starter_name_map (old_name, new_name, topic_number, reply_count) values
  ('yoldaki.deniz', 'deniz.yilmaz', 1, 7),
  ('seda.rota', 'seda_kaya', 2, 3),
  ('mert.yoldefteri', 'mertcelik', 3, 12),
  ('gezgin.ada', 'ada.eren', 4, 5),
  ('elif.izler', 'elif.koc', 5, 16),
  ('cem.pusula', 'cem_arslan', 6, 8),
  ('melis.biryerlerde', 'melis.acar', 7, 4),
  ('arda.kucukmolalar', 'ardatas', 8, 11),
  ('ece.kesifnotu', 'ece.ozkan', 9, 6),
  ('berk.yolarkadasi', 'berk_sahin', 10, 15),
  ('duru.rotam', 'duru.kurt', 11, 2),
  ('can.dunyayadogru', 'canertan', 12, 9),
  ('aylin.sehirarasi', 'aylin.sari', 13, 14),
  ('umut.gunbatimi', 'umut_akin', 14, 10),
  ('selin.yolcizgisi', 'selin.kaplan', 15, 13),
  ('ada.patikalar', 'ada.ozdemir', null, null),
  ('alp.minikmola', 'alpkilic', null, null),
  ('arda.yumusakrota', 'arda.sen', null, null),
  ('asli.yolcuk', 'asli_kara', null, null),
  ('ayca.kiyinotlari', 'ayca.soylu', null, null),
  ('baran.adimadim', 'baran.yildiz', null, null),
  ('beliz.parkdefteri', 'beliz_tek', null, null),
  ('bora.fotodefter', 'borademir', null, null),
  ('cem.kahvemolasi', 'cem.aydin', null, null),
  ('derin.sehirsokak', 'derin_alkan', null, null),
  ('dila.yolnotu', 'dila.aydin', null, null),
  ('eda.yokusasagi', 'edayalcin', null, null),
  ('emre.kucukdurak', 'emre.turan', null, null),
  ('eren.yolgunlugu', 'eren_oz', null, null),
  ('esin.kesisenrota', 'esin.ay', null, null),
  ('ipek.pusulan', 'ipektunc', null, null),
  ('kaan.kucukrota', 'kaan.erturk', null, null),
  ('kerem.sahiladimi', 'kerem_ucar', null, null),
  ('lale.muzemolasi', 'lale.gunes', null, null),
  ('murat.yolpaylas', 'murataksoy', null, null),
  ('nazli.kapipasaj', 'nazli.ozcan', null, null),
  ('nil.rotanotlari', 'nil_aktas', null, null),
  ('omer.ufuknotu', 'omer.yavuz', null, null),
  ('onur.sokakizi', 'onur_bulut', null, null),
  ('ozan.notdefteri', 'ozanergin', null, null),
  ('selma.uzakyakin', 'selma.dogan', null, null),
  ('sena.hafifcanta', 'sena_ozden', null, null),
  ('tolga.rotaciz', 'tolga.sezer', null, null),
  ('tuna.sehirritmi', 'tunacetin', null, null),
  ('zeynep.sakinadim', 'zeynep.sonmez', null, null);

-- Replace exact @handles only. Longer handles, ordinary prose and email-like
-- strings remain unchanged. The helper and mapping disappear after this script.
create function pg_temp.rename_starter_mentions(body text)
returns text language plpgsql as $$
declare
  item record;
  result text := body;
begin
  for item in select old_name, new_name from pg_temp.starter_name_map loop
    result := regexp_replace(result,
      '(?<![[:alnum:]_.@])@' || replace(item.old_name, '.', '[.]') || '(?![[:alnum:]_.])',
      '@' || item.new_name, 'g');
  end loop;
  return result;
end;
$$;

create temporary table starter_name_topics on commit drop as
select t.id, m.topic_number, m.reply_count, m.old_name, m.new_name
from public.forum_topics t
join pg_temp.starter_name_map m
  on t.id = ('f09a2026-0930-4000-8000-' || lpad(m.topic_number::text, 12, '0'))::uuid
  and t.seed_key = 'starter-20260930-' || lpad(m.topic_number::text, 2, '0')
where m.topic_number is not null
  and t.author_id is null and t.status = 'published' and t.is_paywalled = false
  and t.category = 'Ülke Bazlı Sorunlar'
  and t.author_name in (m.old_name, m.new_name);

update public.forum_topics t
set author_name = e.new_name,
    content = pg_temp.rename_starter_mentions(t.content)
from pg_temp.starter_name_topics e
where t.id = e.id
  and t.seed_key = 'starter-20260930-' || lpad(e.topic_number::text, 2, '0')
  and t.author_id is null and t.status = 'published' and t.is_paywalled = false
  and t.category = 'Ülke Bazlı Sorunlar' and t.author_name in (e.old_name, e.new_name)
  and (t.author_name is distinct from e.new_name
    or t.content is distinct from pg_temp.rename_starter_mentions(t.content));

update public.forum_replies r
set author_name = m.new_name,
    content = pg_temp.rename_starter_mentions(r.content)
from pg_temp.starter_name_topics e
cross join lateral generate_series(1, e.reply_count) as n(reply_number)
join pg_temp.starter_name_map m on m.topic_number is null
where r.topic_id = e.id
  and r.id = ('f09a2026-1010-4000-8000-' || lpad(e.topic_number::text, 10, '0') || lpad(n.reply_number::text, 2, '0'))::uuid
  and r.seed_key = 'starter-reply-20261010-' || lpad(e.topic_number::text, 2, '0') || '-' || lpad(n.reply_number::text, 2, '0')
  and r.user_id is null and r.status = 'published'
  and r.author_name in (m.old_name, m.new_name)
  and exists (select 1 from public.forum_topics t where t.id = e.id
    and t.seed_key = 'starter-20260930-' || lpad(e.topic_number::text, 2, '0')
    and t.author_id is null and t.status = 'published' and t.is_paywalled = false
    and t.category = 'Ülke Bazlı Sorunlar' and t.author_name in (e.old_name, e.new_name))
  and (r.author_name is distinct from m.new_name
    or r.content is distinct from pg_temp.rename_starter_mentions(r.content));

drop function pg_temp.rename_starter_mentions(text);
commit;
