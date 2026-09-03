import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { DISCOVERY_DESTINATIONS, dailyDiscovery, localizedDiscovery, type DiscoveryDestination } from "../data/discovery";
import { COUNTRY_LIST } from "../data/countries";
import { profileIdToAlpha3, profileIdsForAlpha3 } from "../data/countryCodes";
import { destinationArtwork } from "../data/artwork";
import { randomRoute, routeByDestinationCode } from "../data/routes";
import {
  addRecentDestination,
  getFavoriteDestinations,
  setFavoriteDestinations,
  toggleFavoriteDestination,
} from "../lib/storage";
import { getSupabaseDataErrorMessage, getUserProfile, updateUserProfile } from "../lib/supabaseData";
import { useI18n } from "../lib/i18n";
import type { RouteSuggestion, ViewId } from "../types";

const categories = ["Tümü", "Vizesiz", "Şehir", "Deniz", "Uzak rota"] as const;

export function ExploreScreen({ ownerId, accessToken, onNavigate, onSurprise, onBuildRoute, onNotice }: {
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onBuildRoute: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, locale } = useI18n();
  const [category, setCategory] = useState<(typeof categories)[number]>("Tümü");
  const [favorites, setFavorites] = useState(() => getFavoriteDestinations(ownerId));
  const [remoteWishlist, setRemoteWishlist] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<DiscoveryDestination | null>(null);
  const featured = localizedDiscovery(dailyDiscovery(), locale);

  useEffect(() => {
    const refreshFavorites = () => setFavorites(getFavoriteDestinations(ownerId));
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshFavorites();
    };

    refreshFavorites();
    window.addEventListener("l2t:storage-change", refreshFavorites);
    window.addEventListener("storage", refreshFavorites);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("l2t:storage-change", refreshFavorites);
      window.removeEventListener("storage", refreshFavorites);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [ownerId]);

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
      if (active) onNotice(getSupabaseDataErrorMessage(error, copy("Favoriler web hesabından alınamadı.", "Favourites could not be loaded from your web account.")));
    });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, ownerId]);

  const destinations = useMemo(() => DISCOVERY_DESTINATIONS.filter((destination) => {
    if (category === "Tümü") return true;
    if (category === "Vizesiz") return destination.entry === "Vizesiz" || destination.entry === "Kimlikle";
    return destination.tag.toLocaleLowerCase("tr-TR").includes(category.toLocaleLowerCase("tr-TR"));
  }).map((destination) => localizedDiscovery(destination, locale)), [category, locale]);

  const surprise = () => {
    const route = randomRoute(locale);
    onSurprise(route);
    onNotice(copy(`${route.name} senin için seçildi.`, `${route.name} was picked for you.`));
  };

  const toggleFavorite = async (destination: DiscoveryDestination) => {
    if (favoriteBusy) return;
    const previous = getFavoriteDestinations(ownerId);
    const next = toggleFavoriteDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setFavorites(next);
    const saved = next.some((item) => item.alpha3 === destination.alpha3);
    if (!ownerId || !accessToken) {
      onNotice(saved ? copy(`${destination.country} favorilerine eklendi.`, `${destination.country} added to favourites.`) : copy(`${destination.country} favorilerden çıkarıldı.`, `${destination.country} removed from favourites.`));
      return;
    }
    setFavoriteBusy(destination.alpha3);
    try {
      const updated = await updateUserProfile(ownerId, {
        wishlistCountries: profileIdsForAlpha3(remoteWishlist, next.map((item) => item.alpha3)),
      }, accessToken);
      if (!updated) throw new Error("profile missing");
      setRemoteWishlist(updated.wishlistCountries);
      onNotice(saved ? copy(`${destination.country} web hesabınla eşitlendi.`, `${destination.country} synced with your web account.`) : copy(`${destination.country} favorilerden çıkarıldı.`, `${destination.country} removed from favourites.`));
    } catch (error) {
      setFavoriteDestinations(previous, ownerId);
      setFavorites(previous);
      onNotice(getSupabaseDataErrorMessage(error, copy("Favori kaydedilemedi; değişiklik geri alındı.", "The favourite could not be saved; the change was reverted.")));
    } finally {
      setFavoriteBusy("");
    }
  };

  const openDetails = (destination: DiscoveryDestination) => {
    addRecentDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setSelectedDestination(destination);
  };

  const buildRoute = (destination: DiscoveryDestination) => {
    const route = routeByDestinationCode(destination.code, locale) || {
      name: destination.name,
      country: destination.country,
      cityOrRegion: destination.name,
      destinationCode: destination.code,
      why: destination.description,
      visaStatus: destination.entry,
      estimatedBudget: destination.budget,
      idealDuration: copy("4–6 gün", "4–6 days"),
      bestFor: destination.tag,
      difficulty: copy("Orta", "Moderate"),
      firstTimeFriendly: true,
      transportEase: copy("Planlamaya göre değişir", "Depends on your plan"),
      safetyNote: copy("Güncel yerel koşulları ve resmî seyahat duyurularını yola çıkmadan önce kontrol et.", "Check current local conditions and official travel notices before departure."),
      scores: { budget: 8, visaEase: destination.entry === "Vizesiz" || destination.entry === "Kimlikle" ? 10 : 7, firstTime: 8, transport: 7, overall: 84 },
      dailyPlan: destination.highlights.map((highlight, index) => copy(`${index + 1}. Gün: ${highlight}.`, `Day ${index + 1}: ${highlight}.`)),
      warnings: [copy("Giriş koşullarını ve rezervasyonlarını seyahatten önce resmî kaynaklardan doğrula.", "Verify entry requirements and bookings with official sources before travel.")],
    };
    setSelectedDestination(null);
    onBuildRoute(route);
  };

  return <div className="screen explore-screen">
    <section className="page-intro explore-intro">
      <span className="page-icon"><Icon name="compass" size={28} /></span>
      <div><small>{copy("DÜNYANI GENİŞLET", "EXPAND YOUR WORLD")}</small><h1>{copy("Keşfet", "Discover")}</h1><p>{copy("Pasaportuna, bütçene ve merakına göre yeni rotalar bul.", "Find destinations that fit your passport, budget and curiosity.")}</p></div>
    </section>

    <section className="explore-actions" aria-label={copy("Keşif araçları", "Discovery tools")}>
      <button onClick={() => onNavigate("passport")}><span><Icon name="passport" size={22} /></span><strong>{copy("Pasaport Gücü", "Passport Power")}</strong><small>{copy("Giriş durumları", "Entry rules")}</small></button>
      <button onClick={surprise}><span><Icon name="sparkles" size={22} /></span><strong>{copy("Beni Şaşırt", "Surprise Me")}</strong><small>{copy("Akıllı rota", "Smart route")}</small></button>
      <button onClick={() => onNavigate("events")}><span><Icon name="calendar" size={22} /></span><strong>{copy("Etkinlik Radarı", "Event Radar")}</strong><small>{copy("Konser ve festival", "Concerts & festivals")}</small></button>
      <button onClick={() => onNavigate("companion")}><span><Icon name="globe" size={22} /></span><strong>{copy("Yol Yardımcısı", "Travel Companion")}</strong><small>{copy("Şimdi, dil, kurallar", "Now, phrases, rules")}</small></button>
    </section>

    <section className="daily-discovery" style={{ backgroundImage: `linear-gradient(125deg,rgba(7,27,51,.92),rgba(7,27,51,.34)),url(${destinationArtwork(featured.code)})` }}>
      <div className="daily-discovery-copy">
        <span>{copy("GÜNÜN KEŞFİ", "TODAY'S DISCOVERY")} · {featured.entry}</span>
        <h2>{featured.flag} {featured.name}</h2>
        <p>{featured.description}</p>
        <button onClick={() => openDetails(featured)}>{copy("Ayrıntıları gör", "View details")} <Icon name="chevron" size={17} /></button>
      </div>
      <span className="daily-globe"><Icon name="globe" size={70} /></span>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><span>{copy("İLHAM PANOSU", "INSPIRATION")}</span><h2>{copy("Sana göre rotalar", "Routes for you")}</h2></div><small className="favorite-count"><Icon name="heart" size={14} /> {favorites.length}</small></div>
      <div className="chip-scroll explore-filter" role="group" aria-label={copy("Rotaları kategoriye göre filtrele", "Filter routes by category")}>
        {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{copy(item, ({ "Tümü": "All", "Vizesiz": "Visa-free", "Şehir": "City", "Deniz": "Coast", "Uzak rota": "Long-haul" } as const)[item])}</button>)}
      </div>
      <div className="discovery-grid">
        {destinations.map((destination) => {
          const favorite = favorites.some((item) => item.alpha3 === destination.alpha3);
          return <article className="discovery-card" key={destination.alpha3}>
            <div className="discovery-visual" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.08),rgba(7,27,51,.88)),url(${destinationArtwork(destination.code)})` }}>
              <span className="destination-flag">{destination.flag}</span>
              <button className={favorite ? "favorite active" : "favorite"} disabled={Boolean(favoriteBusy)} onClick={() => void toggleFavorite(destination)} aria-label={favorite ? copy("Favorilerden çıkar", "Remove from favourites") : copy("Favorilere ekle", "Add to favourites")}>{favoriteBusy === destination.alpha3 ? <span className="button-loader" /> : <Icon name="heart" size={17} />}</button>
              <small>{destination.entry}</small>
              <h3>{destination.name}</h3>
              <p>{destination.country}</p>
            </div>
            <div className="discovery-body"><span>{destination.tag}</span><button onClick={() => openDetails(destination)} aria-label={copy(`${destination.name} ayrıntılarını aç`, `Open ${destination.name} details`)}>{copy("İncele", "View")} <Icon name="chevron" size={15} /></button></div>
          </article>;
        })}
      </div>
    </section>

    <Sheet open={Boolean(selectedDestination)} title={copy("Rota ayrıntıları", "Route details")} onClose={() => setSelectedDestination(null)} size="large">
      {selectedDestination && <div className="destination-detail">
        <div className="destination-detail-hero" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.08),rgba(7,27,51,.9)),url(${destinationArtwork(selectedDestination.code)})` }}>
          <span>{selectedDestination.entry} · {selectedDestination.tag}</span>
          <div><small>{selectedDestination.flag} {selectedDestination.country}</small><h3>{selectedDestination.name}</h3><p>{selectedDestination.description}</p></div>
        </div>
        <div className="destination-facts">
          <div><span><Icon name="calendar" size={17} /></span><small>{copy("En iyi dönem", "Best season")}</small><strong>{selectedDestination.bestMonths}</strong></div>
          <div><span><Icon name="wallet" size={17} /></span><small>{copy("Bütçe profili", "Budget profile")}</small><strong>{selectedDestination.budget}</strong></div>
        </div>
        <section className="destination-highlights"><small>{copy("ÖNE ÇIKANLAR", "HIGHLIGHTS")}</small><div>{selectedDestination.highlights.map((highlight) => <span key={highlight}><Icon name="check" size={14} />{highlight}</span>)}</div></section>
        <section className="destination-tip"><span><Icon name="sparkles" size={19} /></span><div><small>{copy("YEREL PLANLAMA NOTU", "LOCAL PLANNING NOTE")}</small><p>{selectedDestination.localTip}</p></div></section>
        <p className="destination-disclaimer"><Icon name="info" size={14} /> {copy("Giriş koşulları değişebilir; seyahatten önce resmî kaynağı doğrula.", "Entry rules can change; verify the official source before travel.")}</p>
        <div className="destination-detail-actions">
          <button className="secondary-wide" disabled={Boolean(favoriteBusy)} aria-pressed={favorites.some((item) => item.alpha3 === selectedDestination.alpha3)} onClick={() => void toggleFavorite(selectedDestination)}><Icon name="heart" size={18} /> {favorites.some((item) => item.alpha3 === selectedDestination.alpha3) ? copy("Favorilerden çıkar", "Remove favourite") : copy("Favoriye ekle", "Add favourite")}</button>
          <button className="primary-wide" onClick={() => buildRoute(selectedDestination)}><Icon name="route" size={18} /> {copy("Bu rotayı planla", "Plan this route")}</button>
        </div>
      </div>}
    </Sheet>
  </div>;
}
