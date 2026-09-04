import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["sparkles", copy("Yeni renk sistemi", "New colour system"), copy("Beyaz, siyah, canlı mavi ve marka sarısı bütün ekranlarda daha temiz ve tutarlı kullanılıyor.", "White, black, vivid blue and the signature yellow now create a cleaner, consistent experience across every screen.")],
    ["globe", copy("Dünya artık daha erişilebilir", "More of the world, within reach"), copy("Aranabilir ülke seçiciler, çevrimdışı acil ifade kartları ve gerçek Kosova bayrağı eklendi.", "Searchable country pickers, offline emergency phrase cards and the correct Kosovo flag are now included.")],
    ["map", copy("Etkileşimli pasaport haritası", "Interactive passport map"), copy("Haritayı kendi alanında yakınlaştırabilir, sürükleyebilir ve ülkeleri bayraklarıyla keşfedebilirsin.", "Zoom and pan inside the map itself, then explore countries together with their flags.")],
    ["calendar", copy("Daha güvenli tarih akışları", "Safer date flows"), copy("Geçmiş tarihler ve hatalı tarih aralıkları hem ekranda hem sunucuda engelleniyor.", "Past dates and invalid date ranges are now blocked in both the interface and the server.")],
    ["check", copy("Mobil ayrıntılar düzeltildi", "Mobile details refined"), copy("Taşan alanlar, görseller, seçim vurguları ve yönetici belge inceleme akışı iyileştirildi.", "Overflowing fields, destination artwork, selection states and the admin evidence review flow have been refined.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Daha temiz, daha geniş, daha kullanışlı.", "Cleaner, broader and easier to use.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, dünya araçlarını ve mobil deneyimi baştan sona iyileştirir.`, `Build ${config.buildNumber} upgrades the world tools and mobile experience from end to end.`)}</p>
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
