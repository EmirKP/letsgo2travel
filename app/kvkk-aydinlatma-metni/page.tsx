import { Metadata } from "next";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description: "LetsGo2Travel platformu KVKK Aydınlatma Metni",
};

const controllerName = process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME || "[YAYINDAN ÖNCE GERÇEK KİŞİ/TİCARİ UNVAN EKLENECEK]";
const controllerAddress = process.env.NEXT_PUBLIC_DATA_CONTROLLER_ADDRESS || "[YAYINDAN ÖNCE TEBLİGAT ADRESİ EKLENECEK]";
const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "[YAYINDAN ÖNCE KVKK İLETİŞİM E-POSTASI EKLENECEK]";

export default function KVKKAydinlatmaPage() {
  return (
    <div className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '24px', fontSize: '2.5rem' }}>KVKK Aydınlatma Metni</h1>
        
        <div className="l2t-card" style={{ padding: '32px', color: 'var(--l2t-soft)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '16px' }}><strong>Son güncelleme tarihi:</strong> Ağustos 2026</p>
          
          <p style={{ marginBottom: '24px' }}>
            Bu Aydınlatma Metni, LetsGo2Travel platformu üzerinden sunulan üyelik, seyahat rehberi, doğrulanmış gezgin başvurusu, topluluk yorumu, işletme itirazı ve veri talep süreçleri kapsamında işlenen kişisel verilere ilişkin olarak hazırlanmıştır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>1. Veri Sorumlusu</h2>
          <p style={{ marginBottom: '24px' }}>
            İşbu Aydınlatma Metni, LetsGo2Travel hizmetini işleten veri sorumlusu tarafından kişisel verilerinizin işlenmesine ilişkin aydınlatma yükümlülüğünün yerine getirilmesi amacıyla hazırlanmıştır.<br/><br/>
            <strong>Veri Sorumlusu Kimliği</strong><br/>
            Veri Sorumlusu: {controllerName}<br/>
            Tebligat Adresi: {controllerAddress}<br/>
            KVKK İletişim E-postası: {privacyEmail}<br/>
            Elektronik Talep Kanalı: <a href="/veri-silme-ve-hak-talebi" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>Veri Silme ve Hak Talebi formu</a>
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>2. İşlenen Kişisel Veriler</h2>
          <p style={{ marginBottom: '16px' }}>LetsGo2Travel tarafından aşağıdaki kişisel veriler işlenebilir:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Ad, soyad veya kullanıcı adı</li>
            <li>E-posta adresi</li>
            <li>Üyelik bilgileri</li>
            <li>Profil bilgileri</li>
            <li>Kullanıcı yorumları</li>
            <li>Seyahat deneyimi içerikleri</li>
            <li>Doğrulanmış gezgin başvurusu kapsamında seçilen ülke/şehir bilgisi</li>
            <li>Belge türü bilgisi</li>
            <li>Doğrulama sonucu</li>
            <li>Başvuru tarihi</li>
            <li>IP adresi ve işlem güvenliği kayıtları</li>
            <li>KVKK talep formu içeriği</li>
            <li>İşletme itiraz formu içeriği</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Doğrulama amacıyla yüklenen belgeler yalnızca özel erişimli alanda ve inceleme için geçici olarak tutulur. Ham belge onay veya red kararı verilirken önce silinir; karar verilmemiş olsa dahi yüklemeden itibaren en geç 30 gün sonunda otomatik olarak silinir ve başvuru kapatılır. Sistemde yalnızca doğrulama sonucu, belge türü, ülke/şehir bilgisi, başvuru durumu ve silme zamanı gibi minimum kayıtlar tutulur.<br/><br/>
            Kullanıcılardan pasaport numarası, T.C. kimlik numarası, PNR kodu, QR kod, barkod, ödeme bilgisi, açık adres veya gereksiz hassas veri paylaşmamaları istenir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>3. Kişisel Verilerin İşlenme Amaçları</h2>
          <p style={{ marginBottom: '16px' }}>Kişisel verileriniz aşağıdaki amaçlarla işlenebilir:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Üyelik hesabı oluşturmak ve yönetmek</li>
            <li>Kullanıcı giriş işlemlerini sağlamak</li>
            <li>Doğrulanmış gezgin başvurularını almak</li>
            <li>Kullanıcının belirli ülke veya şehir hakkında gerçekten deneyim sahibi olup olmadığını değerlendirmek</li>
            <li>Topluluk yorumlarını göstermek ve yönetmek</li>
            <li>Yorum ve içerik moderasyonu yapmak</li>
            <li>Hukuka aykırı, hakaret, iftira, kişilik hakkı ihlali veya ticari itibarı zedeleyici içerikleri incelemek</li>
            <li>İşletme itiraz taleplerini değerlendirmek</li>
            <li>KVKK kapsamındaki veri silme, düzeltme, rıza geri çekme ve hesap kapatma taleplerini yönetmek</li>
            <li>Sistem güvenliğini sağlamak</li>
            <li>Kötüye kullanım, spam ve yetkisiz erişimi önlemek</li>
            <li>Yasal yükümlülükleri yerine getirmek</li>
          </ul>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>4. Kişisel Verilerin İşlenme Hukuki Sebepleri</h2>
          <p style={{ marginBottom: '16px' }}>Kişisel verileriniz, işleme faaliyetine göre aşağıdaki hukuki sebeplere dayanarak işlenebilir:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması</li>
            <li>Veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi</li>
            <li>Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması</li>
            <li>İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati</li>
            <li>Açık rıza gerektiren hallerde açık rızanız</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Doğrulanmış gezgin başvurusu kapsamında belge yükleme işlemi, kullanıcı tarafından isteğe bağlı olarak yapılır ve açık rıza gerektiren alanlarda ayrı açık rıza alınır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>5. Kişisel Verilerin Aktarılması</h2>
          <p style={{ marginBottom: '16px' }}>Kişisel verileriniz aşağıdaki kişi veya kurumlarla, yalnızca gerekli olduğu ölçüde paylaşılabilir:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Hosting ve altyapı hizmet sağlayıcıları</li>
            <li>E-posta gönderim servisleri</li>
            <li>Veri tabanı ve güvenlik hizmet sağlayıcıları</li>
            <li>Hukuki danışmanlar</li>
            <li>Yetkili kamu kurum ve kuruluşları</li>
            <li>Kanunen yetkili merciler</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel, kullanıcıların doğrulama için yüklediği ham belgeleri herkese açık hâle getirmez ve kalıcı olarak üçüncü kişilerle paylaşmaz. Belge yalnızca yetkili inceleme akışında geçici olarak işlenir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>6. Kişisel Verilerin Saklama Süresi</h2>
          <p style={{ marginBottom: '24px' }}>
            Kişisel verileriniz, işleme amacının gerektirdiği süre boyunca saklanır.<br/><br/>
            Doğrulama için yüklenen ham belgeler onay/red işleminde önce silinir; karar verilmemiş belgeler yüklemeden itibaren en geç 30 gün içinde otomatik olarak silinir.<br/><br/>
            Doğrulama kayıtları, kullanıcı hesabı aktif olduğu sürece veya ilgili hukuki saklama süresi boyunca tutulabilir.<br/><br/>
            KVKK talep kayıtları, başvuru süreçlerinin yönetimi ve hukuki yükümlülükler kapsamında makul sürelerle saklanabilir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>7. İlgili Kişinin Hakları</h2>
          <p style={{ marginBottom: '16px' }}>Kişisel verisi işlenen kullanıcılar, KVKK kapsamındaki haklarını kullanarak:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Kişisel verilerinin işlenip işlenmediğini öğrenebilir</li>
            <li>İşlenmişse buna ilişkin bilgi talep edebilir</li>
            <li>İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenebilir</li>
            <li>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri öğrenebilir</li>
            <li>Eksik veya yanlış işlenmişse düzeltilmesini isteyebilir</li>
            <li>Silinmesini veya yok edilmesini isteyebilir</li>
            <li>İşlemenin yalnızca otomatik sistemlerle analiz edilmesi suretiyle aleyhine sonuç doğmasına itiraz edebilir</li>
            <li>Zarara uğraması halinde zararın giderilmesini talep edebilir</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Başvurular <a href="/veri-silme-ve-hak-talebi" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>/veri-silme-ve-hak-talebi</a> sayfasındaki form üzerinden yapılabilir.
          </p>
        </div>
      </div>
    </div>
  );
}
