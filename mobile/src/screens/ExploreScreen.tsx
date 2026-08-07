import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { DISCOVERY_DESTINATIONS, dailyDiscovery, type DiscoveryDestination } from "../data/discovery";
import { randomRoute } from "../data/routes";
import {
  addRecentDestination,
  getFavoriteDestinations,
  toggleFavoriteDestination,
} from "../lib/storage";
import type { RouteSuggestion, ViewId } from "../types";

const categories = ["Tümü", "Vizesiz", "Şehir", "Deniz", "Uzak rota"] as const;

export function ExploreScreen({ ownerId, onNavigate, onSurprise, onFlightSearch, onNotice }: {
  ownerId?: string | null;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onFlightSearch: (destination: DiscoveryDestination) => void;
  onNotice: (message: string) => void;
}) {
  const [category, setCategory] = useState<(typeof categories)[number]>("Tümü");
  const [favorites, setFavorites] = useState(() => getFavoriteDestinations(ownerId));
  const featured = dailyDiscovery();

  useEffect(() => setFavorites(getFavoriteDestinations(ownerId)), [ownerId]);

  const destinations = useMemo(() => DISCOVERY_DESTINATIONS.filter((destination) => {
    if (category === "Tümü") return true;
    if (category === "Vizesiz") return destination.entry === "Vizesiz" || destination.entry === "Kimlikle";
    return destination.tag.toLocaleLowerCase("tr-TR").includes(category.toLocaleLowerCase("tr-TR"));
  }), [category]);

  const surprise = () => {
    const route = randomRoute();
    onSurprise(route);
    onNotice(`${route.name} senin için seçildi.`);
  };

  const toggleFavorite = (destination: DiscoveryDestination) => {
    const next = toggleFavoriteDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setFavorites(next);
    const saved = next.some((item) => item.alpha3 === destination.alpha3);
    onNotice(saved ? `${destination.country} favorilerine eklendi.` : `${destination.country} favorilerden çıkarıldı.`);
  };

  const openFlight = (destination: DiscoveryDestination) => {
    addRecentDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    onFlightSearch(destination);
  };

  return <div className="screen explore-screen">
    <section className="page-intro explore-intro">
      <span className="page-icon"><Icon name="compass" size={28} /></span>
      <div><small>DÜNYANI GENİŞLET</small><h1>Keşfet</h1><p>Pasaportuna, bütçene ve merakına göre yeni rotalar bul.</p></div>
    </section>

    <section className="explore-actions" aria-label="Keşif araçları">
      <button onClick={() => onNavigate("passport")}><span><Icon name="passport" size={22} /></span><strong>Pasaport Gücü</strong><small>Giriş durumları</small></button>
      <button onClick={surprise}><span><Icon name="sparkles" size={22} /></span><strong>Beni Şaşırt</strong><small>Rastgele rota</small></button>
      <button onClick={() => onNavigate("search")}><span><Icon name="plane" size={22} /></span><strong>Bilet Ara</strong><small>Canlı uçuşlar</small></button>
    </section>

    <section className="daily-discovery" style={{ background: featured.gradient }}>
      <div className="daily-discovery-copy">
        <span>GÜNÜN KEŞFİ · {featured.entry}</span>
        <h2>{featured.flag} {featured.name}</h2>
        <p>{featured.description}</p>
        <button onClick={() => openFlight(featured)}>Uçuşlara bak <Icon name="chevron" size={17} /></button>
      </div>
      <span className="daily-globe"><Icon name="globe" size={70} /></span>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><span>İLHAM PANOSU</span><h2>Sana göre rotalar</h2></div><small className="favorite-count"><Icon name="heart" size={14} /> {favorites.length}</small></div>
      <div className="chip-scroll explore-filter">
        {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="discovery-grid">
        {destinations.map((destination) => {
          const favorite = favorites.some((item) => item.alpha3 === destination.alpha3);
          return <article className="discovery-card" key={destination.alpha3}>
            <div className="discovery-visual" style={{ background: destination.gradient }}>
              <span className="destination-flag">{destination.flag}</span>
              <button className={favorite ? "favorite active" : "favorite"} onClick={() => toggleFavorite(destination)} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Icon name="heart" size={17} /></button>
              <small>{destination.entry}</small>
              <h3>{destination.name}</h3>
              <p>{destination.country}</p>
            </div>
            <div className="discovery-body"><span>{destination.tag}</span><button onClick={() => openFlight(destination)}>Keşfet <Icon name="chevron" size={15} /></button></div>
          </article>;
        })}
      </div>
    </section>
  </div>;
}
