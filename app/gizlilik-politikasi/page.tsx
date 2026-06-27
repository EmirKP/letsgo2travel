import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası | LetsGo2Travel",
  description: "LetsGo2Travel platformu Gizlilik Politikası",
};

export default function GizlilikPolitikasiPage() {
  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '24px', fontSize: '2.5rem' }}>Gizlilik Politikası</h1>
        
        <div className="l2t-card" style={{ padding: '32px', color: 'var(--l2t-soft)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '16px' }}><strong>Son güncelleme tarihi:</strong> Haziran 2026</p>
          
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel olarak kullanıcı gizliliğini önemseriz. Bu Gizlilik Politikası, platformu kullanırken hangi bilgilerin toplandığını, nasıl kullanıldığını, nasıl korunduğunu ve kullanıcıların hangi haklara sahip olduğunu açıklar.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>1. Toplanan Bilgiler</h2>
          <p style={{ marginBottom: '16px' }}>Platformda aşağıdaki bilgiler işlenebilir:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Üyelik bilgileri</li>
            <li>E-posta adresi</li>
            <li>Kullanıcı adı</li>
            <li>Profil bilgileri</li>
            <li>Yorumlar ve kullanıcı tarafından paylaşılan içerikler</li>
            <li>Doğrulanmış gezgin başvuru kayıtları</li>
            <li>KVKK talep kayıtları</li>
            <li>İşletme itiraz kayıtları</li>
            <li>Teknik işlem güvenliği kayıtları</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Doğrulama belgeleri kalıcı olarak saklanmaz. Belge yalnızca geçici olarak işlenir ve doğrulama kaydı oluşturulduktan sonra silinir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>2. Bilgilerin Kullanım Amaçları</h2>
          <p style={{ marginBottom: '16px' }}>Bilgiler şu amaçlarla kullanılır:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Platform üyeliğini yönetmek</li>
            <li>Kullanıcı deneyimini geliştirmek</li>
            <li>Doğrulanmış gezgin sistemini çalıştırmak</li>
            <li>Yorum ve içerik güvenliğini sağlamak</li>
            <li>Spam ve kötüye kullanımı önlemek</li>
            <li>İşletme itirazlarını değerlendirmek</li>
            <li>KVKK taleplerini yönetmek</li>
            <li>Hukuki yükümlülükleri yerine getirmek</li>
          </ul>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>3. Çerezler ve Analitik</h2>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel, site performansını ölçmek ve kullanıcı deneyimini geliştirmek için çerezler veya analitik araçlar kullanabilir.<br/><br/>
            Zorunlu olmayan çerezler için gerektiğinde ayrı rıza mekanizması uygulanır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>4. Üçüncü Taraf Hizmetler</h2>
          <p style={{ marginBottom: '24px' }}>
            Platform; hosting, veri tabanı, e-posta gönderimi, güvenlik, analitik veya seyahat affiliate hizmetleri için üçüncü taraf servislerden yararlanabilir.<br/><br/>
            Bu hizmet sağlayıcılar yalnızca gerekli bilgilerle ve ilgili amaç kapsamında işlem yapar.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>5. Veri Güvenliği</h2>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel; yetkisiz erişimi, veri kaybını ve kötüye kullanımı önlemek amacıyla teknik ve idari güvenlik önlemleri uygular.<br/><br/>
            Ancak internet üzerinden yapılan hiçbir veri iletiminin tamamen risksiz olduğu garanti edilemez.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>6. Kullanıcı Hakları</h2>
          <p style={{ marginBottom: '24px' }}>
            Kullanıcılar, kişisel verilerine ilişkin taleplerini doğrudan <a href="/veri-silme-ve-hak-talebi" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>/veri-silme-ve-hak-talebi</a> sayfasına iletebilir.
          </p>
        </div>
      </div>
    </main>
  );
}
