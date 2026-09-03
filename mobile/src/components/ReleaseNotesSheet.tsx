import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
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
      <h3>Daha akıcı, daha kullanışlı bir mobil deneyim.</h3>
      <p>Açılış, seyahat formu, sürpriz rota ve Pasaport Gücü ekranları birlikte yenilendi.</p>
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
