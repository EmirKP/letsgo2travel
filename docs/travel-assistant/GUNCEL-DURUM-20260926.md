Sonraki genişleme durumu: [EXPANSION-TEST-20260926.md](EXPANSION-TEST-20260926.md). Aşağıdaki metin ilk paketin tarihsel kaydıdır.

# Seyahat Asistanı — 26 Eylül 2026 güncellemesi

Geliştirme Codex ile devam ediyor. Çalışma kopyası `C:\Projects\letsgo2travel-claude-20260917`, dal `feature/travel-assistant-expansion-20260926`, başlangıç commit'i `b5fe1f45f8b18817b70f9ca7cea46b19e1bccb16`.

## Eklenenler

- 47 ülkede 175 kaynaklı acil numara kaydı. Her ülke kendi kaynağına bağlı; kapsam dışı ülkelere 112 veya 911 atanmıyor. Suudi Arabistan SIM koşulu, Kosova mobil arama notu ve Vietnam dil kısıtı korunuyor. Malezya itfaiye dahil 999 olarak güncel ulusal kaynağa bağlandı.
- 46 yabancı ülkede 50 Türk temsilciliği kartı. Cakarta'nın acil kanalı WhatsApp olarak gösteriliyor. Lahey ve Viyana için konsolosluk yetkisi notları var. Kartlarda tek numaralı arama, resmî kaynak ve adres üzerinden yol tarifi bulunuyor. Koordinat ve çalışma saati tahmini yapılmadı; bilinmeyen alanlar açıkça belirtiliyor.
- 15 AB ülkesine genel Tax Free çerçevesi ve Singapur'a su kartı eklendi. Toplam 22 ülkede 30 rehber kartı: 3 su, 20 Tax Free, 1 saat, 5 kanun, 1 kültür. Bu, bütün başlıkların 47 ülkede tamamlandığı anlamına gelmiyor; ayrıntılar `COVERAGE-20260926.md` içinde.
- Kaynaklarda yeniden kontrol zamanı ve süre dolumu görünür. Süresi dolmuş/geçersiz tarihli rehber açıklamaları saklanıyor, resmî kaynağa yönlendirme kalıyor. Tarih, açık kalan uygulamada ve uygulamaya dönüşte yeniden kontrol ediliyor.
- Harita yanıtları konum, kategori, tarih, bağlantı ve nokta sayısı açısından doğrulanıyor. Servis kesilirse yalnız aynı yaklaşık bölge ve aynı harita türünün son sonucu uyarıyla gösteriliyor. Altı saatten eski sonuç kullanılmıyor. Sonuç yalnız bellekte tek kayıt olarak tutuluyor; cihazda kalıcı konum geçmişi oluşturulmuyor. Harita görüntüleri ve yol tarifi internet gerektirebilir.
- Döviz yanıtı ve kayıtlı kur; para birimi çifti, geçerli takvim tarihi, pozitif sonlu oran ve önceki oranla tutarlı değişim açısından doğrulanıyor. Mevcut yedi günlük hesaplama sınırı korunuyor.
- Apple reddine neden olabilecek profil altındaki kullanıcıya görünen `iOS/Android` ifadesi kaldırıldı.

## Doğrulama

- Seyahat Asistanı otomatik testleri: 16/16. Kapsam, numara biçimi, kaynaklar, tarih sınırları, aynı/farklı bölge ve harita türü, zaman aşımı, yarışan istekler, bozuk kur/harita yanıtları, sağlayıcı eşzamanlılık ve hata bekleme süresi kontrol edildi.
- Genel `test:release` paketi geçti; uygulama, hesap silme, topluluk, gizlilik, destek ve mevcut yayın kontrolleri dahil.
- Kök ve mobil lint kontrolleri geçti. Next.js ve mobil TypeScript/Vite derlemeleri geçti.
- Mobil derleme, yalnız derleme kontrolü için gerçek olmayan açık Supabase değerleriyle yapıldı. Bu çıktı oturum açma testi veya dağıtılabilir imzalı uygulama değildir. Gerçek sırlar kullanılmadı.
- Yerel arayüz → yerel API → OSM/Frankfurter → arayüz akışı tarayıcıda denendi. Berlin araması 248 nokta ve sonuç sınırı uyarısı verdi; eczane filtresi 38 noktayı gösterdi. Kur ve önceki yayımlanan oran ekrana geldi.
- Yerel API kapatılarak harita kesintisi denendi: Berlin'in son sonucu eski veri uyarısıyla gösterildi, Paris seçilince Berlin sonucu kullanılmadı ve bağlantı hatası açıklandı.
- 390×844 telefon ve 820×1180 tablet görünümü incelendi; yatay taşma görülmedi. Almanya ve Malezya acil kartları, AB rehber kartı ve Cakarta WhatsApp ayrımı kontrol edildi. Türkçe/İngilizce temsilcilik metinleri doğrulandı. Normal akışta konsol hatası görülmedi; kontrollü servis kesintisi beklenen istek hatalarını oluşturdu.
- Kaynak ve derlenmiş uygulama taramasında kullanıcıya görünen `iOS/Android`, `Google Play` veya `Play Store` ifadesi bulunmadı. Teknik platform kodunu veya kod yorumlarını kaldırmak bu kontrolün amacı değildir.

## Yayına çıkmadan kalanlar

Bu değişiklikler yereldir. GitHub'a gönderim, ana dala birleştirme, Vercel dağıtımı, Codemagic imzalı paket üretimi veya App Store gönderimi yapılmadı. Önceden üretilmiş 1.4.0 (48), bu güncellemeleri içermez. Yeni imzalı paket, benzersiz yeni build numarası ve gerçek cihaz doğrulaması gerekir.

Fiziksel iPhone/iPad testleri henüz yapılmadı. SIM/telefon arama ekranı, WhatsApp geçişi, konum izni kabul/ret, paylaşım, uçak modu ve uygulama yeniden açılışı cihazda kontrol edilmeli. Acil hatlara deneme araması yapılmamalı; sadece arama ekranına geçiş doğrulanmalı.

Su, kanun, kültür ve çalışma saati başlıklarının 47 ülkeye eksiksiz genişletilmesi sürüyor. Ulusal Tax Free eşikleri ve tüm konsoloslukların eklenmesi de tamamlanmış değil. İkon/haber düzenlemeleri, çevrimdışı harita paketleri, canlı çeviri, GTFS ulaşım ve kameralı rehber bu pakette yapılmadı. Mevcut App Store görselleri korunuyor.

## Kaynak bakımı

Yeni kayıtların kaynakları 26 Eylül 2026 tarihinde incelendi; `SOURCE-AUDIT-20260926.md` kaynak dizinidir. Eski rehberlerin 16 Eylül kontrol tarihleri korunmuştur. Yeni kayıtlar için 25 Aralık yeniden kontrol hedefi, editoryal bakım zamanıdır; resmî geçerlilik garantisi değildir. Japonya Tax Free kartı 31 Ekim 2026 sonrası eski açıklamayı göstermeyecek.

Yeni sunucu bağımlılığı eklenmedi; ayrı test servisi için mevcut yedi dosyalı dışa aktarma listesi yeterlidir. Konum/fiyat sağlayıcı limitleri süreç başınadır; tüm dağıtımı kapsayan ortak bir kota sistemi olarak sunulmamalıdır.
