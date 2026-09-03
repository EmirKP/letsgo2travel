import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  const changes = [
    ["home", copy("Daha net bir ana sayfa", "A clearer home"), copy("İlk bakışta ne yapabileceğini gösteren sade adımlar ve canlı seyahat araçları.", "Simple next steps and live travel tools make every action obvious at a glance.")],
    ["calendar", copy("Dünya Etkinlik Radarı", "World Events Radar"), copy("Konser, festival ve spor etkinliklerini ülke, şehir ve seyahat tarihine göre bul; kaydet ve hatırlat.", "Find concerts, festivals and sports by country, city and trip dates; save them and set reminders.")],
    ["sparkles", copy("Yenilenen Beni Şaşırt", "Redesigned Surprise Me"), copy("Bütçe, tempo ve giriş kolaylığına göre temiz ve gerçek bir sürpriz rota deneyimi.", "A polished surprise route experience shaped by budget, pace and entry preference.")],
    ["compass", copy("Seyahat anında yardım", "Help in the moment"), copy("Konum, hava, saat ve bütçeye göre şimdi ne yapabileceğini önerir.", "Suggestions for what to do now, based on location, weather, time and budget.")],
    ["globe", copy("Çevrimdışı dil ve görgü kartları", "Offline phrases and etiquette"), copy("Temel ifadeleri çevrimdışı kullan; ülkeye özel görgü ve yasakları seyahatten önce gör.", "Use essential phrases offline and review local etiquette before your trip.")],
    ["plane", copy("Uçuş boyunca canlı durum", "Live status throughout your flight"), copy("Dynamic Island kalkışa geri sayar, havadayken kalan süreyi ve rota ilerlemesini gösterir.", "Dynamic Island counts down to departure, then shows time to arrival and route progress.")],
    ["globe", copy("Türkçe ve İngilizce", "Turkish and English"), copy("Sağ üstteki dil düğmesiyle uygulamanın tamamında anında geçiş yap.", "Switch instantly across the app from the language control in the top right.")],
    ["shield", copy("Daha güçlü yönetim merkezi", "A stronger admin console"), copy("Site ve uygulamadaki etkinlik, topluluk ve rapor işlemleri aynı güvenli kaynakta eşitlenir.", "Events, community and reports stay in sync across web and app from one secure source.")],
  ] as const;

  return <Sheet open={open} title={copy(`Sürüm ${config.appVersion}`, `Version ${config.appVersion}`)} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>{copy("Seyahat yardımcın artık gerçekten yanında.", "Your travel companion is now truly useful.")}</h3>
      <p>{copy(`Build ${config.buildNumber}, planlamadan seyahat anına kadar ne yapacağını açıkça gösterir.`, `Build ${config.buildNumber} makes every next step clear, from planning to the moment you travel.`)}</p>
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
