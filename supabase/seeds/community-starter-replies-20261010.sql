-- Editorial examples for the 15 existing starter discussions. Every persona
-- is fictional and visibly labelled even in older clients. No fake accounts,
-- votes, points, visits, badges or backdated activity are created.
-- Requires 20261010130000_community_starter_replies.sql and the topic seed.
-- Re-running preserves moderated/deleted-status rows and every genuine reply.
begin;
update public.forum_topics
  set author_name = author_name || ' · Örnek profil'
  where seed_key ~ '^starter-20260930-[0-9]{2}$' and author_id is null
    and author_name not like '% · Örnek profil';

insert into public.forum_replies (id, seed_key, topic_id, user_id, author_name, content, status)
select ('f09a2026-1010-4000-8000-' || lpad(v.topic_number::text, 10, '0') || lpad(v.reply_number::text, 2, '0'))::uuid,
  'starter-reply-20261010-' || lpad(v.topic_number::text, 2, '0') || '-' || lpad(v.reply_number::text, 2, '0'),
  t.id, null, v.persona || ' · Örnek profil', v.body, 'published'
from (values
  (1, 1, 'nil.rotanotlari', 'Ben bu planı tek yakayla sınırlandırırdım. Sabah tarihi yarımada, öğleden sonra kıyıda yürüyüş ve uzun bir yemek molası güzel bir denge olabilir. Listeye her yeri eklemek yerine iki ana durak seçmek daha rahat geliyor.'),
  (1, 2, 'baran.adimadim', 'Vapur fikrine yakınım! Ama geçişi de bir durak gibi düşünmek gerek. Program sıkışırsa bir müzeyi çıkartıp vapurda ve sahilde daha çok vakit bırakırdım. Sizce gün batımını hangi yakada planlayalım?'),
  (2, 1, 'dila.yolnotu', 'Önce görmek istediğin koyları haritada işaretleyip konaklamaya uzaklıklarını karşılaştırabilirsin. Merkez günlerini yürüyüşe, birbirine uzak koyları aynı araç gününe ayırmak mantıklı bir başlangıç olur.'),
  (2, 2, 'kaan.kucukrota', 'İki gün araç fikri bana daha esnek geliyor. Dolmuşla dönülecek günlerde son seferi ayrıca kontrol etmek önemli; sırf dönüş kaygısı yüzünden güzel bir molayı erken kesmek istemezdim.'),
  (3, 1, 'ada.patikalar', 'İki günde vadi yürüyüşü ile köy gezisini ayrı günlere koyardım. İlk güne kısa bir yürüyüş seçip hava ve enerjiye göre uzatmak güzel olabilir. Rahat ayakkabı, su ve güneşten korunma listenin başında olsun.'),
  (3, 2, 'eren.yolgunlugu', 'Benim örnek planım sabah yürüyüş, öğleden sonra çömlek atölyesi veya sakin bir kahve molası olurdu. Balon programı olmayınca sabahları daha esnek bırakmak da hoş. Fotoğraf mı, yürüyüş mü senin için daha öncelikli?'),
  (4, 1, 'sena.hafifcanta', 'Çantayı hazırlarken her parçaya aynı soruyu sorarım: Bunu başka bir şeyle de yapabilir miyim? Birbirine uyan kıyafetler seçmek ve yedekleri azaltmak iyi bir başlangıç. Küçük sıvı şişeleri de düzeni kolaylaştırır.'),
  (4, 2, 'alp.minikmola', 'Ben ikinci ayakkabıyı listede önce sorgulardım. Programda özel bir ihtiyaç yoksa çok yer kaplıyor. Yine de hava tahmini ve yürüyüş miktarı karar değiştirir; hafif çanta uğruna rahatlıktan vazgeçmezdim.'),
  (5, 1, 'derin.sehirsokak', 'Mahalle seçmeden önce her gün gitmek istediğin iki ana noktayı belirle. Sonra toplu taşımayla ve yürüyerek ulaşımı karşılaştır. Merkeze biraz uzakta ama aktarmasız bir yer, haritada yakın görünen bir yerden daha rahat olabilir.'),
  (5, 2, 'tolga.rotaciz', 'Akşam dönüşünü de plana katardım. Sadece otel fiyatı yerine ulaşım masrafı, dönüş süresi ve iptal koşulunu yan yana görmek işe yarar. Seçtiğin iki bölgeyi yazarsan artılarını birlikte karşılaştırabiliriz.'),
  (6, 1, 'ipek.pusulan', 'Beş gün için her güne bir ana bölge ve bir isteğe bağlı durak yazardım. Yağmur veya yorgunluk olursa ikinci durağı bırakabilmek rahatlatır. Yakın bir yere günübirlik gitmeyi sonradan eklemek de mümkün.'),
  (6, 2, 'cem.kahvemolasi', 'Ben ilk gezide tamamını şehre ayırmaya daha yakınım. Birbirinden uzak iki bölgeyi aynı güne yazınca ulaşım kısmı büyüyor. Alışveriş ve yemek için de plansız boşluk bırakmak isterdim.'),
  (7, 1, 'asli.yolcuk', 'Önce bu geziden en çok ne beklediğini seçerdim: tarihi sokaklar mı, doğaya yakın bir gün mü? Sonra iki seçeneğin Tiran ile bağlantısını ve varış saatini kıyaslamak karar vermeyi kolaylaştırır.'),
  (7, 2, 'omer.ufuknotu', 'Kısa gezide bir şehir daha eklemek yerine o şehirde en az bir sakin sabah bırakmak isterdim. Transfer günü ağır bir gezi listesi hazırlamazdım. Kaç gece ayırabiliyorsun?'),
  (8, 1, 'zeynep.sakinadim', 'Ben günü nehir çevresinde yürüyüş, uzun bir öğle molası ve hava uygunsa manzara yürüyüşü diye bölerdim. Kaleye çıkışı günün en sıcak saatine koymamak daha rahat bir taslak olabilir.'),
  (8, 2, 'bora.fotodefter', 'Fotoğraf için kesin saatten çok ışığı takip eden esnek bir plan hoşuma gidiyor. Aynı sokağı sabah ve akşam görmek bile farklı hissettirebilir. Birkaç noktayı tekrar ziyaret etmek de plana dahil olsun.'),
  (9, 1, 'esin.kesisenrota', 'Üç günlük taslakta transfer saatlerini önce yazardım. Sonra iki şehirde kalan gerçek gezi süresine bakmak lazım. İkisini de görmek mümkün görünse bile sürekli yetişme hissi varsa tek şehir daha keyifli olabilir.'),
  (9, 2, 'murat.yolpaylas', 'Bir gece Mostar seçeneğini ayrıca karşılaştırırdım; dönüş yolunu aynı güne sıkıştırmazsın. Ama bagaj ve otel değişimi de zaman alıyor. Hafif çantayla mı seyahat edeceksin?'),
  (10, 1, 'lale.muzemolasi', 'Üç güne üç büyük müze koymak yerine birini seçip çevresindeki mahalleye zaman bırakırdım. Müze gününe önceden ayırdığın bir yemek molası eklemek programı daha insani yapıyor.'),
  (10, 2, 'onur.sokakizi', 'Ben her güne bir iç mekân ve bir yürüyüş seçeneği yazardım. Hava bozarsa sırayı değiştirirsin. Aynı gün içinde şehrin iki ucuna gitmemek, durak sayısını artırmaktan daha faydalı olabilir.'),
  (11, 1, 'nazli.kapipasaj', 'Yağmurlu gün taslağını aynı bölgede tutardım: küçük bir müze, kapalı bir mola ve yakın bir kitapçı gibi. Giriş saati veya rezervasyon gerekiyorsa yola çıkmadan kontrol etmek iyi olur.'),
  (11, 2, 'ozan.notdefteri', 'Bence yağmur planının da boş zamanı olsun. Bütün günü kapalı mekânlar arasında koşturarak geçirmek yerine bir durakta daha uzun kalmak güzel olabilir. Çocukla gezi varsa molaları daha da sıklaştırırdım.'),
  (12, 1, 'selma.uzakyakin', 'Bir haftada iki konaklama noktası bana daha dengeli bir taslak gibi geliyor. İlk ve son günleri transfer açısından düşünerek kalan günleri gruplayabilirsin. Her gün bölge değiştirmek yorucu olabilir.'),
  (12, 2, 'arda.yumusakrota', 'Ben önce kesin yapmak istediğim etkinlikleri haritaya koyardım. Çoğu tek bölgede toplanıyorsa otel değiştirmeyebilirsin. Kararı sadece kilometreye göre değil, yol için ayırmak istediğin zamana göre verirdim.'),
  (13, 1, 'beliz.parkdefteri', 'Ücretsiz gezi planında da ulaşım ve yemek için pay bırakmak lazım. Aynı bölgedeki bir müze ile park yürüyüşünü eşleştirip ikinci müzeyi başka güne ayırmak isterdim.'),
  (13, 2, 'tuna.sehirritmi', 'Giriş ücretsiz olsa bile rezervasyon gerekip gerekmediğini ayrı kontrol ederdim. Bir de yağmur için yakın bir kapalı mola seçeneği hazırlamak iyi olabilir. Planın kuzeyde mi, merkezde mi başlıyor?'),
  (14, 1, 'eda.yokusasagi', 'Yokuşlu rotada sadece toplam kilometreye bakmazdım. Manzara noktasını enerjinin yüksek olduğu bölüme, nehir çevresindeki molayı sona koymak dengeli bir taslak olabilir.'),
  (14, 2, 'emre.kucukdurak', 'Ben rotayı tek yönlü çizmeye çalışırdım; aynı yokuşu iki kez çıkmak istemem. Haritada iki kısa alternatif bulundurmak da iyi: biri uzun yürüyüş, diğeri bol mola günü için.'),
  (15, 1, 'ayca.kiyinotlari', 'Arabasız plan için önce konaklamadan plaja ve dönüşe bakardım. Küçük koy güzel görünebilir ama ulaşım günün çoğunu alıyorsa tek bölgede kalmak daha rahat olabilir.'),
  (15, 2, 'kerem.sahiladimi', 'Sakin bir rota için her güne başka plaj yazmak yerine iki boş gün bırakırdım. Hava veya ulaşım planı değişirse esnek kalırsın. Kaç gün ayıracağını yazarsan birlikte daha sade bir taslak çıkarabiliriz.')
) as v(topic_number, reply_number, persona, body)
join public.forum_topics t on t.seed_key = 'starter-20260930-' || lpad(v.topic_number::text, 2, '0')
  and t.author_id is null and t.status = 'published' and t.is_paywalled = false and t.category = 'Ülke Bazlı Sorunlar'
on conflict (seed_key) where seed_key is not null do nothing;
commit;
