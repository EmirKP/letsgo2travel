import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { TravelToolArtwork } from "../components/TravelToolArtwork";
import { PageHero } from "../components/PageHero";
import { CountryFlag } from "../components/CountryFlag";
import { CountryPicker } from "../components/CountryPicker";
import { DestinationSearchFallback } from "../components/DestinationSearchFallback";
import { DestinationPhoto } from "../components/DestinationPhoto";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { Sheet } from "../components/Sheet";
import { DISCOVERY_DESTINATIONS, dailyDiscovery, localizedDiscovery, type DiscoveryDestination } from "../data/discovery";
import { profileIdsForAlpha3 } from "../data/countryCodes";
import { randomRoute, routeByDestinationCode } from "../data/routes";
import { homeSearchDestinations } from "../data/homeDestinations";
import { reconcileProfileCountries } from "../lib/profileCountries";
import { pendingProfileWrites, trackProfileWrite } from "../lib/profileSync";
import { onAccountResume } from "../lib/accountResume";
import { normalizeSearchText } from "../lib/searchText";
import {
  addRecentDestination,
  getFavoriteDestinations,
  getPendingGuestDataSync,
  setFavoriteDestinations,
  toggleFavoriteDestination,
} from "../lib/storage";
import { getSupabaseDataErrorMessage, getUserProfile, updateUserProfile } from "../lib/supabaseData";
import { useI18n } from "../lib/i18n";
import type { RouteSuggestion, ViewId } from "../types";

import { usePassportPreference } from "../hooks/usePassportPreference";
import { hasPassportPreference, preferredEntry } from "../lib/passportPreference";
import { PASSPORTS } from "../../../lib/country-intelligence/passports";
import passportIndex from "../data/passport-index.json";
import { plannerPassportLabel } from "../../../lib/planner-passport";
import { appRegionName } from "../lib/localeFormatting";
import { useActiveTripContext } from "../lib/activeTripContext";
import type { JourneyArea } from "../lib/mapJourneyClient";
import "./explore-reference.css";
import "../components/feature-entry-artwork.css";

const categories = ["Tümü", "Vizesiz", "Şehir", "Deniz", "Uzak rota"] as const;

