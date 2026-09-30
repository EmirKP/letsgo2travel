import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["sparkles", copy("Daha kolay bir başlangıç", "An easier start"), copy("Ana sayfada sıradaki adımın, Kaydedilenler'de düzenli kategoriler. Planlama seçimlerin sekmeler arasında dolaşırken korunur.", "Your next step on Home and clear categories in Saved. Your planning choices stay with you as you switch tabs.")],
    ["plane", copy("Biletinden seyahatine", "From ticket to trip"), copy("Bilet metnini yapıştır veya iPhone'da fotoğraf/PDF seç. Bulunan bilgileri kontrol ederek devam et; varışı henüz gerçekleşmemiş uçuşunu da ekleyebilirsin.", "Paste ticket text or choose a photo/PDF on iPhone. Review the extracted details before continuing; you can also add a flight whose arrival is still ahead.")],
    ["globe", copy("Adresin ve notların yanında", "Keep your address and notes handy"), copy("Kendi otel, adres ve rezervasyon notlarını kişisel seyahat kartına ekle. Bu cihazda internet olmadan da aç; yanlışlıkla sildiğin kartı geri al.", "Add your hotel, address and reservation notes to a personal travel card. Open it offline on this device and undo an accidental deletion.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`, `Versioni ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Seyahatine daha kolay hazırlan.", "Get ready for your trip more easily.")}</h3>
      <p>{copy("Bildiğin renkler, daha az adım ve kaldığın yerden devam eden planlar.", "Familiar colours, fewer steps and plans that pick up where you left off.")}</p>
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
