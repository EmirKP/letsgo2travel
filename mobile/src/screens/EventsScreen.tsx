import { useEffect, useMemo, useState } from "react";
import { CountryFlag } from "../components/CountryFlag";
import { DateTimeField } from "../components/DateTimeField";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { CountryPicker } from "../components/CountryPicker";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { listEventCities, listTravelEvents } from "../lib/api";
import { clampLocalDate, isValidDateRange, localIsoDate } from "../lib/dates";
import { cancelEventReminder, reconcileEventReminders, scheduleEventReminder } from "../lib/eventReminders";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { getSavedTravelEvents, mergeSavedTravelEvents, toggleSavedTravelEvent } from "../lib/storage";
import { attachTravelEventToCockpitTrip, getSupabaseDataErrorMessage, listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import type { EventCityOption, TravelEvent, ViewId } from "../types";

const CATEGORY_IDS = ["all", "concert", "festival", "sport", "culture", "food", "family"] as const;

export function EventsScreen({ ownerId, accessToken, onOpenAccount, onNavigate, onNotice }: {
  ownerId?: string | null;
  accessToken?: string;
  onOpenAccount: () => void;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, countryName, dateLocale } = useI18n();
  const [countryCode, setCountryCode] = useState("TR");
  const [cityPlaceCode, setCityPlaceCode] = useState("");
  const [cities, setCities] = useState<EventCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState(false);
  const [citiesReloadKey, setCitiesReloadKey] = useState(0);
  const [startDate, setStartDate] = useState(localIsoDate(0));
  const [endDate, setEndDate] = useState(localIsoDate(120));
  const [category, setCategory] = useState<(typeof CATEGORY_IDS)[number]>("all");
  const [events, setEvents] = useState<TravelEvent[]>([]);
  const [savedIds, setSavedIds] = useState(() => new Set(getSavedTravelEvents(ownerId).map((event) => event.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [coverageLimited, setCoverageLimited] = useState(false);
  const [coverageStatus, setCoverageStatus] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [featuredEvents, setFeaturedEvents] = useState<TravelEvent[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredUnavailable, setFeaturedUnavailable] = useState(false);
  const [featuredGlobal, setFeaturedGlobal] = useState(false);
  const [tripEvent, setTripEvent] = useState<TravelEvent | null>(null);
  const [cockpitTrips, setCockpitTrips] = useState<CockpitTrip[]>([]);
  const [tripPickerLoading, setTripPickerLoading] = useState(false);
  const [tripPickerError, setTripPickerError] = useState("");
  const [tripPickerBusy, setTripPickerBusy] = useState("");

  const countries = useMemo(() => COUNTRY_LIST
    .map((country) => ({ ...country, name: countryName(country.alpha3, country.name), code: alpha2FromAlpha3(country.alpha3) }))
    .filter((country) => country.code)
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);

  const selectedCity = useMemo(
    () => cities.find((option) => option.placeCode === cityPlaceCode),
    [cities, cityPlaceCode],
  );

  const countryOptions = useMemo(() => countries.map((country) => ({
    code: country.code,
    flagCode: country.code,
    name: country.name,
  })), [countries]);

  useEffect(() => {
    const refreshDateBounds = () => {
      const today = localIsoDate(0);
      const latest = localIsoDate(366);
      setStartDate((value) => clampLocalDate(value, today, latest));
      setEndDate((value) => clampLocalDate(value, clampLocalDate(startDate, today, latest), latest));
    };
    refreshDateBounds();
    document.addEventListener("visibilitychange", refreshDateBounds);
    return () => document.removeEventListener("visibilitychange", refreshDateBounds);
  }, [endDate, startDate]);

  useEffect(() => {
    let current = true;
    setCityPlaceCode("");
    setCities([]);
    setCitiesError(false);
    if (!countryCode) {
      setCitiesLoading(false);
      return () => { current = false; };
    }
    setCitiesLoading(true);
    void listEventCities(countryCode)
      .then((options) => { if (current) setCities(options); })
      .catch(() => { if (current) { setCities([]); setCitiesError(true); } })
      .finally(() => { if (current) setCitiesLoading(false); });
    return () => { current = false; };
  }, [countryCode, citiesReloadKey]);

  useEffect(() => {
    let current = true;
    const dates = { startDate: localIsoDate(0), endDate: localIsoDate(180) };
    setFeaturedLoading(true);
    setFeaturedUnavailable(false);
    setFeaturedGlobal(false);
    void (async () => {
      try {
        const selected = await listTravelEvents({ countryCode, ...dates, featured: true, limit: 6 });
        let next = Array.isArray(selected.data) ? selected.data : [];
        let usesGlobal = false;
        let unavailable = selected.meta?.coverageStatus === "provider_unavailable" || selected.meta?.coverageStatus === "limited" || selected.meta?.coverageStatus === "not_configured";
        if (countryCode && !next.length && selected.meta?.coverageStatus === "no_results") {
          const worldwide = await listTravelEvents({ ...dates, featured: true, limit: 6 });
          next = Array.isArray(worldwide.data) ? worldwide.data : [];
          usesGlobal = true;
          unavailable = worldwide.meta?.coverageStatus === "provider_unavailable" || worldwide.meta?.coverageStatus === "limited" || worldwide.meta?.coverageStatus === "not_configured";
        }
        if (current) {
          setFeaturedEvents(next);
          setFeaturedGlobal(usesGlobal);
          setFeaturedUnavailable(unavailable && !next.length);
        }
      } catch {
        if (current) {
          setFeaturedEvents([]);
          setFeaturedUnavailable(true);
        }
      } finally {
        if (current) setFeaturedLoading(false);
      }
    })();
    return () => { current = false; };
  }, [countryCode]);

  useEffect(() => {
    setSavedIds(new Set(getSavedTravelEvents(ownerId).map((event) => event.id)));
  }, [ownerId]);

  const categoryLabel = (value: TravelEvent["category"] | "all") => ({
    all: copy("Tümü", "All"), concert: copy("Konser", "Concert"), festival: copy("Festival", "Festival"), sport: copy("Spor", "Sport"), culture: copy("Kültür", "Culture"), food: copy("Yeme içme", "Food"), family: copy("Aile", "Family"), other: copy("Diğer", "Other"),
  })[value];

  const search = async () => {
    if (loading) return;
    const today = localIsoDate(0);
    const latest = localIsoDate(366);
    if (!isValidDateRange(startDate, endDate, today, latest)) {
      setSearched(true);
      setEvents([]);
      setError(copy("Tarihleri bugünden başlayarak en fazla bir yıllık geçerli bir aralıkta seç.", "Choose a valid date range from today through the next year."));
      return;
    }
    setLoading(true);
    setError("");
    setCoverageLimited(false);
    setCoverageStatus("");
    setSearched(true);
    try {
      const result = await listTravelEvents({
        countryCode,
        city: selectedCity?.name,
        placeCode: selectedCity?.placeCode,
        startDate,
        endDate,
        category,
        limit: 30,
      });
      const freshEvents = Array.isArray(result.data) ? result.data : [];
      setEvents(freshEvents);
      const merged = mergeSavedTravelEvents(freshEvents, ownerId);
      setSavedIds(new Set(merged.events.map((item) => item.id)));
      const reminderChanges = await reconcileEventReminders(freshEvents, locale);
      if (reminderChanges > 0) onNotice(copy("Kayıtlı etkinliklerin tarih veya durum değişiklikleri güncellendi.", "Date or status changes for your saved events were updated."));
      setProviderConfigured(result.meta?.providerConfigured !== false);
      setCoverageLimited(result.meta?.coverageLimited === true);
      setCoverageStatus(result.meta?.coverageStatus || "");
      setUpdatedAt(result.meta?.updatedAt || "");
    } catch (requestError) {
      setEvents([]);
      setCoverageLimited(false);
      setCoverageStatus("");
      setError(requestError instanceof Error && requestError.message
        ? requestError.message
        : copy("Etkinlikler yüklenemedi. Bağlantını kontrol edip yeniden dene.", "Events could not be loaded. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void search(); /* İlk ekran gerçek sonuçla açılır. */ }, []);

  const save = (event: TravelEvent) => {
    const result = toggleSavedTravelEvent(event, ownerId);
    setSavedIds(new Set(result.events.map((item) => item.id)));
    if (!result.saved) void cancelEventReminder(event.id);
    onNotice(result.saved ? copy("Etkinlik planına eklendi.", "Event added to your plan.") : copy("Etkinlik planından çıkarıldı.", "Event removed from your plan."));
  };

  const remind = async (event: TravelEvent) => {
    try {
      const result = await scheduleEventReminder(event, locale);
      if (result.ok) onNotice(copy("Etkinlik hatırlatıcısı kuruldu.", "Event reminder set."));
      else if (result.reason === "permission") onNotice(copy("Hatırlatma için bildirim izni vermelisin.", "Enable notifications to set a reminder."));
      else if (result.reason === "past" || result.reason === "status") onNotice(copy("Geçmiş, tamamlanmış veya iptal edilmiş etkinliğe hatırlatma kurulamaz.", "A reminder cannot be set for a past, completed or cancelled event."));
      else onNotice(copy("Etkinlik hatırlatıcısı yalnız mobil uygulamada kullanılabilir.", "Event reminders are available in the mobile app."));
    } catch {
      onNotice(copy("Hatırlatma kurulamadı.", "The reminder could not be set."));
    }
  };

  const openTripPicker = async (event: TravelEvent) => {
    if (!ownerId || !accessToken) {
      onNotice(copy("Etkinliği bir seyahate eklemek için giriş yap.", "Sign in to add the event to a trip."));
      onOpenAccount();
      return;
    }
    setTripEvent(event);
    setTripPickerLoading(true);
    setTripPickerError("");
    try {
      const trips = await listCockpitTrips(ownerId, accessToken);
      setCockpitTrips(trips.filter((trip) => trip.status === "upcoming" || trip.status === "active"));
    } catch (requestError) {
      setCockpitTrips([]);
      setTripPickerError(getSupabaseDataErrorMessage(requestError, copy("Seyahatlerin yüklenemedi.", "Your trips could not be loaded.")));
    } finally {
      setTripPickerLoading(false);
    }
  };

  const attachToTrip = async (trip: CockpitTrip) => {
    if (!tripEvent || !ownerId || !accessToken || tripPickerBusy) return;
    setTripPickerBusy(trip.id);
    setTripPickerError("");
    try {
      const result = await attachTravelEventToCockpitTrip(ownerId, trip, tripEvent, accessToken);
      setCockpitTrips((items) => items.map((item) => item.id === trip.id ? result.trip : item));
      if (!savedIds.has(tripEvent.id)) save(tripEvent);
      onNotice(result.attached ? copy("Etkinlik seçtiğin seyahate eklendi.", "Event added to the selected trip.") : copy("Bu etkinlik zaten seçtiğin seyahatte.", "This event is already in the selected trip."));
      setTripEvent(null);
    } catch (requestError) {
      setTripPickerError(getSupabaseDataErrorMessage(requestError, copy("Etkinlik seyahate eklenemedi.", "The event could not be added to the trip.")));
    } finally {
      setTripPickerBusy("");
    }
  };

  const eventDateForTrip = tripEvent ? new Date(tripEvent.startsAt) : null;
  const eventDay = eventDateForTrip && Number.isFinite(eventDateForTrip.getTime())
    ? `${eventDateForTrip.getFullYear()}-${String(eventDateForTrip.getMonth() + 1).padStart(2, "0")}-${String(eventDateForTrip.getDate()).padStart(2, "0")}`
    : "";
  const hasCompatibleTrip = cockpitTrips.some((trip) => Boolean(eventDay && eventDay >= trip.startDate && eventDay <= trip.endDate));

  return <div className="screen events-screen">
    <section className="events-hero">
      <div className="events-live"><i /> {copy("CANLI ETKİNLİK RADARI", "LIVE EVENT RADAR")}</div>
      <h1>{copy("Seyahatin bir tarihten fazlası olsun.", "Make your trip more than a date.")}</h1>
      <p>{copy("Konserleri, festivalleri, spor ve kültür etkinliklerini ülkeye ve tarihe göre bul.", "Find concerts, festivals, sports and cultural events by country and date.")}</p>
      <button onClick={() => onNavigate("companion")}><Icon name="sparkles" size={17} /> {copy("Şu anda ne yapabilirim?", "What can I do right now?")}</button>
    </section>

    <section className="event-search-card" aria-label={copy("Etkinlik araması", "Event search")}>
      <div className="event-search-grid">
        <CountryPicker value={countryCode} options={countryOptions} includeWorldwide label={copy("Ülke", "Country")} placeholder={copy("Tüm dünya", "Worldwide")} onChange={(nextCountryCode) => {
          setCountryCode(nextCountryCode);
          setCityPlaceCode("");
          setCities([]);
          setCitiesError(false);
        }} />
        <label>{copy("Şehir (isteğe bağlı)", "City (optional)")}<select value={cityPlaceCode} disabled={!countryCode || citiesLoading} onChange={(event) => setCityPlaceCode(event.target.value)}>
          <option value="">{citiesLoading ? copy("Şehirler yükleniyor…", "Loading cities…") : countryCode ? copy("Tüm şehirler", "All cities") : copy("Önce ülke seç", "Choose a country first")}</option>
          {cities.map((option) => <option value={option.placeCode} key={option.placeCode}>{option.name}</option>)}
        </select></label>
        <DateTimeField type="date" label={copy("Başlangıç", "From")} min={localIsoDate(0)} max={localIsoDate(366)} value={startDate} onChange={(requested) => {
          const nextStartDate = clampLocalDate(requested, localIsoDate(0), localIsoDate(366));
          setStartDate(nextStartDate);
          if (endDate && nextStartDate && endDate < nextStartDate) setEndDate(nextStartDate);
          if (requested && requested !== nextStartDate) onNotice(copy("Geçmiş bir başlangıç tarihi seçilemez.", "A past start date cannot be selected."));
        }} />
        <DateTimeField type="date" label={copy("Bitiş", "To")} min={startDate || localIsoDate(0)} max={localIsoDate(366)} value={endDate} onChange={(requested) => {
          const nextEndDate = clampLocalDate(requested, startDate || localIsoDate(0), localIsoDate(366));
          setEndDate(nextEndDate);
          if (requested && requested !== nextEndDate) onNotice(copy("Bitiş tarihi başlangıçtan önce olamaz.", "The end date cannot be before the start date."));
        }} />
      </div>
      {countryCode && !cityPlaceCode && !citiesLoading && !citiesError && <p className="event-city-scope"><Icon name="info" size={14} /> {copy("Tüm şehirler seçiliyken ülke genelindeki sonuçlar aranır; canlı kapsam sağlayıcıya göre değişebilir.", "With all cities selected, results are searched countrywide; live coverage can vary by provider.")}</p>}
      {citiesError && <div className="event-city-error" role="alert"><Icon name="alert" size={16} /><span>{copy("Şehirler yüklenemedi; tüm ülkeyi arayabilir veya yeniden deneyebilirsin.", "Cities could not be loaded; search the whole country or try again.")}</span><button type="button" onClick={() => setCitiesReloadKey((value) => value + 1)}>{copy("Yeniden dene", "Retry")}</button></div>}
      <div className="chip-scroll event-categories" role="group" aria-label={copy("Etkinlik kategorisi", "Event category")}>
        {CATEGORY_IDS.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{categoryLabel(item)}</button>)}
      </div>
      <button className="primary-wide" disabled={loading || !startDate || !endDate} onClick={() => void search()}>{loading ? <span className="button-loader" /> : <Icon name="search" size={18} />} {loading ? copy("Aranıyor", "Searching") : copy("Etkinlikleri bul", "Find events")}</button>
    </section>

    <section className="featured-events" aria-labelledby="featured-events-title">
      <div className="featured-events-heading"><div><span>{copy("DÜNYA SAHNESİ", "WORLD STAGE")}</span><h2 id="featured-events-title">{copy("Dünyaca ünlü sanatçılar", "Global headline artists")}</h2></div><small>{featuredGlobal ? copy("Dünyadan seçildi", "Selected worldwide") : countryCode ? copy("Seçili ülkede", "In selected country") : copy("Tüm dünyada", "Worldwide")}</small></div>
      {featuredLoading ? <div className="featured-skeleton"><div /><div /></div>
        : featuredEvents.length ? <div className="featured-event-list">{featuredEvents.map((event) => <button type="button" key={`featured-${event.id}`} onClick={() => void openExternal(event.ticketUrl || event.sourceUrl)}>
          <span className="featured-event-mark"><CountryFlag code={event.countryCode} label={event.countryCode} className="featured-country-flag" /></span>
          <span className="featured-event-copy"><small>{[event.city, event.venue].filter(Boolean).join(" · ") || event.countryCode}</small><strong>{event.title}</strong><em>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(event.startsAt))}{event.impactRank ? ` · ${copy("Yüksek ilgi", "High impact")}` : ""}</em></span>
          <Icon name="external" size={17} />
        </button>)}</div>
          : <div className="featured-event-empty"><Icon name={featuredUnavailable ? "offline" : "calendar"} size={22} /><p>{featuredUnavailable ? copy("Öne çıkan konser kaynağına şu anda ulaşılamıyor.", "Headline concert data is temporarily unavailable.") : copy("Önümüzdeki dönemde öne çıkan konser bulunamadı.", "No headline concerts were found for the coming months.")}</p></div>}
    </section>

    {!providerConfigured && <div className="info-box event-provider-note"><Icon name="info" size={18} /><p>{copy("Otomatik etkinlik sağlayıcısı henüz etkin değil. Bu sırada yönetici tarafından doğrulanmış duyurular gösterilir.", "The automatic event provider is not enabled yet. Verified editorial listings are shown in the meantime.")}</p></div>}
    {providerConfigured && coverageStatus === "provider_unavailable" && <div className="info-box event-provider-note event-provider-unavailable"><Icon name="alert" size={18} /><p>{copy("Canlı etkinlik kaynağına şu anda ulaşılamıyor. Biraz sonra yeniden dene; doğrulanmış duyurular gösterilmeye devam ediyor.", "The live event source is temporarily unavailable. Try again shortly; verified listings remain visible.")}</p><button onClick={() => void search()}>{copy("Yeniden dene", "Retry")}</button></div>}
    {providerConfigured && coverageLimited && coverageStatus !== "provider_unavailable" && <div className="info-box event-provider-note"><Icon name="info" size={18} /><p>{copy("Bu ülke için canlı etkinlik kapsamı şu anda sınırlı. Yönetici tarafından doğrulanmış duyurular gösteriliyor.", "Live event coverage is currently limited for this country. Verified editorial listings are being shown.")}</p></div>}
    {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p><button onClick={() => void search()}>{copy("Tekrar dene", "Try again")}</button></div>}

    <section className="section-block event-results">
      <div className="section-heading"><div><span>{copy("TARİHİNE UYGUN", "MATCHING YOUR DATES")}</span><h2>{copy("Yaklaşan etkinlikler", "Upcoming events")}</h2></div>{updatedAt && <small>{copy("Güncellendi", "Updated")} {new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt))}</small>}</div>
      {loading && !events.length ? <div className="skeleton-list"><div /><div /><div /></div> : <div className="event-list">
        {events.map((event) => {
          const saved = savedIds.has(event.id);
          const cancelled = event.status === "cancelled";
          return <article className={`event-card ${cancelled ? "cancelled" : ""}`} key={event.id}>
            {event.imageUrl ? <div className="event-card-image" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.04),rgba(7,27,51,.78)),url(${event.imageUrl})` }}><span>{categoryLabel(event.category)}</span></div> : <div className="event-card-image event-card-placeholder"><Icon name="calendar" size={31} /><span>{categoryLabel(event.category)}</span></div>}
            <div className="event-card-body">
              <div className="event-card-date"><strong>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit" }).format(new Date(event.startsAt))}</strong><span>{new Intl.DateTimeFormat(dateLocale, { month: "short" }).format(new Date(event.startsAt))}</span></div>
              <div className="event-card-copy"><small><CountryFlag code={event.countryCode} label={event.countryCode} className="event-inline-flag" /><span>{[event.city, event.venue].filter(Boolean).join(" · ") || copy("Konum kaynağında", "See source for location")}</span></small><h3>{event.title}</h3><p>{new Intl.DateTimeFormat(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</p></div>
              {event.status !== "scheduled" && <em className={`event-status ${event.status}`}>{event.status === "cancelled" ? copy("İptal", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : copy("Tamamlandı", "Ended")}</em>}
            </div>
            {event.description && <p className="event-description">{event.description}</p>}
            <div className={`event-card-actions with-trip-action ${cancelled ? "two-actions" : ""}`}>
              <button className={saved ? "saved" : ""} onClick={() => save(event)}><Icon name={saved ? "check" : "bookmark"} size={16} />{saved ? copy("Kaydedildi", "Saved") : copy("Kaydet", "Save")}</button>
              {!cancelled && <button className="event-add-to-trip" onClick={() => void openTripPicker(event)}><Icon name="suitcase" size={16} />{copy("Seyahate ekle", "Add to trip")}</button>}
              {!cancelled && <button onClick={() => void remind(event)}><Icon name="bell" size={16} />{copy("Hatırlat", "Remind me")}</button>}
              <button onClick={() => void openExternal(event.ticketUrl || event.sourceUrl)}><Icon name="external" size={16} />{event.ticketUrl ? copy("Bilet / kaynak", "Tickets / source") : copy("Kaynağı doğrula", "Verify source")}</button>
            </div>
          </article>;
        })}
        {searched && !loading && !error && !events.length && <div className="empty-state"><span><Icon name="calendar" size={29} /></span><strong>{copy("Bu aralıkta etkinlik bulunamadı", "No events found for these dates")}</strong><p>{copy("Şehir filtresini ‘Tüm şehirler’ yap, tarih aralığını genişlet veya başka kategori seç.", "Choose ‘All cities’, widen the dates or select another category.")}</p></div>}
      </div>}
    </section>
    <p className="event-disclaimer"><Icon name="shield" size={15} /> {copy("Saat, mekân, bilet ve iptal durumunu satın almadan önce bağlantılı kaynaktan ve etkinliğin resmî sitesinden doğrula.", "Before purchase, verify the time, venue, tickets and cancellation status through the linked source and the event's official site.")}</p>
    <Sheet open={Boolean(tripEvent)} title={copy("Etkinliği seyahate ekle", "Add event to trip")} onClose={() => { if (!tripPickerBusy) setTripEvent(null); }}>
      {tripEvent && <div className="event-trip-picker">
        <header><span><Icon name="calendar" size={21} /></span><div><small>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(tripEvent.startsAt))}</small><strong>{tripEvent.title}</strong><p>{[tripEvent.city, tripEvent.venue].filter(Boolean).join(" · ")}</p></div></header>
        <p>{copy("Etkinlik tarihiyle örtüşen seyahatlerden birini seç.", "Choose a trip that covers the event date.")}</p>
        {tripPickerLoading ? <div className="skeleton-list"><div /><div /></div>
          : tripPickerError ? <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{tripPickerError}</p><button type="button" onClick={() => void openTripPicker(tripEvent)}>{copy("Yeniden dene", "Retry")}</button></div>
            : cockpitTrips.length ? <><div className="event-trip-options">{cockpitTrips.map((trip) => {
              const compatible = Boolean(eventDay && eventDay >= trip.startDate && eventDay <= trip.endDate);
              const alreadyAdded = trip.checklistItems.some((item) => item.kind === "event" && item.eventId === tripEvent.id);
              return <button type="button" key={trip.id} disabled={Boolean(tripPickerBusy) || !compatible} onClick={() => void attachToTrip(trip)}><span><Icon name={alreadyAdded ? "check" : compatible ? "suitcase" : "calendar"} size={18} /></span><div><strong>{[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ") || copy("İsimsiz seyahat", "Untitled trip")}</strong><small>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${trip.startDate}T12:00:00`))} – {new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${trip.endDate}T12:00:00`))}</small><em>{alreadyAdded ? copy("Zaten eklendi", "Already added") : compatible ? copy("Tarih uygun", "Date matches") : copy("Etkinlik tarihi bu seyahatin dışında", "Event date is outside this trip")}</em></div><Icon name="chevron" size={16} /></button>;
            })}</div>{!hasCompatibleTrip && <button className="secondary-wide event-trip-create" type="button" onClick={() => { setTripEvent(null); onNavigate("cockpit"); }}><Icon name="plus" size={16} /> {copy("Tarihleri uygun seyahat oluştur", "Create a trip with matching dates")}</button>}</>
              : <div className="empty-state"><span><Icon name="suitcase" size={27} /></span><strong>{copy("Uygun seyahat bulunamadı", "No suitable trip found")}</strong><p>{copy("Önce tarihleri bu etkinliği kapsayan bir seyahat oluştur.", "Create a trip whose dates cover this event first.")}</p><button className="primary-button" type="button" onClick={() => { setTripEvent(null); onNavigate("cockpit"); }}><Icon name="plus" size={16} /> {copy("Seyahat oluştur", "Create trip")}</button></div>}
      </div>}
    </Sheet>
  </div>;
}
