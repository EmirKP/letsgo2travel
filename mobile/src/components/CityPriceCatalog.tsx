import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CITY_BENCHMARKS, CITY_PRICE_SOURCE } from "../../../lib/country-intelligence/city-benchmarks";
import { BUDGET_CURRENCIES, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";
import { minimumBudgetRooms, personalBudgetDuration, personalTripBudget, validatePersonalBudget, type BudgetRange } from "../../../lib/country-intelligence/personal-budget";
import { routeCityBenchmark } from "../../../lib/country-intelligence/route-budget";
import { useI18n } from "../lib/i18n";
import { appRegionName } from "../lib/localeFormatting";
import { bundledImageSource } from "../lib/bundledImageSource";
import { budgetDestinationSuggestions, matchesBudgetDestination, type BudgetDestinationSuggestion } from "../lib/budgetDestinationSearch";
import { activityAllowanceFromGbp, activityAllowanceToGbp } from "../lib/budgetActivityInput";
import { openExternal } from "../lib/native";
import { useActiveTripContext } from "../lib/activeTripContext";
import { useDailyBudgetRate } from "../lib/useDailyBudgetRate";
import { readPersonalBudgetPreferences, savePersonalBudgetPreferences, type PersonalBudgetPreferences } from "../lib/personalBudgetPreferences";
import { createPersonalBudgetCockpitIntent, type BudgetCockpitIntent } from "../lib/budgetCockpitIntent";
import { Sheet } from "./Sheet";
import { CountryFlag } from "./CountryFlag";
import { CountryAdvisory } from "./CountryAdvisory";
import { Icon } from "./Icon";
import { DestinationPhoto } from "./DestinationPhoto";
import { BUDGET_CITY_PHOTOS } from "../data/budgetCityPhotos";
import hotelImage from "../assets/budget/hotel-v2.webp";
import apartmentImage from "../assets/budget/apartment-v2.webp";
import hostelImage from "../assets/budget/hostel-v2.webp";
import economicalComfortImage from "../assets/budget/comfort-economical-v2.webp";
import standardComfortImage from "../assets/budget/comfort-standard-v2.webp";
import premiumComfortImage from "../assets/budget/comfort-comfort-v2.webp";
import "./city-budget.css";

const CITY_PHOTOS: Record<string, string> = { "FR-paris": "PAR", "IT-rome": "FCO", "AL-tirana": "TIA", "RS-belgrade": "BEG", "BA-sarajevo": "SJJ" };

export function CityPriceCatalog({ onOpenCountryNews, ownerId, onPrepareCockpitBudget }: { onOpenCountryNews: (code: string) => void; ownerId?: string | null; onPrepareCockpitBudget?: (intent: BudgetCockpitIntent) => void }) {
  const { copy, locale } = useI18n();
  const [preferences, setPreferences] = useState(() => readPersonalBudgetPreferences(ownerId));
  const [query, setQuery] = useState("");
  const [quickCity, setQuickCity] = useState<string | null>(null);
  const [quickCountry, setQuickCountry] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [limit, setLimit] = useState(8);
  const [sort, setSort] = useState("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appliedTripId, setAppliedTripId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"dates" | "party" | null>(null);
  const editorSnapshot = useRef<{ ownerId: string | null; preferences: PersonalBudgetPreferences } | null>(null);
  const [activityDraft, setActivityDraft] = useState<{ value: string; canonical: string; currency: BudgetCurrency; rate: number } | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const suggestionsList = useRef<HTMLDivElement>(null);
  const durationControl = useRef<HTMLButtonElement>(null);
  const configSection = useRef<HTMLElement>(null);
  const actionBar = useRef<HTMLDivElement>(null);
  const [configInView, setConfigInView] = useState(true);
  const [resultsInView, setResultsInView] = useState(false);
  useEffect(() => {
    const section = configSection.current;
    if (!section || typeof IntersectionObserver === 'undefined' || !document.querySelector('.editorial-app.view-costs')) return;
    const observer = new IntersectionObserver(([entry]) => setConfigInView(entry.isIntersecting), { rootMargin: '-80px 0px -164px 0px' });
    observer.observe(section);
    const resultsObserver = new IntersectionObserver(([entry]) => setResultsInView(entry.isIntersecting), { rootMargin: '-80px 0px -164px 0px' });
    if (resultsHeading.current) resultsObserver.observe(resultsHeading.current);
    return () => { observer.disconnect(); resultsObserver.disconnect(); };
  }, []);
  useEffect(() => {
    const bar = actionBar.current;
    if (!bar) return;
    const navigation = document.querySelector('.editorial-app .bottom-nav');
    if (!navigation) return;
    const updateOffset = () => bar.style.setProperty('--budget-navigation-offset', `${Math.ceil(navigation.getBoundingClientRect().height) + 8}px`);
    updateOffset();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateOffset);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, []);
  const activeTrip = useActiveTripContext(ownerId);
  const { quote, rate, loading: rateLoading, failed: rateFailed } = useDailyBudgetRate(preferences.currency);
  const activityCurrency = rate === null ? "GBP" : preferences.currency;
  const activityRate = rate ?? 1;
  const activityAmount = activityDraft?.canonical === preferences.activityAllowance && activityDraft.currency === activityCurrency && activityDraft.rate === activityRate ? activityDraft.value : activityAllowanceFromGbp(preferences.activityAllowance, activityRate);
  const textLocale = locale === "tr" ? "tr" : "en";
  const money = (value: number, currency = "GBP") => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  const displayMoney = (value: number) => money(value * (rate ?? 1), rate === null ? "GBP" : preferences.currency);
  const displayRange = (range: BudgetRange) => `${displayMoney(range.low)} – ${displayMoney(range.high)}`;
  const update = (next: Partial<PersonalBudgetPreferences>, recalculateRooms = false) => setPreferences(previous => {
    const value = { ...previous, ...next };
    if (recalculateRooms) { const minimum = minimumBudgetRooms(value); if (minimum !== null) value.rooms = String(minimum); }
    savePersonalBudgetPreferences(value, ownerId); return value;
  });
  const duration = personalBudgetDuration(preferences);
  const error = validatePersonalBudget(preferences);
  const describeError = (error: ReturnType<typeof validatePersonalBudget>) => error === "dates" ? copy("1–30 gün seç veya geçerli bir gidiş ve dönüş tarihi gir.", "Choose 1–30 whole days or enter valid departure and return dates.", "Zgjidh 1–30 ditë të plota ose vendos data të vlefshme nisjeje dhe kthimi.")
    : error === "party" ? copy("En az 1 yetişkin ve toplam en fazla 20 kişi gir.", "Enter at least 1 adult and no more than 20 travellers in total.", "Vendos të paktën 1 të rritur dhe jo më shumë se 20 persona gjithsej.")
    : error === "rooms" ? copy(`Bu oda türü için en az ${minimumBudgetRooms(preferences)} oda gerekir.`, `This room type needs at least ${minimumBudgetRooms(preferences)} rooms.`, `Ky lloj dhome kërkon të paktën ${minimumBudgetRooms(preferences)} dhoma.`)
    : error ? copy("Etkinlik payı ve yedek bütçe için geçerli bir tutar gir.", "Enter a valid activity allowance and contingency percentage.", "Vendos një shumë të vlefshme për aktivitetet dhe përqindjen rezervë.") : null;
  const errorText = describeError(error);
  // Validate the open editor on its own: unfinished dates elsewhere must not
  // hide a missing traveller or room in this sheet.
  const partyError = editing === "party" ? validatePersonalBudget({ ...preferences, days: String(duration?.days || 3), startDate: "", endDate: "" }) : null;
  const editorError = editing === "dates" && !duration ? "dates" : editing === "party" && (partyError === "party" || partyError === "rooms") ? partyError : null;
  const editorInvalid = editorError !== null;
  const openEditor = (kind: "dates" | "party") => {
    editorSnapshot.current = { ownerId: ownerId ?? null, preferences: { ...preferences } };
    setEditing(kind);
  };
  const closeEditor = () => {
    const snapshot = editorSnapshot.current;
    if (editorInvalid && snapshot?.ownerId === (ownerId ?? null)) {
      const initial = snapshot.preferences;
      if (editing === "dates") update({ days: initial.days, startDate: initial.startDate, endDate: initial.endDate });
      else if (editing === "party") update({ adults: initial.adults, children: initial.children, rooms: initial.rooms });
    }
    editorSnapshot.current = null;
    setEditing(null);
  };
  const finishEditor = () => {
    if (editorInvalid) return;
    editorSnapshot.current = null;
    setEditing(null);
  };
  const rows = CITY_BENCHMARKS.filter(row => (!quickCity || row.id === quickCity) && (!quickCountry || row.code === quickCountry) && matchesBudgetDestination(row.id, query))
    .map(row => ({ row, budget: personalTripBudget(row, preferences) }))
    .sort((a, b) => sort === "name" ? a.row.city[textLocale].localeCompare(b.row.city[textLocale], locale) : ((a.budget?.total ?? 0) - (b.budget?.total ?? 0)) * (sort === "high" ? -1 : 1));
  const visible = rows.slice(0, limit);
  const selected = CITY_BENCHMARKS.find(row => row.id === selectedId);
  const selectedPhoto = selected ? BUDGET_CITY_PHOTOS[selected.id] : undefined;
  const selectedBudget = selected ? personalTripBudget(selected, preferences) : null;
  const activeBenchmark = activeTrip ? routeCityBenchmark({ name: activeTrip.city || activeTrip.title, cityOrRegion: activeTrip.city, country: activeTrip.countryCode }) : null;
  const hasDates = !!(preferences.startDate || preferences.endDate);
  const automaticSeason = personalTripBudget(CITY_BENCHMARKS[0], { ...preferences, season: "auto" })?.season;
  const automaticSeasonName = automaticSeason === "low" ? copy("Sakin", "Quiet", "E qetë") : automaticSeason === "high" ? copy("Yoğun", "Busy", "E ngarkuar") : automaticSeason === "normal" ? "Normal" : "";
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const durationSummary = duration ? hasDates
    ? `${dateFormat.format(new Date(`${preferences.startDate}T12:00:00Z`))} – ${dateFormat.format(new Date(`${preferences.endDate}T12:00:00Z`))}`
    : copy(`${duration.days} gün · ${duration.nights} gece`, `${duration.days} days · ${duration.nights} nights`, `${duration.days} ditë · ${duration.nights} net`)
    : copy("Süreyi veya tarihleri tamamla", "Complete duration or dates", "Plotëso kohëzgjatjen ose datat");
  const adultCount = Number(preferences.adults), childCount = Number(preferences.children), roomCount = Number(preferences.rooms);
  const partySummary = [copy(`${preferences.adults || "—"} yetişkin`, `${preferences.adults || "—"} ${adultCount === 1 ? "adult" : "adults"}`, `${preferences.adults || "—"} të rritur`),
    ...(childCount > 0 ? [copy(`${preferences.children} çocuk`, `${preferences.children} ${childCount === 1 ? "child" : "children"}`, `${preferences.children} fëmijë`)] : []),
    preferences.accommodation === "hostel" ? copy("Hostelde konaklama", "Hostel stay", "Qëndrim në hostel") : copy(`${preferences.rooms || "—"} oda`, `${preferences.rooms || "—"} ${roomCount === 1 ? "room" : "rooms"}`, `${preferences.rooms || "—"} ${roomCount === 1 ? "dhomë" : "dhoma"}`)].join(" · ");
  const accommodationOptions = [
    { value: "hostel", label: "Hostel", image: hostelImage },
    { value: "apartment", label: copy("Daire", "Apartment", "Apartament"), image: apartmentImage },
    { value: "hotel", label: copy("Otel", "Hotel", "Hotel"), image: hotelImage },
  ] as const;
  const comfortOptions = [
    { value: "economical", label: copy("Ekonomik", "Economical", "Ekonomik"), hint: copy("Hesaplı seçimler", "Budget-friendly", "Me kursim"), image: economicalComfortImage },
    { value: "standard", label: copy("Standart", "Standard", "Standard"), hint: copy("Dengeli bütçe", "Balanced budget", "E balancuar"), image: standardComfortImage },
    { value: "comfort", label: copy("Konfor", "Comfort", "Rehati"), hint: copy("Ekstra rahatlık", "Extra comfort", "Më shumë rehati"), image: premiumComfortImage },
  ] as const;
  const seasonOptions = [
    { value: "auto", label: copy("Tarihe göre", "By date", "Sipas datës"), shortLabel: automaticSeasonName ? copy(`Tarihe göre: ${automaticSeasonName}`, `By date: ${automaticSeasonName}`, `Sipas datës: ${automaticSeasonName}`) : copy("Tarihe göre", "By date", "Sipas datës"), demand: 0, hint: "" },
    { value: "low", label: copy("Sakin dönem", "Quiet period", "Periudhë e qetë"), shortLabel: copy("Sakin", "Quiet", "E qetë"), demand: 1, hint: copy("Sezon dışı", "Off-peak", "Jashtë sezonit") },
    { value: "normal", label: copy("Normal dönem", "Normal period", "Periudhë normale"), shortLabel: copy("Normal", "Normal", "Normal"), demand: 2, hint: copy("Normal talep", "Regular demand", "Kërkesë normale") },
    { value: "high", label: copy("Yoğun dönem", "Busy period", "Periudhë e ngarkuar"), shortLabel: copy("Yoğun", "Busy", "E ngarkuar"), demand: 3, hint: copy("Popüler dönem", "Peak period", "Kulmi i sezonit") },
  ] as const;
  const selects: { key: "roomType" | "food" | "transport" | "activities"; label: string; options: [string, string][]; hidden?: boolean; rooms?: boolean }[] = [
    { key: "roomType", label: copy("Oda türü", "Room type", "Lloji i dhomës"), rooms: true, hidden: preferences.accommodation === "hostel", options: [["single", copy("Tek · 1 kişi", "Single · 1 person", "Njëshe · 1 person")], ["double", copy("Çift · 2 kişi", "Double · 2 people", "Dyshe · 2 persona")], ["family", copy("Aile · en fazla 4 kişi", "Family · up to 4 people", "Familjare · deri në 4 persona")]] },
    { key: "food", label: copy("Yeme içme", "Food", "Ushqimi"), options: [["self-catering", copy("Market / kendim hazırlarım", "Groceries / self-catering", "Ushqimore / gatuaj vetë")], ["local", copy("Yerel ve pratik", "Local and casual", "Lokale dhe praktike")], ["restaurants", copy("Restoran ağırlıklı", "Mostly restaurants", "Kryesisht restorante")]] },
    { key: "transport", label: copy("Şehir içi ulaşım", "Local transport", "Transporti lokal"), options: [["walk", copy("Yürüyüş", "Walking", "Ecje")], ["public", copy("Toplu taşıma", "Public transport", "Transport publik")], ["taxi", copy("Taksi ağırlıklı", "Mostly taxis", "Kryesisht taksi")]] },
    { key: "activities", label: copy("Etkinlikler", "Activities", "Aktivitetet"), options: [["free", copy("Ücretsiz geziler", "Free sights", "Vizita falas")], ["mixed", copy("Ücretsiz + ücretli", "Free and paid", "Falas dhe me pagesë")], ["paid", copy("Müze / turlar", "Museums / tours", "Muze / ture")]] },
  ];
  const dailySummary = [
    preferences.food === "self-catering" ? copy("Market", "Groceries", "Ushqimore") : preferences.food === "restaurants" ? copy("Restoran", "Restaurants", "Restorante") : copy("Yerel yemek", "Local food", "Ushqim lokal"),
    preferences.transport === "walk" ? copy("Yürüyüş", "Walking", "Ecje") : preferences.transport === "taxi" ? copy("Taksi", "Taxis", "Taksi") : copy("Toplu taşıma", "Public transport", "Transport publik"),
  ].join(" · ");
  const suggestions = budgetDestinationSuggestions(query, locale);
  const suggestionsOpen = searchOpen && query.trim().length > 0;
  const chooseDestination = (suggestion: BudgetDestinationSuggestion) => {
    setQuery(suggestion.label);
    setQuickCity(suggestion.cityId ?? null);
    setQuickCountry(suggestion.kind === "country" ? suggestion.countryCode : null);
    setLimit(8);
    setSearchOpen(false);
    setActiveSuggestion(-1);
    requestAnimationFrame(() => {
      durationControl.current?.focus({ preventScroll: true });
    });
  };
  const missingBudgetText = (budget: NonNullable<ReturnType<typeof personalTripBudget>>) => budget.activities === null && budget.unpricedTaxi
    ? copy("Etkinlik ve taksi bütçesi eksik", "Activity and taxi budgets missing", "Mungojnë buxhetet e aktiviteteve dhe taksisë")
    : budget.activities === null ? copy("Etkinlik bütçesi eksik", "Activity budget missing", "Mungon buxheti i aktiviteteve")
    : budget.unpricedTaxi ? copy("Taksi bütçesi eksik", "Taxi budget missing", "Mungon buxheti i taksisë") : copy("Tahmini bütçe", "Estimated budget", "Buxhet i vlerësuar");
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape" && suggestionsOpen) { event.preventDefault(); event.stopPropagation(); }
      setSearchOpen(false); setActiveSuggestion(-1); return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setSearchOpen(true);
      const next = event.key === "ArrowDown" ? !suggestionsOpen || activeSuggestion < 0 ? 0 : (activeSuggestion + 1) % suggestions.length : !suggestionsOpen || activeSuggestion < 0 ? suggestions.length - 1 : (activeSuggestion + suggestions.length - 1) % suggestions.length;
      setActiveSuggestion(next);
      requestAnimationFrame(() => suggestionsList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter" && suggestionsOpen) {
      const option = suggestions[activeSuggestion] ?? (suggestions.length === 1 ? suggestions[0] : undefined);
      if (option) { event.preventDefault(); chooseDestination(option); }
    }
  };
  return <section className="ci-content ci-city-catalog budget-studio">
    <div className="budget-workbench">
      <section ref={configSection} className="budget-destination budget-config" aria-labelledby="budget-destination-title">
        <div className="budget-trip-entry">
        <div className="budget-section-heading"><h2 id="budget-destination-title">{copy("Nereye?", "Where to?", "Ku?")}</h2></div>
        <div className="budget-destination-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setSearchOpen(false); setActiveSuggestion(-1); } }}>
          <label className="budget-city-search"><Icon name="search" size={20}/><input type="search" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? "budget-destination-suggestions" : undefined} aria-activedescendant={suggestionsOpen && suggestions[activeSuggestion] ? `budget-destination-${suggestions[activeSuggestion].id}` : undefined} aria-label={copy("50 şehirde ara", "Search 50 cities", "Kërko në 50 qytete")} placeholder={copy("Şehir veya ülke ara", "Search a city or country", "Kërko qytet ose shtet")} value={query} onFocus={() => { setSearchOpen(true); setActiveSuggestion(-1); }} onKeyDown={onSearchKeyDown} onChange={e => { setQuery(e.target.value); setQuickCity(null); setQuickCountry(null); setLimit(8); setSearchOpen(true); setActiveSuggestion(-1); }}/></label>
          {suggestionsOpen && <div className="budget-destination-suggestions"><div ref={suggestionsList} className="budget-suggestion-list" role="listbox" id="budget-destination-suggestions" aria-label={copy("Ülke ve şehir önerileri", "Country and city suggestions", "Sugjerime shtetesh dhe qytetesh")}>{suggestions.map((suggestion, index) => <button type="button" role="option" id={`budget-destination-${suggestion.id}`} key={suggestion.id} tabIndex={-1} aria-label={`${suggestion.label} · ${suggestion.detail}`} aria-selected={activeSuggestion === index} onMouseDown={event => event.preventDefault()} onClick={() => chooseDestination(suggestion)}><span className="budget-suggestion-flag" aria-hidden="true"><CountryFlag code={suggestion.countryCode} label=""/></span><span className="budget-suggestion-copy"><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></span><Icon name="chevron" size={16}/></button>)}</div>{!suggestions.length && <p role="status">{copy("Bu ülke veya şehir için henüz fiyat verimiz yok.", "We do not have price data for this country or city yet.", "Nuk kemi ende të dhëna çmimesh për këtë shtet apo qytet.")}</p>}</div>}
        </div>
        {!query && <div className="budget-city-ideas" aria-label={copy("Bir şehirle başla", "Start with a city", "Fillo me një qytet")}>{[["Paris", "FR", "FR-paris"], [copy("Roma", "Rome", "Roma"), "IT", "IT-rome"], [copy("Tiran", "Tirana", "Tirana"), "AL", "AL-tirana"]].map(([name, code, cityId]) => <button type="button" key={code} onClick={() => { setQuery(name); setQuickCity(cityId); setQuickCountry(null); setSearchOpen(false); setActiveSuggestion(-1); setLimit(8); }}><span aria-hidden="true"><CountryFlag code={code} label=""/></span>{name}<Icon name="chevron" size={12}/></button>)}</div>}
        {activeTrip && <div className="budget-active-trip"><span><Icon name="calendar" size={19}/><strong>{activeTrip.title}</strong><small>{copy("Seçili seyahatin", "Your selected trip", "Udhëtimi yt i zgjedhur")}</small></span><button type="button" onClick={() => {
          const next: Partial<PersonalBudgetPreferences> = { startDate: activeTrip.startDate, endDate: activeTrip.endDate };
          if (activeTrip.adults !== undefined) next.adults = String(activeTrip.adults);
          if (activeTrip.children !== undefined) next.children = String(activeTrip.children);
          if (activeTrip.rooms !== undefined) next.rooms = String(activeTrip.rooms);
          if (BUDGET_CURRENCIES.includes(activeTrip.currency as BudgetCurrency)) next.currency = activeTrip.currency as BudgetCurrency;
          update(next, activeTrip.rooms === undefined); setAppliedTripId(activeTrip.tripId);
          setQuery(activeBenchmark?.city[textLocale] || ""); setQuickCity(null); setQuickCountry(null); setSearchOpen(false); setActiveSuggestion(-1); setLimit(8);
        }}>{copy("Bilgilerimi kullan", "Use trip details", "Përdor të dhënat")}</button></div>}
        {activeTrip && appliedTripId === activeTrip.tripId && <p className="budget-small-note" role="status">{copy("Seyahat bilgileri eklendi; tercihlerini değiştirebilirsin.", "Trip details applied; you can adjust your preferences.", "Të dhënat u shtuan; mund të ndryshosh preferencat.")}{!activeBenchmark && <> {copy("Bu şehir için araştırılmış fiyat yok. Karşılaştırma için başka bir şehir seç.", "No researched prices for this city. Choose another city for comparison.", "Nuk ka çmime të studiuara për këtë qytet. Zgjidh një tjetër për krahasim.")}</>}</p>}
        <div className="budget-config-choices" aria-label={copy("Hesaplamada kullanılacak seyahat bilgileri", "Trip details used in the estimate", "Të dhënat që përdoren në vlerësim")}>
          <button type="button" ref={durationControl} className="budget-config-row" onClick={() => openEditor("dates")} aria-label={copy("Süreyi ve tarihleri düzenle", "Edit duration and dates", "Ndrysho kohëzgjatjen dhe datat")} aria-describedby="budget-duration-summary">
            <span className="budget-config-text"><span><Icon name="calendar" size={15}/>{copy("Süre", "Duration", "Kohëzgjatja")}</span><strong id="budget-duration-summary">{durationSummary}</strong>{hasDates && duration && <small>{copy(`${duration.days} gün · ${duration.nights} gece`, `${duration.days} days · ${duration.nights} nights`, `${duration.days} ditë · ${duration.nights} net`)}</small>}</span><Icon name="chevron" size={18}/>
          </button>
          <button type="button" className="budget-config-row" onClick={() => openEditor("party")} aria-label={copy("Kişi ve odaları düzenle", "Edit travellers and rooms", "Ndrysho udhëtarët dhe dhomat")} aria-describedby="budget-party-summary">
            <span className="budget-config-text"><span><Icon name="users" size={15}/>{copy("Kişi / oda", "Guests / rooms", "Persona / dhoma")}</span><strong id="budget-party-summary">{partySummary}</strong></span><Icon name="chevron" size={18}/>
          </button>
        </div>
        </div>
        <fieldset className="budget-visible-options budget-accommodation-options">
          <legend>{copy("Konaklama", "Stay", "Akomodimi")}</legend>
          <div className="budget-stay-cards" role="group" aria-label={copy("Konaklama türü", "Accommodation type", "Lloji i akomodimit")}>
            {accommodationOptions.map(option => <button type="button" key={option.value} className={`budget-stay-card budget-stay-${option.value}`} aria-label={option.label} aria-pressed={preferences.accommodation === option.value} onClick={() => update({ accommodation: option.value }, true)}>
              <span className="budget-stay-photo" aria-hidden="true"><img src={bundledImageSource(option.image)} alt="" width="1024" height="1024" loading="lazy" decoding="async"/></span>
              <span className="budget-option-copy"><strong>{option.label}</strong>{option.value === "hostel" && <small>{copy("Paylaşımlı", "Shared", "E përbashkët")}</small>}</span>
              {preferences.accommodation === option.value && <span className="budget-option-check"><Icon name="check" size={12}/></span>}
            </button>)}
          </div>
          {preferences.accommodation === "hotel" && <div className="budget-hotel-class" role="group" aria-label={copy("Otel sınıfı", "Hotel category", "Kategoria e hotelit")}><span>{copy("Otel sınıfı", "Hotel category", "Kategoria e hotelit")}</span><div>{(["2", "3", "4", "5"] as const).map(stars => <button type="button" key={stars} aria-label={copy(`${stars} yıldızlı otel`, `${stars}-star hotel`, `Hotel me ${stars} yje`)} aria-pressed={preferences.stars === stars} onClick={() => update({ stars })}>{stars}<span aria-hidden="true">★</span></button>)}</div></div>}
          {selects.filter(field => field.rooms && !field.hidden).map(field => <label className="budget-room-type" key={field.key}><span>{field.label}</span><select value={preferences[field.key]} onChange={event => update({ roomType: event.target.value as PersonalBudgetPreferences["roomType"] }, true)}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
        </fieldset>
        <fieldset className="budget-visible-options budget-comfort-options">
          <legend>{copy("Harcama tarzı", "Spending style", "Stili i shpenzimeve")}</legend>
          <p className="budget-option-note">{copy("Konaklama, yemek ve ulaşım düzeyini etkiler.", "Sets accommodation, food and transport spending.", "Ndikon në akomodim, ushqim dhe transport.")}</p>
          <div className="budget-comfort-cards" role="group" aria-label={copy("Seyahat tarzı", "Travel style", "Stili i udhëtimit")}>
            {comfortOptions.map(option => <button type="button" key={option.value} aria-label={option.label} aria-pressed={preferences.style === option.value} onClick={() => update({ style: option.value })}><span className="budget-comfort-photo" aria-hidden="true"><img src={bundledImageSource(option.image)} alt="" width="640" height="480" loading="lazy" decoding="async"/></span><span className="budget-option-copy"><strong>{option.label}</strong><small>{option.hint}</small></span>{preferences.style === option.value && <span className="budget-option-check" aria-hidden="true"><Icon name="check" size={12}/></span>}</button>)}
          </div>
        </fieldset>
        <fieldset className="budget-visible-options budget-season-options">
          <legend>{copy("Sezon", "Season", "Sezoni")}</legend>
          <div className="budget-season-cards budget-season-choices" role="group" aria-label={copy("Sezon", "Season", "Sezoni")}>
            {seasonOptions.map(option => <button type="button" key={option.value} className={option.value === "auto" ? "budget-season-auto-option" : "budget-season-period"} aria-label={option.label} aria-pressed={preferences.season === option.value} onClick={() => update({ season: option.value })}>{option.value === "auto" ? <Icon name="calendar" size={15}/> : <span className="budget-season-demand" aria-hidden="true">{[1, 2, 3].map(level => <span key={level} className={level <= option.demand ? "is-active" : undefined}/>)}</span>}<span className="budget-option-copy"><strong>{option.shortLabel}</strong>{option.hint && <small>{option.hint}</small>}</span>{preferences.season === option.value && <span className="budget-season-tick" aria-hidden="true"><Icon name="check" size={12}/></span>}</button>)}
          </div>
          <label className="budget-holiday-option"><input type="checkbox" checked={preferences.holiday} onChange={e => update({ holiday: e.target.checked })}/><span>{copy("Tatil / büyük etkinlik dönemi", "Holiday / major event", "Festë / event i madh")}</span></label>
          {preferences.season === "auto" && <p className="budget-season-note">{hasDates ? copy("Genel takvim tahmini; yerel sezon farklı olabilir.", "General calendar estimate; local seasons may differ.", "Vlerësim sipas kalendarit; sezoni lokal mund të ndryshojë.") : copy("Tarih yoksa normal sezon kullanılır.", "Without dates, normal season is used.", "Pa data përdoret sezoni normal.")}</p>}
        </fieldset>
        <details className="budget-extra-options budget-food-options">
          <summary><Icon name="settings" size={18}/><span><strong>{copy("Yemek ve ulaşım", "Food and transport", "Ushqimi dhe transporti")}</strong><small>{dailySummary}</small></span><Icon name="chevron" size={17}/></summary>
          <div className="budget-controls budget-preference-grid">
            {selects.filter(field => field.key === "food" || field.key === "transport").map(field => <label key={field.key}>{field.label}<select value={preferences[field.key]} onChange={e => update({ [field.key]: e.target.value })}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
          </div>
        </details>
        <details className="budget-extra-options budget-additional-options">
          <summary><Icon name="wallet" size={18}/><span><strong>{copy("Etkinlik ve yedek bütçe", "Activities and contingency", "Aktivitete dhe rezervë")}</strong><small>{preferences.activities === "free" ? copy("Ücretsiz geziler", "Free sights", "Vizita falas") : activityAmount ? `${activityAmount} ${activityCurrency} / ${copy("kişi · gün", "person · day", "person · ditë")}` : copy("Etkinlik bütçesi ekle", "Add an activity budget", "Shto buxhet për aktivitetet")}</small></span><Icon name="chevron" size={17}/></summary>
          <div className="budget-controls budget-preference-grid">
            {selects.filter(field => field.key === "activities").map(field => <label key={field.key}>{field.label}<select value={preferences[field.key]} onChange={e => update({ activities: e.target.value as PersonalBudgetPreferences["activities"] })}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
            {preferences.activities !== "free" && <label>{copy(`Etkinlik payı · ${activityCurrency} / kişi / gün`, `Activity allowance · ${activityCurrency} / person / day`, `Aktivitete · ${activityCurrency} / person / ditë`)}<input type="number" aria-label={copy(`Etkinlik payı · ${activityCurrency} / kişi / gün`, `Activity allowance · ${activityCurrency} / person / day`, `Aktivitete · ${activityCurrency} / person / ditë`)} inputMode="decimal" min="0" step="0.01" placeholder={copy("Bütçeni gir", "Enter your allowance", "Vendos buxhetin")} value={activityAmount} onChange={event => { const value = event.target.value; const canonical = activityAllowanceToGbp(value, activityRate); setActivityDraft({ value, canonical, currency: activityCurrency, rate: activityRate }); update({ activityAllowance: canonical }); }}/>{activityCurrency !== preferences.currency && <small>{copy("Kur alınamadığı için bu tutarı GBP olarak gir.", "Enter this amount in GBP while the exchange rate is unavailable.", "Vendose këtë shumë në GBP derisa kursi të jetë i disponueshëm.")}</small>}</label>}
            <label>{copy("Yedek bütçe · %", "Contingency · %", "Buxhet rezervë · %")}<input type="number" inputMode="decimal" min="0" max="50" value={preferences.buffer} onChange={e => update({ buffer: e.target.value })}/></label>
          </div>
        </details>
        <label className="budget-config-currency"><span>{copy("Para birimi", "Currency", "Monedha")}</span><select value={preferences.currency} onChange={e => update({ currency: e.target.value as BudgetCurrency })}>{BUDGET_CURRENCIES.map(code => <option key={code} value={code}>{code === "TRY" ? copy("Türk lirası (₺)", "Turkish lira (₺)", "Lira turke (₺)") : code === "EUR" ? "Euro (€)" : code === "USD" ? copy("ABD doları ($)", "US dollar ($)", "Dollari amerikan ($)") : copy("İngiliz sterlini (£)", "British pound (£)", "Paundi britanik (£)")}</option>)}</select></label>
        <div className="budget-calculation-scope"><Icon name="info" size={18}/><p>{copy("Konaklama, yemek ve şehir içi ulaşım tahmini.", "Accommodation, food and local transport estimate.", "Vlerësim për akomodimin, ushqimin dhe transportin lokal.")} <strong>{copy("Uçuş hariç.", "Flights excluded.", "Pa fluturime.")}</strong></p></div>
        {errorText && <p className="budget-input-error" role="alert">{errorText}</p>}
        {query.trim() && !rows.length && <p className="budget-small-note" role="status">{copy("Bu arama için fiyat verimiz yok. Başka bir şehir veya ülke dene.", "We have no price data for this search. Try another city or country.", "Nuk kemi të dhëna çmimesh për këtë kërkim. Provo një qytet ose shtet tjetër.")}</p>}
      </section>
      <div ref={actionBar} className="budget-action-bar" hidden={!configInView || resultsInView}>
        <div className="budget-action-summary" aria-live="polite"><small>{errorText ? copy("Bilgileri tamamla", "Complete the details", "Plotëso të dhënat") : rows.length === 1 ? rows[0].row.city[textLocale] : copy(`${rows.length} şehir`, `${rows.length} cities`, `${rows.length} qytete`)}</small><strong>{errorText ? '—' : rows.length === 1 && rows[0].budget ? displayRange(rows[0].budget.totalRange) : duration ? copy(`${duration.days} gün · ${adultCount + childCount} kişi`, `${duration.days} days · ${adultCount + childCount} people`, `${duration.days} ditë · ${adultCount + childCount} persona`) : '—'}</strong></div>
        <button type="button" className="budget-calculate" disabled={!!errorText || !rows.length} onClick={() => { resultsHeading.current?.focus({ preventScroll: true }); resultsHeading.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }}><Icon name="wallet" size={19}/>{rows.length === 1 ? copy("Bütçemi göster", "Show my budget", "Shiko buxhetin") : copy("Bütçeleri göster", "Show budgets", "Shiko buxhetet")}<Icon name="chevron" size={18}/></button>
      </div>
      <div className="budget-results">
        <header className="budget-results-heading"><div><h2 ref={resultsHeading} tabIndex={-1}>{query && rows.length === 1 ? copy("Tahmini seyahat bütçen", "Your estimated trip budget", "Buxheti i vlerësuar i udhëtimit") : copy("Şehir bütçeleri", "City budgets", "Buxhetet e qyteteve")}</h2><p>{duration && copy(`${duration.days} gün · ${Number(preferences.adults) + Number(preferences.children)} kişi için`, `For ${duration.days} days · ${Number(preferences.adults) + Number(preferences.children)} people`, `Për ${duration.days} ditë · ${Number(preferences.adults) + Number(preferences.children)} persona`)}</p></div><button type="button" className="budget-edit-settings" aria-label={copy("Bütçe tercihlerini düzenle", "Edit budget preferences", "Ndrysho preferencat e buxhetit")} onClick={() => { durationControl.current?.focus({ preventScroll: true }); durationControl.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); }}><Icon name="settings" size={15}/>{copy("Düzenle", "Edit", "Ndrysho")}</button></header>
        {rateLoading && <p className="budget-small-note" role="status">{copy("Para birimin güncelleniyor…", "Updating your currency…", "Po përditësohet monedha jote…")}</p>}
        {rate === null && !rateLoading && <p className="budget-rate-warning" role="status">{copy("Seçtiğin para biriminin kuru alınamadı. Tahminler GBP olarak gösteriliyor; bağlantı geldiğinde otomatik yenilenir.", "Your selected currency rate is unavailable. Estimates are shown in GBP and update automatically when the connection returns.", "Kursi i monedhës së zgjedhur mungon. Vlerësimet shfaqen në GBP dhe përditësohen automatikisht kur rikthehet lidhja.")}</p>}
        {rateFailed && rate !== null && <p className="budget-small-note" role="status">{copy("Kur güncellenemedi; son kullanılabilir kurla hesaplandı.", "The rate could not be updated; the last usable rate is applied.", "Kursi nuk u përditësua; përdoret kursi i fundit i vlefshëm.")}</p>}
        {rows.length > 1 && <div className="budget-results-sort"><small>{rows.length} {copy("şehir karşılaştırılıyor", "cities to compare", "qytete për krahasim")}</small><select aria-label={copy("Şehir sırası", "City order", "Renditja e qyteteve")} value={sort} onChange={e => setSort(e.target.value)}><option value="price">{copy("Önce ekonomik", "Lowest budget first", "Buxheti më i ulët")}</option><option value="high">{copy("Bütçe: yüksekten", "Highest budget first", "Buxheti më i lartë")}</option><option value="name">{copy("Şehir adı", "City name", "Emri i qytetit")}</option></select></div>}
        <div className="ci-cost-list">{visible.map(({ row, budget }) => <button type="button" className="budget-city-row has-photo" key={row.id} onClick={() => setSelectedId(row.id)}>
          <span className="budget-city-top"><span className="budget-city-identity"><CountryFlag code={row.code} label=""/><span><strong>{row.city[textLocale]}</strong><small>{appRegionName(row.code, locale)}</small></span></span><span className="budget-estimate-tag">{budget ? missingBudgetText(budget) : copy("Tahmini bütçe", "Estimated budget", "Buxhet i vlerësuar")}</span></span>
          <span className="budget-city-photo"><DestinationPhoto code={CITY_PHOTOS[row.id]} src={BUDGET_CITY_PHOTOS[row.id]?.src} countryCode={row.code} label={row.city[textLocale]}/></span>
          <span className="budget-row-total"><span>{budget ? copy(`${budget.days} gün · ${budget.nights} gece · ${budget.people} kişi`, `${budget.days} days · ${budget.nights} nights · ${budget.people} people`, `${budget.days} ditë · ${budget.nights} net · ${budget.people} persona`) : "—"}</span><strong>{budget ? displayRange(budget.totalRange) : "—"}</strong><small>{budget ? copy(`${budget.people} kişi için toplam · uçuş hariç`, `Total for ${budget.people} people · flights excluded`, `Totali për ${budget.people} persona · pa fluturime`) : copy("Toplam bütçe · uçuş hariç", "Trip total · flights excluded", "Totali · pa fluturime")}</small></span>
          <span className="budget-card-footer"><span>{budget && <>{displayRange(budget.perPersonDayRange)}<small> / {copy("kişi · gün", "person · day", "person · ditë")}</small></>}</span><span>{copy("Detayı gör", "View details", "Shiko hollësitë")}<Icon name="chevron" size={15}/></span></span>
        </button>)}</div>
        {!rows.length && <div className="budget-empty"><Icon name="search" size={27}/><h3>{copy("Bu şehir henüz listemizde yok", "This city isn't in our list yet", "Ky qytet nuk është ende në listë")}</h3><p>{copy("50 şehirden birini seçerek bütçeni karşılaştırabilirsin. Başka bir şehrin fiyatını bu şehre uygulamıyoruz.", "Compare your budget across 50 cities. We never substitute another city's prices.", "Krahaso buxhetin në 50 qytete. Nuk zëvendësojmë çmimet me ato të një qyteti tjetër.")}</p><button type="button" onClick={() => { setQuery(""); setQuickCity(null); setQuickCountry(null); setSearchOpen(false); setActiveSuggestion(-1); }}>{copy("Tüm şehirleri göster", "Show all cities", "Shfaq të gjitha qytetet")}</button></div>}
        {limit < rows.length && <button type="button" className="country-load-more" onClick={() => setLimit(n => n + 8)}>{copy("Daha fazla şehir", "More cities", "Më shumë qytete")} · {Math.min(limit, rows.length)}/{rows.length}</button>}
        <p className="budget-estimate-note"><Icon name="info" size={14}/>{copy("Planlama tahminidir. Uçuş ve şehirler arası ulaşım hariç.", "A planning estimate. Flights and intercity travel excluded.", "Vlerësim planifikimi. Pa fluturime dhe transport ndërqytetas.")}</p>
        <BudgetMethod/>
      </div>
    </div>
    <Sheet open={editing !== null} title={editing === "dates" ? copy("Süre ve tarihler", "Duration and dates", "Kohëzgjatja dhe datat") : copy("Kimlerle gidiyorsun?", "Who's coming along?", "Me kë po shkon?")} onClose={closeEditor} className="budget-options-sheet">
      <div className="budget-editor">
        {editing === "dates" && <><p>{copy("Tarihlerin belli değilse yalnızca gün sayısıyla devam edebilirsin.", "You can use just the number of days if your dates aren't set.", "Mund të përdorësh vetëm numrin e ditëve nëse datat nuk janë caktuar.")}</p><div className="budget-controls budget-date-controls"><label>{copy("Gün", "Days", "Ditë")}<input type="number" inputMode="numeric" min="1" max="30" value={hasDates ? duration?.days ?? "" : preferences.days} disabled={hasDates} onChange={e => update({ days: e.target.value })}/></label><label>{copy("Gidiş · isteğe bağlı", "Departure · optional", "Nisja · opsionale")}<input type="date" value={preferences.startDate} onChange={e => update({ startDate: e.target.value })}/></label><label>{copy("Dönüş", "Return", "Kthimi")}<input type="date" min={preferences.startDate || undefined} value={preferences.endDate} onChange={e => update({ endDate: e.target.value })}/></label></div>{hasDates && <p className="budget-small-note">{duration && copy(`${duration.days} gün · ${duration.nights} gece. Gidiş ve dönüş günleri dahil.`, `${duration.days} days · ${duration.nights} nights. Both travel days included.`, `${duration.days} ditë · ${duration.nights} net. Përfshihen të dyja ditët e udhëtimit.`)} <button type="button" className="ci-text-button" onClick={() => update({ startDate: "", endDate: "", days: String(duration?.days || personalBudgetDuration({ ...preferences, startDate: "", endDate: "" })?.days || 3) })}>{copy("Tarihleri kaldır", "Clear dates", "Hiq datat")}</button></p>}</>}
        {editing === "party" && <><p>{copy("Kişi sayısı değişince gerekli oda sayısını da hesaplarız. Dilersen daha fazla oda seçebilirsin.", "We work out the rooms needed when your party changes. You can choose more rooms if you like.", "Llogarisim dhomat e nevojshme kur ndryshon grupi. Mund të zgjedhësh më shumë dhoma.")}</p><div className="budget-controls budget-party-controls"><label>{copy("Yetişkin", "Adults", "Të rritur")}<input type="number" inputMode="numeric" min="1" max="20" value={preferences.adults} onChange={e => update({ adults: e.target.value }, true)}/></label><label>{copy("Çocuk", "Children", "Fëmijë")}<input type="number" inputMode="numeric" min="0" max="19" value={preferences.children} onChange={e => update({ children: e.target.value }, true)}/></label>{preferences.accommodation !== "hostel" && <label>{copy("Oda / daire", "Rooms / units", "Dhoma / njësi")}<input type="number" inputMode="numeric" min={minimumBudgetRooms(preferences) || 1} max="20" value={preferences.rooms} onChange={e => update({ rooms: e.target.value })}/></label>}</div></>}
        {editorError && <p className="budget-input-error" role="alert">{describeError(editorError)}</p>}
        <button type="button" className="budget-editor-done" disabled={editorInvalid} onClick={finishEditor}>{copy("Tamam", "Done", "U krye")}<Icon name="check" size={18}/></button>
      </div>
    </Sheet>
    <Sheet open={!!selected} title={selected?.city[textLocale] || ""} onClose={() => setSelectedId(null)}>{selected && <div className="ci-content ci-details">
      {selectedBudget ? <><section className="budget-detail-total"><span>{copy(`${selectedBudget.days} gün · ${selectedBudget.people} kişi için tahmin`, `Estimate for ${selectedBudget.days} days · ${selectedBudget.people} travellers`, `Vlerësim për ${selectedBudget.days} ditë · ${selectedBudget.people} persona`)}</span><strong>{displayRange(selectedBudget.totalRange)}</strong><span>{selectedBudget.partial ? missingBudgetText(selectedBudget) : copy("Seyahat toplam aralığı", "Trip total range", "Intervali total i udhëtimit")}</span><small>{copy("Kişi başı seyahat", "Trip per person", "Udhëtimi për person")}: {displayRange(selectedBudget.perPersonRange)}<br/>{copy("Kişi başı günlük", "Daily per person", "Ditore për person")}: {displayRange(selectedBudget.perPersonDayRange)}</small></section>
        <div className="budget-breakdown">
          <div><span>{copy("Konaklama", "Accommodation", "Akomodimi")}<small>{copy(`${selectedBudget.nights} gece · ${preferences.accommodation === "hostel" ? `${selectedBudget.people} yatak` : `${selectedBudget.rooms} oda / daire`}`, `${selectedBudget.nights} nights · ${preferences.accommodation === "hostel" ? `${selectedBudget.people} beds` : `${selectedBudget.rooms} rooms / units`}`, `${selectedBudget.nights} net · ${preferences.accommodation === "hostel" ? `${selectedBudget.people} shtretër` : `${selectedBudget.rooms} dhoma / njësi`}`)}</small></span><strong>{displayRange(selectedBudget.ranges.hotel)}</strong></div>
          <div><span>{copy("Yeme içme · tüm öğünler", "Food · all meals", "Ushqimi · të gjitha vaktet")}<small>{copy("Günlük planlama varsayımı", "Daily planning assumption", "Supozim planifikimi ditor")}</small></span><strong>{displayRange(selectedBudget.ranges.meals)}</strong></div>
          <div><span>{copy("Şehir içi ulaşım", "Local transport", "Transporti lokal")}</span><strong>{displayRange(selectedBudget.ranges.travel)}</strong></div>
          <div><span>{copy("Etkinlik payı", "Activity allowance", "Buxheti i aktiviteteve")}</span><strong>{selectedBudget.ranges.activities ? displayRange(selectedBudget.ranges.activities) : copy("Henüz eklenmedi", "Not added yet", "Nuk është shtuar ende")}</strong></div>
          <div><span>{copy("Yedek bütçe", "Contingency", "Buxheti rezervë")} · %{preferences.buffer}</span><strong>{displayRange(selectedBudget.ranges.contingency)}</strong></div>
        </div>
        {selectedBudget.activities === null && <p className="budget-model-note">{copy("Ücretli etkinlik fiyatları bilinmiyor. Günlük etkinlik payını girerek toplamı tamamla.", "Paid activity prices are unknown. Enter your daily activity allowance to complete the total.", "Çmimet e aktiviteteve me pagesë nuk dihen. Vendos buxhetin ditor për të plotësuar totalin.")}</p>}
        {selected.travel === 0 && preferences.transport === "taxi" && <p className="budget-model-note">{copy("Kaynak ulaşım tutarı 0; taksi fiyatı bu veriden hesaplanamaz. Taksi teklifini ayrıca bütçele.", "The source transit amount is 0; taxis cannot be estimated from it. Budget your taxi quote separately.", "Transporti burimor është 0; taksitë nuk vlerësohen nga ai. Planifiko ofertën e taksisë veçmas.")}</p>}
        {onPrepareCockpitBudget && <button type="button" className="primary-wide" onClick={() => {
          const intent = createPersonalBudgetCockpitIntent(selected, preferences, preferences.currency, quote, ownerId || null, selected.city[textLocale]);
          if (intent) { setSelectedId(null); onPrepareCockpitBudget(intent); }
        }}><Icon name="wallet" size={18}/>{copy("Bu tahmini seyahatlerime ekle", "Add this estimate to My trips", "Shto këtë vlerësim te Udhëtimet e mia")}</button>}
      </> : <p role="alert">{errorText}</p>}
      <CountryAdvisory code={selected.code} onOpenNews={code => { setSelectedId(null); onOpenCountryNews(code); }}/>
      {selectedPhoto?.credit && <details className="budget-photo-credit"><summary>{copy("Fotoğraf kaynağı", "Photo credit", "Burimi i fotografisë")}</summary><p>{selectedPhoto.credit.title}<br/>{selectedPhoto.credit.author}</p><div><button type="button" className="ci-text-button" onClick={() => void openExternal(selectedPhoto.credit!.source)}>Wikimedia Commons<Icon name="external" size={12}/></button><button type="button" className="ci-text-button" onClick={() => void openExternal(selectedPhoto.credit!.licenseUrl)}>{selectedPhoto.credit.license}<Icon name="external" size={12}/></button></div><small>{copy("Boyutlandırıldı, WebP'ye dönüştürüldü ve ekrana göre kırpılır.", "Resized, converted to WebP and cropped to fit the display.", "E ripërmasuar, e kthyer në WebP dhe e prerë sipas ekranit.")}</small></details>}
    </div>}</Sheet>
  </section>;
}

function BudgetMethod() {
  const { copy } = useI18n();
  return <details className="ci-method budget-method"><summary>{copy("Hesaplama yöntemi ve kaynak", "Method and source", "Metoda dhe burimi")}</summary>
    <p>{copy("Başlangıç: Post Office City Costs Barometer, 22 Mayıs 2026. Merkezde 3 yıldızlı iki kişilik odanın 2 gecesi, 2 kişilik bir akşam yemeği ve kişi başı 48 saatlik ulaşım kartı. Otel örneği 5–7 Haziran içindir. Araştırma güncel satış fiyatı değildir; güncel kur fiyatı yenilemez.", "Baseline: Post Office City Costs Barometer, 22 May 2026. Two nights in a central three-star double room, one dinner for two and a 48-hour transit pass per person. Hotel sample: 5–7 June. Survey prices are not current selling prices; current FX does not update them.", "Baza: Post Office City Costs Barometer, 22 maj 2026. Dy net në dhomë dyshe qendrore me tre yje, një darkë për dy dhe kartë transporti 48-orëshe për person. Mostra e hotelit: 5–7 qershor. Këto nuk janë çmime aktuale; kursi i ri nuk i përditëson.")}</p>
    <p>{copy("Çarpanlar planlama varsayımlarıdır. Otel: 2★ ×0,8 / 3★ ×1 / 4★ ×1,4 / 5★ ×2; tek oda ×0,8 / çift ×1 / aile ×1,5. Apart ×0,9; hostel yatak başı oda tutarının ×0,3'ü. Oda ücreti kişi sayısıyla tekrar çarpılmaz. Oda kapasitesi ve çocuk kabulü tesisten doğrulanmalıdır.", "Multipliers are planning assumptions. Hotel: 2★ ×0.8 / 3★ ×1 / 4★ ×1.4 / 5★ ×2; single ×0.8 / double ×1 / family ×1.5. Apartment ×0.9; hostel bed ×0.3 of the room rate. Rooms are not multiplied again by guests. Confirm capacity and child policies with the property.", "Shumëzuesit janë supozime planifikimi. Hotel: 2★ ×0,8 / 3★ ×1 / 4★ ×1,4 / 5★ ×2; njëshe ×0,8 / dyshe ×1 / familjare ×1,5. Apartament ×0,9; shtrat hosteli ×0,3 e dhomës. Dhoma nuk shumëzohet sërish me personat. Konfirmo kapacitetin dhe pranimin e fëmijëve me pronën.")}</p>
    <p>{copy("Tüm öğünler kişi başı akşam yemeği temelinden: market ×1 / yerel ×1,7 / restoran ×2,5; çocuk porsiyonu %70 varsayılır. Çocuk ulaşımı tam ücret sayılır. Ulaşım tam 48 saatlik kartlarla; taksi ×3 senaryosu. Etkinlik ücretleri araştırılmış değildir; kendi belirlediğin pay eklenir.", "All meals use the per-person dinner baseline: groceries ×1 / local ×1.7 / restaurants ×2.5; child portions assumed at 70%. Child transit uses full fares. Transport uses whole 48-hour passes; taxi scenario ×3. Activity prices are not researched; your own allowance is added.", "Vaktet bazohen në darkën për person: ushqimore ×1 / lokale ×1,7 / restorante ×2,5; porcionet e fëmijëve supozohen 70%. Transporti i fëmijëve llogaritet i plotë. Përdoren karta 48-orëshe; taksi ×3. Çmimet e aktiviteteve nuk janë të studiuara; shtohet buxheti yt.")}</p>
    <p>{copy("Ekonomik: konaklama ×0,85 / yemek ×0,9 / ulaşım ×0,9. Standart ×1. Konfor ×1,25 / ×1,2 / ×1,15. Sezon konaklamaya uygulanır: düşük ×0,85 / normal ×1 / yüksek ×1,25; tatil ayrıca ×1,2. Otomatik: Haziran–Ağustos yüksek, Ocak–Şubat ve Kasım düşük, kalan aylar normal. Bu genel takvim yerel sezon veya tatilleri doğrulamaz; seçimi değiştirebilirsin.", "Economical: accommodation ×0.85 / food ×0.9 / transport ×0.9. Standard ×1. Comfort ×1.25 / ×1.2 / ×1.15. Accommodation season: low ×0.85 / normal ×1 / high ×1.25; holiday adds ×1.2. Auto: June–August high, January–February and November low, other months normal. This broad calendar does not verify local seasons or holidays; override it as needed.", "Ekonomik: akomodimi ×0,85 / ushqimi ×0,9 / transporti ×0,9. Standard ×1. Rehati ×1,25 / ×1,2 / ×1,15. Sezoni: i ulët ×0,85 / normal ×1 / i lartë ×1,25; festa shton ×1,2. Automatik: qershor–gusht i lartë, janar–shkurt dhe nëntor i ulët, të tjerët normal. Ky kalendar nuk verifikon sezonet apo festat lokale; ndryshoje sipas nevojës.")}</p>
    <p>{copy("Aralıklar: konaklama %75–135 (yüksek sezon/tatilde üst sınır %150), yemek/ulaşım %80–135, taksi %70–160. Etkinlik kendi sabit payın; yedek yüzde ara toplama eklenir. Fiyat garantisi veya istatistiksel güven aralığı değildir. Uçuş, şehirler arası ulaşım, bagaj, sigorta ve teklifteki ek vergiler dahil değildir. Kaynak ulaşımı sıfırsa diğer ulaşım türlerinin ücretsiz olduğu varsayılmaz.", "Ranges: accommodation 75–135% (upper limit 150% in high season/holidays), food/transit 80–135%, taxis 70–160%. Activities use your fixed allowance; contingency adds to the subtotal. These are not guarantees or statistical confidence intervals. Flights, intercity travel, baggage, insurance and extra taxes in quotes are excluded. Zero source transit does not imply other transport is free.", "Intervalet: akomodimi 75–135% (deri në 150% në sezon të lartë/festa), ushqimi/transporti 80–135%, taksi 70–160%. Aktivitetet përdorin buxhetin tënd fiks; rezerva shtohet mbi nëntotalin. Nuk janë garanci apo intervale besimi. Pa fluturime, udhëtime ndërqytetase, bagazhe, sigurim dhe taksa shtesë. Transporti burimor zero nuk do të thotë se çdo transport është falas.")}</p>
    <button className="ci-text-button" type="button" onClick={() => void openExternal(CITY_PRICE_SOURCE)}>{copy("Orijinal araştırma (PDF)", "Original survey (PDF)", "Studimi origjinal (PDF)")}<Icon name="external" size={14}/></button>
  </details>;
}
