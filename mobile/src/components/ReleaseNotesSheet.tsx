import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["users", copy("Topluluk artık ana sayfada", "Community is now on Home"), copy("Ülke topluluklarına, son sorulara ve Gezginlere sor alanına ana sayfadan doğrudan ulaşabilirsin.", "Open country communities, recent questions and Ask travellers directly from Home.")],
    ["shield", copy("Güvenli belge incelemesi", "Safer evidence review"), copy("Eksik belge açıkça işaretlenir ve onaylanamaz; geçerli belge incelendikten sonra karar işlemleri açılır.", "Missing evidence is clearly marked and cannot be approved; review actions unlock only after valid evidence is inspected.")],
    ["calendar", copy("Etkinliği seyahatine ekle", "Add events to your trip"), copy("Etkinlikleri tarihleri örtüşen kokpit seyahatine ekleyip seyahat takviminde birlikte görebilirsin.", "Attach events to a Cockpit trip with matching dates and see them together in your trip calendar.")],
    ["plane", copy("Dengeli uçuş canlı etkinliği", "Balanced flight Live Activity"), copy("Kalkış, Uçuyoruz ve sarı varış sayacı tek satırda daha net görünür; tekrarlanan sayaç kaldırıldı.", "Departure, Flying and the yellow arrival countdown now fit cleanly in one row without a duplicate timer.")],
    ["home", copy("Küçük ekranda daha düzenli", "Cleaner on small screens"), copy("Topluluk, yönetici sekmeleri ve etkinlik seçimleri dar iPhone ekranlarında taşmadan çalışır.", "Community, admin tabs and event selection now fit narrow iPhone screens without overlap.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Topluluk ve seyahat planın artık birlikte.", "Community and trip planning, together.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, topluluğu ana sayfaya getirir; etkinlik, doğrulama ve uçuş akışlarını tamamlar.`, `Build ${config.buildNumber} brings Community to Home and completes event, verification and flight flows.`)}</p>
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
