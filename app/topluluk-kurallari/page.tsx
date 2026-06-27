import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Topluluk Kuralları | LetsGo2Travel",
  description: "LetsGo2Travel platformu Topluluk Kuralları",
};

export default function ToplulukKurallariPage() {
  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '24px', fontSize: '2.5rem' }}>Topluluk Kuralları</h1>
        
        <div className="l2t-card" style={{ padding: '32px', color: 'var(--l2t-soft)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '16px' }}><strong>Son güncelleme tarihi:</strong> Haziran 2026</p>
          
          <p style={{ marginBottom: '24px' }}>
            LetsGo2Travel topluluğu, seyahat eden insanların birbirine güvenilir, saygılı ve faydalı bilgiler sunması için kurulmuştur.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>1. Saygılı Dil Kullan</h2>
          <p style={{ marginBottom: '24px' }}>
            Hakaret, küfür, aşağılama, tehdit ve nefret söylemi yasaktır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>2. Kişisel Deneyimini Anlat</h2>
          <p style={{ marginBottom: '16px' }}>
            İşletmeler, kişiler veya kurumlar hakkında kesin suçlayıcı ifadeler kullanma.
          </p>
          <div style={{ padding: '16px', background: 'rgba(255, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 68, 68, 0.2)', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#ff4444' }}><strong>Yanlış ifade:</strong> "Bu döviz bürosu dolandırıcı."</p>
          </div>
          <div style={{ padding: '16px', background: 'rgba(0, 200, 83, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 200, 83, 0.2)', marginBottom: '24px' }}>
            <p style={{ margin: 0, color: '#00c853' }}><strong>Doğru ifade:</strong> "Benim deneyimimde beklediğimden daha düşük kur verildi. İşlem yapmadan önce güncel kuru sormanızı öneririm."</p>
          </div>
          <div style={{ padding: '16px', background: 'rgba(255, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 68, 68, 0.2)', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#ff4444' }}><strong>Yanlış ifade:</strong> "Bu restoran turistleri kazıklıyor."</p>
          </div>
          <div style={{ padding: '16px', background: 'rgba(0, 200, 83, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 200, 83, 0.2)', marginBottom: '24px' }}>
            <p style={{ margin: 0, color: '#00c853' }}><strong>Doğru ifade:</strong> "Benim deneyimimde fiyatlar beklentimin üzerindeydi. Sipariş öncesinde menü fiyatlarını kontrol etmenizi öneririm."</p>
          </div>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>3. Kişisel Veri Paylaşma</h2>
          <p style={{ marginBottom: '16px' }}>Kendi veya başkasına ait:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <li>T.C. kimlik numarası</li>
            <li>Pasaport numarası</li>
            <li>PNR kodu</li>
            <li>QR kod</li>
            <li>Barkod</li>
            <li>Telefon</li>
            <li>Açık adres</li>
            <li>Ödeme bilgisi</li>
            <li>E-posta</li>
            <li>Kimlik görseli</li>
          </ul>
          <p style={{ marginBottom: '24px' }}>paylaşma.</p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>4. Faydalı ve Doğru Bilgi Paylaş</h2>
          <p style={{ marginBottom: '24px' }}>
            Bilerek yanlış bilgi paylaşmak, sahte deneyim yazmak veya kullanıcıları yanıltmak yasaktır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>5. Reklam ve Spam Yasaktır</h2>
          <p style={{ marginBottom: '24px' }}>
            İzinsiz reklam, link spam, sahte kampanya, yanıltıcı yönlendirme ve otomatik içerik paylaşımı yasaktır.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>6. Raporlama</h2>
          <p style={{ marginBottom: '24px' }}>
            Kullanıcılar, sorunlu içerikleri "Rapor Et" butonuyla bildirebilir. Bildirilen içerikler moderasyon ekibi tarafından incelenir.
          </p>
        </div>
      </div>
    </main>
  );
}
