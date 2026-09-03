import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { dailyDiscovery, localizedDiscovery } from "../data/discovery";
import { listTravelEvents } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { randomRoute } from "../data/routes";
import { getFavoriteDestinations, getSavedRoutePlans, getSavedTravelEvents } from "../lib/storage";
import type { AuthUser, RouteSuggestion, TravelEvent, ViewId } from "../types";

type HomeAction = { titleTr: string; titleEn: string; textTr: string; textEn: string; icon: IconName; view: ViewId };

const primaryActions: HomeAction[] = [
  { titleTr: "Nereye gideyim?", titleEn: "Where should I go?", textTr: "Ülkeleri ve giriş kolaylığını karşılaştır", textEn: "Compare destinations and entry options", icon: "compass", view: "explore" },
  { titleTr: "Gezi planla", titleEn: "Plan a trip", textTr: "Bütçene göre gün gün rota oluştur", textEn: "Build a day-by-day route for your budget", icon: "route", view: "route" },
  { titleTr: "Seyahatimi yönet", titleEn: "Manage my trip", textTr: "Uçuş, hazırlık ve tarihleri takip et", textEn: "Track flights, preparation and dates", icon: "suitcase", view: "cockpit" },
];

const liveTools: HomeAction[] = [
  { titleTr: "Etkinlik Radarı", titleEn: "Event Radar", textTr: "Konser, festival ve maçları bul", textEn: "Find concerts, festivals and sport", icon: "calendar", view: "events" },
  { titleTr: "Şimdi ne yapabilirim?", titleEn: "What can I do now?", textTr: "Konum, saat ve havaya göre öneri", textEn: "Ideas from your location, time and weather", icon: "sun", view: "companion" },
  { titleTr: "Konuş & Uyum Sağla", titleEn: "Speak & Fit In", textTr: "Çevrimdışı ifadeler ve yerel kurallar", textEn: "Offline phrases and local etiquette", icon: "users", view: "phrases" },
  { titleTr: "Pasaport Gücü", titleEn: "Passport Power", textTr: "Ülke giriş durumlarını karşılaştır", textEn: "Compare country entry rules", icon: "passport", view: "passport" },
];

function firstName(user: AuthUser | null, fallback: string) {
  const value = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || user?.email?.split("@")[0] || fallback);
  return value.trim().split(/\s+/)[0] || fallback;
}

function greeting(locale: "tr" | "en") {
  const hour = new Date().getHours();
  if (locale === "en") return hour < 11 ? "Good morning" : hour < 18 ? "Hello" : "Good evening";
  return hour < 11 ? "Günaydın" : hour < 18 ? "Merhaba" : "İyi akşamlar";
}

