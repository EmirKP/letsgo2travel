import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import { listEventCities, listTravelEvents } from "../lib/api";
import { cancelEventReminder, reconcileEventReminders, scheduleEventReminder } from "../lib/eventReminders";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { getSavedTravelEvents, mergeSavedTravelEvents, toggleSavedTravelEvent } from "../lib/storage";
import type { EventCityOption, TravelEvent, ViewId } from "../types";

const CATEGORY_IDS = ["all", "concert", "festival", "sport", "culture", "food", "family"] as const;

function isoDateAfter(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function EventsScreen({ ownerId, onNavigate, onNotice }: {
  ownerId?: string | null;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, copy, countryName, dateLocale } = useI18n();
  const [countryCode, setCountryCode] = useState("TR");
  const [cityPlaceCode, setCityPlaceCode] = useState("");
  const [cities, setCities] = useState<EventCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [startDate, setStartDate] = useState(isoDateAfter(0));
  const [endDate, setEndDate] = useState(isoDateAfter(120));
  const [category, setCategory] = useState<(typeof CATEGORY_IDS)[number]>("all");
  const [events, setEvents] = useState<TravelEvent[]>([]);
  const [savedIds, setSavedIds] = useState(() => new Set(getSavedTravelEvents(ownerId).map((event) => event.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [coverageLimited, setCoverageLimited] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const countries = useMemo(() => COUNTRY_LIST
    .map((country) => ({ ...country, name: countryName(country.alpha3, country.name), code: alpha2FromAlpha3(country.alpha3) }))
    .filter((country) => country.code)
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);

  const selectedCity = useMemo(
    () => cities.find((option) => option.placeCode === cityPlaceCode),
    [cities, cityPlaceCode],
  );

  useEffect(() => {
    let current = true;
    setCityPlaceCode("");
    setCities([]);
    if (!countryCode) {
      setCitiesLoading(false);
      return () => { current = false; };
    }
    setCitiesLoading(true);
    void listEventCities(countryCode)
      .then((options) => { if (current) setCities(options); })
      .catch(() => { if (current) setCities([]); })
      .finally(() => { if (current) setCitiesLoading(false); });
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
    setLoading(true);
    setError("");
    setCoverageLimited(false);
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
      setUpdatedAt(result.meta?.updatedAt || "");
    } catch {
      setEvents([]);
      setCoverageLimited(false);
      setError(copy("Etkinlikler yüklenemedi. Bağlantını kontrol edip yeniden dene.", "Events could not be loaded. Check your connection and try again."));
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

  return <div className="screen events-screen">
    <section className="events-hero">
      <div className="events-live"><i /> {copy("CANLI ETKİNLİK RADARI", "LIVE EVENT RADAR")}</div>
      <h1>{copy("Seyahatin bir tarihten fazlası olsun.", "Make your trip more than a date.")}</h1>
      <p>{copy("Konserleri, festivalleri, spor ve kültür etkinliklerini ülkeye ve tarihe göre bul.", "Find concerts, festivals, sports and cultural events by country and date.")}</p>
      <button onClick={() => onNavigate("companion")}><Icon name="sparkles" size={17} /> {copy("Şu anda ne yapabilirim?", "What can I do right now?")}</button>
    </section>

    <section className="event-search-card" aria-label={copy("Etkinlik araması", "Event search")}>
      <div className="event-search-grid">
        <label>{copy("Ülke", "Country")}<select value={countryCode} onChange={(event) => {
          setCountryCode(event.target.value);
          setCityPlaceCode("");
          setCities([]);
        }}>
          <option value="">{copy("Tüm dünya", "Worldwide")}</option>
          {countries.map((country) => <option value={country.code} key={country.alpha3}>{flagEmoji(country.code)} {country.name}</option>)}
        </select></label>
        <label>{copy("Şehir (isteğe bağlı)", "City (optional)")}<select value={cityPlaceCode} disabled={!countryCode || citiesLoading} onChange={(event) => setCityPlaceCode(event.target.value)}>
          <option value="">{citiesLoading ? copy("Şehirler yükleniyor…", "Loading cities…") : countryCode ? copy("Tüm şehirler", "All cities") : copy("Önce ülke seç", "Choose a country first")}</option>
          {cities.map((option) => <option value={option.placeCode} key={option.placeCode}>{option.name}</option>)}
        </select></label>
        <label>{copy("Başlangıç", "From")}<input type="date" value={startDate} onChange={(event) => {
          const nextStartDate = event.target.value;
          setStartDate(nextStartDate);
          if (endDate && nextStartDate && endDate < nextStartDate) setEndDate(nextStartDate);
        }} /></label>
        <label>{copy("Bitiş", "To")}<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      </div>
      <div className="chip-scroll event-categories" role="group" aria-label={copy("Etkinlik kategorisi", "Event category")}>
        {CATEGORY_IDS.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{categoryLabel(item)}</button>)}
      </div>
      <button className="primary-wide" disabled={loading || !startDate || !endDate} onClick={() => void search()}>{loading ? <span className="button-loader" /> : <Icon name="search" size={18} />} {loading ? copy("Aranıyor", "Searching") : copy("Etkinlikleri bul", "Find events")}</button>
    </section>

    {!providerConfigured && <div className="info-box event-provider-note"><Icon name="info" size={18} /><p>{copy("Otomatik etkinlik sağlayıcısı henüz etkin değil. Bu sırada yönetici tarafından doğrulanmış duyurular gösterilir.", "The automatic event provider is not enabled yet. Verified editorial listings are shown in the meantime.")}</p></div>}
    {providerConfigured && coverageLimited && <div className="info-box event-provider-note"><Icon name="info" size={18} /><p>{copy("Bu ülke için canlı etkinlik kapsamı şu anda sınırlı. Yönetici tarafından doğrulanmış duyurular gösteriliyor.", "Live event coverage is currently limited for this country. Verified editorial listings are being shown.")}</p></div>}
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
              <div className="event-card-copy"><small>{flagEmoji(event.countryCode)} {[event.city, event.venue].filter(Boolean).join(" · ") || copy("Konum kaynağında", "See source for location")}</small><h3>{event.title}</h3><p>{new Intl.DateTimeFormat(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</p></div>
              {event.status !== "scheduled" && <em className={`event-status ${event.status}`}>{event.status === "cancelled" ? copy("İptal", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : copy("Tamamlandı", "Ended")}</em>}
            </div>
            {event.description && <p className="event-description">{event.description}</p>}
            <div className={`event-card-actions ${cancelled ? "two-actions" : ""}`}>
              <button className={saved ? "saved" : ""} onClick={() => save(event)}><Icon name={saved ? "check" : "plus"} size={16} />{saved ? copy("Planımda", "In my plan") : copy("Planıma ekle", "Add to plan")}</button>
              {!cancelled && <button onClick={() => void remind(event)}><Icon name="bell" size={16} />{copy("Hatırlat", "Remind me")}</button>}
              <button onClick={() => void openExternal(event.ticketUrl || event.sourceUrl)}><Icon name="external" size={16} />{event.ticketUrl ? copy("Bilet / kaynak", "Tickets / source") : copy("Kaynağı doğrula", "Verify source")}</button>
            </div>
          </article>;
        })}
        {searched && !loading && !error && !events.length && <div className="empty-state"><span><Icon name="calendar" size={29} /></span><strong>{copy("Bu aralıkta etkinlik bulunamadı", "No events found for these dates")}</strong><p>{copy("Şehir filtresini ‘Tüm şehirler’ yap, tarih aralığını genişlet veya başka kategori seç.", "Choose ‘All cities’, widen the dates or select another category.")}</p></div>}
      </div>}
    </section>
    <p className="event-disclaimer"><Icon name="shield" size={15} /> {copy("Saat, mekân, bilet ve iptal durumunu satın almadan önce bağlantılı kaynaktan ve etkinliğin resmî sitesinden doğrula.", "Before purchase, verify the time, venue, tickets and cancellation status through the linked source and the event's official site.")}</p>
  </div>;
}
