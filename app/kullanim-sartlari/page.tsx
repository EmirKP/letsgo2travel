import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Şartları | LetsGo2Travel",
  description: "LetsGo2Travel platformu Kullanım Şartları",
};

export default function KullanimSartlariPage() {
  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '24px', fontSize: '2.5rem' }}>Kullanım Şartları</h1>
        
        <div className="l2t-card" style={{ padding: '32px', color: 'var(--l2t-soft)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '16px' }}><strong>Son güncelleme tarihi:</strong> Haziran 2026</p>
          
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel platformunu kullanan herkes bu Kullanım Şartları'nı kabul etmiş sayılır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>1. Platformun Amacı</h2>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel; uçak bileti arama, seyahat rehberi, vize/pasaport bilgilendirmesi, şehir rehberi, topluluk yorumları ve doğrulanmış gezgin deneyimleri sunmayı amaçlayan bir seyahat platformudur.<br/><br/>
            Platformda yer alan bazı bilgiler resmi kaynaklardan, bazı bilgiler kullanıcı deneyimlerinden oluşabilir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>2. Resmî Bilgi ve Kullanıcı Deneyimi Ayrımı</h2>
          <p style={{ marginBottom: '16px' }}>Platformdaki içerikler şu kategorilerle ayrılır:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Resmî Bilgi</li>
            <li>Doğrulanmış Gezgin Deneyimi</li>
            <li>Topluluk Yorumu</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Kullanıcı deneyimleri resmi bilgi niteliği taşımaz.<br/><br/>
            Vize, pasaport, ülkeye giriş şartları, güvenlik, sağlık ve hukuki konularda seyahat öncesinde ilgili ülkenin resmi kurumlarından, konsolosluklardan veya yetkili mercilerden güncel bilgi alınmalıdır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>3. Kullanıcı Sorumluluğu</h2>
          <p style={{ marginBottom: '16px' }}>
            Kullanıcı, LetsGo2Travel'da paylaştığı tüm yorum, bilgi, öneri, fiyat bilgisi, belge, görsel, seyahat deneyimi ve değerlendirmeden kendisinin sorumlu olduğunu kabul eder.<br/><br/>
            Kullanıcı:
          </p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Hakaret içeren içerik paylaşamaz</li>
            <li>İftira niteliğinde paylaşım yapamaz</li>
            <li>Kişilik haklarını ihlal edemez</li>
            <li>Ticari itibarı zedeleyici kesin suçlamalarda bulunamaz</li>
            <li>Başka kişilere ait kişisel verileri paylaşamaz</li>
            <li>Telif, marka veya üçüncü kişi haklarını ihlal edemez</li>
            <li>Yanlış veya yanıltıcı bilgi paylaşamaz</li>
            <li>Pasaport numarası, T.C. kimlik numarası, PNR, QR, barkod veya ödeme bilgisi gibi hassas verileri açık şekilde paylaşamaz</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>
            Kullanıcı, paylaştığı içerikten doğabilecek hukuki sorumluluğun kendisine ait olduğunu kabul eder.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>4. LetsGo2Travel'ın Sorumluluğu</h2>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel, kullanıcılar tarafından paylaşılan içeriklerin doğruluğunu, güncelliğini, eksiksizliğini veya hukuka uygunluğunu garanti etmez.<br/><br/>
            LetsGo2Travel, kullanıcı içeriklerini moderasyona alabilir, yayından kaldırabilir, görünürlüğünü azaltabilir, düzenleme talep edebilir veya hesabı kısıtlayabilir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>5. Yasaklı İçerikler</h2>
          <p style={{ marginBottom: '16px' }}>Aşağıdaki içerikler yasaktır:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>Hakaret</li>
            <li>İftira</li>
            <li>Tehdit</li>
            <li>Nefret söylemi</li>
            <li>Ayrımcılık</li>
            <li>Kişisel veri paylaşımı</li>
            <li>Telif veya marka hakkı ihlali</li>
            <li>Spam</li>
            <li>Sahte yorum</li>
            <li>Yanıltıcı bilgi</li>
            <li>İşletme veya kişi hakkında kesin suçlayıcı iddialar</li>
          </ul>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>6. Hesap Kısıtlama ve İçerik Kaldırma</h2>
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel, kuralları ihlal eden kullanıcıların içeriklerini kaldırabilir, hesaplarını geçici veya kalıcı olarak kısıtlayabilir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>7. Seyahat ve Vize Bilgilendirmesi</h2>
          <p style={{ marginBottom: '24px' }}>
            Platformdaki vize, pasaport, seyahat, güvenlik ve fiyat bilgileri bilgilendirme amaçlıdır. Kullanıcı, seyahat öncesinde resmi kurumlardan güncel bilgi almakla sorumludur.
          </p>
        </div>
      </div>
    </main>
  );
}
