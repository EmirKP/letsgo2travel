import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
  ["compass", "Yeni mobil gezinme", "Ana Sayfa, Keşfet, Rota, Seyahatlerim ve Profil artık tek dokunuş uzağında."],
  ["bell", "Bildirim merkezi", "Fiyat alarmlarını ve seyahat hatırlatmalarını uygulama içinde takip et."],
  ["shield", "Daha güvenli kişisel kayıtlar", "Cihazdaki rota ve aramalar farklı hesaplar arasında karışmaz."],
  ["suitcase", "Seyahat merkezi", "Favoriler, kayıtlı rotalar ve uçuş aramaları daha düzenli bir merkezde."],
] as const;

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={`Sürüm ${config.appVersion}`} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD 4</small>
      <h3>LetsGo2Travel tamamen yenilendi.</h3>
      <p>Daha hızlı, daha kişisel ve gerçekten mobil uygulama gibi hissettiren yeni deneyime hoş geldin.</p>
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
