import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["users", copy("Ortak plan artık gözünün önünde", "Shared planning is now easy to find"), copy("Ana sayfadan veya Seyahatlerim'in en üstünden davet oluştur, bağlantıyla katıl, oyla ve masrafları böl.", "Create or join invitations from Home or the top of My Trips, vote and split expenses.")],
    ["globe", copy("Günlüğün, dünya haritan ve yıllık özetin", "Your journal, world map and yearly recap"), copy("Anılarını çevrimdışı da yaz; bağlantı gelince otomatik eşitlensin. Gezdiğin ülkeleri gör ve yıllık özetini paylaş.", "Write memories offline and let them sync automatically when you're connected. See visited countries and share your year in travel.")],
    ["shield", copy("Aktarma ve güvenlik yardımcısı", "Transfer and safety assistants"), copy("Aktarma süreni kontrol et; seyahatine göre acil numaralara, hazırlık adımlarına ve yerel uyarılara ulaş.", "Check connection time and access emergency numbers, preparation steps and local guidance.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Aradığın seyahat aracı artık elinin altında.", "Every travel tool is now within reach.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, ortak planı görünür hale getirir ve yolculuğun tamamını Seyahatlerim'de toplar.`, `Build ${config.buildNumber} makes shared planning visible and brings the whole journey into My Trips.`)}</p>
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
