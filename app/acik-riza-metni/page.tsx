import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Açık Rıza Metni | LetsGo2Travel",
  description: "LetsGo2Travel platformu Doğrulanmış Gezgin Başvurusu Açık Rıza Metni",
};

export default function AcikRizaMetniPage() {
  return (
    <main className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: 'var(--l2t-gold)', marginBottom: '24px', fontSize: '2.5rem' }}>Açık Rıza Metni</h1>
        
        <div className="l2t-card" style={{ padding: '32px', color: 'var(--l2t-soft)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '16px' }}><strong>Son güncelleme tarihi:</strong> Haziran 2026</p>
          
          <p style={{ marginBottom: '24px' }}>
            Bu Açık Rıza Metni, LetsGo2Travel platformunda doğrulanmış gezgin başvurusu yapmak isteyen kullanıcıların isteğe bağlı olarak belge yüklemesi kapsamında hazırlanmıştır.<br/><br/>
            Doğrulanmış gezgin başvurusu yapmak zorunlu değildir. Kullanıcı, belge yüklemeden de platformun temel özelliklerini kullanabilir.
          </p>

          <h2 style={{ color: '#fff', marginTop: '32px', marginBottom: '16px', fontSize: '1.5rem' }}>Açık Rıza Beyanı</h2>
          <p style={{ marginBottom: '16px' }}>
            LetsGo2Travel platformunda belirli bir ülke veya şehir hakkında doğrulanmış gezgin olarak içerik paylaşabilmek için, seyahatime ilişkin belgeyi isteğe bağlı olarak yüklediğimi kabul ederim.
          </p>
          <p style={{ marginBottom: '16px' }}>
            Yüklediğim belgenin yalnızca doğrulama amacıyla geçici olarak işleneceğini, ham belgenin kalıcı olarak saklanmayacağını, doğrulama kaydı oluşturulduktan sonra silineceğini biliyorum.
          </p>
          <p style={{ marginBottom: '16px' }}>
            Yükleme öncesinde pasaport numarası, T.C. kimlik numarası, PNR kodu, QR kod, barkod, ödeme bilgisi, açık adres, telefon numarası ve gereksiz kişisel bilgileri kapatmam gerektiğini anladım.
          </p>
          <p style={{ marginBottom: '16px' }}>
            Bu kapsamda, belge yükleme süreci için gerekli kişisel verilerimin LetsGo2Travel tarafından işlenmesine açık rıza veriyorum.
          </p>
          <p style={{ marginBottom: '32px' }}>
            Bu rızayı istediğim zaman geri çekebileceğimi biliyorum. Rızamı geri çekmek için <a href="/veri-silme-ve-hak-talebi" style={{color: 'var(--l2t-gold)', textDecoration: 'underline'}}>/veri-silme-ve-hak-talebi</a> sayfasındaki formu kullanabileceğimi kabul ederim.
          </p>

          <div style={{ padding: '16px', background: 'rgba(245, 184, 27, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 184, 27, 0.2)' }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--l2t-gold)' }}>Form Onay Metni</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>
              "Doğrulanmış gezgin başvurusu kapsamında yüklediğim belgenin geçici olarak işlenmesine, doğrulama sonrası ham belgenin silinmesine ve yalnızca minimum doğrulama kaydının tutulmasına açık rıza veriyorum."
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
