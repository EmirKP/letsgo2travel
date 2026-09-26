# Gerçek cihaz kontrol listesi

Bu liste henüz tamamlanmadı. Tarayıcı ve otomatik test başarısı, aşağıdaki cihaz testlerinin yerine geçmez.

- [ ] Xcode 16+ SDK ile iOS kaynakları derlenir; iOS 18+ fiziksel iPhone ve iPad üzerinde açılır. Daha eski desteklenen iOS sürümünde uygulama açılır, çeviri desteklenmiyor mesajı çıkar.
- [ ] Gerçek açık yapılandırma ve yeni benzersiz build numarasıyla TestFlight paketi üretilir. Uygulama/uzantı sürümleri eşleşir. Eski 48 paketiyle karıştırılmaz.
- [ ] Profil, destek, tanıtım ve yeni araçlarda kullanıcıya görünen Android/Google Play yönlendirmesi yoktur. Apple'ın 2.3.10 bulgusu yeni binary üzerinde tekrar kontrol edilir.
- [ ] Dil desteği Türkçe–İngilizce ve İngilizce–Almanca çiftleri için cihazdan kontrol edilir; desteklenmeyen çift çalışıyormuş gibi sunulmaz.
- [ ] Paket indirme yalnız düğmeye basınca başlar. Wi-Fi yok, izin reddi, indirme iptali, ekran değişimi ve tekrarlı basma kontrollü sonuçlanır.
- [ ] İndirme tamamlandıktan sonra uçak modunda yeni metin çevrilir. Uygulamayı tamamen kapatıp açınca paket durumu doğrudur. Model silindikten sonra çeviri yerine paket hazırlama istenir.
- [ ] Kamera/fotoğraf seçici açılır; izin reddi/iptal ve büyük/uygunsuz dosya anlaşılır mesaj verir. Önizleme yatay/dikey fotoğrafta doğru yönlenir.
- [ ] Fotoğraf analizi etkin test sunucusunda giriş yapmadan, onay kutusu olmadan ve kota bitince sağlayıcı çağrısı yapmaz. Başka hesaba geçişte eski fotoğraf/yanıt ekranda kalmaz.
- [ ] Gerçek test fotoğrafı için canlı Gemini yanıtı ve belirsizlik mesajı kontrol edilir; kişisel belge kullanılmaz. Metaveriler ve sunucu günlükleri fotoğraf/konum/sır içermez.
- [ ] Londra Waterloo–Euston ve aktarmalı ikinci bir rota sorgulanır. Aynı durak, bulunamayan ad, servis kesintisi, 5 dakika bekleme ve saat dilimi farkı kontrol edilir.
- [ ] Küçük harita bölgesi indirilir; uçak modunda ve uygulama yeniden açılınca sokaklar/noktalar görünür. Paket silme, üç paket sınırı ve dolu depolamada eski paket koruması test edilir.
- [ ] Yaklaşık konum izni kabul/ret senaryoları, cihaz ayarlarına dönüş ve konum kapalıyken şehir merkezinden arama çalışır.
- [ ] Acil hat arama, WhatsApp temsilcilik geçişi, dış bağlantılar ve paylaşım gerçek cihazda doğru uygulamayı açar; testte gerçek acil servise çağrı bağlanmaz.
- [ ] Haberlerde hava/afet filtresi, başlık/kaynak araması, ülke ve dil değiştirme kontrol edilir.
- [ ] iPad dikey/yatay, küçük iPhone, büyük yazı ayarı ve VoiceOver temel akışı kontrol edilir. Görsel haritadaki noktaların metin listesi erişilebilirdir.

Her madde için cihaz/OS, build, tarih ve sonucu kaydet. Başarısız maddeler giderildikten sonra aynı build yeniden doğrulanır; Apple gönderimi en son yapılır.
