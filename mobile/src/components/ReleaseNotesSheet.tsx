import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["users", copy("Davetlere daha kolay katıl", "Join invitations more easily"), copy("Bağlantıyı Seyahatlerim'e yapıştır veya web üzerinden hesabına katıl. Topluluk ana sayfanın üstünde.", "Paste a link in My Trips or join through your account on the web. Community is near the top of Home.")],
    ["plans", copy("Günlüğün bağlantıda eşitlensin", "Your journal syncs when connected"), copy("Çevrimdışı notlar yeniden bağlanınca gönderilir. Tarih alanları düzenlendi; anılar sayıyla sınırlanmaz.", "Offline memories are sent after reconnecting. Date fields are aligned; the journal has no entry-count cutoff.")],
    ["globe", copy("Daha okunaklı harita ve doğru hesaplar", "Clearer maps and reliable calculations"), copy("Bayraklar büyüdü, harita 20 kata kadar yakınlaşır. Masraflar kendi para birimiyle, yıllık özet yalnız başlamış seyahatlerle hesaplanır.", "Larger flags and up to 20× map zoom. Expenses keep their currency; recaps include only started trips.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Seyahat araçlarına ince ayar.", "Travel tools, refined.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, günlük, davet, ortak masraf ve harita akışlarını iyileştirir.`, `Build ${config.buildNumber} improves journals, invitations, shared expenses and maps.`)}</p>
    </div>
    <div className="release-list">
      {changes.map(([icon, title, description]) => <div key={title}>
        <span><Icon name={icon} size={20} /></span>
        <div><strong>{title}</strong><p>{description}</p></div>
      </div>)}
    </div>
    <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> {copy("Yenilikleri gördüm", "Got it")}</button>
  </Sheet>;
}
