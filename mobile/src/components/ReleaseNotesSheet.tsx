import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["users", copy("Cevap yazmak artık daha rahat", "A better reply composer"), copy("Forum cevap alanı tam genişlikte, okunaklı ve karakter sayacıyla dar iPhone ekranlarına uygun çalışır.", "The forum reply field is full-width, readable and includes a character counter on narrow iPhones.")],
    ["info", copy("Soru detayı doğru yerden açılır", "Question details open correctly"), copy("Detay ekranı otomatik olarak cevap alanına atlamaz; soru ve cevaplar en baştan görünür.", "Question details no longer jump to the reply field and open at the beginning.")],
    ["shield", copy("Yönetim durumu daha güvenilir", "More reliable admin health"), copy("Kullanılmayan servisler yanlış uyarı oluşturmaz; gerçek bir sorun varsa etkilenen bölüm adı ve yeniden deneme görünür.", "Unused services no longer trigger false warnings; real failures name the affected section and offer retry.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Topluluk daha temiz, yönetim daha net.", "Cleaner Community, clearer admin status.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, forum cevap deneyimini ve yönetim paneli hata görünürlüğünü iyileştirir.`, `Build ${config.buildNumber} improves forum replies and admin error visibility.`)}</p>
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
