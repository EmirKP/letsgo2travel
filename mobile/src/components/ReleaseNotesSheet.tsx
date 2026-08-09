import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
  ["user", "Güvenli uygulama içi giriş", "E-posta, Google ve iOS'ta Apple girişi PKCE doğrulamasıyla uygulamaya geri döner."],
  ["suitcase", "Yerel Seyahat Kokpiti", "Tarihlerini ve hazırlık listeni web hesabınla aynı veride yönet."],
  ["users", "Kaşifler Ligi ve akış", "Gezgin sorularını uygulamada oku, paylaş ve lig sıralamasını keşfet."],
  ["sparkles", "Beni Şaşırt", "Dünyayı döndür, görsel rotanı seç ve tek dokunuşla plana dönüştür."],
] as const;

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={`Sürüm ${config.appVersion}`} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>Daha güvenli, daha yerel bir mobil deneyim.</h3>
      <p>Giriş akışları, seyahat kayıtları, erişilebilirlik ve uygulama içi yönlendirmeler birlikte yenilendi.</p>
    </div>
    <div className="release-list">
      {changes.map(([icon, title, text]) => <div key={title}>
        <span><Icon name={icon} size={20} /></span>
        <div><strong>{title}</strong><p>{text}</p></div>
      </div>)}
    </div>
    <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> Yenilikleri gördüm</button>
  </Sheet>;
}
