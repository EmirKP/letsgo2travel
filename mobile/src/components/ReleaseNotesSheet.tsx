import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
  ["user", "Güvenilir hesap girişi", "E-posta, Google ve iOS'ta Apple girişi uygulamaya güvenli bağlantıyla geri döner."],
  ["suitcase", "Yerel Seyahat Kokpiti", "Tarihlerini ve hazırlık listeni web hesabınla aynı veride yönet."],
  ["users", "Kaşifler Ligi ve akış", "Gezgin sorularını uygulamada oku, paylaş ve lig sıralamasını keşfet."],
  ["sparkles", "Beni Şaşırt", "Dünyayı döndür, görsel rotanı seç ve tek dokunuşla plana dönüştür."],
] as const;

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={`Sürüm ${config.appVersion}`} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD 5</small>
      <h3>Web ve mobil artık birlikte çalışıyor.</h3>
      <p>Hesap, plan, favori ve seyahat kayıtların aynı güvenli veri katmanında buluşuyor.</p>
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