export function ExploreScreen({ initialDestinationCode, initialSearchQuery = "", searchRequestId = 0, ownerId, accessToken, onNavigate, onSurprise, onBuildRoute, onNotice, onPlanPlace, onOpenCountryGuide, onOpenCountryEvents, savedRouteIds = [], onToggleSaved, onOpenSavedRoute }: {
  initialDestinationCode?: string;
  initialSearchQuery?: string;
  searchRequestId?: number;
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onBuildRoute: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
  onPlanPlace?: (name: string, area?: JourneyArea) => void;
  onOpenCountryGuide?: (alpha3: string) => void;
  onOpenCountryEvents?: (alpha2: string, city?: string) => void;
  savedRouteIds?: string[];
  onToggleSaved?: (route: RouteSuggestion, passport?: { passportCountry?: string; passportType?: string }) => void;
  onOpenSavedRoute?: (destinationCode: string) => void;
}) {
  const { copy, locale } = useI18n();
  const preference = usePassportPreference();
  const passportSelected = hasPassportPreference(preference);
  const [passportEditorOpen, setPassportEditorOpen] = useState(false);
  const [passportDraft, setPassportDraft] = useState({ country: preference.country, type: preference.type });
  const [passportError, setPassportError] = useState(false);
  const passportOptions = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    return Object.keys(PASSPORTS).map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const activeTrip = useActiveTripContext(ownerId);
  const travelDate = activeTrip?.startDate;
  const entryFor = (destination: DiscoveryDestination) => preferredEntry(preference, alpha2FromAlpha3(destination.alpha3), locale, travelDate);
  const withEntry = (destination: DiscoveryDestination) => ({ ...localizedDiscovery(destination, locale), entry: passportSelected ? entryFor(destination).label : copy('Pasaport seçilmedi', 'Passport not selected', 'Pasaporta nuk është zgjedhur') });
  const [category, setCategory] = useState<(typeof categories)[number]>("Tümü");
  const [query, setQuery] = useState(initialSearchQuery);
  const searchInput = useRef<HTMLInputElement>(null);
  const [favorites, setFavorites] = useState(() => getFavoriteDestinations(ownerId));
  const [favoritesReady, setFavoritesReady] = useState(!ownerId);
  const [favoritesRetry, setFavoritesRetry] = useState(0);
  const [favoritesError, setFavoritesError] = useState(false);
  const [remoteWishlist, setRemoteWishlist] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const favoriteWrite = useRef<Promise<unknown> | null>(null);
  const [selectedDestinationValue, setSelectedDestination] = useState<DiscoveryDestination | null>(() => { const item = DISCOVERY_DESTINATIONS.find(item => item.code === initialDestinationCode || item.alpha3 === initialDestinationCode); return item ? localizedDiscovery(item, locale) : null; });
  const [viewedCountry, setViewedCountry] = useState("");
  const selectedDestination = selectedDestinationValue ? withEntry(selectedDestinationValue) : null;
  const featured = withEntry(dailyDiscovery());
  const handledDestinationCode = useRef(initialDestinationCode);
  const handledSearch = useRef({ query: initialSearchQuery, requestId: searchRequestId });

  useEffect(() => {
    // Activity reconnects effects on return; only a new Home request replaces
    // a query the user has edited while exploring.
    if (handledSearch.current.query === initialSearchQuery && handledSearch.current.requestId === searchRequestId) return;
    handledSearch.current = { query: initialSearchQuery, requestId: searchRequestId };
    setQuery(initialSearchQuery);
    setCategory("Tümü");
    if (searchRequestId) setSelectedDestination(null);
  }, [initialSearchQuery, searchRequestId]);

  useEffect(() => {
    if (!initialDestinationCode) {
      handledDestinationCode.current = "";
      return;
    }
    if (handledDestinationCode.current === initialDestinationCode) return;
    handledDestinationCode.current = initialDestinationCode;
    const item = DISCOVERY_DESTINATIONS.find(destination => destination.code === initialDestinationCode || destination.alpha3 === initialDestinationCode);
    if (item) setSelectedDestination(localizedDiscovery(item, locale));
  }, [initialDestinationCode, locale]);

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
    setFavoritesReady(!ownerId);
    setFavoritesError(false);
    if (!ownerId || !accessToken) return () => { active = false; };
    const refresh = async () => {
      // Token refresh and Activity return may reconnect while a save is pending.
      const pending = pendingProfileWrites(ownerId);
      if (pending) await pending;
      if (!active) return;
      const profile = await getUserProfile(ownerId, accessToken);
      if (!active) return;
      if (!profile) throw new Error("profile missing");
      const merged = reconcileProfileCountries(profile.wishlistCountries, getFavoriteDestinations(ownerId), Boolean(getPendingGuestDataSync(ownerId)?.profile));
      setFavoriteDestinations(merged, ownerId);
      setFavorites(merged);
      setRemoteWishlist(profile.wishlistCountries);
      setFavoritesReady(true);
    };
    void refresh().catch((error) => {
      if (active) setFavoritesError(true);
      if (active) onNotice(getSupabaseDataErrorMessage(error, copy("Favoriler web hesabından alınamadı.", "Favourites could not be loaded from your web account.")));
    });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, ownerId, favoritesRetry]);

  useEffect(() => onAccountResume(() => {
    if (ownerId && accessToken && !favoriteBusy) setFavoritesRetry(value => value + 1);
  }), [ownerId, accessToken, favoriteBusy]);

  const search = normalizeSearchText(query);
  const destinations = useMemo(() => DISCOVERY_DESTINATIONS.filter((destination) => {
    if (search) {
      const names = (["tr", "en", "sq", "ro"] as const).flatMap(language => {
        const local = localizedDiscovery(destination, language);
        return [local.name, local.country];
      });
      if (destination.code === "TIA") names.push("Tiranë");
      return normalizeSearchText([...names, destination.code, destination.alpha3].join(" ")).includes(search);
    }
    if (category === "Tümü") return true;
    if (category === "Vizesiz") return preferredEntry(preference, alpha2FromAlpha3(destination.alpha3), locale, travelDate).visaFree;
    return destination.tag.toLocaleLowerCase("tr-TR").includes(category.toLocaleLowerCase("tr-TR"));
  }).map((destination) => ({ ...localizedDiscovery(destination, locale), entry: passportSelected ? preferredEntry(preference, alpha2FromAlpha3(destination.alpha3), locale, travelDate).label : copy('Pasaport seçilmedi', 'Passport not selected', 'Pasaporta nuk është zgjedhur') })), [category, copy, locale, passportSelected, preference.country, preference.type, search, travelDate]);
  const searchRoutes = useMemo(() => {
    if (!search) return [];
    const home = homeSearchDestinations(locale);
    const homeTr = homeSearchDestinations("tr");
    const homeEn = homeSearchDestinations("en");
    const homeSq = homeSearchDestinations("sq");
    const all = [...home, ...["FCO", "DXB", "BKK"].flatMap(code => {
      const route = routeByDestinationCode(code, locale);
      return route ? [route] : [];
    })];
    const codes = new Set(DISCOVERY_DESTINATIONS.map(item => item.code));
    return all.filter(route => {
      const code = route.destinationCode;
      if (!code || codes.has(code)) return false;
      codes.add(code);
      const tr = homeTr.find(item => item.destinationCode === code) || routeByDestinationCode(code, "tr");
      const en = homeEn.find(item => item.destinationCode === code) || routeByDestinationCode(code, "en");
      const sq = homeSq.find(item => item.destinationCode === code) || routeByDestinationCode(code, "sq");
      return normalizeSearchText([route, tr, en, sq].flatMap(item => item ? [item.name, item.country, item.cityOrRegion] : []).concat(code).join(" ")).includes(search);
    });
  }, [locale, search]);
  const discoveryState = !search ? "idle" : destinations.length ? "ready" : searchRoutes.length ? "route-only" : "empty";
  const passportLabel = plannerPassportLabel({ passportCountry: preference.country, passportType: preference.type }, locale,
    preference.country ? appRegionName(preference.country, locale) : undefined);

  const surprise = () => {
    const route = randomRoute(locale);
    onSurprise(route);
    onNotice(copy(`${route.name} senin için seçildi.`, `${route.name} was picked for you.`, `${route.name} u zgjodh për ty.`));
  };

  const toggleFavorite = async (destination: DiscoveryDestination) => {
    if (favoriteWrite.current || favoriteBusy) return;
    if (ownerId && !favoritesReady) {
      if (favoritesError) setFavoritesRetry(value => value + 1);
      onNotice(copy("Favorilerin yükleniyor. Biraz sonra tekrar dene.", "Your favourites are loading. Please try again shortly.", "Të preferuarat po ngarkohen. Provo sërish pas pak."));
      return;
    }
    const previous = getFavoriteDestinations(ownerId);
    const next = toggleFavoriteDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setFavorites(next);
    const saved = next.some((item) => item.alpha3 === destination.alpha3);
    if (!ownerId || !accessToken) {
      onNotice(saved ? copy(`${destination.country} favorilerine eklendi.`, `${destination.country} added to favourites.`, `${destination.country} u shtua te të preferuarat.`) : copy(`${destination.country} favorilerden çıkarıldı.`, `${destination.country} removed from favourites.`, `${destination.country} u hoq nga të preferuarat.`));
      return;
    }
    setFavoriteBusy(destination.alpha3);
    try {
      const pending = trackProfileWrite(ownerId, updateUserProfile(ownerId, {
        wishlistCountries: profileIdsForAlpha3(remoteWishlist, next.map((item) => item.alpha3)),
      }, accessToken));
      favoriteWrite.current = pending;
      const updated = await pending;
      if (!updated) throw new Error("profile missing");
      setRemoteWishlist(updated.wishlistCountries);
      onNotice(saved ? copy(`${destination.country} web hesabınla eşitlendi.`, `${destination.country} synced with your web account.`, `${destination.country} u sinkronizua me llogarinë tënde në web.`) : copy(`${destination.country} favorilerden çıkarıldı.`, `${destination.country} removed from favourites.`, `${destination.country} u hoq nga të preferuarat.`));
    } catch (error) {
      setFavoriteDestinations(previous, ownerId);
      setFavorites(previous);
      onNotice(getSupabaseDataErrorMessage(error, copy("Favori kaydedilemedi; değişiklik geri alındı.", "The favourite could not be saved; the change was reverted.")));
    } finally {
      favoriteWrite.current = null;
      setFavoriteBusy("");
    }
  };

  const openDetails = (destination: DiscoveryDestination) => {
    addRecentDestination({ alpha3: destination.alpha3, name: destination.country }, ownerId);
    setViewedCountry(destination.alpha3);
    setSelectedDestination(destination);
    setPassportEditorOpen(false);
    setPassportError(false);
  };

  const catalogRouteFor = (destination: DiscoveryDestination) => routeByDestinationCode(destination.code, locale) || homeSearchDestinations(locale).find(route => route.destinationCode === destination.code);
  const saveCatalogRoute = (route: RouteSuggestion) => onToggleSaved?.(route, { passportCountry: preference.country, passportType: preference.type });
  const withRouteEntry = (route: RouteSuggestion, destination: DiscoveryDestination): RouteSuggestion => ({ ...route, visaStatus: entryFor(destination).label, visaNote: !passportSelected ? copy("Pasaport seçilmedi; seyahatten önce giriş koşullarını doğrula.", "Passport not selected; verify entry conditions before travelling.", "Pasaporta nuk është zgjedhur; verifiko kushtet e hyrjes përpara udhëtimit.") : copy(`Seçili pasaport: ${preference.country} (${preference.type}). Keşif verisi: ${passportIndex.asOf}; güncel koşulları resmî kaynaktan doğrula.`, `Selected passport: ${preference.country} (${preference.type}). Discovery data: ${passportIndex.asOf}; verify current official entry rules.`, `Pasaporta e zgjedhur: ${preference.country} (${preference.type}). Të dhënat e zbulimit: ${passportIndex.asOf}; verifiko kushtet aktuale të hyrjes në burimet zyrtare.`), visaVerifiedAt: null, visaSourceUrl: undefined, verifiedEntryStatus: undefined });
  const openPassportEditor = () => { setPassportDraft({ country: preference.country, type: preference.type }); setPassportError(false); setPassportEditorOpen(true); };

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
      dailyPlan: destination.highlights.map((highlight, index) => copy(`${index + 1}. Gün: ${highlight}.`, `Day ${index + 1}: ${highlight}.`, `Dita ${index + 1}: ${highlight}.`)),
      warnings: [copy("Giriş koşullarını ve rezervasyonlarını seyahatten önce resmî kaynaklardan doğrula.", "Verify entry requirements and bookings with official sources before travel.")],
    };
    setSelectedDestination(null);
    onBuildRoute(withRouteEntry(route, destination));
  };

  const discoveryActions = <section className="explore-actions" aria-label={copy("Keşif araçları", "Discovery tools", "Mjetet e zbulimit")}>
      {!search && <>
      <button onClick={() => onNavigate("passport")}><span className="explore-feature-artwork"><TravelToolArtwork kind="passport" size={64} /></span><strong>{copy("Pasaport Gücü", "Passport Power")}</strong><small>{copy("Giriş durumları", "Entry rules")}</small></button>
      <button onClick={surprise}><span className="explore-feature-artwork"><TravelToolArtwork kind="explore" size={64} /></span><strong>{copy("Beni Şaşırt", "Surprise Me")}</strong><small>{copy("Akıllı rota", "Smart route")}</small></button>
      <button onClick={() => onNavigate("events")}><span className="explore-feature-artwork"><TravelToolArtwork kind="events" size={64} /></span><strong>{copy("Etkinlik Radarı", "Event Radar")}</strong><small>{copy("Konser ve festival", "Concerts & festivals")}</small></button>
      <button onClick={() => onNavigate("companion")}><span className="explore-feature-artwork"><TravelToolArtwork kind="tools" size={64} /></span><strong>{copy("Yol Yardımcısı", "Travel Companion")}</strong><small>{copy("Şimdi, dil, kurallar", "Now, phrases, rules")}</small></button>
      </>}
      <button type="button" onClick={() => onNavigate("country-news")}><span className="explore-feature-artwork"><TravelToolArtwork kind="globe" size={64}/></span><strong>{copy("Ülke Gündemi", "Country Updates", "Lajme nga shtetet")}</strong><small>{copy("Haberler ve seyahat uyarıları", "News and travel advice", "Lajme dhe këshilla udhëtimi")}</small></button>
      <button type="button" onClick={() => onNavigate("costs")}><span className="explore-feature-artwork"><TravelToolArtwork kind="money" size={64}/></span><strong>{copy("Ülke Maliyetleri", "Country Costs", "Kostot sipas shtetit")}</strong><small>{copy("Şehirlere göre bütçeni hazırla", "Plan your budget by city", "Planifiko buxhetin sipas qytetit")}</small></button>
    </section>;

  const selectedCatalogRoute = selectedDestination ? catalogRouteFor(selectedDestination) : undefined;
  const selectedRouteSaved = Boolean(selectedCatalogRoute?.destinationCode && savedRouteIds.includes(selectedCatalogRoute.destinationCode));
  return <div className={`screen explore-screen${search ? " explore-searching" : ""}`}>
    {search ? <header className="explore-search-heading"><h1>{copy("Şehir ve ülke keşfet", "Explore cities and countries", "Eksploro qytete dhe shtete")}</h1></header> : <PageHero scene="coast" title={copy("Rotaları keşfet", "Explore destinations")} subtitle={copy("Dünyanın bir yerinde, yeni hikâyen seni bekliyor.", "Your next story is waiting somewhere in the world.")} />}

    <label className="discovery-search"><Icon name="search" size={19}/><span className="sr-only">{copy("Şehir veya ülke ara", "Search cities or countries", "Kërko qytete ose shtete")}</span><input data-guide="explore-search" data-guide-complete={search.length >= 2 && destinations.length > 0 ? "true" : "false"} data-guide-discovery={discoveryState} data-guide-return-complete={viewedCountry && !selectedDestination && !favoriteBusy && favorites.some(item => item.alpha3 === viewedCountry) ? "true" : "false"} ref={searchInput} type="search" aria-controls="explore-search-results" value={query} maxLength={120} placeholder={copy("Şehir veya ülke ara…", "Search a city or country…", "Kërko qytet ose shtet…")} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" className="icon-button compact" style={{ minWidth: 44, minHeight: 44 }} onClick={() => { setQuery(""); searchInput.current?.focus(); }} aria-label={copy("Aramayı temizle", "Clear search", "Pastro kërkimin")}><Icon name="close" size={18}/></button>}</label>

    {!search && discoveryActions}

    {!search && <section className="daily-discovery"><DestinationPhoto code={featured.code} countryCode={alpha2FromAlpha3(featured.alpha3)} label={featured.name}/>
      <div className="daily-discovery-copy">
        <span>{copy("GÜNÜN KEŞFİ", "TODAY'S DISCOVERY")} · {featured.entry}</span>
        <h2><CountryFlag code={alpha2FromAlpha3(featured.alpha3)} label={featured.country} /> {featured.name}</h2>
        <p>{featured.description}</p>
        <button onClick={() => openDetails(featured)}>{copy("Ayrıntıları gör", "View details")} <Icon name="chevron" size={17} /></button>
      </div>
      <span className="daily-globe"><Icon name="globe" size={70} /></span>
    </section>}

    <section className="section-block" id="explore-search-results">
      <div className="section-heading"><div><span>{copy("İLHAM PANOSU", "INSPIRATION", "FRYMËZIM")}</span><h2>{search ? copy("Arama sonuçları", "Search results", "Rezultatet e kërkimit") : copy("Sana göre rotalar", "Routes for you", "Itinerare për ty")}</h2></div><small className="favorite-count"><Icon name="heart" size={14} /> {copy("Favori ülkeler", "Favourite countries", "Shtetet e preferuara")}: {favorites.length}</small></div>
      {search && <p role="status">{copy(`“${query.trim()}” için ${destinations.length + searchRoutes.length} hazır rota bulundu.`, `${destinations.length + searchRoutes.length} ready-made routes found for “${query.trim()}”.`, `U gjetën ${destinations.length + searchRoutes.length} itinerare të gatshme për “${query.trim()}”.`)}</p>}
      <button type="button" className="secondary-wide explore-passport-context" onClick={() => onNavigate("passport")}><span>{copy("Pasaportun", "Your passport", "Pasaporta jote")}:</span><strong>{passportLabel}</strong><span>{copy("Değiştir", "Change", "Ndrysho")}</span></button>
      {!search && <div className="chip-scroll explore-filter" role="group" aria-label={copy("Rotaları kategoriye göre filtrele", "Filter routes by category")}>
        {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{copy(item, ({ "Tümü": "All", "Vizesiz": "Visa-free", "Şehir": "City", "Deniz": "Coast", "Uzak rota": "Long-haul" } as const)[item], ({ "Tümü": "Të gjitha", "Vizesiz": "Pa vizë", "Şehir": "Qytet", "Deniz": "Bregdet", "Uzak rota": "Destinacione të largëta" } as const)[item])}</button>)}
      </div>}
      <div className="discovery-grid">
        {destinations.map((destination) => {
          const favorite = favorites.some((item) => item.alpha3 === destination.alpha3);
          return <article className="discovery-card" key={destination.alpha3}>
            <div className="discovery-visual"><DestinationPhoto code={destination.code} countryCode={alpha2FromAlpha3(destination.alpha3)} label={destination.name}/>
              <span className="destination-flag"><CountryFlag code={alpha2FromAlpha3(destination.alpha3)} label={destination.country} /></span>
              <button className={favorite ? "favorite active" : "favorite"} disabled={Boolean(favoriteBusy)} onClick={() => void toggleFavorite(destination)} aria-label={favorite ? copy(`${destination.country} ülkesini favorilerden çıkar`, `Remove ${destination.country} from favourite countries`, `Hiq ${destination.country} nga shtetet e preferuara`) : copy(`${destination.country} ülkesini favorilere ekle`, `Add ${destination.country} to favourite countries`, `Shto ${destination.country} te shtetet e preferuara`)}>{favoriteBusy === destination.alpha3 ? <span className="button-loader" /> : <Icon name="heart" size={17} />}</button>
              <small>{destination.entry}</small>
              <h3>{destination.name}</h3>
              <p>{destination.country}</p>
            </div>
            <div className="discovery-body"><span>{destination.tag}</span><button data-guide="explore-place" onClick={() => openDetails(destination)} aria-label={copy(`${destination.name} ayrıntılarını aç`, `Open ${destination.name} details`, `Hap hollësitë për ${destination.name}`)}>{copy("İncele", "View", "Shiko")} <Icon name="chevron" size={15} /></button></div>
          </article>;
        })}
        {searchRoutes.map(route => <article className="discovery-card" key={route.destinationCode}>
          <div className="discovery-visual"><DestinationPhoto code={route.destinationCode} label={route.name}/><h3>{route.name}</h3><p>{route.country}</p></div>
          <div className="discovery-body"><span>{route.idealDuration}</span><button type="button" onClick={() => onBuildRoute(route)} aria-label={copy(`${route.name} rotasını planla`, `Plan ${route.name}`, `Planifiko ${route.name}`)}>{copy("Planla", "Plan", "Planifiko")}<Icon name="chevron" size={15}/></button></div>
          {onToggleSaved && <div className="discovery-route-save"><button type="button" aria-pressed={savedRouteIds.includes(route.destinationCode || '')} onClick={() => saveCatalogRoute(route)}><Icon name={savedRouteIds.includes(route.destinationCode || '') ? 'check' : 'bookmark'} size={16}/>{savedRouteIds.includes(route.destinationCode || '') ? copy('Rota kaydedildi', 'Itinerary saved', 'Itinerari u ruajt') : copy('Rotayı kaydet', 'Save itinerary', 'Ruaj itinerarin')}</button>{savedRouteIds.includes(route.destinationCode || '') && onOpenSavedRoute && <button type="button" onClick={() => onOpenSavedRoute(route.destinationCode!)}>{copy('Kaydedilen rotayı aç', 'Open saved itinerary', 'Hap itinerarin e ruajtur')}<Icon name="chevron" size={15}/></button>}</div>}
        </article>)}
      </div>
      {search && !destinations.length && !searchRoutes.length && <div className="discovery-search-empty"><DestinationSearchFallback query={query} onPlanPlace={(name, area) => { if (onPlanPlace) onPlanPlace(name, area); else onNavigate("route"); }} onOpenCountryGuide={code => { if (onOpenCountryGuide) onOpenCountryGuide(code); else onNavigate("country-news"); }} onOpenCountryEvents={onOpenCountryEvents}/><p>{copy("Bu arama için hazır rotamız henüz yok. Farklı bir şehir veya ülke deneyebilir ya da tercihlerine göre rota oluşturabilirsin.", "We don't have a ready-made route for this search yet. Try another city or country, or create a route around your preferences.", "Ende nuk kemi itinerar të gatshëm për këtë kërkim. Provo një qytet ose shtet tjetër, ose krijo një itinerar sipas preferencave të tua.")}</p><button type="button" className="secondary-wide" onClick={() => { setQuery(copy("Tiran", "Tirana", "Tiranë")); searchInput.current?.focus(); }}>{copy("Tiran ile dene", "Try Tirana", "Provo Tiranën")}</button><button type="button" className="secondary-wide" onClick={() => { if (onPlanPlace) onPlanPlace(query.trim()); else onNavigate("route"); }}><Icon name="route" size={18}/>{copy("Tercihlerimle rota oluştur", "Create a route for me", "Krijo itinerar për mua")}</button></div>}
    </section>

    {search && discoveryActions}

    <Sheet open={Boolean(selectedDestination)} title={copy("Rota ayrıntıları", "Route details")} onClose={() => setSelectedDestination(null)} size="large">
      {selectedDestination && <div className="destination-detail">
        <div className="destination-detail-hero"><DestinationPhoto code={selectedDestination.code} countryCode={alpha2FromAlpha3(selectedDestination.alpha3)} label={selectedDestination.name}/>
          <span>{selectedDestination.entry} · {selectedDestination.tag}</span>
          <div><small><CountryFlag code={alpha2FromAlpha3(selectedDestination.alpha3)} label={selectedDestination.country} /> {selectedDestination.country}</small><h3>{selectedDestination.name}</h3><p>{selectedDestination.description}</p></div>
        </div>
        <section className="destination-passport-inline" aria-label={copy('Pasaport ve giriş durumu', 'Passport and entry status', 'Pasaporta dhe kushtet e hyrjes')}>
          {!passportSelected ? <p><Icon name="passport" size={19}/><span>{copy('Giriş durumunu görmek için seyahatte kullanacağın pasaportu seç.', 'Choose the passport you will use to see entry conditions.', 'Zgjidh pasaportën që do të përdorësh për të parë kushtet e hyrjes.')}</span></p> : <p><Icon name="passport" size={19}/><span>{passportLabel}</span></p>}
          {!passportEditorOpen && <button type="button" className="secondary-wide" onClick={openPassportEditor}>{passportSelected ? copy('Pasaportu değiştir', 'Change passport', 'Ndrysho pasaportën') : copy('Pasaport seç', 'Choose passport', 'Zgjidh pasaportën')}</button>}
          {passportEditorOpen && <form onSubmit={event => { event.preventDefault(); if (!hasPassportPreference(passportDraft)) return; if (!preference.setPreference(passportDraft.country, passportDraft.type)) { setPassportError(true); return; } setPassportEditorOpen(false); setPassportError(false); }}>
            <CountryPicker value={passportDraft.country} options={passportOptions} label={copy('Pasaportu düzenleyen ülke', 'Passport issuing country', 'Shteti që lëshon pasaportën')} placeholder={copy('Ülke seç', 'Choose country', 'Zgjidh shtetin')} onChange={country => { setPassportDraft(current => ({ ...current, country })); setPassportError(false); }}/>
            <label>{copy('Pasaport türü', 'Passport type', 'Lloji i pasaportës')}<select value={passportDraft.type} onChange={event => { setPassportDraft(current => ({ ...current, type: event.target.value })); setPassportError(false); }}><option value="">{copy('Tür seç', 'Choose type', 'Zgjidh llojin')}</option><option value="ordinary">{copy('Umuma mahsus (normal)', 'Ordinary (regular)', 'E zakonshme')}</option><option value="special">{copy('Hususi', 'Special', 'Speciale')}</option><option value="service">{copy('Hizmet', 'Service', 'Shërbimi')}</option><option value="diplomatic">{copy('Diplomatik', 'Diplomatic', 'Diplomatike')}</option></select></label>
            {passportError && <p role="alert">{copy('Pasaportun kaydedilemedi. Tekrar dene; önceki seçimin korundu.', 'Your passport choice could not be saved. Retry; your previous choice is kept.', 'Zgjedhja e pasaportës nuk u ruajt. Provo sërish; zgjedhja e mëparshme ruhet.')}</p>}
            <div className="destination-passport-actions"><button type="submit" className="primary-wide" disabled={!hasPassportPreference(passportDraft)}>{copy('Pasaportu kaydet', 'Save passport', 'Ruaj pasaportën')}</button><button type="button" className="secondary-wide" onClick={() => { setPassportEditorOpen(false); setPassportError(false); }}>{copy('Vazgeç', 'Cancel', 'Anulo')}</button></div>
          </form>}
        </section>
        <div className="destination-facts">
          <div><span><Icon name="calendar" size={17} /></span><small>{copy("En iyi dönem", "Best season")}</small><strong>{selectedDestination.bestMonths}</strong></div>
          <div><span><Icon name="wallet" size={17} /></span><small>{copy("Bütçe profili", "Budget profile")}</small><strong>{selectedDestination.budget}</strong></div>
        </div>
        <section className="destination-highlights"><small>{copy("ÖNE ÇIKANLAR", "HIGHLIGHTS")}</small><div>{selectedDestination.highlights.map((highlight) => <span key={highlight}><Icon name="check" size={14} />{highlight}</span>)}</div></section>
        <section className="destination-tip"><span><Icon name="sparkles" size={19} /></span><div><small>{copy("YEREL PLANLAMA NOTU", "LOCAL PLANNING NOTE")}</small><p>{selectedDestination.localTip}</p></div></section>
        <p className="destination-disclaimer"><Icon name="info" size={14} /> {copy("Giriş koşulları değişebilir; seyahatten önce resmî kaynağı doğrula.", "Entry rules can change; verify the official source before travel.")}</p>
        <button type="button" data-guide="explore-back" className="secondary-wide" onClick={() => setSelectedDestination(null)}><Icon name="back" size={18}/>{copy("Keşfe dön", "Back to exploring", "Kthehu te eksplorimi")}</button>
        <div className="destination-detail-actions">
          {selectedCatalogRoute && onToggleSaved && <button type="button" className="secondary-wide destination-save-route" aria-pressed={selectedRouteSaved} aria-label={selectedRouteSaved ? copy('Rotayı kayıtlardan çıkar', 'Remove saved itinerary', 'Hiq itinerarin e ruajtur') : copy('Rotayı kaydet', 'Save itinerary', 'Ruaj itinerarin')} onClick={() => saveCatalogRoute(withRouteEntry(selectedCatalogRoute, selectedDestination))}><Icon name={selectedRouteSaved ? 'check' : 'bookmark'} size={18}/>{selectedRouteSaved ? copy('Rota kaydedildi', 'Itinerary saved', 'Itinerari u ruajt') : copy('Rotayı kaydet', 'Save itinerary', 'Ruaj itinerarin')}</button>}
          {selectedRouteSaved && onOpenSavedRoute && <button type="button" className="secondary-wide destination-open-route" onClick={() => { setSelectedDestination(null); onOpenSavedRoute(selectedCatalogRoute!.destinationCode!); }}>{copy('Kaydedilen rotayı aç', 'Open saved itinerary', 'Hap itinerarin e ruajtur')}<Icon name="chevron" size={17}/></button>}
          <button data-guide="explore-save" className="secondary-wide destination-save-country" disabled={Boolean(favoriteBusy)} aria-busy={Boolean(favoriteBusy)} aria-pressed={favorites.some((item) => item.alpha3 === selectedDestination.alpha3)} onClick={() => void toggleFavorite(selectedDestination)}><Icon name="heart" size={18} /> {favorites.some((item) => item.alpha3 === selectedDestination.alpha3) ? copy(`${selectedDestination.country} ülkesini favorilerden çıkar`, `Remove ${selectedDestination.country} from favourite countries`, `Hiq ${selectedDestination.country} nga shtetet e preferuara`) : copy(`${selectedDestination.country} ülkesini favorilere ekle`, `Add ${selectedDestination.country} to favourite countries`, `Shto ${selectedDestination.country} te shtetet e preferuara`)}</button>
          <button className="primary-wide" onClick={() => buildRoute(selectedDestination)}><Icon name="route" size={18} /> {copy("Bu rotayı planla", "Plan this route")}</button>
        </div>
      </div>}
    </Sheet>
  </div>;
}
