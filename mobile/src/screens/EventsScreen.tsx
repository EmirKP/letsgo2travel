import { formatAppDate } from "../lib/localeFormatting";
import { eventDateLabel, eventTimeLabel, eventLocalDate, hasEventTime } from "../../../lib/event-time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountryFlag } from "../components/CountryFlag";
import { DateTimeField } from "../components/DateTimeField";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { CountryPicker } from "../components/CountryPicker";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { listEventCities, listTravelEvents } from "../lib/api";
import { loadFeaturedEvents } from "../lib/featuredEvents";
import { clampLocalDate, isValidDateRange, localIsoDate } from "../lib/dates";
import { matchesEventCity, type EventSearchContext, type EventSearchFilters } from "../lib/eventSearchContext";
import { cancelEventReminder, reconcileEventReminders, scheduleEventReminder } from "../lib/eventReminders";
import { useI18n } from "../lib/i18n";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { EventCompanionsPanel } from "../components/EventCompanionsPanel";
import type { NoticeAction } from "../lib/notices";
import { openExternal } from "../lib/native";
import { getSavedTravelEvents, mergeSavedTravelEvents, toggleSavedTravelEvent } from "../lib/storage";
import { attachTravelEventToCockpitTrip, getSupabaseDataErrorMessage, listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import type { EventCityOption, TravelEvent, ViewId } from "../types";
import "./daily-journey.css";

const CATEGORY_IDS = ["all", "concert", "festival", "sport", "culture", "food", "family"] as const;

export function EventsScreen({ initialContext, initialFilters, onFiltersChange, onContextHandled, focusEventId, onFocusHandled, pendingTripEvent, onTripIntentPending, onTripIntentHandled, ownerId, accessToken, onOpenAccount, onOpenSaved, onOpenProfile, onCreateEventTrip, onNavigate, onNotice }: {
  initialContext?: EventSearchContext;
  initialFilters?: EventSearchFilters;
  onFiltersChange?: (filters: EventSearchFilters) => void;
  onContextHandled?: () => void;
  focusEventId?: string;
  onFocusHandled?: () => void;
  pendingTripEvent?: TravelEvent | null;
  onTripIntentPending?: (event: TravelEvent) => void;
  onTripIntentHandled?: () => void;
  ownerId?: string | null;
  accessToken?: string;
  onOpenAccount: () => void;
  onOpenSaved?: () => void;
  onOpenProfile?: (key: string) => void;
  onCreateEventTrip?: (event: TravelEvent) => void;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string, action?: NoticeAction) => void;
}) {
  const { locale, copy, countryName, dateLocale } = useI18n();
  const now = useCurrentTime();
  const [entryContext] = useState(() => initialContext);
  const [contextEdited, setContextEdited] = useState(false);
  const [focusedEntry, setFocusedEntry] = useState<{ owner: string | null; event: TravelEvent } | null>(null);
  const focusedEvent = focusedEntry?.owner === (ownerId || null) ? focusedEntry.event : null;
  useEffect(() => {
    if (!focusEventId) return;
    const event = getSavedTravelEvents(ownerId).find(item => item.id === focusEventId);
    if (event) setFocusedEntry(previous => previous?.owner === (ownerId || null) && previous.event === event ? previous : { owner: ownerId || null, event });
    else { setFocusedEntry(null); onNotice(copy("Bu etkinlik artık kayıtlı değil. Güncel etkinlikleri arayabilirsin.", "This event is no longer saved. Search for current events.")); }
    onFocusHandled?.();
  }, [focusEventId, ownerId, onFocusHandled, onNotice, copy]);
  const [restoredFilters] = useState(() => entryContext ? undefined : initialFilters);
  const [countryCode, setCountryCode] = useState(entryContext?.countryCode ?? initialFilters?.countryCode ?? "TR");
  const [cityPlaceCode, setCityPlaceCode] = useState(entryContext ? "" : initialFilters?.cityPlaceCode || "");
  const [cities, setCities] = useState<EventCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState(false);
  const [citiesReloadKey, setCitiesReloadKey] = useState(0);
  const [startDate, setStartDate] = useState(() => clampLocalDate(entryContext?.startDate || initialFilters?.startDate || localIsoDate(0), localIsoDate(0), localIsoDate(366)));
  const [endDate, setEndDate] = useState(() => clampLocalDate(entryContext?.endDate || initialFilters?.endDate || localIsoDate(7), startDate, localIsoDate(366)));
  const [query, setQuery] = useState(initialFilters?.query || '');
  const [contextCity, setContextCity] = useState(entryContext?.cityName || "");
  const [contextCityUnavailable, setContextCityUnavailable] = useState(false);
  const [contextReady, setContextReady] = useState(!entryContext?.cityName && !(initialFilters?.cityPlaceCode && !initialFilters.cityName));
  const [contextUnknown, setContextUnknown] = useState(Boolean(entryContext && !entryContext.countryCode));
  const [category, setCategory] = useState<(typeof CATEGORY_IDS)[number]>(entryContext ? "all" : initialFilters?.category || "all");
  const [events, setEvents] = useState<TravelEvent[]>([]);
  const [savedIds, setSavedIds] = useState(() => new Set(getSavedTravelEvents(ownerId).map((event) => event.id)));
  const [guideSaveSuccess, setGuideSaveSuccess] = useState<{ id: string; revision: number }>({ id: '', revision: 0 });
  useEffect(() => {
    const update = () => {
      try { setSavedIds(new Set(getSavedTravelEvents(ownerId).map(event => event.id))); }
      catch { /* Keep the last usable list; never turn unreadable storage into an empty write. */ }
    };
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, [ownerId]);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [paginationLimited, setPaginationLimited] = useState(false);
  const [showStarted, setShowStarted] = useState(false);
  const requestSerial = useRef(0);
  const searchInFlight = useRef(false);
  const eventFilters = useRef<HTMLDetailsElement>(null);
  useEffect(() => () => { requestSerial.current++; searchInFlight.current = false; }, []);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [coverageLimited, setCoverageLimited] = useState(false);
  const [coverageStatus, setCoverageStatus] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [featuredEvents, setFeaturedEvents] = useState<TravelEvent[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredUnavailable, setFeaturedUnavailable] = useState(false);
  const [featuredNotConfigured, setFeaturedNotConfigured] = useState(false);
  const [featuredPartial, setFeaturedPartial] = useState(false);
  const [featuredRetry, setFeaturedRetry] = useState(0);
  const [featuredGlobal, setFeaturedGlobal] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState<{ signature: string; label: string } | null>(null);
  const [tripEvent, setTripEvent] = useState<TravelEvent | null>(null);
  const [cockpitTrips, setCockpitTrips] = useState<CockpitTrip[]>([]);
  const [tripPickerLoading, setTripPickerLoading] = useState(false);
  const [tripPickerError, setTripPickerError] = useState("");
  const [tripPickerBusy, setTripPickerBusy] = useState("");

  const countries = useMemo(() => COUNTRY_LIST
    .map((country) => ({ ...country, name: countryName(country.alpha3, country.name), code: alpha2FromAlpha3(country.alpha3) }))
    .filter((country) => country.code)
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);

  const selectedCity = useMemo(() => {
    const current = cities.find((option) => option.placeCode === cityPlaceCode);
    const previous = restoredFilters;
    // A previously selected, owner-scoped city remains usable while its option
    // list is reloading or unavailable. Do not silently broaden that search.
    return current || (cityPlaceCode && previous?.countryCode === countryCode && previous.cityPlaceCode === cityPlaceCode && previous.cityName
      ? { name: previous.cityName, placeCode: cityPlaceCode } : undefined);
  }, [cities, cityPlaceCode, countryCode, restoredFilters]);

  const filterSignature = JSON.stringify([countryCode, cityPlaceCode, selectedCity?.name, startDate, endDate, category, query]);
  const reportedFilters = useRef("");
  useEffect(() => {
    if (!contextReady || contextUnknown || !onFiltersChange || reportedFilters.current === filterSignature) return;
    reportedFilters.current = filterSignature;
    onFiltersChange({ countryCode, cityPlaceCode, cityName: selectedCity?.name, startDate, endDate, category, query });
  }, [contextReady, contextUnknown, filterSignature, onFiltersChange, countryCode, cityPlaceCode, selectedCity?.name, startDate, endDate, category, query]);
  const contextHandled = useRef(!entryContext);
  useEffect(() => {
    if (contextHandled.current || !contextReady || contextUnknown || !onContextHandled) return;
    contextHandled.current = true;
    onContextHandled();
  }, [contextReady, contextUnknown, onContextHandled]);

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
    setCities([]);
    setCitiesError(false);
    if (!countryCode) {
      setCitiesLoading(false);
      setContextReady(true);
      return () => { current = false; };
    }
    setCitiesLoading(true);
    void listEventCities(countryCode)
      .then((options) => {
        if (!current) return;
        setCities(options);
        if (contextCity && countryCode === entryContext?.countryCode) {
          const match = options.find(option => matchesEventCity(option.name, contextCity, countryCode));
          setCityPlaceCode(match?.placeCode || "");
          setContextCityUnavailable(!match);
        }
      })
      .catch(() => { if (current) { setCities([]); setCitiesError(true); setContextCityUnavailable(Boolean(contextCity)); } })
      .finally(() => { if (current) { setCitiesLoading(false); setContextReady(true); } });
    return () => { current = false; };
  }, [countryCode, citiesReloadKey]);

  useEffect(() => {
    let current = true;
    if (!featuredOpen) return () => { current = false; };
    const dates = { startDate: localIsoDate(0), endDate: localIsoDate(180) };
    setFeaturedLoading(true);
    setFeaturedUnavailable(false);
    setFeaturedNotConfigured(false);
    setFeaturedPartial(false);
    setFeaturedGlobal(false);
    void (async () => {
      try {
        const result = await loadFeaturedEvents(countryCode, dates);
        if (current) {
          setFeaturedEvents(result.events);
          setFeaturedGlobal(result.global);
          setFeaturedUnavailable(result.unavailable && !result.events.length);
          setFeaturedNotConfigured(result.notConfigured);
          setFeaturedPartial(result.partial);
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
  }, [countryCode, featuredOpen, featuredRetry]);

  useEffect(() => {
    setSavedIds(new Set(getSavedTravelEvents(ownerId).map((event) => event.id)));
  }, [ownerId]);

  const categoryLabel = (value: TravelEvent["category"] | "all") => ({
    all: copy("Tümü", "All"), concert: copy("Konser", "Concert"), festival: copy("Festival", "Festival"), sport: copy("Spor", "Sport"), culture: copy("Kültür", "Culture"), food: copy("Yeme içme", "Food"), family: copy("Aile", "Family"), other: copy("Diğer", "Other"),
  })[value];

  const search = async (nextCategory = category, append = false, dates?: { start: string; end: string }) => {
    if (searchInFlight.current || !contextReady) return;
    if (contextUnknown) {
      setError(copy("Etkinlik aramak için önce ülkeni seç.", "Choose your country before searching for events.", "Zgjidh shtetin para se të kërkosh aktivitete."));
      return;
    }
    const today = localIsoDate(0);
    const latest = localIsoDate(366);
    const requestedStart = dates?.start || startDate, requestedEnd = dates?.end || endDate;
    if (!isValidDateRange(requestedStart, requestedEnd, today, latest)) {
      setSearched(true);
      setEvents([]);
      setError(copy("Tarihleri bugünden başlayarak en fazla bir yıllık geçerli bir aralıkta seç.", "Choose a valid date range from today through the next year."));
      return;
    }
    searchInFlight.current = true;
    const serial = ++requestSerial.current;
    if (append) { setMoreLoading(true); setMoreError(''); }
    else { setLoading(true); setError(''); setMoreError(''); setCoverageLimited(false); setCoverageStatus(''); setNextCursor(null); }
    setSearched(true);
    const requestedSignature = [countryCode, cityPlaceCode, requestedStart, requestedEnd, nextCategory, query.trim()].join("|");
    const requestedLabel = [selectedCity?.name || countries.find(country => country.code === countryCode)?.name || copy("Tüm dünya", "Worldwide"), `${requestedStart} – ${requestedEnd}`, categoryLabel(nextCategory), query.trim()].filter(Boolean).join(" · ");
    try {
      const result = await listTravelEvents({
        countryCode,
        city: selectedCity?.name,
        placeCode: selectedCity?.placeCode,
        startDate: requestedStart,
        endDate: requestedEnd,
        category: nextCategory,
        limit: 30,
        query,
        paginated: true,
        cursor: append ? nextCursor || undefined : undefined,
      });
      if (serial !== requestSerial.current) return;
      const freshEvents = Array.isArray(result.data) ? result.data : [];
      setEvents(previous => {
        const seenIds = new Set<string>(), seenEvents = new Set<string>();
        const normalized = (value: string) => value.toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        return [...(append ? previous : []), ...freshEvents].filter(event => {
          const key = [normalized(event.title), event.startsAt.slice(0, 10), event.countryCode, normalized(event.city)].join('|');
          if (seenIds.has(event.id) || seenEvents.has(key)) return false;
          seenIds.add(event.id); seenEvents.add(key); return true;
        });
      });
      setNextCursor(result.meta?.nextCursor || null);
      setPaginationLimited(result.meta?.paginationLimited === true);
      setAppliedSearch({ signature: requestedSignature, label: requestedLabel });
      setProviderConfigured(result.meta?.providerConfigured !== false);
      setCoverageLimited(result.meta?.coverageLimited === true);
      setCoverageStatus(result.meta?.coverageStatus || "");
      setUpdatedAt(result.meta?.updatedAt || "");
      // Device maintenance is independent of the successful provider search.
      // A full store or delayed native notification must not erase or block it.
      try {
        const merged = mergeSavedTravelEvents(freshEvents, ownerId);
        setSavedIds(new Set(merged.events.map((item) => item.id)));
      } catch {
        onNotice(copy("Etkinlikler yüklendi; kayıtlı etkinlikler güncellenemedi. Cihaz depolamasını kontrol et.", "Events loaded, but saved events could not be refreshed. Check device storage.", "Aktivitetet u ngarkuan, por të ruajturat nuk u rifreskuan. Kontrollo hapësirën e pajisjes."));
      }
      void reconcileEventReminders(freshEvents, locale, ownerId).then(changes => {
        if (serial === requestSerial.current && changes > 0) onNotice(copy("Kayıtlı etkinliklerin tarih veya durum değişiklikleri güncellendi.", "Date or status changes for your saved events were updated."));
      }).catch(() => {
        if (serial === requestSerial.current) onNotice(copy("Etkinlik hatırlatıcıları güncellenemedi. Etkinlik sonuçlarını kullanmaya devam edebilirsin.", "Event reminders could not be refreshed. Your event results are still available.", "Kujtesat e aktiviteteve nuk u rifreskuan. Rezultatet mbeten të disponueshme."));
      });
    } catch (requestError) {
      if (serial !== requestSerial.current) return;
      if (append) { setMoreError(copy('Diğer etkinlikler yüklenemedi. Tekrar deneyebilirsin.', 'Could not load more events. Try again.', 'Aktivitetet e tjera nuk u ngarkuan. Provo sërish.')); return; }
      setEvents([]);
      setCoverageLimited(false);
      setCoverageStatus("");
      setError(requestError instanceof Error && requestError.message && !/fetch|network|load failed/i.test(requestError.message)
        ? requestError.message
        : copy("Etkinlikler yüklenemedi. Bağlantını kontrol edip yeniden dene.", "Events could not be loaded. Check your connection and try again."));
    } finally {
      if (serial === requestSerial.current) { searchInFlight.current = false; setLoading(false); setMoreLoading(false); }
    }
  };

  useEffect(() => { if (contextReady && !contextUnknown) void search(); /* Explicit nearby context resolves before the first request. */ }, [contextReady]);

  const save = (event: TravelEvent) => {
    try {
    const result = toggleSavedTravelEvent(event, ownerId);
    setSavedIds(new Set(result.events.map((item) => item.id)));
    if (result.saved) setGuideSaveSuccess(previous => ({ id: event.id, revision: previous.revision + 1 }));
    if (!result.saved) void cancelEventReminder(event.id, ownerId).then(ok => { if (!ok) onNotice(copy("Hatırlatıcı iptali bekliyor; yeniden denenecek.", "Reminder cancellation is pending and will retry.")); }).catch(() => onNotice(copy("Hatırlatıcı iptal edilemedi.", "Reminder could not be cancelled.")));
    onNotice(ownerId ? copy("Etkinlik seçimin cihazda kaydedildi; hesabınla eşitlenecek.", "Your event selection is saved on this device and queued for account sync.", "Zgjedhja e aktivitetit u ruajt në këtë pajisje dhe pret sinkronizimin me llogarinë.") : result.saved ? copy("Etkinlik planına eklendi.", "Event added to your plan.") : copy("Etkinlik planından çıkarıldı.", "Event removed from your plan."), result.saved && onOpenSaved ? { label: copy('Planlar’da aç','Open in Plans','Hap te Planet'), onClick: onOpenSaved } : undefined);
    } catch { onNotice(copy("Etkinlik kaydı değiştirilemedi. Cihaz depolamasını kontrol et.", "Could not update saved events. Check device storage.")); }
  };

  const remind = async (event: TravelEvent) => {
    if (!hasEventTime(event)) {
      onNotice(copy("Saat açıklanmadan hatırlatıcı kurulamaz.", "A reminder needs a confirmed start time.", "Kujtesa kërkon orën e konfirmuar të fillimit."));
      return;
    }
    if (event.status !== 'scheduled' || !Number.isFinite(Date.parse(event.startsAt)) || Date.parse(event.startsAt) <= Date.now() + 60_000) {
      onNotice(copy("Geçmiş, tamamlanmış veya iptal edilmiş etkinliğe hatırlatma kurulamaz.", "A reminder cannot be set for a past, completed or cancelled event.", "Nuk mund të vendoset kujtesë për aktivitete të kaluara, të përfunduara ose të anuluara."));
      return;
    }
    try {
      // Keep the tap target durable before asking the OS to schedule anything.
      if (!getSavedTravelEvents(ownerId).some(item => item.id === event.id)) {
        const saved = toggleSavedTravelEvent(event, ownerId);
        setSavedIds(new Set(saved.events.map(item => item.id)));
      }
      const result = await scheduleEventReminder(event, locale, ownerId);
      if (result.ok) onNotice(copy("Etkinlik kaydedildi ve hatırlatıcısı kuruldu.", "Event saved and reminder set."));
      else if (result.reason === "permission") onNotice(copy("Hatırlatma için bildirim izni vermelisin.", "Enable notifications to set a reminder."));
      else if (result.reason === "time") onNotice(copy("Saat açıklanmadan hatırlatıcı kurulamaz.", "A reminder needs a confirmed start time."));
      else if (result.reason === "past" || result.reason === "status") onNotice(copy("Geçmiş, tamamlanmış veya iptal edilmiş etkinliğe hatırlatma kurulamaz.", "A reminder cannot be set for a past, completed or cancelled event."));
      else onNotice(copy("Etkinlik hatırlatıcısı yalnız mobil uygulamada kullanılabilir.", "Event reminders are available in the mobile app."));
    } catch {
      onNotice(copy("Hatırlatma kurulamadı.", "The reminder could not be set."));
    }
  };

  const openTripPicker = useCallback(async (event: TravelEvent) => {
    const day = eventLocalDate(event);
    if (!day || day < localIsoDate(0) || !['scheduled', 'postponed'].includes(event.status)) {
      onNotice(copy("Bu etkinliğin tarihi veya durumu seyahate eklemeye uygun değil. Güncel bilgiyi kaynağından kontrol et.", "This event's date or status cannot be added to a trip. Check the source for current details.", "Data ose gjendja e aktivitetit nuk lejon shtimin në udhëtim. Kontrollo burimin për të dhënat aktuale."));
      return;
    }
    if (!ownerId || !accessToken) {
      onTripIntentPending?.(event);
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
  }, [ownerId, accessToken, copy, onNotice, onOpenAccount, onTripIntentPending]);
  const resumedTripIntent = useRef<TravelEvent | null>(null);
  useEffect(() => {
    if (!pendingTripEvent) { resumedTripIntent.current = null; return; }
    if (!ownerId || !accessToken || resumedTripIntent.current === pendingTripEvent) return;
    resumedTripIntent.current = pendingTripEvent;
    setFocusedEntry({ owner: ownerId, event: pendingTripEvent });
    void openTripPicker(pendingTripEvent);
    onTripIntentHandled?.();
  }, [pendingTripEvent, ownerId, accessToken, openTripPicker, onTripIntentHandled]);

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

  const eventDay = tripEvent ? eventLocalDate(tripEvent) : "";
  const hasCompatibleTrip = cockpitTrips.some((trip) => Boolean(eventDay && eventDay >= trip.startDate && eventDay <= trip.endDate));
  const filtersChanged = Boolean(appliedSearch && appliedSearch.signature !== [countryCode, cityPlaceCode, startDate, endDate, category, query.trim()].join("|"));
  const liveSearchUnavailable = !providerConfigured || coverageStatus === 'not_configured';
  const canConfirmEmpty = providerConfigured && !coverageLimited && !nextCursor && coverageStatus !== 'provider_unavailable' && coverageStatus !== 'not_configured';
  const alreadyStarted = (event: TravelEvent) => hasEventTime(event) && Number.isFinite(Date.parse(event.startsAt)) && Date.parse(event.startsAt) < now;
  const upcomingEvents = events.filter(event => !alreadyStarted(event)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const startedEvents = events.filter(alreadyStarted).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const displayedEvents = showStarted ? [...upcomingEvents, ...startedEvents] : upcomingEvents;
  const guideRecovery = searched && !loading && !error
    ? !events.length && canConfirmEmpty ? 'empty'
      : events.length > 0 && events.every(event => savedIds.has(event.id)) ? 'saved' : undefined
    : undefined;

  function eventPlanningActions(event: TravelEvent) {
    const day = eventLocalDate(event);
    const canAdd = (event.status === 'scheduled' || event.status === 'postponed') && Boolean(day) && day >= localIsoDate(0);
    if (!canAdd) return null;
    const canRemind = hasEventTime(event) && event.status === 'scheduled' && Date.parse(event.startsAt) > now + 60_000;
    return <>
      <button type="button" className="event-add-to-trip" onClick={() => void openTripPicker(event)}><Icon name="suitcase" size={16} />{copy("Seyahate ekle", "Add to trip", "Shto në udhëtim")}</button>
      <button type="button" disabled={!canRemind} onClick={() => void remind(event)}><Icon name="bell" size={16} />{copy("Hatırlat", "Remind me", "Më kujto")}</button>
    </>;
  }

  return <div className="screen events-screen daily-events">
    <Sheet open={Boolean(focusedEvent) && !tripEvent} title={copy("Etkinlik ayrıntıları", "Event details")} onClose={() => setFocusedEntry(null)}>
      {focusedEvent && <div className="form-card event-detail-card">{focusedEvent.imageUrl && <img className="event-detail-photo" src={focusedEvent.imageUrl} alt="" loading="lazy"/>}<h3>{focusedEvent.title}</h3><p>{focusedEvent.city} · {focusedEvent.venue}</p><p>{eventDateLabel(focusedEvent, dateLocale, undefined, formatAppDate)} · {eventTimeLabel(focusedEvent, dateLocale, formatAppDate)}</p><p>{focusedEvent.description}</p>
        <div className="event-card-actions with-trip-action"><button type="button" aria-pressed={savedIds.has(focusedEvent.id)} onClick={() => save(focusedEvent)}><Icon name={savedIds.has(focusedEvent.id) ? 'check' : 'bookmark'} size={16}/>{savedIds.has(focusedEvent.id) ? copy('Kaydedildi', 'Saved', 'U ruajt') : copy('Kaydet', 'Save', 'Ruaj')}</button>{eventPlanningActions(focusedEvent)}<button type="button" onClick={() => void openExternal(focusedEvent.ticketUrl || focusedEvent.sourceUrl)}>{copy("Kaynağı aç", "Open source", "Hap burimin")}</button></div>
        {!hasEventTime(focusedEvent) && <p className="form-hint">{copy("Hatırlatıcı için etkinliğin kesin başlangıç saati gerekli. Saat açıklanınca tekrar deneyebilirsin.", "A reminder needs the confirmed start time. Try again when the time is announced.", "Kujtesa kërkon orën e konfirmuar të fillimit. Provo sërish kur të shpallet ora.")}</p>}
        <p className="form-hint">{copy("Tarih ve iptal durumunu gitmeden önce kaynağından doğrula.", "Check dates and cancellation status with the source before going.", "Verifiko datat dhe anulimet te burimi para se të nisesh.")}</p>
        <EventCompanionsPanel event={focusedEvent} ownerId={ownerId} accessToken={accessToken} onOpenAccount={onOpenAccount} onNotice={onNotice} onOpenProfile={onOpenProfile}/>
      </div>}
    </Sheet>
    <header className="daily-page-heading"><span>{copy("TAKVİMİNE BİR AN EKLE", "MAKE TIME FOR SOMETHING GOOD")}</span><h1>{copy("Oradayken ne var?", "What's on while you're there?")}</h1><p>{copy("Yerini ve tarihlerini seç; kaçırmak istemediklerini kaydet.", "Choose your place and dates. Save what you don't want to miss.")}</p></header>
    {entryContext && !contextEdited && <p className="info-box" role="status">{contextUnknown ? copy("Yaklaşık konumundan ülke belirlenemedi. Etkinlik aramak istediğin ülkeyi seç.", "Your country could not be determined from your approximate location. Choose where to search for events.", "Shteti nuk u përcaktua nga vendndodhja e përafërt. Zgjidh ku të kërkosh aktivitete.") : contextCityUnavailable && citiesError ? copy("Şehir seçenekleri yüklenemedi; seçili ülkenin tüm şehirleri aranıyor. Şehir yüklemesini yeniden deneyebilirsin.", "City options could not be loaded; searching all cities in the selected country. You can retry loading cities.", "Qytetet nuk u ngarkuan; kërkohen të gjitha qytetet e shtetit të zgjedhur. Mund ta provosh sërish ngarkimin.") : contextCityUnavailable ? copy(`${contextCity} şehir filtresi kaynakta bulunamadı; seçili ülkenin tüm şehirleri gösteriliyor. Şehri ve tarihleri değiştirebilirsin.`, `The source has no city filter for ${contextCity}; showing all cities in the selected country. You can change the city and dates.`, `Burimi nuk ka filtër qyteti për ${contextCity}; shfaqen të gjitha qytetet e shtetit të zgjedhur. Mund të ndryshosh qytetin dhe datat.`) : copy("Yaklaşık konumun ve önümüzdeki 7 gün için açıldı. Ülkeyi, şehri ve tarihleri değiştirebilirsin.", "Opened for your approximate location and the next 7 days. You can change the country, city and dates.", "U hap për vendndodhjen tënde të përafërt dhe 7 ditët e ardhshme. Mund të ndryshosh shtetin, qytetin dhe datat.")}</p>}
    <button type="button" className="daily-event-saved" data-guide="event-saved" onClick={() => onOpenSaved ? onOpenSaved() : onNavigate("trips")}><Icon name="bookmark" size={20}/><span>{copy("Kayıtlı etkinliklerim", "My saved events")}<small>{copy(`${savedIds.size} etkinlik`, `${savedIds.size} events`, `${savedIds.size} aktivitete`)}</small></span><Icon name="chevron" size={18}/></button>

    <form className="event-name-search" role="search" onSubmit={event => { event.preventDefault(); void search(); }}><Icon name="search" size={21}/><label className="sr-only" htmlFor="event-name-query">{copy('Etkinlik veya sanatçı ara', 'Search events or artists', 'Kërko aktivitete ose artistë')}</label><input id="event-name-query" type="search" value={query} maxLength={120} autoComplete="off" placeholder={copy('Etkinlik veya sanatçı adı', 'Event or artist name', 'Emri i aktivitetit ose artistit')} onChange={event => setQuery(event.target.value)}/><button type="submit" disabled={loading || moreLoading || !contextReady} aria-label={copy('Etkinlik adıyla ara', 'Search by event name', 'Kërko sipas emrit të aktivitetit')}><Icon name="chevron" size={21}/></button></form>
    <div className="event-quick-dates" role="group" aria-label={copy('Hızlı tarih seçimi', 'Quick dates', 'Datat e shpejta')}>{[{ days: 0, label: copy('Bugün', 'Today', 'Sot') }, { days: 7, label: copy('7 gün', '7 days', '7 ditë') }, { days: 30, label: copy('30 gün', '30 days', '30 ditë') }].map(option => <button type="button" key={option.days} disabled={loading || moreLoading || !contextReady} aria-pressed={startDate === localIsoDate(0) && endDate === localIsoDate(option.days)} onClick={() => { const dates = { start: localIsoDate(0), end: localIsoDate(option.days) }; setContextEdited(true); setStartDate(dates.start); setEndDate(dates.end); void search(category, false, dates); }}>{option.label}</button>)}</div>

          <div className="chip-scroll event-categories" role="group" aria-label={copy("Etkinlik kategorisi", "Event category")}>
        {CATEGORY_IDS.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} disabled={loading || moreLoading || !contextReady} onClick={() => { setContextEdited(true);setCategory(item); void search(item); }}>{categoryLabel(item)}</button>)}
      </div>
    <details ref={eventFilters} className="event-filter-disclosure" open><summary><Icon name="calendar" size={17} /><span>{copy("Ülke ve tarih seç", "Choose country and dates")}</span><Icon name="chevron" size={15} /></summary>
    <section className="event-search-card" aria-label={copy("Etkinlik araması", "Event search")}>
      <div className="event-search-grid">
        <CountryPicker value={countryCode} options={countryOptions} includeWorldwide label={copy("Ülke", "Country")} placeholder={copy("Tüm dünya", "Worldwide")} onChange={(nextCountryCode) => {
          setCountryCode(nextCountryCode);
          setContextEdited(true);
          setContextCity("");
          setContextCityUnavailable(false);
          setContextUnknown(false);
          setCityPlaceCode("");
          setCities([]);
          setCitiesError(false);
        }} />
        <label>{copy("Şehir (isteğe bağlı)", "City (optional)")}<select value={cityPlaceCode} disabled={!countryCode || citiesLoading} onChange={(event) => {setContextEdited(true);setCityPlaceCode(event.target.value);}}>
          <option value="">{citiesLoading ? copy("Şehirler yükleniyor…", "Loading cities…") : countryCode ? copy("Tüm şehirler", "All cities") : copy("Önce ülke seç", "Choose a country first")}</option>
          {selectedCity && !cities.some(city => city.placeCode === selectedCity.placeCode) && <option value={selectedCity.placeCode}>{selectedCity.name}</option>}
          {cities.map((option) => <option value={option.placeCode} key={option.placeCode}>{option.name}</option>)}
        </select></label>
        <DateTimeField type="date" label={copy("Başlangıç", "From")} min={localIsoDate(0)} max={localIsoDate(366)} value={startDate} onChange={(requested) => {
          setContextEdited(true);
          const nextStartDate = clampLocalDate(requested, localIsoDate(0), localIsoDate(366));
          setStartDate(nextStartDate);
          if (endDate && nextStartDate && endDate < nextStartDate) setEndDate(nextStartDate);
          if (requested && requested !== nextStartDate) onNotice(copy("Geçmiş bir başlangıç tarihi seçilemez.", "A past start date cannot be selected."));
        }} />
        <DateTimeField type="date" label={copy("Bitiş", "To")} min={startDate || localIsoDate(0)} max={localIsoDate(366)} value={endDate} onChange={(requested) => {
          setContextEdited(true);
          const nextEndDate = clampLocalDate(requested, startDate || localIsoDate(0), localIsoDate(366));
          setEndDate(nextEndDate);
          if (requested && requested !== nextEndDate) onNotice(copy("Bitiş tarihi başlangıçtan önce olamaz.", "The end date cannot be before the start date."));
        }} />
      </div>
      {countryCode && !cityPlaceCode && !citiesLoading && !citiesError && <p className="event-city-scope"><Icon name="info" size={14} /> {copy("Tüm şehirler seçiliyken ülke genelindeki sonuçlar aranır; canlı kapsam sağlayıcıya göre değişebilir.", "With all cities selected, results are searched countrywide; live coverage can vary by provider.")}</p>}
      {citiesError && <div className="event-city-error" role="alert"><Icon name="alert" size={16} /><span>{selectedCity ? copy("Şehir seçenekleri güncellenemedi. Önceki şehir seçimin korundu; yeniden deneyebilirsin.", "City options could not be refreshed. Your previous city selection was kept; you can try again.", "Opsionet e qyteteve nuk u rifreskuan. Qyteti i zgjedhur u ruajt; mund të provosh sërish.") : copy("Şehirler yüklenemedi; tüm ülkeyi arayabilir veya yeniden deneyebilirsin.", "Cities could not be loaded; search the whole country or try again.")}</span><button type="button" onClick={() => setCitiesReloadKey((value) => value + 1)}>{copy("Yeniden dene", "Retry")}</button></div>}

      <button data-guide="event-search" data-guide-event-recovery={guideRecovery} data-guide-complete={appliedSearch && !filtersChanged && !loading && !error && (events.length > 0 || canConfirmEmpty) ? "true" : undefined} className="primary-wide" disabled={loading || !startDate || !endDate || !contextReady} onClick={() => void search()}>{loading ? <span className="button-loader" /> : <Icon name="search" size={18} />} {loading ? copy("Aranıyor", "Searching") : copy("Etkinlikleri bul", "Find events")}</button>
    </section>

    </details>
    {filtersChanged && <div className="daily-event-changed" role="status"><p>{copy("Filtreler değişti. Aşağıdaki liste son aramana ait.", "Filters changed. The list below is from your last search.")}</p><button type="button" disabled={loading} onClick={() => void search()}>{copy("Sonuçları güncelle", "Update results")}</button></div>}

    <details className="daily-featured-disclosure" onToggle={event => setFeaturedOpen(event.currentTarget.open)}><summary><Icon name="sparkles" size={18}/>{copy("Dünyadan konser fikirleri", "Concert inspiration worldwide")}<Icon name="chevron" size={16}/></summary><section className="featured-events" aria-labelledby="featured-events-title">
      <div className="featured-events-heading"><div><span>{copy("DÜNYA SAHNESİ", "WORLD STAGE")}</span><h2 id="featured-events-title">{copy("Öne çıkan konserler", "Concert highlights")}</h2></div><small>{featuredGlobal ? copy("Dünyadan seçildi", "Selected worldwide") : countryCode ? copy("Seçili ülkede", "In selected country") : copy("Tüm dünyada", "Worldwide")}</small></div>
      {featuredLoading ? <div className="featured-skeleton"><div /><div /></div>
        : featuredEvents.length ? <div className="featured-event-list">{featuredEvents.map((event) => <button type="button" key={`featured-${event.id}`} onClick={() => setFocusedEntry({ owner: ownerId || null, event })} aria-haspopup="dialog">
          <span className="featured-event-mark">{event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" width="58" height="62" onError={e => { e.currentTarget.hidden = true; }} /> : <Icon name="calendar" size={23} />}</span>
          <span className="featured-event-copy"><small>{[event.city, event.venue].filter(Boolean).join(" · ") || event.countryCode}</small><strong>{event.title}</strong><em>{eventDateLabel(event, dateLocale, undefined, formatAppDate)}{event.impactRank ? ` · ${copy("Yüksek ilgi", "High impact")}` : ""}</em></span>
          <Icon name="chevron" size={17} />
        </button>)}</div>
          : <div className="featured-event-empty" role="status"><Icon name={featuredUnavailable ? "offline" : "calendar"} size={22} /><p>{featuredNotConfigured ? copy("Konser önerileri henüz kullanıma açık değil.", "Concert highlights are not available yet.") : featuredUnavailable ? copy("Konser kaynaklarına şu anda ulaşılamıyor. Yeniden deneyebilirsin.", "Concert sources are temporarily unavailable. You can try again.") : copy("Önümüzdeki dönemde öne çıkan konser bulunamadı.", "No concert highlights were found for the coming months.")}</p>{featuredUnavailable && <button type="button" onClick={() => setFeaturedRetry(value => value + 1)}><Icon name="refresh" size={16}/>{copy("Yeniden dene", "Try again")}</button>}</div>}
      {!featuredLoading && featuredEvents.length > 0 && featuredPartial && <p className="featured-coverage-note">{copy("Ulaşılabilen konser kaynaklarından öneriler gösteriliyor; tüm konserleri kapsamayabilir.", "Suggestions use the concert sources currently available and may not include every concert.")}</p>}
    </section></details>

    {searched && !loading && !error && liveSearchUnavailable && <div className="info-box event-provider-note" role="status"><Icon name="info" size={18} /><p>{events.length
      ? copy("Canlı etkinlik araması şu anda kullanılamıyor. Doğrulanmış etkinlik duyuruları gösteriliyor.", "Live event search is unavailable right now. Verified event listings are shown.", "Kërkimi i drejtpërdrejtë i aktiviteteve nuk është i disponueshëm tani. Shfaqen njoftime të verifikuara.")
      : copy("Canlı etkinlik araması şu anda kullanılamıyor.", "Live event search is unavailable right now.", "Kërkimi i drejtpërdrejtë i aktiviteteve nuk është i disponueshëm tani.")}</p></div>}
    {providerConfigured && coverageStatus === "provider_unavailable" && <div className="info-box event-provider-note event-provider-unavailable" role="status"><Icon name="alert" size={18} /><p>{events.length
      ? copy("Canlı etkinlik kaynağına şu anda ulaşılamıyor. Biraz sonra yeniden dene; doğrulanmış duyurular gösterilmeye devam ediyor.", "The live event source is temporarily unavailable. Try again shortly; verified listings remain visible.", "Burimi i aktiviteteve nuk është i disponueshëm. Provo përsëri më vonë; njoftimet e verifikuara mbeten të dukshme.")
      : copy("Canlı etkinlik kaynağına şu anda ulaşılamıyor; sonuçları doğrulayamadık. Seçimlerin korundu, yeniden deneyebilirsin.", "The live event source is unavailable, so we could not check the results. Your choices are kept; try again.", "Burimi i aktiviteteve nuk është i disponueshëm, ndaj rezultatet nuk u verifikuan. Zgjedhjet ruhen; provo sërish.")}</p><button type="button" disabled={loading} onClick={() => void search()}>{copy("Yeniden dene", "Retry", "Provo sërish")}</button></div>}
    {!liveSearchUnavailable && coverageLimited && coverageStatus !== "provider_unavailable" && <div className="info-box event-provider-note"><Icon name="info" size={18} /><p>{copy("Bu ülke için canlı etkinlik kapsamı şu anda sınırlı. Doğrulanmış etkinlik duyuruları gösteriliyor.", "Live event coverage is currently limited for this country. Verified event listings are shown.", "Mbulimi i aktiviteteve për këtë shtet është i kufizuar. Shfaqen njoftime të verifikuara.")}</p></div>}
    {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p><button onClick={() => void search()}>{copy("Tekrar dene", "Try again")}</button></div>}

    <section className="section-block event-results">
      {appliedSearch && <p className="daily-event-result-scope">{appliedSearch.label}</p>}
      <div className="section-heading"><div><span>{copy("TARİHİNE UYGUN", "MATCHING YOUR DATES")}</span><h2>{copy("Yaklaşan etkinlikler", "Upcoming events")}</h2></div>{updatedAt && <small>{copy("Güncellendi", "Updated")} {formatAppDate(new Date(updatedAt), dateLocale, { hour: "2-digit", minute: "2-digit" })}</small>}</div>
      {loading && !events.length ? <div className="skeleton-list"><div /><div /><div /></div> : <div className="event-list">
        {displayedEvents.map((event) => {
          const saved = savedIds.has(event.id);
          const cancelled = event.status === "cancelled";
          return <article className={`event-card ${cancelled ? "cancelled" : ""}`} key={event.id}>
            {event.imageUrl ? <div className="event-card-image" style={{ backgroundImage: `linear-gradient(180deg,rgba(7,27,51,.04),rgba(7,27,51,.78)),url(${event.imageUrl})` }}><span>{categoryLabel(event.category)}</span></div> : <div className="event-card-image event-card-placeholder"><Icon name="calendar" size={31} /><span>{categoryLabel(event.category)}</span></div>}
            <div className="event-card-body">
              <div className="event-card-date"><strong>{eventDateLabel(event, dateLocale, { day: "2-digit" }, formatAppDate)}</strong><span>{eventDateLabel(event, dateLocale, { month: "short" }, formatAppDate)}</span></div>
              <div className="event-card-copy"><small><CountryFlag code={event.countryCode} label={event.countryCode} className="event-inline-flag" /><span>{[event.city, event.venue].filter(Boolean).join(" · ") || copy("Konum kaynağında", "See source for location")}</span></small><h3>{event.title}</h3><p>{eventTimeLabel(event, dateLocale, formatAppDate)}</p></div>
              {event.status !== "scheduled" && <em className={`event-status ${event.status}`}>{event.status === "cancelled" ? copy("İptal", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : copy("Tamamlandı", "Ended")}</em>}
            </div>
            {event.description && <p className="event-description">{event.description}</p>}
            {alreadyStarted(event) && <p className="event-started-label"><Icon name="clock" size={14}/>{copy('Başlangıç saati geçti', 'Start time has passed', 'Ora e fillimit ka kaluar')}</p>}
            <div className={`event-card-actions with-trip-action ${cancelled ? "two-actions" : ""}`}>
              <button data-guide="event-save" data-guide-save-success={guideSaveSuccess.id === event.id ? String(guideSaveSuccess.revision) : undefined} aria-pressed={saved} className={saved ? "saved" : ""} onClick={() => save(event)}><Icon name={saved ? "check" : "bookmark"} size={16} />{saved ? copy("Kaydedildi", "Saved") : copy("Kaydet", "Save")}</button>
              {eventPlanningActions(event)}
              <button onClick={() => void openExternal(event.ticketUrl || event.sourceUrl)}><Icon name="external" size={16} />{event.ticketUrl ? copy("Bilet / kaynak", "Tickets / source") : copy("Kaynağı doğrula", "Verify source")}</button>
              <button type="button" className="event-companions-open" onClick={() => setFocusedEntry({ owner: ownerId || null, event })}><Icon name="users" size={16}/>{copy('Kimler gidiyor? · Sohbet','Who’s going? · Chat','Kush po shkon? · Bisedo')}</button>
            </div>
          </article>;
        })}
        {searched && !loading && !error && !events.length && canConfirmEmpty && <div className="empty-state"><span><Icon name="calendar" size={29} /></span><strong>{copy("Bu aralıkta etkinlik bulunamadı", "No events found for these dates")}</strong><p>{copy("Şehir filtresini ‘Tüm şehirler’ yap, tarih aralığını genişlet veya başka kategori seç.", "Choose ‘All cities’, widen the dates or select another category.")}</p></div>}
        {searched && !loading && !error && !events.length && liveSearchUnavailable && <div className="empty-state event-listings-unavailable" role="status"><span><Icon name="calendar" size={29}/></span><strong>{copy("Bu seçim için henüz etkinlik gösterilemiyor", "We cannot show verified listings for this selection yet", "Ende nuk mund të shfaqim njoftime të verifikuara për këtë zgjedhje")}</strong><p>{copy("Bu, etkinlik olmadığı anlamına gelmez. Başka bir ülke veya tarih aralığı seçebilir ya da daha sonra tekrar deneyebilirsin.", "This does not mean there are no events. Choose another country or date range, or try again later.", "Kjo nuk do të thotë se nuk ka aktivitete. Zgjidh një shtet ose periudhë tjetër, ose provo më vonë.")}</p><button type="button" className="secondary-button" onClick={() => { const filters = eventFilters.current; if (!filters) return; filters.open = true; filters.scrollIntoView({ block: 'start', behavior: 'auto' }); filters.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }}>{copy("Ülke veya tarihleri değiştir", "Change country or dates", "Ndrysho shtetin ose datat")}</button></div>}
        {!loading && !error && !upcomingEvents.length && (startedEvents.length > 0 || nextCursor) && <p className="event-page-note" role="status">{nextCursor ? copy('Bu sayfada henüz başlayacak etkinlik yok. Diğer sonuçları da kontrol edebilirsin.', 'No upcoming events on this page. You can check more results.', 'Nuk ka aktivitete të ardhshme në këtë faqe. Mund të kontrollosh rezultate të tjera.') : copy('Bu aralıktaki etkinliklerin başlangıç saati geçmiş.', 'The start times for these events have passed.', 'Orët e fillimit të këtyre aktiviteteve kanë kaluar.')}</p>}
      </div>}
      {startedEvents.length > 0 && <button className="event-started-toggle" type="button" aria-expanded={showStarted} onClick={() => setShowStarted(value => !value)}>{showStarted ? copy('Başlangıcı geçmiş olanları gizle', 'Hide events that have started', 'Fshih aktivitetet që kanë filluar') : copy(`Başlangıcı geçmiş olanları göster (${startedEvents.length})`, `Show events that have started (${startedEvents.length})`, `Shfaq aktivitetet që kanë filluar (${startedEvents.length})`)}</button>}
      {moreError && <p className="info-box error" role="alert">{moreError}</p>}
      {nextCursor && <button className="secondary-wide event-more-results" type="button" disabled={loading || moreLoading || filtersChanged} onClick={() => void search(category, true)}>{moreLoading ? copy('Diğer etkinlikler aranıyor…', 'Loading more events…', 'Duke ngarkuar aktivitete të tjera…') : copy('Diğer etkinlikleri göster', 'Show more events', 'Shfaq aktivitete të tjera')}</button>}
      {paginationLimited && <p className="event-page-note" role="status">{copy('Kaynağın sonuç sınırına ulaşıldı. Daha fazla etkinlik için şehri veya tarih aralığını daralt.', 'The source result limit was reached. Narrow the city or dates to find more events.', 'U arrit kufiri i rezultateve të burimit. Kufizo qytetin ose datat për të gjetur më shumë aktivitete.')}</p>}
    </section>
    <p className="event-disclaimer"><Icon name="shield" size={15} /> {copy("Saat, mekân, bilet ve iptal durumunu satın almadan önce bağlantılı kaynaktan ve etkinliğin resmî sitesinden doğrula.", "Before purchase, verify the time, venue, tickets and cancellation status through the linked source and the event's official site.")}</p>
    <Sheet open={Boolean(tripEvent)} title={copy("Etkinliği seyahate ekle", "Add event to trip")} onClose={() => { if (!tripPickerBusy) setTripEvent(null); }}>
      {tripEvent && <div className="event-trip-picker">
        <header><span><Icon name="calendar" size={21} /></span><div><small>{`${eventDateLabel(tripEvent, dateLocale, undefined, formatAppDate)} · ${eventTimeLabel(tripEvent, dateLocale, formatAppDate)}`}</small><strong>{tripEvent.title}</strong><p>{[tripEvent.city, tripEvent.venue].filter(Boolean).join(" · ")}</p></div></header>
        <p>{copy("Etkinlik tarihiyle örtüşen seyahatlerden birini seç.", "Choose a trip that covers the event date.")}</p>
        {tripPickerLoading ? <div className="skeleton-list"><div /><div /></div>
          : tripPickerError ? <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{tripPickerError}</p><button type="button" onClick={() => void openTripPicker(tripEvent)}>{copy("Yeniden dene", "Retry")}</button></div>
            : cockpitTrips.length ? <><div className="event-trip-options">{cockpitTrips.map((trip) => {
              const compatible = Boolean(eventDay && eventDay >= trip.startDate && eventDay <= trip.endDate);
              const alreadyAdded = trip.checklistItems.some((item) => item.kind === "event" && item.eventId === tripEvent.id);
              return <button type="button" key={trip.id} disabled={Boolean(tripPickerBusy) || !compatible} onClick={() => void attachToTrip(trip)}><span><Icon name={alreadyAdded ? "check" : compatible ? "suitcase" : "calendar"} size={18} /></span><div><strong>{[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ") || trip.flightNumber || copy("Seyahat", "Trip")}</strong><small>{formatAppDate(new Date(`${trip.startDate}T12:00:00`), dateLocale, { day: "2-digit", month: "short", year: "numeric" })} – {formatAppDate(new Date(`${trip.endDate}T12:00:00`), dateLocale, { day: "2-digit", month: "short", year: "numeric" })}</small><em>{alreadyAdded ? copy("Zaten eklendi", "Already added") : compatible ? copy("Tarih uygun", "Date matches") : copy("Etkinlik tarihi bu seyahatin dışında", "Event date is outside this trip")}</em></div><Icon name="chevron" size={16} /></button>;
            })}</div>{!hasCompatibleTrip && <button className="secondary-wide event-trip-create" type="button" onClick={() => { if (tripEvent && onCreateEventTrip) { onCreateEventTrip(tripEvent); setTripEvent(null); } }}><Icon name="plus" size={16} /> {copy("Tarihleri uygun seyahat oluştur", "Create a trip with matching dates")}</button>}</>
              : <div className="empty-state"><span><Icon name="suitcase" size={27} /></span><strong>{copy("Uygun seyahat bulunamadı", "No suitable trip found")}</strong><p>{copy("Önce tarihleri bu etkinliği kapsayan bir seyahat oluştur.", "Create a trip whose dates cover this event first.")}</p><button className="primary-button" type="button" onClick={() => { if (tripEvent && onCreateEventTrip) { onCreateEventTrip(tripEvent); setTripEvent(null); } }}><Icon name="plus" size={16} /> {copy("Seyahat oluştur", "Create trip")}</button></div>}
      </div>}
    </Sheet>
  </div>;
}
