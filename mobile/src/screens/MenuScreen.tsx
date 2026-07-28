import Icon, { type IconName } from "../components/Icon";
import { SITE_URL } from "../config";
import { openExternal } from "../lib/native";
import type { Screen, Session } from "../types";

const internalItems: { title: string; subtitle: string; icon: IconName; screen: Screen }[] = [
  { title: "Fiyat Alarmları", subtitle: "Uçuş fiyatlarını takip et", icon: "bell", screen: "alerts" },
  { title: "Favoriler", subtitle: "Kaydettiğin fırsatlar", icon: "heart", screen: "favorites" },
  { title: "Planlarım", subtitle: "Seyahat panonu aç", icon: "plans", screen: "plans" },
  { title: "Rota Asistanı", subtitle: "Yeni rota oluştur", icon: "sparkles", screen: "route" },
];

const links: { title: string; path: string; icon: IconName }[] = [
  { title: "Rehber Merkezi", path: "/rehber-merkezi", icon: "globe" },
  { title: "Forum ve Topluluk", path: "/forum", icon: "users" },
  { title: "Hakkımızda", path: "/hakkimizda", icon: "info" },
  { title: "Gizlilik Politikası", path: "/gizlilik-politikasi", icon: "shield" },
  { title: "Kullanım Şartları", path: "/kullanim-sartlari", icon: "settings" },
  { title: "KVKK Aydınlatma Metni", path: "/kvkk-aydinlatma-metni", icon: "lock" },
  { title: "Veri silme ve hak talebi", path: "/veri-silme-ve-hak-talebi", icon: "trash" },
];

export default function MenuScreen({ session, isOnline, navigate }: { session: Session | null; isOnline: boolean; navigate: (screen: Screen) => void }) {
  return (
    <main className="content menu-content">
      <section className="menu-profile" onClick={() => navigate(session ? "profile" : "auth")}>
        <span><Icon name="user" size={25}/></span>
        <div><small>{session ? "OTURUM AÇIK" : "MİSAFİR"}</small><strong>{session?.user.email || "Hesabına giriş yap"}</strong><p>{session ? "Profilini ve kayıtlarını yönet" : "Planlarını bütün cihazlarında taşı"}</p></div>
        <Icon name="chevron" size={18}/>
      </section>

      <div className={isOnline ? "connection-state online" : "connection-state offline"}><Icon name={isOnline ? "wifi" : "offline"} size={17}/><span>{isOnline ? "İnternet bağlantısı aktif" : "Çevrimdışı mod"}</span></div>

      <section className="menu-section">
        <span className="section-kicker">UYGULAMA</span>
        <div className="menu-list">{internalItems.map((item) => <button key={item.title} onClick={() => navigate(item.screen)}><span><Icon name={item.icon} size={20}/></span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><Icon name="chevron" size={17}/></button>)}</div>
      </section>

      <section className="menu-section">
        <span className="section-kicker">BİLGİ VE YASAL</span>
        <div className="menu-list legal-list">{links.map((item) => <button key={item.title} onClick={() => openExternal(`${SITE_URL}${item.path}`)}><span><Icon name={item.icon} size={19}/></span><div><strong>{item.title}</strong></div><Icon name="external" size={16}/></button>)}</div>
      </section>

      <footer className="app-footer"><strong>LetsGo<span>2</span>Travel</strong><p>Mobil uygulama · Sürüm 1.0.0</p><small>Vize, fiyat ve seyahat koşulları değişebilir. Resmî kaynaklardan doğrulama yap.</small></footer>
    </main>
  );
}
