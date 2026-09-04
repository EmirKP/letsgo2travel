import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["calendar", copy("Tarihler artık gerçek alanlarda", "Dates now sit in real fields"), copy("Etkinlik, kokpit, fiyat alarmı ve yönetici ekranındaki tarih-saat seçimleri aynı, sola hizalı mobil alanı kullanıyor.", "Event, cockpit, price alert and admin date-time pickers now use the same left-aligned mobile field.")],
    ["map", copy("Net ve tam ekran pasaport haritası", "Crisp full-screen passport map"), copy("Vektör harita sekiz kata kadar yakınlaşıyor; büyük bayraklar, sürükleme ve tam ekran görünüm haritanın içinde çalışıyor.", "The vector map zooms up to eight times with larger flags, panning and a full-screen view contained inside the map.")],
    ["plane", copy("Canlı uçuş evreleri", "Live flight phases"), copy("Kalkıştan sonra Uçuyoruz görünür; geri sayım kalkıştan varış tarafına otomatik geçer.", "After departure, Flying appears and the countdown moves automatically from departure to arrival.")],
    ["suitcase", copy("Kişisel ana sayfa", "A personal home screen"), copy("Yaklaşan veya devam eden seyahatin ana sayfada öne çıkar; planlama kısayolları daha sıkı bir düzende sunulur.", "Your next or active trip is highlighted on the home screen in a tighter, more useful layout.")],
    ["offline", copy("Daha sade yerel yardımcı", "A cleaner local companion"), copy("Seçilen ülkeyi tekrar eden büyük kart kaldırıldı; çevrimdışı dil durumu küçük bir notla gösteriliyor.", "The large duplicate country card is gone, replaced by a compact offline-language note.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Daha net, daha kişisel, daha canlı.", "Sharper, more personal and more alive.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, tarih alanlarını, pasaport haritasını, ana sayfayı ve uçuş canlı etkinliğini yeniler.`, `Build ${config.buildNumber} refreshes date fields, the passport map, home screen and flight Live Activity.`)}</p>
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
