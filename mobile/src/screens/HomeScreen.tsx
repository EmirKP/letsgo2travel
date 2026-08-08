import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { dailyDiscovery } from "../data/discovery";
import { destinationArtwork } from "../data/artwork";
import { randomRoute } from "../data/routes";
import { getFeaturedDeals } from "../lib/api";
import { openExternal } from "../lib/native";
import {
  getFavoriteDestinations,
  getRecentDestinations,
  getSavedFlightSearches,
  getSavedRoutePlans,
} from "../lib/storage";
import type { AuthUser, FlightDeal, RouteSuggestion, ViewId } from "../types";

const quickCards: Array<{ title: string; text: string; icon: IconName; view?: ViewId; action?: "surprise" }> = [
  { title: "Pasaport Gücü", text: "Giriş durumlarını karşılaştır", icon: "passport", view: "passport" },
  { title: "Beni Şaşırt", text: "Kararı dünyaya bırak", icon: "sparkles", action: "surprise" },
  { title: "Fiyat Alarmı", text: "Uçuş fiyatını takip et", icon: "bell", view: "search" },
  { title: "Vizesiz Ülkeler", text: "Kolay rotaları keşfet", icon: "globe", view: "passport" },
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
  const [deals, setDeals] = useState<FlightDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [storageTick, setStorageTick] = useState(0);
  const dealRequest = useRef(0);

  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, storageTick]);
  const searches = useMemo(() => getSavedFlightSearches(ownerId), [ownerId, storageTick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, storageTick]);
  const recent = useMemo(() => getRecentDestinations(ownerId), [ownerId, storageTick]);
  const discovery = dailyDiscovery();

  useEffect(() => {
    const update = () => setStorageTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  const loadDeals = useCallback(async () => {
    const requestId = ++dealRequest.current;
    setLoadingDeals(true);
    try {
      const next = (await getFeaturedDeals()).slice(0, 6);
      if (requestId === dealRequest.current) setDeals(next);
    } catch {
      if (requestId === dealRequest.current) setDeals([]);
    } finally {
      if (requestId === dealRequest.current) setLoadingDeals(false);
    }
  }, []);

  useEffect(() => { void loadDeals(); }, [loadDeals, refreshToken]);

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
      <div className="eyebrow"><span><Icon name="globe" size={13} /></span> GLOBAL SEYAHAT KEŞFİ</div>
      <h1>Bir sonraki hikâyen nerede başlasın?</h1>
      <p>Pasaportuna uygun ülkeleri gör, akıllı rotanı oluştur ve seyahatini tek yerde yönet.</p>
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

    {(routes[0] || searches[0]) && <section className="continue-card">
      <span><Icon name={routes[0] ? "route" : "plane"} size={24} /></span>
      <div><small>KALDIĞIN YERDEN DEVAM ET</small><strong>{routes[0] ? routes[0].plan.routes.map((route) => route.name).join(" · ") : `${searches[0].originCode} → ${searches[0].destinationCode}`}</strong><p>{routes[0] ? routes[0].plan.summary : `${searches[0].departureDate} tarihli uçuş araman`}</p></div>
      <button onClick={() => onNavigate("trips")}><Icon name="chevron" size={18} /></button>
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
      <span><Icon name="suitcase" size={27} /></span><div><small>AKILLI SEYAHAT KOKPİTİ</small><strong>Uçuş gününe kadar yanında</strong><p>Seyahat kayıtların ve hazırlık listen tek yerde.</p></div><Icon name="chevron" size={17} />
    </button>

    <section className="section-block deals-block">
      <div className="section-heading"><div><span>ÖNE ÇIKANLAR</span><h2>İlham veren rotalar</h2></div><button className="text-button" onClick={() => void loadDeals()} aria-label="Yenile"><Icon name="refresh" size={17} /> Yenile</button></div>
      {loadingDeals ? <div className="skeleton-list"><div /><div /><div /></div>
        : deals.length ? <div className="deal-scroll">{deals.map((deal) => <article className="deal-card" key={deal.id}>
          <div className="deal-visual" style={deal.image_url ? { backgroundImage: `linear-gradient(180deg,transparent,rgba(3,19,36,.78)),url(${deal.image_url})` } : undefined}><span>{deal.visa_type || "Rota"}</span><strong>{deal.destination}</strong><small>{deal.origin} çıkışlı</small></div>
          <div className="deal-body"><div><small>Başlangıç fiyatı</small><strong>{new Intl.NumberFormat("tr-TR").format(deal.price)} {deal.currency}</strong></div><button onClick={() => void openExternal(deal.affiliate_url)} aria-label={`${deal.destination} uçuşlarını aç`}><Icon name="external" size={17} /></button></div>
        </article>)}</div>
        : <div className="empty-inline"><Icon name="info" /><div><strong>Canlı fırsatlar şu an alınamadı</strong><span>Bilet arama ve rota asistanı çevrimdışı seçeneklerle kullanılabilir.</span></div></div>}
    </section>
  </div>;
}
