import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["globe", copy("Daha geniş etkinlik kapsamı", "Broader event coverage"), copy("Ticketmaster'ın kapsamadığı ülkelerde küresel yedek kaynak otomatik devreye girer.", "A global fallback source now takes over automatically where Ticketmaster has no coverage.")],
    ["calendar", copy("Gerçek şehir seçimi", "Working city selection"), copy("Ülkeyi seçince o ülkenin şehirleri gelir; yazım farkları artık aramayı bozmaz.", "Choose a country to load its cities, without spelling differences breaking the search.")],
    ["check", copy("Düzgün mobil satırlar", "Aligned mobile layouts"), copy("Form alanları, durum etiketleri ve etkinlik düğmeleri dar ekranlarda hizalı kalır.", "Fields, status labels and event actions stay aligned on narrow screens.")],
    ["shield", copy("Sabit ve kontrollü görünüm", "Stable, controlled view"), copy("Uygulama ve pasaport haritasında yanlışlıkla yakınlaştırma kaldırıldı; ülkeye dokunma korunuyor.", "Accidental zoom is disabled in the app and passport map while country taps still work.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Etkinlik Radarı artık daha fazla ülkeye ulaşıyor.", "Event Radar now reaches more countries.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, şehir aramasını ve dar ekran deneyimini daha güvenilir hâle getirir.`, `Build ${config.buildNumber} makes city search and narrow-screen layouts more reliable.`)}</p>
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
