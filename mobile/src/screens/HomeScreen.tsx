import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { dailyDiscovery } from "../data/discovery";
import { destinationArtwork } from "../data/artwork";
import { randomRoute } from "../data/routes";
import {
  getFavoriteDestinations,
  getRecentDestinations,
  getSavedRoutePlans,
} from "../lib/storage";
import type { AuthUser, RouteSuggestion, ViewId } from "../types";

// Hızlı erişim: ana fonksiyonlar. "Keşfet" hero'da zaten var; tekrar
// yerine Fiyat Alarmı hızlı erişimi verildi.
const quickCards: Array<{ title: string; text: string; icon: IconName; view?: ViewId; action?: "surprise" }> = [
  { title: "Pasaport Gücü", text: "Giriş durumlarını karşılaştır", icon: "passport", view: "passport" },
  { title: "Fiyat Alarmı", text: "Fiyat düşünce haber al", icon: "bell", view: "alerts" },
  { title: "Beni Şaşırt", text: "Kararı dünyaya bırak", icon: "sparkles", action: "surprise" },
  { title: "Kaşifler Ligi", text: "Gezginlerden ilham al", icon: "users", view: "community" },
];

function firstName(user: AuthUser | null) {
  const value = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Kaşif");
  return value.trim().split(/\s+/)[0] || "Kaşif";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Günaydın";
  if (hour < 18) return "Merhaba";
  return "İyi akşamlar";
}

export function HomeScreen({ user, ownerId, refreshToken, onNavigate, onSurprise, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  refreshToken?: number;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const [storageTick, setStorageTick] = useState(0);

  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, storageTick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, storageTick]);
  const recent = useMemo(() => getRecentDestinations(ownerId), [ownerId, storageTick]);
  const discovery = dailyDiscovery();
  const activityCount = routes.length + favorites.length;

  useEffect(() => {
    const update = () => setStorageTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  useEffect(() => {
    setStorageTick((value) => value + 1);
  }, [refreshToken]);

  const surprise = () => {
    const selected = randomRoute();
    onSurprise(selected);
    onNotice(`${selected.name} senin için seçildi.`);
  };

  return <div className="screen home-screen">
    <section className="personal-greeting">
      <div><small>{greeting()}</small><strong>{firstName(user)} 👋</strong><p>Bugün dünyada nereyi merak ediyorsun?</p></div>
      <button onClick={() => onNavigate("profile")} aria-label="Profili aç">{firstName(user).slice(0, 1).toLocaleUpperCase("tr-TR")}</button>
    </section>

    <section className="hero home-hero" style={{ backgroundImage: `radial-gradient(circle at 88% 12%,rgba(25,198,211,.22),transparent 34%),linear-gradient(145deg,rgba(7,27,51,.94),rgba(11,49,82,.78)),url(${destinationArtwork("FCO")})` }}>
      <div className="eyebrow"><span><Icon name="globe" size={13} /></span> TÜRKİYE'DEN DÜNYAYA</div>
      <h1>Bir sonraki hikâyen nerede başlasın?</h1>
      <p>Türkiye pasaportuna uygun ülkeleri gör, akıllı rotanı oluştur ve seyahatini tek yerde yönet.</p>
      <div className="hero-actions">
        <button className="primary-button" onClick={() => onNavigate("route")}><Icon name="route" size={18} /> Rota oluştur</button>
        <button className="secondary-button" onClick={() => onNavigate("explore")}><Icon name="compass" size={18} /> Keşfet</button>
      </div>
    </section>

    <section className="home-quick-grid" aria-label="Hızlı erişim">
      {quickCards.map((card) => <button key={card.title} onClick={() => card.action === "surprise" ? surprise() : card.view && onNavigate(card.view)}>
        <span><Icon name={card.icon} size={21} /></span><strong>{card.title}</strong><small>{card.text}</small>
      </button>)}
    </section>

    {activityCount > 0 && <section className="travel-pulse" aria-label="Seyahat nabzın">
      <div className="travel-pulse-copy"><span><Icon name="sparkles" size={19} /></span><div><small>SEYAHAT NABZI</small><strong>{activityCount} keşif kaydın hazır</strong><p>Planların ve favorilerin bu cihazda seninle.</p></div></div>
      <div className="travel-pulse-stats">
        <button onClick={() => onNavigate("trips")} aria-label={`${routes.length} kayıtlı rotayı aç`}><strong>{routes.length}</strong><span>Rota</span></button>
        <button onClick={() => onNavigate("explore")} aria-label={`${favorites.length} favoriyi aç`}><strong>{favorites.length}</strong><span>Favori</span></button>
      </div>
    </section>}

    {routes[0] && <section className="continue-card">
      <span><Icon name="route" size={24} /></span>
      <div><small>KALDIĞIN YERDEN DEVAM ET</small><strong>{routes[0].plan.routes.map((route) => route.name).join(" · ")}</strong><p>{routes[0].plan.summary}</p></div>
      <button onClick={() => onNavigate("trips")} aria-label="Seyahatlerim'de devam et"><Icon name="chevron" size={18} /></button>
    </section>}

    <button className="discovery-teaser" onClick={() => onNavigate("explore")} style={{ backgroundImage: `linear-gradient(125deg,rgba(7,27,51,.86),rgba(7,27,51,.45)),url(${destinationArtwork(discovery.code)})` }}>
      <span><small>GÜNÜN KEŞFİ · {discovery.entry}</small><strong>{discovery.flag} {discovery.name}</strong><em>{discovery.tag}</em></span><Icon name="chevron" size={20} />
    </button>

    {(recent.length > 0 || favorites.length > 0) && <section className="section-block personal-destinations">
      <div className="section-heading"><div><span>SANA ÖZEL</span><h2>Keşiflerin</h2></div><button className="text-button" onClick={() => onNavigate("explore")}>Tümünü gör</button></div>
      <div className="personal-chip-list">
        {[...recent, ...favorites].filter((item, index, all) => all.findIndex((other) => other.alpha3 === item.alpha3) === index).slice(0, 6).map((item) => <button key={item.alpha3} onClick={() => onNavigate("explore")}><Icon name={favorites.some((favorite) => favorite.alpha3 === item.alpha3) ? "heart" : "compass"} size={15} />{item.name}</button>)}
      </div>
    </section>}

    <button className="cockpit-banner" onClick={() => onNavigate("cockpit")}>
      <span><Icon name="suitcase" size={27} /></span><div><small>AKILLI SEYAHAT KOKPİTİ</small><strong>Seyahat gününe kadar yanında</strong><p>Seyahat kayıtların ve hazırlık listen tek yerde.</p></div><Icon name="chevron" size={17} />
    </button>
  </div>;
}
