import { config } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const changes = [
  ["compass", "Ne yapacağını hemen seç", "Ana sayfadaki hızlı başlangıç alanı; keşfetme, rota planlama ve seyahat yönetme yollarını açıkça anlatır."],
  ["route", "Rotaların artık gerçekten açılıyor", "Kaydettiğin rota kartına dokunarak bütçeyi, süreyi, günlük planı ve uyarıları yeniden okuyabilirsin."],
  ["suitcase", "Daha güvenilir Seyahat Kokpiti", "Durum değişiklikleri, silinen seyahatler, hatırlatmalar ve Live Activity kayıtları birbiriyle tutarlı çalışır."],
  ["users", "Site ve uygulama aynı topluluk", "Soru ve cevap sayıları iki tarafta eşleşir; genel sorular ile üyelik kilitleri aynı kurala uyar."],
  ["bell", "Hata göstermeyen boş ekran yok", "Fiyat alarmı ve canlı veri sorunları artık boş liste gibi görünmez; nedeni ve tekrar deneme yolu açıkça gösterilir."],
  ["globe", "Daha kullanışlı Pasaport haritası", "Yakınlaştırma, sürükleme, klavye desteği, açıklamalar ve ülke listesiyle haritayı kullanmak kolaylaştı."],
  ["shield", "Güvenli hesap ve yönetim", "Yönetici yetkisi yalnız sunucudan doğrulanır; misafir kayıtların da isteğinle uygulama ve web hesabına aktarılır."],
  ["sparkles", "Daha hafif ve akıcı", "Ağır ekranlar ihtiyaç olduğunda açılır; rota görselleri yaklaşık yüzde 80 küçülerek ilk açılış hızlandırıldı."],
] as const;

export function ReleaseNotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={`Sürüm ${config.appVersion}`} onClose={onClose} size="large">
    <div className="release-hero">
      <span><Icon name="sparkles" size={30} /></span>
      <small>BUILD {config.buildNumber}</small>
      <h3>LetsGo2Travel artık daha anlaşılır.</h3>
      <p>Build {config.buildNumber}, ilk dokunuştan seyahat gününe kadar uygulamanın ne işe yaradığını açıkça gösterir ve kayıtlarını daha güvenli korur.</p>
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
