import Icon from "../components/Icon";
import { SITE_URL } from "../config";
import { openExternal } from "../lib/native";
import type { FlightDeal, Profile, SavedPlan, Screen, Session } from "../types";

export default function ProfileScreen({
  session,
  profile,
  plans,
  favorites,
  navigate,
  onSignOut,
}: {
  session: Session;
  profile: Profile | null;
  plans: SavedPlan[];
  favorites: FlightDeal[];
  navigate: (screen: Screen) => void;
  onSignOut: () => void;
}) {
  const metadata = session.user.user_metadata || {};
  const fullName = String(metadata.full_name || metadata.name || profile?.username || "LetsGo2Travel Gezgini");
  const username = profile?.username || String(metadata.username || "");
  const visited = profile?.visited_countries?.length || 0;

  const rows: { title: string; subtitle: string; icon: "bell" | "heart" | "plans" | "map" | "shield"; screen?: Screen; href?: string }[] = [
    { title: "Fiyat Alarmlarım", subtitle: "Aktif uçuş takiplerini yönet", icon: "bell", screen: "alerts" },
    { title: "Favori Rotalarım", subtitle: `${favorites.length} kayıtlı fırsat`, icon: "heart", screen: "favorites" },
    { title: "Planlarım", subtitle: `${plans.length} cihaz kaydı`, icon: "plans", screen: "plans" },
    { title: "Dünyam & Liderlik", subtitle: `${visited} ziyaret edilen ülke`, icon: "map", href: "/profil/harita" },
    { title: "Hesap güvenliği", subtitle: "Şifre ve oturum ayarları", icon: "shield", href: "/sifremi-unuttum" },
  ];

  return (
    <main className="content profile-content">
      <section className="profile-card">
        <span className="profile-avatar"><Icon name="user" size={34}/></span>
        <div><small>SEYAHAT PROFİLİ</small><h1>{fullName}</h1><p>{session.user.email}</p>{username ? <strong>@{username}</strong> : null}</div>
        {profile?.role === "admin" ? <em>Admin</em> : null}
      </section>

      <section className="profile-stats">
        <div><strong>{plans.length}</strong><span>Plan</span></div>
        <div><strong>{favorites.length}</strong><span>Favori</span></div>
        <div><strong>{visited}</strong><span>Ülke</span></div>
      </section>

      <section className="profile-list">
        {rows.map((row) => (
          <button key={row.title} onClick={() => row.screen ? navigate(row.screen) : row.href ? openExternal(`${SITE_URL}${row.href}`) : undefined}>
            <span><Icon name={row.icon} size={20}/></span>
            <div><strong>{row.title}</strong><small>{row.subtitle}</small></div>
            <Icon name="chevron" size={18}/>
          </button>
        ))}
      </section>

      <section className="profile-note"><Icon name="info" size={19}/><p>Profil bilgilerin Supabase hesabından okunur. Ziyaret edilen ülkeler ve topluluk özellikleri web hesabınla aynıdır.</p></section>

      <button className="signout-button" onClick={onSignOut}><Icon name="logout" size={19}/>Hesaptan çıkış yap</button>
    </main>
  );
}
