import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["globe", copy("Kosova etkinlikleri", "Events in Kosovo"), copy("Kosova aramaları artık XK engeline takılmadan PRN konum kapsamıyla çalışır.", "Kosovo searches now use PRN location coverage instead of failing on XK.")],
    ["sparkles", copy("Dünya sahnesi", "World stage"), copy("Yüksek ilgi gören yaklaşan konserler, ülkeye öncelik verilerek otomatik öne çıkarılır.", "High-impact upcoming concerts are highlighted automatically, prioritising the selected country.")],
    ["calendar", copy("Güvenli tarih ve saatler", "Safe dates and times"), copy("Geçmiş günler, geçmiş saatler ve ters tarih aralıkları artık kabul edilmez.", "Past days, past times and reversed date ranges are no longer accepted.")],
    ["check", copy("Hizalı mobil formlar", "Aligned mobile forms"), copy("iOS tarih ve saat kutuları kart içinde kalır; gereksiz varış arka planı kaldırıldı.", "iOS date and time fields stay inside their cards, with the extra arrival background removed.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Büyük konserleri kaçırma; planını doğru tarihle kur.", "Catch major concerts and plan with the right dates.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, etkinlik kapsamını, tarih güvenliğini ve iOS form düzenini yeniler.`, `Build ${config.buildNumber} improves event coverage, date safety and iOS form layouts.`)}</p>
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
