import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["globe", copy("Yeni açılış sahnesi", "New opening scene"), copy("Dönen dünya üzerinde yürüyen gezgin, uygulama açılırken tam ekran ve akıcı biçimde karşılar.", "A traveller walking across the rotating globe now welcomes you in a fluid full-screen opening.")],
    ["sparkles", copy("LetsGo2Travel imzası", "LetsGo2Travel signature"), copy("Marka yazısı, kısa slogan ve altın ilerleme çizgisi animasyona uyumlu biçimde eklendi.", "The wordmark, short message and gold progress line now move in harmony with the scene.")],
    ["check", copy("Hızlı ve hafif", "Fast and lightweight"), copy("Video kısaltıldı, sessizleştirildi ve görüntü kalitesi korunarak mobil için sıkıştırıldı.", "The video was shortened, muted and compressed for mobile while preserving visual quality.")],
    ["shield", copy("Güvenli geçiş", "Reliable transition"), copy("Video yüklenemezse uygulama açılışta kalmaz; azaltılmış hareket tercihi de korunur.", "If the video cannot load, the app never gets stuck, and reduced-motion preferences remain respected.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Yeni yolculuğun daha uygulama açılırken başlasın.", "Let your next journey begin the moment the app opens.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, yeni ve hafif LetsGo2Travel açılış animasyonunu getirir.`, `Build ${config.buildNumber} introduces the new lightweight LetsGo2Travel opening animation.`)}</p>
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
