import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["users", copy("Arkadaşlarınla aynı seyahati planla", "Plan the same trip with friends"), copy("Güvenli davet koduyla arkadaşlarını ekle; düzenleyici veya izleyici yetkisini sen belirle.", "Invite friends with a secure code and choose editor or viewer access.")],
    ["check", copy("Fikirleri oylayın", "Vote on ideas"), copy("Rota, konaklama, ulaşım ve aktivite önerilerini tek yerde toplayıp ekipçe karar verin.", "Collect route, stay, transport and activity ideas, then decide together.")],
    ["wallet", copy("Bütçe ve masraflar ortak", "Shared budget and expenses"), copy("Kimin ödediğini seç, masrafı katılımcılar arasında eşit böl ve alacak-borç dengesini anında gör.", "Choose who paid, split expenses equally and instantly see balances.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Seyahat artık gerçekten ortak.", "Trips are truly shared now.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, arkadaş daveti, oylama ve ortak masraf yönetimini Kokpit'e getirir.`, `Build ${config.buildNumber} brings invitations, voting and shared expenses to the Cockpit.`)}</p>
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
