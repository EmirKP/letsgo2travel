import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["sparkles", copy("Yeni seyahat ekranların", "Your refreshed travel screens"), copy("Fotoğraflı üst alanlar, sade kartlar ve kolay gezinme. Gezgin topluluğu ana sayfada; favorilerin Kaydedilenler'de.", "Photo headers, clear cards and easy navigation. Community stays on Home; favourites appear in Saved.")],
    ["wallet", copy("Bütçe ve havalimanı rehberi", "Budget and airport guide"), copy("Örnek bütçeleri kendi tutarlarınla hesapla; havalimanlarının resmî rehberlerine ve aktarma yardımcısına ulaş. Canlı fiyat veya hizmet bilgisi sunulmaz.", "Calculate example budgets with your own amounts; open official airport guides and the transfer assistant. No live prices or facility data are provided.")],
    ["globe", copy("Seyahat araçlarına ince ayar", "Travel tools, refined"), copy("Tarih ve yazı alanları, belge incelemesi, davet bağlantıları ve harita kontrolleri iyileştirildi. Mevcut seyahatlerin ve hesap altyapın korunur.", "Improved date and text fields, evidence review, invitation links and map controls. Existing trips and account infrastructure are preserved.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Sıradaki hikayene yeni bir görünüm.", "A fresh look for your next story.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, seyahat ekranlarını yeniler; bütçe ve havalimanı rehberlerini ekler.`, `Build ${config.buildNumber} refreshes travel screens and adds budget and airport guides.`)}</p>
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
