# Fiyat Alarmı Kapanış Bilgilendirmesi — E-posta Şablonu ve Gönderim Planı

> Durum: **HAZIR — GÖNDERİLMEDİ.** Gerçek gönderim ayrı production onayı gerektirir.
> Karar (Emir, 31.08.2026): Abonelere yalnızca özelliğin kalıcı olarak kaldırıldığını
> bildiren tek seferlik hizmet bilgilendirme e-postası gönderilecek; gönderim
> tamamlandıktan sonra abonelik verileri kontrollü şekilde silinecek
> (`supabase/migrations/20260901110000_remove_flight_price_alert_data.sql`) ve
> hiçbir şekilde pazarlama amacıyla kullanılmayacak.

---

## 1. E-posta şablonu (TR)

**Konu:** LetsGo2Travel fiyat alarmı hizmeti sona erdi

**Gönderen:** LetsGo2Travel `<RESEND_FROM adresi — değer env'de>`

**Gövde (HTML'e dökülecek metin):**

> Merhaba,
>
> Bir süre önce LetsGo2Travel üzerinde uçuş fiyat alarmı oluşturmuştun. Sana
> bu hizmetle ilgili önemli bir değişikliği bildirmek istiyoruz.
>
> **LetsGo2Travel, uçuş fiyat arama, karşılaştırma ve fiyat alarmı hizmetini
> kalıcı olarak sonlandırdı.** Bu nedenle mevcut fiyat alarmın kapatıldı ve
> bundan sonra fiyat bildirimi almayacaksın. Alarm kaydınla ilişkili veriler
> (e-posta adresin dahil) kısa süre içinde sistemlerimizden kalıcı olarak
> silinecek ve başka hiçbir amaçla kullanılmayacak.
>
> LetsGo2Travel bundan sonra; etkinlik ve destinasyon keşfi, uçuş hariç
> seyahat bütçesi planlama, ülke ve havalimanı bilgileri ile Seyahat Kokpiti
> üzerinden yolculuk takibi sunan bir seyahat platformu olarak devam ediyor.
> Biletini dilediğin platformdan satın alıp uçuş bilgilerini Seyahat
> Kokpiti'ne ekleyebilirsin: https://www.letsgo2travel.com.tr/
>
> Bu e-posta tek seferlik bir hizmet bilgilendirmesidir; herhangi bir işlem
> yapmana gerek yoktur. Sorun için: `<NEXT_PUBLIC_SUPPORT_EMAIL değeri>`
>
> İyi yolculuklar,
> LetsGo2Travel ekibi

Şablon notları: pazarlama içeriği, kampanya, indirim veya yeni özellik tanıtımı
**eklenmez** (KVKK m.5/2-f meşru menfaat kapsamındaki hizmet bilgilendirmesi
sınırında kalmalıdır). Abonelikten çıkma linki gerekmez; hizmet zaten sonlanmıştır
ve bir daha e-posta gönderilmeyecektir — bu, metinde açıkça söylenir.

## 2. Alıcı kapsamı — GÖNDERİM ÖNCESİ AYRI ONAY GEREKTİRİR

Alıcı kapsamı bu planda VARSAYILMAZ; pasif/abonelikten çıkmış herkese otomatik
gönderim yapılacağı ön kabulü YOKTUR. Gönderim onayında (Onay B) Emir şu
kapsam kararını açıkça verir ve hukuki dayanak buna göre kayda geçirilir:

| Segment | Öneri | Hukuki değerlendirme |
|---|---|---|
| `status = active` alarm sahipleri | Bilgilendir | Aktif hizmet ilişkisi; hizmet bilgilendirmesi (KVKK m.5/2-f meşru menfaat) savunulabilir |
| Kapatılmış/abonelikten çıkmış (`unsubscribed`/pasif) alarm sahipleri | **Varsayılan: GÖNDERME** | Kişi iletişimi durdurmuştur; e-posta yerine verileri doğrudan silmek daha az müdahaleci seçenektir. Gönderilecekse gerekçesi ayrıca onaylanmalı |
| Yalnız log tablosunda kalan adresler | GÖNDERME | Aktif abonelik ilişkisi yok |

- Kapsam kararı + tekil alıcı SAYISI (adres değil) Onay B'de yazılı onaylanır.
- Gerekirse gönderim öncesi kısa bir hukuki görüş alınması Emir'in kararıdır.
- Liste yalnız gönderim anında, sunucu tarafında üretilir; hiçbir rapora,
  worktree'ye veya sohbete dökülmez.
- E-posta gönderilmeyen segmentlerin verisi de migration 4 ile silinir;
  bilgilendirme yalnız onaylanan segmente yapılır.

## 3. Gönderim planı (ayrı onaylı adımlar)

1. **Onay A (bu plan):** Metin ve kapsam onayı — Emir.
2. Read-only sayım (segment bazlı): aktif / pasif / unsubscribed ayrımıyla
   `count(distinct email)` (yalnız sayılar raporlanır, adres raporlanmaz).
3. Gönderim mekanizması: Resend üzerinden, mevcut `lib/mail.ts` `sendMail`
   altyapısıyla tek seferlik bir sunucu script'i (script gönderim onayından
   sonra yazılır; repoda kalıcı endpoint olarak TUTULMAZ, iş bitince silinir).
   Batch: 50 adres/dk (Resend limitlerine göre gönderim gününde doğrulanır).
   Kategori: `service_notice`; `mail_delivery_logs`'a loglanır.
4. **Onay B:** Alıcı kapsamı (hangi segmentler) + hukuki dayanak + tarih +
   alıcı sayısı ile gerçek gönderim onayı. Kapsam onaylanmadan hiçbir
   segmente gönderim yapılmaz.
5. Gönderim + hata raporu (yalnız sayılar: başarılı/başarısız).
6. 7 gün bekleme (geç bounce/şikayet penceresi).
7. **Onay C:** `20260901110000_remove_flight_price_alert_data.sql`
   production'a uygulanır (öncesinde şifreli managed backup + sayım).
8. KVKK hesap-silme rotasındaki artık no-op flight_price_alerts bloğu sonraki
   temizlik commit'inde kaldırılır.

## 4. Yapılmayacaklar

- Bu listeye başka hiçbir e-posta gönderilmez (pazarlama yasağı).
- Adresler hiçbir yeni tabloya/arşive kopyalanmaz.
- Gönderim öncesi tablo drop edilmez (sıra: önce bilgilendirme, sonra silme).
