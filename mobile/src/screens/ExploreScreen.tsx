import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { DISCOVERY_DESTINATIONS, dailyDiscovery, type DiscoveryDestination } from "../data/discovery";
import { COUNTRY_LIST } from "../data/countries";
import { profileIdToAlpha3, profileIdsForAlpha3 } from "../data/countryCodes";
import { destinationArtwork } from "../data/artwork";
import { randomRoute } from "../data/routes";
import {
  addRecentDestination,
  getFavoriteDestinations,
  setFavoriteDestinations,
  toggleFavoriteDestination,
} from "../lib/storage";
import { getSupabaseDataErrorMessage, getUserProfile, updateUserProfile } from "../lib/supabaseData";
import type { RouteSuggestion, ViewId } from "../types";

const categories = ["Tümü", "Vizesiz", "Şehir", "Deniz", "Uzak rota"] as const;

export function ExploreScreen({ ownerId, accessToken, onNavigate, onSurprise, onNotice }: {
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const [category, setCategory] = useState<(typeof categories)[number]>("Tümü");
  const [favorites, setFavorites] = useState(() => getFavoriteDestinations(ownerId));
  const [remoteWishlist, setRemoteWishlist] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<DiscoveryDestination | null>(null);
  const featured = dailyDiscovery();

  useEffect(() => {
    let active = true;
    setFavorites(getFavoriteDestinations(ownerId));
    setRemoteWishlist([]);
    if (!ownerId || !accessToken) return () => { active = false; };
    void getUserProfile(ownerId, accessToken).then((profile) => {
      if (!active || !profile) return;
      const remote = profile.wishlistCountries.flatMap((id) => {
        const alpha3 = profileIdToAlpha3(id);
        const country = COUNTRY_LIST.find((item) => item.alpha3 === alpha3);
        return country ? [{ ...country, createdAt: new Date(0).toISOString() }] : [];
      });
      const merged = [...remote, ...getFavoriteDestinations(ownerId)].filter((item, index, all) => all.findIndex((other) => other.alpha3 === item.alpha3) === index);
      setFavoriteDestinations(merged, ownerId);
      setFavorites(merged);
      setRemoteWishlist(profile.wishlistCountries);
      const nextIds = profileIdsForAlpha3(profile.wishlistCountries, merged.map((item) => item.alpha3));
      if (JSON.stringify(nextIds) !== JSON.stringify(profile.wishlistCountries)) {
        void updateUserProfile(ownerId, { wishlistCountries: nextIds }, accessToken).then((updated) => {
          if (active && updated) setRemoteWishlist(updated.wishlistCountries);
        }).catch(() => undefined);
      }
    }).catch((error) => {
      if (active) onNotice(getSupabaseDataErrorMessage(error, "Favoriler web hesabından alınamadı."));
    });
    return () => { active = false; };
  }, [accessToken, onNotice, ownerId]);

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

  const toggleFavorite = async (destination: DiscoveryDestination) => {
    if (favoriteBusy) return;
    const previous = getFavoriteDestinations(ownerId);
    const next = toggleFavoriteDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setFavorites(next);
    const saved = next.some((item) => item.alpha3 === destination.alpha3);
    if (!ownerId || !accessToken) {
      onNotice(saved ? `${destination.country} favorilerine eklendi.` : `${destination.country} favorilerden çıkarıldı.`);
      return;
    }
    setFavoriteBusy(destination.alpha3);
    try {
      const updated = await updateUserProfile(ownerId, {
        wishlistCountries: profileIdsForAlpha3(remoteWishlist, next.map((item) => item.alpha3)),
      }, accessToken);
      if (!updated) throw new Error("profile missing");
      setRemoteWishlist(updated.wishlistCountries);
      onNotice(saved ? `${destination.country} web hesabınla eşitlendi.` : `${destination.country} favorilerden çıkarıldı.`);
    } catch (error) {
      setFavoriteDestinations(previous, ownerId);
      setFavorites(previous);
      onNotice(getSupabaseDataErrorMessage(error, "Favori kaydedilemedi; değişiklik geri alındı."));
    } finally {
      setFavoriteBusy("");
    }
  };

  const openDetails = (destination: DiscoveryDestination) => {
    addRecentDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setSelectedDestination(destination);
  };

  return <div className="screen explore-screen">
    <section className="page-intro explore-intro">
      <span className="page-icon"><Icon name="compass" size={28} /></span>
      <div><small>DÜNYANI GENİŞLET</small><h1>Keşfet</h1><p>Pasaportuna, bütçene ve merakına göre yeni rotalar bul.</p></div>
    </section>

    <section className="explore-actions" aria-label="Keşif araçları">
      <button onClick={() => onNavigate("passport")}><span><Icon name="passport" size={22} /></span><strong>Pasaport Gücü</strong><small>Giriş durumları</small></button>
      <button onClick={surprise}><span><Icon name="sparkles" size={22} /></span><strong>Beni Şaşırt</strong><small>Rastgele rota</small></button>
    </section>

    <section className="daily-discovery" style={{ backgroundImage: `linear-gradient(125deg,rgba(7,27,51,.92),rgba(7,27,51,.34)),url(${destinationArtwork(featured.code)})` }}>
      <div className="daily-discovery-copy">
        <span>GÜNÜN KEŞFİ · {featured.entry}</span>
        <h2>{featured.flag} {featured.name}</h2>
        <p>{featured.description}</p>
        <button onClick={() => openDetails(featured)}>Ayrıntıları gör <Icon name="chevron" size={17} /></button>
      </div>
      <span className="daily-globe"><Icon name="globe" size={70} /></span>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><span>İLHAM PANOSU</span><h2>Sana göre rotalar</h2></div><small className="favorite-count"><Icon name="heart" size={14} /> {favorites.length}</small></div>
      <div className="chip-scroll explore-filter" role="group" aria-label="Rotaları kategoriye göre filtrele">
        {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="discovery-grid">
        {destinations.map((destination) => {
          const favorite = favorites.some((item) => item.alpha3 === destination.alpha3);
          return <article className="discovery-card" key={destination.alpha3}>
            <div className="discovery-visual" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.08),rgba(7,27,51,.88)),url(${destinationArtwork(destination.code)})` }}>
              <span className="destination-flag">{destination.flag}</span>
              <button className={favorite ? "favorite active" : "favorite"} disabled={Boolean(favoriteBusy)} onClick={() => void toggleFavorite(destination)} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}>{favoriteBusy === destination.alpha3 ? <span className="button-loader" /> : <Icon name="heart" size={17} />}</button>
              <small>{destination.entry}</small>
              <h3>{destination.name}</h3>
              <p>{destination.country}</p>
            </div>
            <div className="discovery-body"><span>{destination.tag}</span><button onClick={() => openDetails(destination)} aria-label={`${destination.name} ayrıntılarını aç`}>İncele <Icon name="chevron" size={15} /></button></div>
          </article>;
        })}
      </div>
    </section>

    <Sheet open={Boolean(selectedDestination)} title="Rota ayrıntıları" onClose={() => setSelectedDestination(null)} size="large">
      {selectedDestination && <div className="destination-detail">
        <div className="destination-detail-hero" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.08),rgba(7,27,51,.9)),url(${destinationArtwork(selectedDestination.code)})` }}>
          <span>{selectedDestination.entry} · {selectedDestination.tag}</span>
          <div><small>{selectedDestination.flag} {selectedDestination.country}</small><h3>{selectedDestination.name}</h3><p>{selectedDestination.description}</p></div>
        </div>
        <div className="destination-facts">
          <div><span><Icon name="calendar" size={17} /></span><small>En iyi dönem</small><strong>{selectedDestination.bestMonths}</strong></div>
          <div><span><Icon name="wallet" size={17} /></span><small>Bütçe profili</small><strong>{selectedDestination.budget}</strong></div>
        </div>
        <section className="destination-highlights"><small>ÖNE ÇIKANLAR</small><div>{selectedDestination.highlights.map((highlight) => <span key={highlight}><Icon name="check" size={14} />{highlight}</span>)}</div></section>
        <section className="destination-tip"><span><Icon name="sparkles" size={19} /></span><div><small>YEREL PLANLAMA NOTU</small><p>{selectedDestination.localTip}</p></div></section>
        <p className="destination-disclaimer"><Icon name="info" size={14} /> Giriş koşulları değişebilir; seyahatten önce resmî kaynağı doğrula.</p>
        <button className="primary-wide" disabled={Boolean(favoriteBusy)} aria-pressed={favorites.some((item) => item.alpha3 === selectedDestination.alpha3)} onClick={() => void toggleFavorite(selectedDestination)}><Icon name="heart" size={18} /> {favorites.some((item) => item.alpha3 === selectedDestination.alpha3) ? "Favorilerden çıkar" : "Favoriye ekle"}</button>
      </div>}
    </Sheet>
  </div>;
}