export function HomeScreen({ user, ownerId, refreshToken, onNavigate, onSurprise, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  refreshToken?: number;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, dateLocale } = useI18n();
  const [storageTick, setStorageTick] = useState(0);
  const [event, setEvent] = useState<TravelEvent | null>(null);
  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, storageTick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, storageTick]);
  const savedEvents = useMemo(() => getSavedTravelEvents(ownerId), [ownerId, storageTick]);
  const discovery = localizedDiscovery(dailyDiscovery(), locale);
  const name = firstName(user, copy("Kaşif", "Explorer"));

  useEffect(() => {
    const update = () => setStorageTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  useEffect(() => setStorageTick((value) => value + 1), [refreshToken]);

  useEffect(() => {
    let active = true;
    const savedUpcoming = getSavedTravelEvents(ownerId).find((item) => Date.parse(item.startsAt) > Date.now());
    if (savedUpcoming) {
      setEvent(savedUpcoming);
      return () => { active = false; };
    }
    void listTravelEvents({ startDate: new Date().toISOString().slice(0, 10), limit: 1 })
      .then((result) => { if (active) setEvent(result.data?.[0] || null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [ownerId]);

  const surprise = () => {
    const selected = randomRoute(locale);
    onSurprise(selected);
    onNotice(copy(`${selected.name} senin için seçildi.`, `${selected.name} was picked for you.`));
  };

  return <div className="screen home-screen home-v14">
    <section className="home-welcome">
      <div><small>{greeting(locale)}</small><h1>{name} <span aria-hidden="true">👋</span></h1><p>{copy("Bugün seyahatin için neyi çözmek istiyorsun?", "What would you like to solve for your trip today?")}</p></div>
      <button onClick={() => onNavigate("profile")} aria-label={copy("Profili aç", "Open profile")}>{name.slice(0, 1).toLocaleUpperCase(locale)}</button>
    </section>

    <section className="home-purpose">
      <span className="home-purpose-badge"><Icon name="globe" size={18} /> LetsGo2Travel</span>
      <h2>{copy("Karardan dönüşe kadar seyahat yardımcın.", "Your travel companion, from decision to return.")}</h2>
      <p>{copy("Yerini seç, rotanı kur, fırsatları ve etkinlikleri yakala; seyahatte ihtiyacın olan araçları yanında taşı.", "Choose a place, build your route, catch events and deals, and carry the tools you need on the road.")}</p>
      <div className="home-purpose-steps" aria-label={copy("Uygulamanın üç adımı", "Three steps in the app")}>
        <span><b>1</b>{copy("Keşfet", "Discover")}</span><i />
        <span><b>2</b>{copy("Planla", "Plan")}</span><i />
        <span><b>3</b>{copy("Yolda kullan", "Use on trip")}</span>
      </div>
    </section>

    <section className="home-decision" aria-labelledby="home-decision-title">
      <div className="home-section-title"><div><small>{copy("BURADAN BAŞLA", "START HERE")}</small><h2 id="home-decision-title">{copy("Ne yapmak istiyorsun?", "What do you want to do?")}</h2></div><span>{copy("Tek dokunuş", "One tap")}</span></div>
      <div className="home-decision-list">{primaryActions.map((action, index) => <button key={action.view} onClick={() => onNavigate(action.view)}>
        <em>{index + 1}</em><span><Icon name={action.icon} size={23} /></span><div><strong>{locale === "tr" ? action.titleTr : action.titleEn}</strong><small>{locale === "tr" ? action.textTr : action.textEn}</small></div><Icon name="chevron" size={17} />
      </button>)}</div>
    </section>

    {(routes[0] || savedEvents[0]) && <section className="home-next-step">
      <div><small>{copy("SIRADAKİ ADIMIN", "YOUR NEXT STEP")}</small><h2>{routes[0] ? routes[0].plan.routes.map((route) => route.name).join(" · ") : savedEvents[0].title}</h2><p>{routes[0] ? copy("Kayıtlı rotan hazır. Ayrıntılara dönüp planına devam et.", "Your saved route is ready. Return to the details and continue planning.") : copy("Kaydettiğin etkinliği seyahat planına eklemeyi unutma.", "Don't forget to add your saved event to your trip plan.")}</p></div>
      <button onClick={() => onNavigate(routes[0] ? "trips" : "events")}><Icon name="chevron" size={19} /></button>
    </section>}

    <section className="home-live-section">
      <div className="home-section-title"><div><small>{copy("SEYAHATTE İŞE YARAR", "USEFUL ON THE ROAD")}</small><h2>{copy("Yanındaki akıllı araçlar", "Smart tools at your side")}</h2></div></div>
      <div className="home-live-grid">{liveTools.map((tool) => <button key={tool.titleEn} onClick={() => onNavigate(tool.view)}><span><Icon name={tool.icon} size={22} /></span><strong>{locale === "tr" ? tool.titleTr : tool.titleEn}</strong><small>{locale === "tr" ? tool.textTr : tool.textEn}</small><Icon name="chevron" size={15} /></button>)}</div>
    </section>

    <section className="home-world-now">
      <div className="home-world-heading"><span><i /> {copy("DÜNYADA NELER OLUYOR?", "WHAT'S HAPPENING AROUND THE WORLD?")}</span><button onClick={() => onNavigate("events")}>{copy("Tümünü gör", "See all")}</button></div>
      {event ? <button className="home-event-card" onClick={() => onNavigate("events")}>
        <span className="home-event-date"><strong>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit" }).format(new Date(event.startsAt))}</strong><small>{new Intl.DateTimeFormat(dateLocale, { month: "short" }).format(new Date(event.startsAt))}</small></span>
        <span><small>{event.city} · {event.category === "concert" ? copy("Konser", "Concert") : event.category === "sport" ? copy("Spor", "Sport") : copy("Etkinlik", "Event")}</small><strong>{event.title}</strong><em>{copy("Kaynak ve bilet ayrıntısını aç", "Open source and ticket details")}</em></span><Icon name="chevron" size={18} />
      </button> : <button className="home-event-empty" onClick={() => onNavigate("events")}><span><Icon name="calendar" size={23} /></span><div><strong>{copy("Tarihine göre etkinlik ara", "Search events for your dates")}</strong><small>{copy("Konser, festival, spor ve kültür", "Concerts, festivals, sport and culture")}</small></div><Icon name="chevron" size={17} /></button>}
    </section>

    <section className="home-discovery-row">
      <div><small>{copy("BUGÜNÜN FİKRİ", "TODAY'S IDEA")}</small><h2>{discovery.flag} {discovery.name}</h2><p>{discovery.tag} · {discovery.entry}</p></div>
      <button onClick={() => onNavigate("explore")}>{copy("İncele", "Explore")} <Icon name="chevron" size={16} /></button>
    </section>

    <button className="home-surprise-v14" onClick={surprise}><span><Icon name="sparkles" size={25} /></span><div><small>{copy("KARAR VEREMİYOR MUSUN?", "CAN'T DECIDE?")}</small><strong>{copy("Tercihlerini seç, seni şaşırtalım", "Choose your preferences and let us surprise you")}</strong></div><Icon name="chevron" size={18} /></button>

    <div className="home-mini-stats" aria-label={copy("Kayıtların", "Your saved items")}><button onClick={() => onNavigate("trips")}><strong>{routes.length}</strong><span>{copy("Rota", "Routes")}</span></button><button onClick={() => onNavigate("explore")}><strong>{favorites.length}</strong><span>{copy("Favori", "Favourites")}</span></button><button onClick={() => onNavigate("events")}><strong>{savedEvents.length}</strong><span>{copy("Etkinlik", "Events")}</span></button></div>
  </div>;
}
