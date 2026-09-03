import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
  ["shield", "Hesaba özel Admin Paneli", "Yalnız sunucuda yönetici olarak doğrulanan hesap, siteyle ortak canlı yönetim kuyruklarını görür."],
  ["users", "Site ve uygulama forumu eşitlendi", "Sorular ve cevaplar iki tarafta aynı kaynaktan gelir; açık ülke kilitleri uygulamada da geçerlidir."],
  ["globe", "Daha hafif ve akıcı uygulama", "Harita çizimi, bölüm yüklemeleri, açılış görseli ve havalimanı araması performans için iyileştirildi."],
  ["sparkles", "Yeni animasyonlu açılış", "LetsGo2Travel simgesi artık uygulamayı kısa ve akıcı bir animasyonla açar."],
  ["suitcase", "Taşmayan Kokpit formu", "Uçuşlu ve uçuşsuz seyahat alanları her iPhone genişliğine tam oturur."],
  ["globe", "Geliştirilmiş Pasaport haritası", "16 kata kadar yakınlaştır, iki parmakla odaklan ve ülkeye dokunarak ayrıntıya geç."],
  ["compass", "Daha ferah Beni Şaşırt", "Rota seçimi ve sonuç kartı daha dengeli, hızlı okunur bir düzene kavuştu."],
] as const;

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={`Sürüm ${config.appVersion}`} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>Forum artık siteyle eksiksiz eşitleniyor.</h3>
      <p>Build 11, webdeki soruları ve hesabının açık cevap kilitlerini uygulamaya güvenli biçimde taşır.</p>
    </div>
    <div className="release-list">
      {changes.map(([icon, title, text]) => <div key={title}>
        <span><Icon name={icon} size={20} /></span>
        <div><strong>{title}</strong><p>{text}</p></div>
      </div>)}
    </div>
    <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> Yenilikleri gördüm</button>
  </Sheet>;
}
