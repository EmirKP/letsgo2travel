# Apple bağlantısını hesap silme sırasında iptal etme

Kod hazırdır; bu belge sunucu kurulumu ve yayın öncesi gerçek cihaz kontrolünü açıklar. Yerel testlerde sahte sağlayıcı yanıtları kullanılır. Testler gerçek bir Apple veya Supabase hesabını silmez.

## Mevcut ve yeni Apple hesapları

Supabase oturumunun erişim/yenileme tokenları Apple sağlayıcı tokenları değildir. Bunlar Apple'ın iptal API'sine gönderilmez. Daha önce açılmış Apple hesaplarında da kullanıcı uygulamadaki hesap silme bölümünden Apple ile bir kez doğrulama yapabilir. Bu işlem başka bir Supabase hesabına geçiş yapmaz.

Sunucu, kullanıcının doğrulanmış Supabase oturumuna bağlı on dakikalık, tek kullanımlık `state` ve rastgele `nonce` üretir. Apple'ın yetkilendirme kodu sunucuda değiştirilir; ID token imzası, issuer, audience, tarih, nonce ve Apple kullanıcı kimliği doğrulanır. Apple kimliği mevcut hesabın Apple kimliğiyle aynı olmalıdır.

Apple yenileme tokenı yalnız sunucuda, AES-256-GCM ile kullanıcı/istemci/Apple kimliğine bağlanarak şifrelenir. İstemciye, URL'ye, kullanıcı metadata'sına veya loglara yazılmaz. Hesap silme yönetici tarafından yürütülürken önce Apple'dan **HTTP 200** iptal yanıtı alınır; ardından yerel veriler ve Supabase hesabı silinir. Başka yanıt, eksik kimlik doğrulama veya eksik kurulum hesap silme işlemini durdurur. Silme talebi bu sırada korunur.

Token iptalinden sonra şifreli token temizlenir. Sonuç kaydı hesapla birlikte silinir. Kullanıcı Apple bağlantısını yeniden kurarsa eski iptal kaydı/token yeterli sayılmaz; tekrar doğrulama gerekir.

## Gerekli kurulum

1. Veritabanına hesap silme yaşam döngüsü ve `20260910233000_apple_account_deletion.sql` değişikliklerini sırayla uygulayın. Apple tabloları ve RPC'ler yalnız `service_role` tarafından kullanılabilir.
2. Supabase Apple sağlayıcısının web OAuth girişinde kullanılan **aynı Services ID**'yi kullanın. Farklı/gruplanmamış bir Services ID, aynı kişinin farklı Apple kullanıcı kimliğine sahip olmasına yol açabilir; uygulama bu eşleşmezliği reddeder.
3. Apple Developer → ilgili Services ID → Sign in with Apple web ayarlarına uygulamanın HTTPS alan adını ve tam dönüş adresini ekleyin: `https://www.letsgo2travel.com.tr/api/account/apple-deletion/callback`. Supabase'in mevcut dönüş adresini kaldırmayın.
4. Aşağıdaki değerleri yalnız sunucunun gizli ortam değişkenlerine ekleyin. İsimlerin hiçbiri `NEXT_PUBLIC_` değildir. `.p8`, token veya gerçek değerleri Git'e eklemeyin.

| Değişken | Değer |
|---|---|
| `APPLE_SIGN_IN_CLIENT_ID` | Supabase web Apple girişindeki Services ID |
| `APPLE_SIGN_IN_TEAM_ID` | Apple Developer Team ID |
| `APPLE_SIGN_IN_KEY_ID` | Sign in with Apple yetkisi olan `.p8` anahtarın ID'si |
| `APPLE_SIGN_IN_PRIVATE_KEY` | Bu anahtarın PEM içeriği; satır sonları veya `\n` desteklenir |
| `APPLE_DELETION_REDIRECT_URI` | Apple'a kayıtlı tam HTTPS callback adresi |
| `APPLE_DELETION_ENCRYPTION_KEY` | Kriptografik olarak rastgele 32 bayt, 64 karakter hexadecimal |

APNs bildirim anahtarı otomatik olarak Apple giriş anahtarı sayılmaz. Şifreleme anahtarını değiştirmek mevcut bekleyen şifreli kayıtların okunmasını engeller; kayıtlara yönelik kontrollü anahtar geçişi tamamlanmadan değiştirmeyin. Kurulum eksikken kullanıcıya değişken adları gösterilmez; talebi alınır ve tamamlanma durumunu takip edebilir.

## Yayın öncesi kabul kontrolü

- Ayrı bir test Apple hesabıyla önceden oluşturulmuş Supabase hesabına giriş yapın; profil → hesap silme → Apple doğrulama akışını açın.
- İptal ederek geri dönün: hesap ve veriler korunmalı, yeniden deneme mümkün olmalı.
- Farklı bir Apple hesabıyla doğrulayın: kayıt mevcut hesaba bağlanmamalı.
- Doğru hesapla doğrulayın: uygulamaya dönüp durumu yenileyin; Apple doğrulaması hazır görünmeli. Bu adım tek başına hesabı silmemeli.
- Yalnız silinmesi açıkça onaylanmış test hesabını yönetici üzerinden işleyin: Apple iptali, hesap silinmesi, silme talebinin sonuçlanması ve tamamlanma e-postası doğrulanmalı.
- Sonraki Apple girişinin yeni hesap oluşturma akışı olduğunu ve eski özel verilerin geri gelmediğini doğrulayın.
- İptal sağlayıcısı veya veritabanı erişilemiyorsa uygulama başarı bildirmemeli; işlemi yeniden denemek mümkün olmalı.

Otomatik test: `node scripts/test-apple-account-deletion.mjs`. Gerçek anahtar gerektirmeden geçici RSA/EC anahtarlarıyla imza doğrulaması, hesap/nonce eşleşmesi, şifreli verinin kullanıcılar arasında taşınmasının reddi, yeniden deneme ve eski iptal kaydının kullanılmaması sınanır. İzole PGlite veritabanında aynı migration ile oturum/süre/tekrar kullanma, servis erişimi ve eşzamanlı silme kilitleri doğrulanır.

## Resmî kaynaklar

- [Apple: Token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
- [Apple: Token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
- [Apple: Account deletion and token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Supabase: Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
