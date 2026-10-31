import { inspirationRouteCodes, savedInspirationRoute, toggleInspirationRoute } from "./lib/inspirationRoutes";
import { cityDestination, cityDestinations, type CityDestination } from "./data/cityDestinations";
import { cityCodeFromUrl, cityHash, cityCountryFromUrl, cityCatalogueHash } from "./lib/cityNavigation";
import { readPersonalMapPins, subscribePersonalMapPins, toggleCityMapPin } from "./lib/personalMapPins";
import { Activity, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import "./fonts.css";
import "./editorial.css";
import "./merged-functional.css";
import "./country-intelligence.css";
import "./unified.css";
import "./journey.css";
import "./reference-theme.css";
import "./screens/secondary-polish.css";
import "./shared-shell.css";
import "./dark-theme.css";
import { NavigationPane } from "./components/NavigationPane";
import { LazyOverlay } from "./components/LazyOverlay";
import { Sheet } from "./components/Sheet";
import { readMapJourneys } from "./lib/mapJourneyStorage";
import type { MapJourney } from "./lib/mapJourney";
import { isJourneyGuideUrl, journeyGuideIntentFromUrl, type JourneyGuideIntent, type JourneyGuideRequest } from "./lib/journeyGuideIntent";
import { AnimatedSplash } from "./components/AnimatedSplash";
import { Icon, type IconName } from "./components/Icon";
import { NotificationCenter } from "./components/NotificationCenter";
import { SocialRoutePicker } from "./components/SocialRoutePicker";
import type { SocialPlace } from "./lib/social";
import { Onboarding } from "./components/Onboarding";
import { AppGuide } from "./components/AppGuide";
import { GuideMenu } from "./components/GuideMenu";
import { readGuideProgress, saveGuideProgress, readWelcomeDestination, rememberWelcomeDestination, type WelcomeDestination, type GuideTask, guideTaskForIntent } from "./lib/appGuide";
import { readWelcomePreferences } from "./lib/onboardingPreferences";
import type { EventSearchContext, EventSearchFilters } from "./lib/eventSearchContext";
import { useActiveTripContext } from "./lib/activeTripContext";
import { selectTravelCountry } from "./lib/travelSelection";
import type { JourneyArea } from "./lib/mapJourneyClient";
import type { NoticeAction } from "./lib/notices";
import { localIsoDate } from "./lib/dates";
import { syncJourneyLiveActivityOwner } from "./lib/journeyLiveActivity";
import { useAuth } from "./hooks/useAuth";
import { useBudgetSignInResume } from "./hooks/useBudgetSignInResume";
import { clearBudgetSignInResume, hasBudgetSignInResume, prepareBudgetSignInResume } from "./lib/budgetSignInResume";
import { getMobileAdminAccess, getMobileAdminOverview, type MobileAdminOverview } from "./lib/admin";
import { ApiError } from "./lib/api";
import { completeUserProfile, getSupabaseDataErrorMessage } from "./lib/supabaseData";
import { communityTranslationQueue } from "./lib/communityTranslation";
import type { EventTripIntent } from "./lib/eventTripIntent";
import { validJourneyIntent, type CockpitJourneyIntent } from "./lib/cockpitJourney";
import { addPluginListener, isNativePlatform, plugin } from "./lib/capacitor";
import { releaseId } from "./lib/config";
import { impact } from "./lib/native";
import { tripIdFromUrl } from "./lib/deepLink";
import { tripInviteFromUrl, pendingTripInvite, rememberTripInvite } from "./lib/tripCollaboration";
import { initFlightReminderTapListener } from "./lib/liveActivity";
import { initEventReminderTapListener, startEventReminderMaintenance } from "./lib/eventReminders";
import { useI18n } from "./lib/i18n";
import { useTheme } from "./lib/useTheme";
import { initLiveActivityRetry, initLiveActivityTokenSync, syncTokensAfterLogin } from "./lib/liveActivityPush";
import {
  hasPendingPushDetach,
  initPushTapListener,
  isPushEnabledForDevice,
  retryPendingPushDetach,
  syncPushAfterLogin,
} from "./lib/push";
import { closeTopSheet, hasOpenSheet } from "./lib/sheetStack";
import {
  completeOnboarding,
  getMobilePreferences,
  getGuestDataSummary,
  hasCompletedOnboarding,
  hasSeenRelease,
  importGuestDataForUser,
  markGuestDataImportDecision,
  markReleaseSeen,
  shouldOfferGuestDataImport,
} from "./lib/storage";
import { HomeScreen } from "./screens/HomeScreen";
import { BrandMark } from "./components/BrandMark";
import { LanguagePicker } from './components/LanguagePicker';
import { HeaderThemeToggle } from './components/AppearancePicker';
import type { TravelAssistantTool, JourneyToolId } from './lib/appTools';
import { alpha2FromAlpha3 } from './data/countryIso';
import type { RouteSuggestion, TabId, TravelEvent, ViewId } from "./types";
import type { JoinedEventChat } from "./lib/eventCommunity";

type EventProfileContext = { kind: 'event'; event: TravelEvent } | { kind: 'chat'; chat: JoinedEventChat };

// Ana ekran ilk karede hazır kalır; diğer modüller yalnız açıldığında
// indirilir. Böylece açılış paketi ve düşük bağlantıda ilk etkileşim hafifler.
const CountryNewsScreen = lazy(() => import("./screens/CountryNewsScreen").then(m => ({ default: m.CountryNewsScreen })));
const CostsScreen = lazy(() => import("./screens/CostsScreen").then(m => ({ default: m.CostsScreen })));
const CityDestinationScreen = lazy(() => import("./screens/CityDestinationScreen").then(m => ({ default: m.CityDestinationScreen })));
const CityDiscoveryScreen = lazy(() => import("./screens/CityDiscoveryScreen").then(m => ({ default: m.CityDiscoveryScreen })));
const AdminScreen = lazy(() => import("./screens/AdminScreen").then((module) => ({ default: module.AdminScreen })));
const CockpitScreen = lazy(() => import("./screens/CockpitScreen").then((module) => ({ default: module.CockpitScreen })));
const CommunityScreen = lazy(() => import("./screens/CommunityScreen").then((module) => ({ default: module.CommunityScreen })));
const ExploreScreen = lazy(() => import("./screens/ExploreScreen").then((module) => ({ default: module.ExploreScreen })));
const EventsScreen = lazy(() => import("./screens/EventsScreen").then((module) => ({ default: module.EventsScreen })));
const PassportScreen = lazy(() => import("./screens/PassportScreen").then((module) => ({ default: module.PassportScreen })));
const PriceAlertsScreen = lazy(() => import("./screens/PriceAlertsScreen").then((module) => ({ default: module.PriceAlertsScreen })));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen").then((module) => ({ default: module.ProfileScreen })));
const RouteAssistantScreen = lazy(() => import("./screens/RouteAssistantScreen").then((module) => ({ default: module.RouteAssistantScreen })));
const SurpriseScreen = lazy(() => import("./screens/SurpriseScreen").then((module) => ({ default: module.SurpriseScreen })));
const TripsScreen = lazy(() => import("./screens/PlansScreen").then((module) => ({ default: module.TripsScreen })));
const TravelCompanionScreen = lazy(() => import("./screens/TravelCompanionScreen").then((module) => ({ default: module.TravelCompanionScreen })));
const AirportGuideScreen = lazy(() => import("./screens/AirportGuideScreen").then((module) => ({ default: module.AirportGuideScreen })));
const AccountSheet = lazy(() => import("./components/AccountSheet").then(module => ({ default: module.AccountSheet })));
const RouteExampleLesson = lazy(() => import("./components/RouteExampleLesson").then(module => ({ default: module.RouteExampleLesson })));
const GuestDataImportSheet = lazy(() => import("./components/GuestDataImportSheet").then(module => ({ default: module.GuestDataImportSheet })));
const ReleaseNotesSheet = lazy(() => import("./components/ReleaseNotesSheet").then(module => ({ default: module.ReleaseNotesSheet })));
const GlobalSearchSheet = lazy(() => import('./components/GlobalSearchSheet').then(module => ({ default: module.GlobalSearchSheet })));
const MapJourneyPlanner = lazy(() => import('./components/MapJourneyPlanner').then(module => ({ default: module.MapJourneyPlanner })));

const tabDefinitions: Array<{ id: TabId; icon: IconName }> = [
  { id: "home", icon: "home" },
  { id: "trips", icon: "calendar" },
  { id: "community", icon: "users" },
  { id: "companion", icon: "suitcase" },
  { id: "profile", icon: "user" },
];

const validViews = new Set<ViewId>(["home", "explore", "city", "cities", "route", "trips", "profile", "passport", "surprise", "cockpit", "community", "alerts", "events", "companion", "phrases", "admin", "costs", "airports", "country-news"]);

function viewFromUrl(value: string): ViewId | null {
  try {
    if (cityCodeFromUrl(value)) return "city";
    if (cityCountryFromUrl(value)) return "cities";
    const parsed = new URL(value, window.location.origin);
    const raw = (parsed.hash.replace(/^#\/?/, "") || parsed.searchParams.get("view") || parsed.pathname.split("/").filter(Boolean).pop() || parsed.host).toLocaleLowerCase("tr-TR");
    const aliases: Record<string, ViewId> = {
      "ulke-gundemi": "country-news", "ulke-maliyetleri": "costs", "havalimani-rehberi": "airports", "kaydedilenler": "trips",
      "ana-sayfa": "home",
      "kesfet": "explore",
      "keşfet": "explore",
      "rota-asistani": "route",
      "rota-asistanı": "route",
      "seyahatlerim": "trips",
      "profil": "profile",
      "pasaport-gucu": "passport",
      "pasaport-gücü": "passport",
      "beni-sasirt": "surprise",
      "beni-şaşırt": "surprise",
      "seyahat-kokpiti": "cockpit",
      "kasifler-ligi": "community",
      "kaşifler-ligi": "community",
      "fiyat-alarmlarim": "alerts",
      "fiyat-alarmlarım": "alerts",
      "price-alerts": "alerts",
      etkinlikler: "events",
      events: "events",
      "seyahat-yardimcisi": "companion",
      "seyahat-yardımcısı": "companion",
      companion: "companion",
      "hazir-ifadeler": "phrases",
      "hazır-ifadeler": "phrases",
      phrases: "phrases",
    };
    const candidate = aliases[raw] || raw as ViewId;
    return validViews.has(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function rootTabFor(view: ViewId): TabId {
  if (view === "explore" || view === "city" || view === "cities" || view === "surprise" || view === "events" || view === "costs" || view === "country-news") return "home";
  if (view === "passport" || view === "phrases") return "companion";
  if (view === "route" || view === "cockpit" || view === "airports") return "trips";
  if (view === "admin" || view === "alerts") return "profile";
  return view as TabId;
}

function navigationTabFor(view: ViewId, from: TabId): TabId {
  // These shared pages can be reached from several sections. Keep the entry
  // section selected, and store it in history so Back restores it as well.
  return ["costs", "country-news", "airports", "alerts"].includes(view) ? from : rootTabFor(view);
}

export default function App() {
  const { locale, copy } = useI18n();
  const { resolved: resolvedTheme } = useTheme();
  const [launching, setLaunching] = useState(() => isNativePlatform());
  const [openTransfer, setOpenTransfer] = useState(false);
  const [exploreCode, setExploreCode] = useState("");
  const [exploreSearch, setExploreSearch] = useState({ query: "", requestId: 0 });
  const [homeSavedRoutes, setHomeSavedRoutes] = useState<{ owner: string | null; codes: string[] } | null>(null);
  const [cityCode, setCityCode] = useState<string | null>(() => cityCodeFromUrl(window.location.href));
  const [cityDiscoveryQuery, setCityDiscoveryQuery] = useState("");
  const [cityDiscoveryCountry, setCityDiscoveryCountry] = useState<string | null>(() => cityCountryFromUrl(window.location.href));
  const [savedCities, setSavedCities] = useState<{ owner: string | null; codes: string[] }>({ owner: null, codes: [] });
  const [cityBudgetRequest, setCityBudgetRequest] = useState<{ query: string; id: number } | null>(() => {
    const query = window.history.state?.budgetCityQuery;
    return viewFromUrl(window.location.href) === "costs" && typeof query === "string" && query.trim()
      ? { query: query.trim().slice(0, 120), id: 1 } : null;
  });
  const [newsCountryCode, setNewsCountryCode] = useState("TR");
  const [activeView, setActiveView] = useState<ViewId>(() => pendingTripInvite(window.location.href) ? "trips" : viewFromUrl(window.location.href) || "home");
  const [activeTab, setActiveTab] = useState<TabId>(() => rootTabFor(activeView));
  const activeTabRef = useRef(activeTab);
  const [visitedViews, setVisitedViews] = useState<ViewId[]>(() => [viewFromUrl(window.location.href) || "home"]);
  const [scrollPositions, setScrollPositions] = useState<Partial<Record<ViewId, number>>>({});
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "back">("forward");
  const [savedSection, setSavedSection] = useState<"all" | "routes" | "places" | "events" | "countries" | "travel" | "shared">("all");
  const [savedSectionRequest, setSavedSectionRequest] = useState(0);
  const [journeyToolRequest, setJourneyToolRequest] = useState<{tool: JourneyToolId; id: number} | null>(null);
  const [eventFilters, setEventFilters] = useState<{owner: string | null; tripKey?: string; filters: EventSearchFilters} | null>(null);
  const [eventSearchContext, setEventSearchContext] = useState<{context: EventSearchContext | null; id: number} | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [savedRouteId, setSavedRouteId] = useState('');
  const [toolRequest, setToolRequest] = useState<{ tool: TravelAssistantTool; id: number; country?: string; mapSearch?: { id: number; query: string; center: { latitude: number; longitude: number }; label?: string } } | null>(null);
  const toolRequestCounter = useRef(0);
  const [notice, setNotice] = useState("");
  const [noticeAction, setNoticeAction] = useState<(NoticeAction & { owner: string | null }) | null>(null);
  const [accountOpen, setAccountOpen] = useState(() => readWelcomeDestination() !== null);
  const [welcomeDestination, setWelcomeDestination] = useState<WelcomeDestination | null>(readWelcomeDestination);
  const [guideActive, setGuideActive] = useState(() => readGuideProgress().active);
  const [guideRevision, setGuideRevision] = useState(0);
  const [guideTask, setGuideTask] = useState<GuideTask | undefined>(() => readGuideProgress().task);
  const [routeExampleOpen, setRouteExampleOpen] = useState(false);
  const [guideMenuOpen, setGuideMenuOpen] = useState(false);
  const [guideLibraryRequest, setGuideLibraryRequest] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => getMobilePreferences().inAppNotifications);
  const [releaseOpen, setReleaseOpen] = useState(() => hasCompletedOnboarding() && !hasSeenRelease(releaseId));
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasCompletedOnboarding());
  const [focusEventId, setFocusEventId] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [surpriseRoute, setSurpriseRoute] = useState<RouteSuggestion | null>(null);
  const [routeSeedKind, setRouteSeedKind] = useState<"surprise" | "explore">("surprise");
  const [routeResetToken, setRouteResetToken] = useState(0);
  const [mapRequestId, setMapRequestId] = useState(0);
  const [cockpitFocusTripId, setCockpitFocusTripId] = useState("");
  const journeyGuideLinkCounter=useRef(0);
  const [pendingJourneyGuideLink,setPendingJourneyGuideLink]=useState<{intent:JourneyGuideIntent;requestId:number;replace:boolean}|null>(null);
  const [journeyGuideTripRequest,setJourneyGuideTripRequest]=useState<{owner:string;request:JourneyGuideRequest}|null>(null);
  const [journeyGuideMap,setJourneyGuideMap]=useState<{owner:string|null;journey:MapJourney;day:number;requestId:number}|null>(null);
  const [todayTripId, setTodayTripId] = useState("");
  const [eventTripIntent, setEventTripIntent] = useState<EventTripIntent | null>(null);
  const [pendingEventTrip, setPendingEventTrip] = useState<{ owner: string | null; event: TravelEvent } | null>(null);
  const [cockpitInviteCode, setCockpitInviteCode] = useState(() => pendingTripInvite(window.location.href));
  const [communityCountryCode, setCommunityCountryCode] = useState("");
  const [communityLeagueRequest, setCommunityLeagueRequest] = useState(0);
  const [visitedCountriesRequest, setVisitedCountriesRequest] = useState(0);
  const [profileEditRequest, setProfileEditRequest] = useState<{ owner: string; id: number } | null>(null);
  const [profileEditingOwner, setProfileEditingOwner] = useState<string | null>(null);
  const eventProfileResume = useRef<{ owner: string; view: 'events' | 'community'; context: EventProfileContext; started: boolean; completed: boolean } | null>(null);
  const [eventProfileReturn, setEventProfileReturn] = useState<{ owner: string; context: EventProfileContext } | null>(null);
  const profileEditCounter = useRef(0);
  const [socialPlace,setSocialPlace] = useState<{owner:string|null;place:SocialPlace}|null>(null);
  const [socialIntent,setSocialIntent] = useState<{postId?:string;profileKey?:string;commentId?:string;questionId?:string}>({});
  const [routePlaceName,setRoutePlaceName] = useState('');
  const [routeArea,setRouteArea] = useState<JourneyArea | undefined>();
  const [refreshTick, setRefreshTick] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [adminOverview, setAdminOverview] = useState<MobileAdminOverview | null>(null);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [adminChecking, setAdminChecking] = useState(false);
  const [guestImportOpen, setGuestImportOpen] = useState(false);
  const [guestImportBusy, setGuestImportBusy] = useState(false);
  const [guestSummary, setGuestSummary] = useState(() => getGuestDataSummary());
  const noticeTimer = useRef<number | null>(null);
  const pullStart = useRef<number | null>(null);
  const edgeSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const activeViewRef = useRef(activeView);
  const historyDepth = useRef(0);
  const auth = useAuth();
  const ownerId = auth.user?.id || null;
  const profileOwnerRef = useRef(ownerId);
  const profileOwnerRevision = useRef(0);
  useLayoutEffect(() => {
    if (profileOwnerRef.current !== ownerId) { profileOwnerRevision.current++; eventProfileResume.current = null; setEventProfileReturn(null); }
    profileOwnerRef.current = ownerId;
  }, [ownerId]);
  const activeTrip = useActiveTripContext(ownerId);
  const activeTripKey = activeTrip ? `${activeTrip.tripId}:${activeTrip.countryCode}:${activeTrip.startDate}:${activeTrip.endDate}` : '';
  useEffect(() => { void syncJourneyLiveActivityOwner(ownerId); }, [ownerId]);
  const accessTokenRef = useRef(auth.accessToken);
  // Giriş geçişi tespiti "" ile başlar: geri yüklenen oturumda da (soğuk
  // açılış) ilk dolu değerde senkron çalışır.
  const lastLiveActivityOwnerRef = useRef("");
  const lastPushOwnerRef = useRef("");
  const lastUiOwnerRef = useRef(ownerId || "guest");
  const adminTokenRef = useRef("");
  const authUiKey = ownerId ? `user-${ownerId}` : "guest";
  useLayoutEffect(() => { communityTranslationQueue.clear(); }, [ownerId]);
  const [cockpitJourneyIntent, setCockpitJourneyIntent] = useState<CockpitJourneyIntent | null>(null);
  const visibleUnreadCount = notificationsEnabled ? unreadCount : 0;
  const nestedView = !tabDefinitions.some(tab => tab.id === activeView);
  const nativeUiRef = useRef({
    accountOpen,
    activeView,
    nestedView,
    notificationsOpen,
    onboardingOpen,
    releaseOpen,
  });
  const interactionBlocked = launching || onboardingOpen;
  const finishLaunching = useCallback(() => setLaunching(false), []);

  useEffect(() => {
    activeViewRef.current = activeView;
    const titles: Record<ViewId, string> = {
      cities: copy("Ülkeleri keşfet", "Explore countries", "Eksploro shtetet"),
      city: cityCode ? cityDestination(cityCode, locale)?.name || copy("Şehri keşfet", "Explore a city", "Eksploro një qytet") : copy("Şehri keşfet", "Explore a city", "Eksploro një qytet"),
      "country-news": copy("Ülke Gündemi", "Country Updates"), costs: copy("Ülke Maliyetleri", "Country Costs"), airports: copy("Havalimanı Rehberi", "Airport Guide"),
      home: copy("Keşfet", "Explore"), explore: copy("Rotaları keşfet", "Explore destinations"), route: copy("Rota Planla", "Plan a Route"), trips: copy("Planlar", "Plans"), profile: copy("Profil", "Profile"), passport: copy("Pasaport Gücü", "Passport Power"), surprise: copy("Beni Şaşırt", "Surprise Me"), cockpit: copy("Seyahatlerim", "My trips", "Udhëtimet e mia"), community: copy("Topluluk", "Community"), alerts: copy("Fiyat Alarmlarım", "Price Alerts"), events: copy("Etkinlik Radarı", "Event Radar"), companion: copy("Araçlar", "Tools"), phrases: copy("Hazır İfadeler", "Offline Phrases"), admin: copy("Yönetim Merkezi", "Admin Centre"),
    };
    document.title = `${titles[activeView]} · LetsGo2Travel`;
  }, [activeView, cityCode, copy, locale]);

  useEffect(() => {
    nativeUiRef.current = {
      accountOpen,
      activeView,
      nestedView,
      notificationsOpen,
      onboardingOpen,
      releaseOpen,
    };
  }, [accountOpen, activeView, nestedView, notificationsOpen, onboardingOpen, releaseOpen]);

  const showNotice = useCallback((message: string, action?: NoticeAction) => {
    if (lastUiOwnerRef.current !== (ownerId || 'guest')) return;
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    setNoticeAction(action ? { ...action, owner: ownerId } : null);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      setNoticeAction(null);
      noticeTimer.current = null;
    }, action ? 7000 : 4200);
  }, [ownerId]);

  useEffect(() => {
    const refresh = () => {
      try { setHomeSavedRoutes({ owner: ownerId, codes: inspirationRouteCodes(ownerId) }); }
      catch { setHomeSavedRoutes(null); }
    };
    refresh();
    window.addEventListener("l2t:storage-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("l2t:storage-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [ownerId]);

  useEffect(() => {
    const refresh = () => {
      const state = readPersonalMapPins(ownerId);
      setSavedCities({ owner: ownerId, codes: state.items.flatMap(item => item.destinationCode ? [item.destinationCode] : []) });
    };
    refresh();
    return subscribePersonalMapPins(refresh, ownerId);
  }, [ownerId]);

  const toggleHomeRoute = (route: RouteSuggestion, passport?: { passportCountry?: string; passportType?: string }) => {
    const code = route.destinationCode?.toUpperCase();
    if (!code || !/^[A-Z0-9]{2,8}$/.test(code)) return;
    try {
      const saved = !toggleInspirationRoute(route, ownerId, passport);
      setHomeSavedRoutes({ owner: ownerId, codes: inspirationRouteCodes(ownerId) });
      showNotice(saved ? copy("Rota kayıtlarından çıkarıldı.", "Route removed from your saved items.") : copy("Rota cihazına kaydedildi. Planlar bölümünden açabilirsin.", "Route saved on this device. Open it from Plans."));
    } catch {
      // The account outbox may have persisted before the device list failed.
      // Reflect durable state without claiming that an unsuccessful write worked.
      try { setHomeSavedRoutes({ owner: ownerId, codes: inspirationRouteCodes(ownerId) }); } catch { /* Keep existing UI on unreadable storage. */ }
      showNotice(copy("Kayıt güncellenemedi. Cihaz depolamasını kontrol edip tekrar dene.", "Saved items couldn't update. Check device storage and try again."));
    }
  };

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    const refreshPreferences = () => setNotificationsEnabled(getMobilePreferences().inAppNotifications);
    const reportStorageError = () => showNotice(copy("Bu cihazda kayıt alanına yazılamadı. Depolama iznini veya boş alanı kontrol et.", "This device could not save your data. Check storage access or free space."));
    window.addEventListener("l2t:storage-change", refreshPreferences);
    window.addEventListener("l2t:storage-error", reportStorageError);
    return () => {
      window.removeEventListener("l2t:storage-change", refreshPreferences);
      window.removeEventListener("l2t:storage-error", reportStorageError);
    };
  }, [copy, showNotice]);

  useEffect(() => {
    const initialCityCode = cityCodeFromUrl(window.location.href);
    const initialCityCountry = cityCountryFromUrl(window.location.href);
    const initialBudgetQuery = activeView === "costs" && typeof window.history.state?.budgetCityQuery === "string" ? window.history.state.budgetCityQuery.trim().slice(0, 120) : "";
    const initialDepth = (activeView === "city" || activeView === "cities" || initialBudgetQuery) && window.history.state?.view === activeView && Number.isInteger(window.history.state.depth)
      ? Math.max(0, Math.min(1000, Number(window.history.state.depth))) : 0;
    historyDepth.current = initialDepth;
    window.history.replaceState({ view: activeView, tab: activeTabRef.current, depth: initialDepth, ...(initialCityCode ? { cityCode: initialCityCode } : {}), ...(initialBudgetQuery ? { budgetCityQuery: initialBudgetQuery } : {}) }, "", activeView === "city" && initialCityCode ? cityHash(initialCityCode) : activeView === "cities" ? cityCatalogueHash(initialCityCountry) : `#${activeView}`);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPopState = (event: PopStateEvent) => {
      const next = event.state && typeof event.state.view === "string" && validViews.has(event.state.view)
        ? event.state.view as ViewId
        : viewFromUrl(window.location.href);
      if (next) {
        if (next === "city") setCityCode(cityCodeFromUrl(window.location.href));
        if (next === "cities") setCityDiscoveryCountry(cityCountryFromUrl(window.location.href));
        if (next === "costs") setCityBudgetRequest(previous => event.state?.budgetCityQuery ? { query: String(event.state.budgetCityQuery).slice(0, 120), id: (previous?.id || 0) + 1 } : null);
        const previous = activeViewRef.current;
        const top = window.scrollY || 0;
        setScrollPositions(positions => ({ ...positions, [previous]: top }));
        setVisitedViews(views => views.includes(next) ? views : [...views, next]);
        setNavigationDirection("back");
        const depth = event.state && Number.isInteger(event.state.depth)
          ? Math.max(0, Number(event.state.depth))
          : Math.max(0, historyDepth.current - 1);
        historyDepth.current = depth;
        activeViewRef.current = next;
        const tab = tabDefinitions.some(item => item.id === event.state?.tab) ? event.state.tab as TabId : rootTabFor(next);
        activeTabRef.current = tab;
        setActiveTab(tab);
        setActiveView(next);
        window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.history.scrollRestoration = previousRestoration;
    };
    // İlk tarihçe kaydı yalnızca uygulama açılırken yazılır.
  }, []);

  const navigate = useCallback((view: ViewId, options?: { replace?: boolean; communityCountryCode?: string; cityCode?: string; cityCountryCode?: string | null; budgetCityQuery?: string }) => {
    if (view === "city" && options?.cityCode) setCityCode(options.cityCode);
    if (view === "cities") setCityDiscoveryCountry(options?.cityCountryCode || null);
    if (view === "costs") setCityBudgetRequest(previous => options?.budgetCityQuery ? { query: options.budgetCityQuery.slice(0, 120), id: (previous?.id || 0) + 1 } : null);
    const current = activeViewRef.current;
    const changingCity = view === "city" && options?.cityCode && cityCodeFromUrl(window.location.href) !== options.cityCode;
    const changingBudget = view === "costs" && options?.budgetCityQuery && window.history.state?.budgetCityQuery !== options.budgetCityQuery;
    const changingCityCountry = view === "cities" && cityCountryFromUrl(window.location.href) !== (options?.cityCountryCode || null);
    if (current === view && !options?.replace && !changingCity && !changingBudget && !changingCityCountry) {
      if (view === "community" && options?.communityCountryCode !== undefined) setCommunityCountryCode(options.communityCountryCode);
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
      return;
    }
    setOpenTransfer(false);
    setExploreCode("");
    const top = window.scrollY || 0;
    setScrollPositions(positions => ({ ...positions, [current]: top }));
    setVisitedViews(views => views.includes(view) ? views : [...views, view]);
    setNavigationDirection("forward");
    if (view === "community") setCommunityCountryCode(options?.communityCountryCode || "");
    const nextDepth = options?.replace ? historyDepth.current : historyDepth.current + 1;
    historyDepth.current = nextDepth;
    activeViewRef.current = view;
    const tab = navigationTabFor(view, activeTabRef.current);
    activeTabRef.current = tab;
    setActiveTab(tab);
    setActiveView(view);
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ view, tab, depth: nextDepth, ...(options?.cityCode ? { cityCode: options.cityCode } : {}), ...(options?.budgetCityQuery ? { budgetCityQuery: options.budgetCityQuery.slice(0, 120) } : {}) }, "", view === "city" && options?.cityCode ? cityHash(options.cityCode) : view === "cities" ? cityCatalogueHash(options?.cityCountryCode) : `#${view}`);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    void impact();
  }, []);

  const openNavigationView = useCallback((view: ViewId) => {
    // Switching tabs keeps the current plan and its form selections.
    if (view === "route") { setMapRequestId(value => value + 1); setSurpriseRoute(null); }
    if (view === "trips") { setOpenTransfer(false); setJourneyToolRequest(null); setSavedSection("all"); setSavedSectionRequest(value => value + 1); }
    if (view === "companion") setToolRequest(null);
    navigate(view);
  }, [navigate]);

  useEffect(() => { if (activeView !== "trips") setJourneyToolRequest(null); }, [activeView]);

  const openTool = useCallback((tool: TravelAssistantTool, country?: string) => {
    if (country) selectTravelCountry(country);
    setToolRequest({ tool, id: ++toolRequestCounter.current, country });
    navigate('companion');
    setScrollPositions(positions => ({ ...positions, companion: 0 }));
  }, [navigate]);
  const openJourneyTool = useCallback((tool: JourneyToolId) => {
    setOpenTransfer(false);
    setJourneyToolRequest(previous => ({tool, id: (previous?.id || 0) + 1}));
    setSavedSection("travel");
    navigate("trips");
    setScrollPositions(previous => ({...previous, trips: 0}));
  }, [navigate]);
  const openSavedRoutes = useCallback(() => {
    setOpenTransfer(false);
    setJourneyToolRequest(null);
    setSavedSection("routes");
    setSavedSectionRequest(value => value + 1);
    navigate("trips");
    setScrollPositions(previous => ({...previous, trips: 0}));
  }, [navigate]);
  const openNearbyEvents = useCallback((context: EventSearchContext) => {
    setEventSearchContext(previous => ({context, id: (previous?.id || 0) + 1}));
    navigate("events");
    setScrollPositions(previous => ({...previous, events: 0}));
  }, [navigate]);
  const openGlobalSearch = useCallback((query = '') => { setGlobalQuery(query); setSearchOpen(true); }, []);

  const openSeededRoute = useCallback((route: RouteSuggestion, kind: "surprise" | "explore") => {
    setRoutePlaceName('');
    setRouteArea(undefined);
    setRouteSeedKind(kind);
    setSurpriseRoute(route);
    navigate("route");
    // A newly chosen destination starts at the form heading. Ordinary tab
    // navigation continues to restore the existing draft's scroll position.
    setScrollPositions(positions => ({ ...positions, route: 0 }));
  }, [navigate]);

  const searchDestinations = useCallback((query: string) => {
    navigate("explore");
    setExploreSearch(previous => ({ query: query.trim().slice(0, 120), requestId: previous.requestId + 1 }));
    setScrollPositions(positions => ({ ...positions, explore: 0 }));
  }, [navigate]);

  const openCity = (code: string) => {
    const destination = cityDestination(code, locale);
    if (!destination) return;
    navigate("city", { cityCode: destination.code });
    setScrollPositions(positions => ({ ...positions, city: 0 }));
  };
  const openCityCountry = (code: string) => {
    if (!cityDestinations(locale).some(city => city.countryCode === code)) return;
    navigate("cities", { cityCountryCode: code });
    setScrollPositions(previous => ({ ...previous, cities: 0 }));
  };
  const toggleCitySaved = (code: string) => {
    const destination = cityDestination(code, locale);
    if (!destination) return;
    try {
      const saved = toggleCityMapPin(destination, ownerId);
      showNotice(locale === "ro" ? saved ? "Oraș salvat pe acest dispozitiv. Îl găsești în Planuri → Locurile mele." : "Orașul a fost eliminat din locurile salvate."
        : saved ? copy("Şehir cihazına kaydedildi. Planlar → Yerlerim’den açabilirsin.", "City saved on this device. Open it from Plans → My places.", "Qyteti u ruajt në këtë pajisje. Hape te Planet → Vendet e mia.")
          : copy("Şehir kaydedilenlerden çıkarıldı.", "City removed from saved places.", "Qyteti u hoq nga vendet e ruajtura."));
    } catch {
      showNotice(copy("Kayıt güncellenemedi. Cihaz depolamasını kontrol edip tekrar dene.", "Saved items couldn't update. Check device storage and try again."));
    }
  };
  const planCity = (destination: CityDestination) => {
    setRoutePlaceName(destination.name);
    setRouteArea({ ...destination.center, name: destination.name });
    setSurpriseRoute(null);
    setRouteResetToken(value => value + 1);
    setMapRequestId(value => value + 1);
    navigate("route");
    setScrollPositions(positions => ({ ...positions, route: 0 }));
  };
  const mapCity = (destination: CityDestination, point?: CityDestination["highlights"][number]) => {
    const id = ++toolRequestCounter.current;
    selectTravelCountry(destination.countryCode);
    setToolRequest({ tool: "map", id, country: destination.countryCode,
      mapSearch: { id, query: point?.name || "", center: point ? { latitude: point.latitude, longitude: point.longitude } : destination.center, label: point?.name || destination.name } });
    navigate("companion");
    setScrollPositions(positions => ({ ...positions, companion: 0 }));
  };

  const goBack = useCallback(() => {
    if (historyDepth.current > 0) {
      window.history.back();
      return;
    }
    if (activeViewRef.current === "cities" && cityCountryFromUrl(window.location.href)) {
      navigate("cities", { replace: true });
      return;
    }
    navigate(activeTabRef.current, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const nextOwner = ownerId || "guest";
    if (lastUiOwnerRef.current === nextOwner) return;
    const previousOwner = lastUiOwnerRef.current;
    lastUiOwnerRef.current = nextOwner;

    // Hesap değişiminde önceki kullanıcının taslakları, seçili seyahati veya
    // açık yönetim/topluluk yüzeyi yeni hesaba taşınmasın. İçerik alt ağacı da
    // authUiKey ile yeniden kurulur; geç tamamlanan A hesabı istekleri B
    // hesabının ekran durumuna yazamaz.
    setSurpriseRoute(null);
    setExploreSearch({ query: "", requestId: 0 });
    setSocialPlace(null);
    setSocialIntent({});
    setCommunityLeagueRequest(0);
    setVisitedCountriesRequest(0);
    setProfileEditRequest(null);
    setProfileEditingOwner(null);
    setPendingEventTrip(previous => previous && previousOwner === 'guest' && previous.owner === null && ownerId
      ? { ...previous, owner: ownerId }
      : previous?.owner === ownerId ? previous : null);
    setRoutePlaceName('');
    setRouteArea(undefined);
    setRouteSeedKind("surprise");
    setRouteResetToken((value) => value + 1);
    setCockpitFocusTripId("");
    setJourneyGuideTripRequest(null);setJourneyGuideMap(null);
    setCockpitJourneyIntent(null);
    setEventTripIntent(null); setTodayTripId("");
    setVisitedViews([activeViewRef.current]);
    setScrollPositions({});
    setSavedSection("all");
    setSearchOpen(false);
    setGlobalQuery('');
    setSavedRouteId('');
    setToolRequest(null);
    setAdminOverview(null);
    setAccountOpen(false);
    setNotificationsOpen(false);
    setGuestImportOpen(false);
    setRouteExampleOpen(false);
    setJourneyToolRequest(null);
    setEventSearchContext(null);
    setEventFilters(null);
    if (activeViewRef.current === "admin") navigate("profile", { replace: true });
  }, [navigate, ownerId]);

  useEffect(()=>{
    if(!pendingJourneyGuideLink||auth.loading)return;
    const {intent,requestId,replace}=pendingJourneyGuideLink;
    if(intent.tripId){
      if(!ownerId){setAccountOpen(true);return;}
      setJourneyGuideTripRequest({owner:ownerId,request:{...intent,requestId}});
      setCockpitFocusTripId(intent.tripId);
      navigate('cockpit',{replace});
    }else{
      const saved=readMapJourneys(ownerId);
      const journey=saved.items.find(item=>item.id===intent.journeyId);
      if(saved.error||!journey||intent.day>journey.dayCount)showNotice(copy('Bu gezi günü bu hesabın kayıtlarında bulunamadı. Kaydı veya kullandığın hesabı kontrol et.','This itinerary day is unavailable in this account. Check the saved plan or the account you are using.','Kjo ditë nuk gjendet në regjistrimet e llogarisë. Kontrollo planin ose llogarinë.'));
      else setJourneyGuideMap(previous=>previous?.owner===ownerId&&previous.journey.id===journey.id?{...previous,day:intent.day,requestId}:{owner:ownerId,journey,day:intent.day,requestId});
    }
    setPendingJourneyGuideLink(null);
  },[pendingJourneyGuideLink,auth.loading,ownerId,navigate,showNotice,copy]);

  useEffect(() => {
    // Bildirime dokunulduğunda "Fiyat Alarmlarım" ekranı açılır (web'de sessiz no-op).
    return initPushTapListener(() => navigate("alerts"));
  }, [navigate]);

  useEffect(() => {
    // Dinleyici/getter, giriş eşitlemesinden ÖNCE kurulur. Böylece soğuk
    // açılışta geri yüklenen oturum ilk karede hazır olsa bile native tampon
    // boş access token yüzünden atlanmaz.
    const cleanupSync = initLiveActivityTokenSync(() => accessTokenRef.current);
    const cleanupRetry = initLiveActivityRetry();
    return () => { cleanupSync(); cleanupRetry(); };
  }, []);

  useEffect(() => {
    accessTokenRef.current = auth.accessToken;
    const userId = auth.user?.id || "";
    if (!userId || !auth.accessToken) {
      lastLiveActivityOwnerRef.current = "";
      lastPushOwnerRef.current = "";
      return;
    }
    if (!online || !isNativePlatform()) return;

    let active = true;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    const accessToken = auth.accessToken;

    const syncNativeSession = () => {
      if (!active || !accessTokenRef.current) return;

      // Live Activity oturumu yalnız gerçek kullanıcı/oturum geçişinde yeni
      // generation açar. Başarısızlıkta sahip işaretlenmez; ağ dönüşü veya
      // foreground aynı güvenli generation ile tekrar dener.
      if (lastLiveActivityOwnerRef.current !== userId) {
        void syncTokensAfterLogin(userId).then((synced) => {
          if (active && synced && auth.user?.id === userId && accessTokenRef.current === accessToken) {
            lastLiveActivityOwnerRef.current = userId;
          }
        });
      }

      // Eski logout isteği yalnız aynı hesabın bearer'ıyla yeniden denenir.
      // Ardından, kullanıcı tercihi açıksa mevcut APNs/FCM tokenı hesaba
      // atomik bağlanır. Başarı gelmeden sahip işareti yazılmaz.
      const syncNormalPush = async () => {
        if (hasPendingPushDetach()) {
          await retryPendingPushDetach(() => accessTokenRef.current, userId);
        }
        if (!active || auth.user?.id !== userId || accessTokenRef.current !== accessToken) return;
        if (!isPushEnabledForDevice()) {
          lastPushOwnerRef.current = userId;
          return;
        }
        if (lastPushOwnerRef.current === userId) return;
        const synced = await syncPushAfterLogin(() => accessTokenRef.current);
        if (active && synced && auth.user?.id === userId && accessTokenRef.current === accessToken) {
          lastPushOwnerRef.current = userId;
        }
      };
      void syncNormalPush();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncNativeSession();
    };
    syncNativeSession();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void addPluginListener("App", "appStateChange", (value) => {
      if (value.isActive === true) syncNativeSession();
    }).then((handle) => {
      if (!active) void handle?.remove();
      else appStateListener = handle;
    });

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void appStateListener?.remove();
    };
  }, [auth.accessToken, auth.user?.id, online]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let retryAttempt = 0;
    let retryTimer: number | null = null;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    const accessToken = auth.accessToken;
    const tokenChanged = adminTokenRef.current !== accessToken;
    adminTokenRef.current = accessToken;

    if (tokenChanged) {
      setAdminOverview(null);
      setAdminAllowed(false);
    }
    if (!accessToken) {
      setAdminChecking(false);
      return () => { active = false; };
    }

    const scheduleRetry = () => {
      if (!active || retryTimer !== null || retryAttempt >= 5) return;
      const delays = [2_000, 5_000, 12_000, 25_000, 45_000];
      const delay = delays[retryAttempt++] ?? 45_000;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        checkAccess();
      }, delay);
    };

    // Oturum açan her kullanıcıda pahalı yönetim kuyruklarını indirme.
    // Önce yalnız rolü doğrula; ağ/5xx hatası yetki reddi SAYILMAZ. Böylece
    // geçici kesinti tek yönetici girişini oturum boyunca görünmez yapmaz.
    const checkAccess = () => {
      if (!active || inFlight || !online) {
        if (active && !online) scheduleRetry();
        return;
      }
      inFlight = true;
      setAdminChecking(true);
      void getMobileAdminAccess(accessToken)
        .then((access) => {
          if (!active || adminTokenRef.current !== accessToken) return;
          retryAttempt = 0;
          setAdminAllowed(access.allowed);
        })
        .catch((error) => {
          if (!active || adminTokenRef.current !== accessToken) return;
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setAdminAllowed(false);
            return;
          }
          scheduleRetry();
        })
        .finally(() => {
          inFlight = false;
          if (active && adminTokenRef.current === accessToken) setAdminChecking(false);
        });
    };

    const resumeCheck = () => {
      retryAttempt = 0;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      checkAccess();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resumeCheck();
    };
    checkAccess();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void addPluginListener("App", "appStateChange", (value) => {
      if (value.isActive === true) resumeCheck();
    }).then((handle) => {
      if (!active) void handle?.remove();
      else appStateListener = handle;
    });

    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void appStateListener?.remove();
    };
  }, [auth.accessToken, online]);

  useEffect(() => {
    if (activeView !== "admin" || !adminAllowed || !auth.accessToken || adminOverview) return;
    let active = true;
    setAdminChecking(true);
    void getMobileAdminOverview(auth.accessToken)
      .then((overview) => { if (active) setAdminOverview(overview); })
      .catch(() => {
        if (!active) return;
        // Erişim daha önce sunucuda doğrulandı. Özetin geçici yükleme hatası
        // yetkiyi kaldırmaz; profil girişini koruyup yeniden denemeye izin ver.
        setAdminOverview(null);
        showNotice(copy("Yönetim merkezi şu an açılamadı. Bağlantı gelince yeniden deneyebilirsin.", "The admin centre is unavailable right now. Try again when your connection returns."));
        navigate("profile", { replace: true });
      })
      .finally(() => { if (active) setAdminChecking(false); });
    return () => { active = false; };
  }, [activeView, adminAllowed, adminOverview, auth.accessToken, copy, navigate, showNotice]);

  useEffect(() => {
    const userId = auth.user?.id || "";
    if (!userId || onboardingOpen || releaseOpen) {
      setGuestImportOpen(false);
      return;
    }
    try {
      const summary = getGuestDataSummary();
      setGuestSummary(summary);
      setGuestImportOpen(summary.total > 0 && shouldOfferGuestDataImport(userId));
    } catch {
      setGuestImportOpen(false);
    }
  }, [auth.user?.id, onboardingOpen, releaseOpen]);

  useEffect(() => {
    if (!ownerId || !auth.accessToken || !online) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    void import("./lib/journalSync").then(module => {
      if (!stopped) stop = module.startJournalSync(ownerId,auth.accessToken);
    });
    return () => { stopped = true; stop?.(); };
  }, [ownerId,auth.accessToken,online]);

  useEffect(() => {
    if (!ownerId || !auth.accessToken || !online) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    void import("./lib/routeSync").then(module => {
      if (!stopped) stop = module.startRouteSync(ownerId, auth.accessToken);
    });
    return () => { stopped = true; stop?.(); };
  }, [ownerId, auth.accessToken, online]);

  useEffect(() => {
    if (!ownerId || !auth.accessToken || !online) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    void import("./lib/accountCollectionSync").then(module => {
      if (!stopped) stop = module.startAccountCollectionSync(ownerId, auth.accessToken);
    });
    return () => { stopped = true; stop?.(); };
  }, [ownerId, auth.accessToken, online]);

  useEffect(() => {
    if (!ownerId || !auth.accessToken || !online) return;
    let active = true;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    // Önceki açılışta ağ kesildiyse misafir kayıtlarının web eşitlemesini
    // kullanıcıdan yeniden işlem istemeden açılışta, ağ dönüşünde ve uygulama
    // her öne geldiğinde güvenli/idempotent biçimde tamamla.
    const flushGuestData = () => {
      // Native WebView'da navigator.onLine eski kalabilir; bu effect zaten
      // Capacitor Network'ten gelen güvenilir `online` durumuyla sınırlandı.
      if (!active) return;
      void import("./lib/guestDataSync")
        .then((module) => module.flushPendingGuestDataSync(ownerId, auth.accessToken))
        .then((report) => {
          if (!active || !report) return;
          if (report.status === "synced") showNotice(copy("Bekleyen kayıtların web hesabınla eşitlendi.", "Your pending items are now synced with your web account."));
          else if (report.status === "partial") showNotice(copy("Bazı kayıtların web eşitlemesi bekliyor; cihazdaki kopyaların güvende.", "Some items are still waiting to sync; the copies on this device are safe."));
        })
        .catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") flushGuestData();
    };

    flushGuestData();
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (isNativePlatform()) {
      void addPluginListener("App", "appStateChange", (value) => {
        if (value.isActive === true) flushGuestData();
      }).then((handle) => {
        if (!active) void handle?.remove();
        else appStateListener = handle;
      });
    }

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void appStateListener?.remove();
    };
  }, [auth.accessToken, copy, online, ownerId, showNotice]);

  useEffect(() => {
    // Uçuş hatırlatmasına dokununca İLGİLİ Kokpit kaydı açılır (tripId ile).
    return initFlightReminderTapListener((tripId) => {
      if (tripId) setCockpitFocusTripId(tripId);
      navigate("cockpit");
    });
  }, [navigate]);

  useEffect(() => startEventReminderMaintenance(ownerId), [ownerId]);
  useEffect(() => initEventReminderTapListener((eventId, reminderOwner) => { if (reminderOwner !== (ownerId || "guest")) return; setFocusEventId(eventId); navigate("events"); }), [navigate, ownerId]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const statusBar = plugin("StatusBar");
    void statusBar?.setOverlaysWebView?.({ overlay: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const statusBar = plugin("StatusBar");
    // Both header palettes need white status icons; only their background changes.
    void statusBar?.setStyle?.({ style: "DARK" }).catch(() => undefined);
    void statusBar?.setBackgroundColor?.({ color: resolvedTheme === "dark" ? "#101b2d" : "#0877b8" }).catch(() => undefined);
  }, [resolvedTheme]);

  useEffect(() => {
    let active = true;
    let listener: { remove: () => Promise<void> } | null = null;
    const network = plugin("Network");
    if (network?.getStatus) {
      void network.getStatus().then((value) => {
        const connected = value && typeof value === "object" && "connected" in value ? Boolean((value as { connected?: boolean }).connected) : navigator.onLine;
        if (active) setOnline(connected);
      });
      void addPluginListener("Network", "networkStatusChange", (value) => setOnline(Boolean(value.connected))).then((handle) => { listener = handle; });
    }
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void listener?.remove();
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    // Android resizes both the WebView and its visual viewport for the IME,
    // so their height difference remains zero. Its native observer is the
    // authority there; keep the existing viewport behavior on iOS and web.
    const keyboard = isNativePlatform() ? plugin("KeyboardState") : undefined;
    const usesNativeKeyboard = typeof keyboard?.getState === "function";
    let active = true;
    let nativeRevision = 0;
    let keyboardListener: { remove: () => Promise<void> } | null = null;
    const update = () => {
      if (!active || !viewport) return;
      if (!usesNativeKeyboard) setKeyboardOpen(window.innerHeight - viewport.height > 150);
      document.documentElement.style.setProperty("--visual-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--visual-top", `${viewport.offsetTop}px`);
    };
    if (usesNativeKeyboard) {
      void addPluginListener("KeyboardState", "keyboardStateChanged", state => {
        if (!active || typeof state.visible !== "boolean") return;
        nativeRevision++;
        setKeyboardOpen(state.visible);
      }).then(handle => {
        if (!active) { void handle?.remove().catch(() => undefined); return; }
        keyboardListener = handle;
        const requestedAt = nativeRevision;
        void keyboard!.getState().then(value => {
          const state = value as { visible?: boolean };
          // A newer IME event wins over a delayed initial snapshot.
          if (active && requestedAt === nativeRevision && typeof state.visible === "boolean") setKeyboardOpen(state.visible);
        }).catch(() => undefined);
      });
    }
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      active = false;
      void keyboardListener?.remove().catch(() => undefined);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    // Sheet'ler erişilebilirlik izolasyonu için body'ye portal edilir. Klavye
    // durumunu da body'ye taşıyarak eski iOS WebView'larında (:has öncesi)
    // sheet'in görünür alana sığmasını koru.
    document.body.classList.toggle("keyboard-open", keyboardOpen);
    return () => document.body.classList.remove("keyboard-open");
  }, [keyboardOpen]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    let active = true;
    let backListener: { remove: () => Promise<void> } | null = null;
    let urlListener: { remove: () => Promise<void> } | null = null;

    void addPluginListener("App", "backButton", () => {
      const state = nativeUiRef.current;
      if (state.onboardingOpen) return;
      if (closeTopSheet()) return;
      if (state.releaseOpen) return setReleaseOpen(false);
      if (state.notificationsOpen) return setNotificationsOpen(false);
      if (state.accountOpen) {
        setPendingEventTrip(null);
        clearBudgetSignInResume();
        return setAccountOpen(false);
      }
      if (historyDepth.current > 0 || state.nestedView) return goBack();
      if (state.activeView !== "home") return navigate("home", { replace: true });
      const app = plugin("App");
      void app?.exitApp?.().catch(() => undefined);
    }).then((handle) => {
      if (!handle) return;
      if (!active) void handle.remove();
      else backListener = handle;
    });

    void addPluginListener("App", "appUrlOpen", (event) => {
      const url = typeof event.url === "string" ? event.url : "";
      if (/\/auth\/callback|auth\/callback/i.test(url)) return;
      if(isJourneyGuideUrl(url)){
        const intent=journeyGuideIntentFromUrl(url);
        if(intent)setPendingJourneyGuideLink({intent,requestId:++journeyGuideLinkCounter.current,replace:false});
        return;
      }
      const target = url ? viewFromUrl(url) : null;
      const tripId = url ? tripIdFromUrl(url) : null;
      const inviteCode = url ? tripInviteFromUrl(url) : "";
      if (tripId) setCockpitFocusTripId(tripId);
      if (inviteCode) setCockpitInviteCode(rememberTripInvite(inviteCode));
      if (inviteCode) navigate("trips");
      else if (target) navigate(target, target === "city" ? { cityCode: cityCodeFromUrl(url) || undefined } : target === "cities" ? { cityCountryCode: cityCountryFromUrl(url) } : undefined);
      else if (tripId || inviteCode) navigate("cockpit");
    }).then((handle) => {
      if (!handle) return;
      if (!active) void handle.remove();
      else urlListener = handle;
    });

    const app = plugin("App");
    if (app?.getLaunchUrl) {
      void app.getLaunchUrl().then((value) => {
        if (!active) return;
        const url = value && typeof value === "object" && "url" in value ? String((value as { url?: string }).url || "") : "";
        if (url && !/\/auth\/callback|auth\/callback/i.test(url)) {
          if(isJourneyGuideUrl(url)){
            const intent=journeyGuideIntentFromUrl(url);
            if(intent)setPendingJourneyGuideLink({intent,requestId:++journeyGuideLinkCounter.current,replace:true});
            return;
          }
          const target = viewFromUrl(url);
          const tripId = tripIdFromUrl(url);
          const inviteCode = tripInviteFromUrl(url);
          if (tripId) setCockpitFocusTripId(tripId);
          if (inviteCode) setCockpitInviteCode(rememberTripInvite(inviteCode));
          if (inviteCode) navigate("trips", { replace: true });
          else if (target) navigate(target, { replace: true, ...(target === "city" ? { cityCode: cityCodeFromUrl(url) || undefined } : {}), ...(target === "cities" ? { cityCountryCode: cityCountryFromUrl(url) } : {}) });
          else if (tripId || inviteCode) navigate("cockpit", { replace: true });
        }
      });
    }

    return () => {
      active = false;
      void backListener?.remove();
      void urlListener?.remove();
    };
  }, [goBack, navigate]);

  const startGuide = useCallback((task?: GuideTask) => {
    saveGuideProgress({ active: true, seen: [], ...(task ? {task} : {}) });
    setGuideTask(task);
    setGuideRevision(value => value + 1);
    setGuideActive(true);
  }, []);

  const beginWelcomeGuide = useCallback((destination: WelcomeDestination) => {
    const task = guideTaskForIntent(destination === "home" ? "explore" : destination);
    startGuide(task);
    openNavigationView(destination === "home" ? "explore" : destination);
    if (task === "routeExample") setRouteExampleOpen(true);
  }, [startGuide, openNavigationView]);

  const closeAccount = useCallback((authenticated = false) => {
    if (!authenticated) { clearBudgetSignInResume(); setPendingEventTrip(null); }
    setAccountOpen(false);
    if (welcomeDestination && !hasBudgetSignInResume()) {
      rememberWelcomeDestination(null);
      setWelcomeDestination(null);
      beginWelcomeGuide(welcomeDestination);
    }
  }, [welcomeDestination, beginWelcomeGuide]);

  // OAuth can complete without an AccountSheet submit callback. Keep an
  // incomplete profile in the existing account form before continuing.
  useEffect(() => {
    if (hasBudgetSignInResume()) return;
    if (ownerId && profileEditingOwner === ownerId) return;
    if (!welcomeDestination || !auth.user || auth.recoveryPending) return;
    if (!auth.user.user_metadata?.full_name || !auth.user.user_metadata?.username) return;
    closeAccount(true);
  }, [welcomeDestination, auth.user, auth.recoveryPending, closeAccount, ownerId, profileEditingOwner]);

  const openProfileEditor = () => {
    if (!ownerId || !auth.accessToken) return;
    setAccountOpen(false);
    setProfileEditingOwner(ownerId);
    setProfileEditRequest({ owner: ownerId, id: ++profileEditCounter.current });
    navigate('profile');
  };
  const completeProfileForEvent = (context: EventProfileContext) => {
    if (!ownerId || !auth.accessToken || profileOwnerRef.current !== ownerId) return;
    const view = activeViewRef.current;
    if (view !== 'events' && view !== 'community' || !context || (view === 'events' ? context.kind !== 'event' || !context.event.id : context.kind !== 'chat' || !context.chat.eventKey)) return;
    setEventProfileReturn(null);
    eventProfileResume.current = { owner: ownerId, view, context, started: false, completed: false };
    openProfileEditor();
  };
  const reportProfileEditing = useCallback((editing: boolean) => {
    setProfileEditingOwner(previous => profileOwnerRef.current === ownerId
      ? editing ? ownerId : null
      : previous === ownerId ? null : previous);
    const resume = eventProfileResume.current;
    if (!resume || resume.owner !== ownerId || profileOwnerRef.current !== ownerId) return;
    if (editing) { resume.started = true; return; }
    if (!resume.started) return;
    eventProfileResume.current = null;
    if (resume.completed && activeViewRef.current === "profile") { setEventProfileReturn({ owner: resume.owner, context: resume.context }); setFocusEventId(''); navigate(resume.view); }
  }, [ownerId, navigate]);
  const saveProfileIdentity = async (fullName: string, username: string) => {
    const editingOwner = ownerId, token = auth.accessToken;
    const editingRevision = profileOwnerRevision.current;
    const resume = eventProfileResume.current;
    const sessionChanged = copy('Profil oturumu değişti. Yeniden giriş yapıp tekrar dene.', 'Your profile session changed. Sign in again and retry.', 'Sesioni i profilit ndryshoi. Hyr sërish dhe provo përsëri.');
    if (!editingOwner || !token || profileOwnerRef.current !== editingOwner) throw new Error(sessionChanged);
    const name = fullName.replace(/\s+/g, ' ').trim(), handle = username.trim().toLowerCase();
    if (name.length < 2 || name.length > 100 || !/^[a-z0-9_]{3,20}$/.test(handle)) throw new Error(copy('Adını ve kullanıcı adını kontrol et.', 'Check your name and username.', 'Kontrollo emrin dhe emrin e përdoruesit.'));
    try {
      await completeUserProfile(editingOwner, handle, token);
      if (profileOwnerRef.current !== editingOwner || profileOwnerRevision.current !== editingRevision) throw new Error(sessionChanged);
      await auth.updateProfile(name, handle);
      if (profileOwnerRef.current !== editingOwner || profileOwnerRevision.current !== editingRevision) throw new Error(sessionChanged);
      if (resume?.owner === editingOwner && eventProfileResume.current === resume) resume.completed = true;
    } catch (failure) {
      throw new Error(getSupabaseDataErrorMessage(failure, failure instanceof Error ? failure.message : copy('Profil güncellenemedi.', 'Your profile could not be updated.', 'Profili nuk u përditësua.')), { cause: failure });
    }
  };

  const resumeBudgetAfterSignIn = useCallback((intent: Extract<CockpitJourneyIntent, { kind: "city-budget" }>) => {
    rememberWelcomeDestination(null);
    setWelcomeDestination(null);
    setAccountOpen(false);
    setCockpitJourneyIntent(intent);
    navigate("cockpit");
  }, [navigate]);
  const requireBudgetProfile = useCallback(() => {
    if (ownerId && profileEditingOwner === ownerId && activeViewRef.current === 'profile') return;
    setAccountOpen(true);
  }, [ownerId, profileEditingOwner]);
  useBudgetSignInResume({
    ownerId, accessToken: auth.accessToken, loading: auth.loading, recoveryPending: auth.recoveryPending,
    profileComplete: !!(auth.user?.user_metadata?.full_name && auth.user?.user_metadata?.username) && profileEditingOwner !== ownerId,
    onRequireProfile: requireBudgetProfile, onResume: resumeBudgetAfterSignIn,
  });

  const completeWelcome = (destination?: "explore" | "route" | "companion", options?: { guest: boolean }) => {
    if (destination === "route" && !hasCompletedOnboarding()) setRouteResetToken(value => value + 1);
    completeOnboarding();
    markReleaseSeen(releaseId);
    setOnboardingOpen(false);
    // An explicit in-progress account/budget recovery keeps precedence over
    // optional setup navigation, including the early guest shortcut.
    if (hasBudgetSignInResume() || auth.recoveryPending) { setAccountOpen(true); return; }
    if (!ownerId && options?.guest && !auth.loading) {
      rememberWelcomeDestination(null);
      setWelcomeDestination(null);
      setAccountOpen(false);
      beginWelcomeGuide(destination || "home");
      return;
    }
    if (!ownerId) {
      const next = destination || "home";
      rememberWelcomeDestination(next);
      setWelcomeDestination(next);
      setAccountOpen(true);
      return;
    }
    beginWelcomeGuide(destination || "home");
  };

  const reopenGuide = () => {
    setGuideMenuOpen(true);
  };
  const stopGuide = () => {
    saveGuideProgress({ ...readGuideProgress(), active: false });
    setGuideActive(false);
  };

  const closeRelease = () => {
    markReleaseSeen(releaseId);
    setReleaseOpen(false);
  };

  const startPull = (event: React.TouchEvent) => {
    edgeSwipeStart.current = null;
    pullStart.current = null;
    const touch = event.touches[0];
    if (!touch || onboardingOpen || releaseOpen || notificationsOpen || accountOpen || hasOpenSheet()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, button, a, [role='dialog'], [data-no-gesture], .chip-scroll")) return;
    if (touch.clientX <= 24) edgeSwipeStart.current = { x: touch.clientX, y: touch.clientY };
    if (activeView === "home" && window.scrollY <= 0) pullStart.current = touch.clientY;
  };
  const movePull = (event: React.TouchEvent) => {
    if (pullStart.current === null || window.scrollY > 0) return;
    const distance = Math.max(0, Math.min(96, ((event.touches[0]?.clientY || 0) - pullStart.current) * .55));
    setPullDistance(distance);
  };
  const endPull = (event: React.TouchEvent) => {
    const end = event.changedTouches[0];
    const edge = edgeSwipeStart.current;
    edgeSwipeStart.current = null;
    if (end && edge && end.clientX - edge.x > 76 && Math.abs(end.clientY - edge.y) < 55) {
      setPullDistance(0);
      pullStart.current = null;
      if (historyDepth.current > 0 || nestedView) goBack();
      else if (activeView !== "home") navigate("home", { replace: true });
      return;
    }
    pullStart.current = null;
    if (pullDistance >= 62) {
      setRefreshing(true);
      setRefreshTick((value) => value + 1);
      window.setTimeout(() => {
        setRefreshing(false);
        showNotice(online ? copy("Yenileme istendi.", "Refresh requested.") : copy("Cihazdaki kayıtlar yeniden açılıyor.", "Reloading saved items on this device."));
      }, 550);
    }
    setPullDistance(0);
  };
  const cancelPull = () => {
    edgeSwipeStart.current = null;
    pullStart.current = null;
    setPullDistance(0);
  };

  const prepareCockpitJourney = (intent: CockpitJourneyIntent) => {
    if (!ownerId || !auth.accessToken) {
      if (!ownerId && intent.kind === "city-budget" && intent.ownerId === null) {
        if (!prepareBudgetSignInResume(intent)) showNotice(copy("Bütçen bu cihazda korunamadı. Giriş yaptıktan sonra tekrar seç.", "This device could not retain the budget. Select it again after signing in.", "Pajisja nuk e ruajti dot buxhetin. Zgjidhe sërish pas hyrjes."));
      } else clearBudgetSignInResume();
      setAccountOpen(true); return;
    }
    if (!validJourneyIntent(intent, ownerId)) return;
    clearBudgetSignInResume();
    setCockpitJourneyIntent(intent); navigate("cockpit");
  };
  const renderView = (view: ViewId) => {
    if (view === "cities") return <CityDiscoveryScreen countryCode={cityDiscoveryCountry} onOpenCountry={openCityCountry} onBack={goBack} onOpenCity={openCity} onToggleCitySaved={toggleCitySaved} savedCityCodes={savedCities.owner === ownerId ? savedCities.codes : []} initialQuery={cityDiscoveryQuery} onQueryChange={setCityDiscoveryQuery}/>;
    if (view === "city") {
      const destination = cityCode ? cityDestination(cityCode, locale) : null;
      if (!destination) return <section className="screen"><h1>{copy("Şehir bulunamadı", "City not found", "Qyteti nuk u gjet")}</h1><button className="secondary-wide" onClick={() => navigate("cities")}>{copy("Tüm şehirleri keşfet", "Explore all destinations", "Eksploro të gjitha destinacionet")}</button></section>;
      return <CityDestinationScreen destination={destination} saved={savedCities.owner === ownerId && savedCities.codes.includes(destination.code)} onToggleSaved={() => toggleCitySaved(destination.code)}
        onPlan={() => planCity(destination)} onBudget={() => { navigate("costs", { budgetCityQuery: locale === "tr" ? destination.name : cityDestination(destination.code, "en")?.name || destination.name }); setScrollPositions(previous => ({ ...previous, costs: 0 })); }}
        onMap={point => mapCity(destination, point)} onEvents={() => openNearbyEvents({ source: "city", countryCode: destination.countryCode, cityName: cityDestination(destination.code, "en")?.name || destination.name,
          startDate: localIsoDate(0), endDate: localIsoDate(7) })} onBack={goBack}
        onOpenReadyRoute={() => { if (destination.route) openSeededRoute(destination.route, "explore"); }}/>
    }
    if (view === "home") return <HomeScreen onOpenCity={openCity} onOpenAllCities={() => { setCityDiscoveryQuery(""); setScrollPositions(previous => ({ ...previous, cities: 0 })); navigate("cities"); }} onToggleCitySaved={toggleCitySaved} savedCityCodes={savedCities.owner === ownerId ? savedCities.codes : []} onOpenGuide={reopenGuide} onOpenJourneyTool={openJourneyTool} onOpenGlobalSearch={openGlobalSearch} onOpenTool={openTool} initialSearchQuery={exploreSearch.query} onSearchDestination={searchDestinations} onToggleSaved={toggleHomeRoute} savedRouteIds={homeSavedRoutes?.owner === ownerId ? homeSavedRoutes.codes : []} onOpenCountry={code => { setNewsCountryCode(alpha2FromAlpha3(code)); navigate("country-news"); }} onOpenTrip={(id, section) => { setCockpitFocusTripId(id); setTodayTripId(section === "today" ? id : ""); navigate("cockpit"); }} onOpenSaved={section => {setJourneyToolRequest(null); setSavedSectionRequest(value => value + 1); navigate("trips"); setSavedSection(section); }} user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} refreshToken={refreshTick} onNavigate={openNavigationView} onOpenCommunity={(countryCode) => navigate("community", { communityCountryCode: countryCode })} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onBuildRoute={route => openSeededRoute(route, "explore")} onNotice={showNotice} />;
    if (view === "explore") return <ExploreScreen initialSearchQuery={exploreSearch.query} searchRequestId={exploreSearch.requestId} initialDestinationCode={exploreCode} ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onBuildRoute={route => openSeededRoute(route, "explore")}
      savedRouteIds={homeSavedRoutes?.owner === ownerId ? homeSavedRoutes.codes : []} onToggleSaved={toggleHomeRoute}
      onOpenSavedRoute={code => { const saved = savedInspirationRoute(code, ownerId); if (!saved) return showNotice(copy('Bu rota artık kayıtlı değil.', 'This route is no longer saved.', 'Ky itinerar nuk është më i ruajtur.')); setSavedRouteId(saved.id); openSavedRoutes(); }}
      onPlanPlace={(name, area) => { setRoutePlaceName(name); setRouteArea(area); setSurpriseRoute(null); setRouteResetToken(value => value + 1); setMapRequestId(value => value + 1); navigate('route'); }}
      onOpenCountryGuide={code => openTool('guide', alpha2FromAlpha3(code))}
      onOpenCountryEvents={(countryCode, cityName) => openNearbyEvents({ countryCode, cityName, startDate: activeTrip?.countryCode === countryCode ? activeTrip.startDate : localIsoDate(0), endDate: activeTrip?.countryCode === countryCode ? activeTrip.endDate : localIsoDate(7) })} onNotice={showNotice} />;
    if (view === "events") return <EventsScreen profileEvent={eventProfileReturn?.owner === ownerId && eventProfileReturn.context.kind === "event" ? eventProfileReturn.context.event : null} onProfileEventHandled={() => setEventProfileReturn(previous => previous?.context.kind === "event" ? null : previous)} onCompleteProfile={event => completeProfileForEvent({ kind: "event", event })} pendingTripEvent={pendingEventTrip && (pendingEventTrip.owner === ownerId || pendingEventTrip.owner === null) ? pendingEventTrip.event : null} onTripIntentPending={event => { if (profileOwnerRef.current === ownerId) setPendingEventTrip({owner: ownerId, event}); }} onTripIntentHandled={() => setPendingEventTrip(previous => previous?.event === pendingEventTrip?.event ? null : previous)} initialContext={eventSearchContext?.context || (activeTrip && !(eventFilters?.owner === ownerId && eventFilters.tripKey === activeTripKey) ? { countryCode: activeTrip.countryCode, cityName: activeTrip.city, startDate: activeTrip.startDate, endDate: activeTrip.endDate } : undefined)} initialFilters={eventFilters?.owner === ownerId && (eventFilters.tripKey || '') === activeTripKey ? eventFilters.filters : undefined} onFiltersChange={filters => setEventFilters({owner: ownerId, tripKey: activeTripKey, filters})} onContextHandled={() => setEventSearchContext(previous => previous ? {...previous, context: null} : previous)} onCreateEventTrip={event => { if (!ownerId) { setAccountOpen(true); return; } setEventTripIntent({ ownerId, event }); navigate("cockpit"); }} key={`${ownerId || "guest"}-${eventSearchContext?.id || 0}-${activeTripKey}`} focusEventId={focusEventId} onFocusHandled={() => setFocusEventId("")} ownerId={ownerId} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onOpenSaved={() => {setJourneyToolRequest(null); setSavedSectionRequest(value => value + 1); navigate("trips"); setSavedSection("events"); }} onOpenProfile={profileKey => { setSocialIntent({profileKey}); navigate('community'); }} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "country-news") return <CountryNewsScreen key={newsCountryCode} initialCountry={newsCountryCode}/>;
    if (view === "costs") return <CostsScreen key={cityBudgetRequest?.id || 0} initialCityQuery={cityBudgetRequest?.query} ownerId={ownerId} onPrepareCockpitBudget={prepareCockpitJourney} onOpenCountryNews={code => { setNewsCountryCode(code); navigate("country-news"); }}/>;
    if (view === "airports") return <AirportGuideScreen onOpenTransfer={() => { navigate("trips"); setOpenTransfer(true); }} onNotice={showNotice} />;
    if (view === "companion" || view === "phrases") return <TravelCompanionScreen key={`${ownerId || "guest"}-${toolRequest?.id || 0}-${activeTrip?.tripId || ''}`} initialCountry={toolRequest?.country || activeTrip?.countryCode || ''} initialMapSearch={toolRequest?.mapSearch} initialTool={toolRequest?.tool} onOpenEvents={openNearbyEvents} ownerId={ownerId} accessToken={auth.accessToken} onSignIn={() => setAccountOpen(true)} initialTab={view === "phrases" ? "phrases" : "assistant"} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "passport") return <PassportScreen ownerId={ownerId} onOpenCountryNews={code => { setNewsCountryCode(code); navigate("country-news"); }}/>;
    if (view === "surprise") return <SurpriseScreen initialRoute={surpriseRoute} onSelect={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); }} onBuildRoute={route => openSeededRoute(route, "surprise")} onNotice={showNotice} />;
    if (view === "route") return <RouteAssistantScreen onOpenSavedRoutes={openSavedRoutes} onOpenAccount={() => setAccountOpen(true)} key={`planner-${ownerId || "guest"}-${routeResetToken}`} placeName={routePlaceName} placeArea={routeArea} mapRequestId={mapRequestId} surpriseRoute={surpriseRoute} routeSeedKind={routeSeedKind} ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "trips") return <TripsScreen onOpenCountryMap={code => openTool("map", code)} onEditVisitedCountries={() => { setVisitedCountriesRequest(value => value + 1); navigate("profile"); }} onOpenOfflineMap={() => openTool("offline")} sectionRequestId={savedSectionRequest} toolRequestId={journeyToolRequest?.id || 0} guideRequest={guideLibraryRequest} initialRouteId={savedRouteId} onInitialRouteHandled={() => setSavedRouteId("")} onPrepareCockpit={prepareCockpitJourney} initialSection={savedSection} onOpenEvent={id => { setFocusEventId(id); navigate("events"); }} key={ownerId || "guest"} initialTool={openTransfer ? "airport" : journeyToolRequest?.tool} onOpenDestination={(code) => { navigate("explore"); setExploreCode(code); }} user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} inviteCode={cockpitInviteCode || undefined} onInviteHandled={() => { rememberTripInvite(""); setCockpitInviteCode(""); }} onOpenAccount={() => setAccountOpen(true)} onNavigate={openNavigationView} onNotice={showNotice} />;
    if (view === "cockpit") return <CockpitScreen onOpenPlans={() => { setSavedSection("shared"); setSavedSectionRequest(value => value + 1); navigate("trips"); setScrollPositions(previous => ({...previous, trips: 0})); }} journeyGuideRequest={journeyGuideTripRequest?.owner===ownerId?journeyGuideTripRequest.request:null} onJourneyGuideHandled={()=>setJourneyGuideTripRequest(null)} todayTripId={todayTripId} onTodayHandled={() => setTodayTripId("")} eventIntent={eventTripIntent?.ownerId === ownerId ? eventTripIntent : null} onEventHandled={() => setEventTripIntent(null)} journeyIntent={cockpitJourneyIntent?.ownerId === ownerId ? cockpitJourneyIntent : null} onJourneyHandled={() => setCockpitJourneyIntent(null)} user={auth.user} accessToken={auth.accessToken} focusTripId={cockpitFocusTripId || undefined} onFocusHandled={() => setCockpitFocusTripId("")} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (view === "community") return <CommunityScreen profileChat={eventProfileReturn?.owner === ownerId && eventProfileReturn.context.kind === "chat" ? eventProfileReturn.context.chat : null} onProfileChatHandled={() => setEventProfileReturn(previous => previous?.context.kind === "chat" ? null : previous)} onCompleteProfile={chat => completeProfileForEvent({ kind: "chat", chat })} initialLeagueRequest={communityLeagueRequest} onLeagueRequestHandled={() => setCommunityLeagueRequest(0)} user={auth.user} accessToken={auth.accessToken} initialCountryCode={communityCountryCode} initialSocialPostId={socialIntent.postId} initialSocialCommentId={socialIntent.commentId} initialSocialProfileKey={socialIntent.profileKey} onSocialIntentHandled={()=>setSocialIntent({})} initialQuestionId={socialIntent.questionId} onQuestionIntentHandled={()=>setSocialIntent({})} onAddSocialPlace={place=>setSocialPlace({owner:ownerId,place})} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onSearchDestination={searchDestinations} onNotice={showNotice} />;
    if (view === "alerts") return <PriceAlertsScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (view === "admin" && adminAllowed && Boolean(auth.accessToken)) return <AdminScreen accessToken={auth.accessToken} initialOverview={adminOverview} checking={adminChecking || !adminOverview} onOverviewChange={setAdminOverview} onNotice={showNotice} />;
    return <ProfileScreen onProfileEditingChange={reportProfileEditing} onSaveProfileIdentity={saveProfileIdentity} profileEditRequest={profileEditRequest?.owner === ownerId ? profileEditRequest.id : 0} onProfileEditHandled={() => setProfileEditRequest(previous => previous?.owner === ownerId ? null : previous)} visitedCountriesRequest={visitedCountriesRequest} onVisitedCountriesHandled={() => setVisitedCountriesRequest(0)} onOpenLeague={() => { setCommunityLeagueRequest(value => value + 1); navigate("community"); }} user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} isAdmin={adminAllowed} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onOpenOnboarding={reopenGuide} onOpenCommunityQuestion={questionId => { setSocialIntent({questionId}); navigate("community"); }} onAddSocialPlace={place => setSocialPlace({owner:ownerId,place})} onNotice={showNotice} />;
  };

  const tabs = tabDefinitions.map((tab) => ({
    ...tab,
    label: tab.id === "home" ? copy("Keşfet", "Explore") : tab.id === "trips" ? copy("Planlar", "Plans") : tab.id === "community" ? copy("Topluluk", "Community") : tab.id === "companion" ? copy("Araçlar", "Tools") : copy("Profil", "Profile"),
  }));

  return <div className={`app-shell editorial-app shared-shell view-${activeView} ${keyboardOpen ? "keyboard-open" : ""}`} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={endPull} onTouchCancel={cancelPull}>
    {launching && <AnimatedSplash onFinish={finishLaunching} />}
    <header className="topbar shared-topbar" inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      <div className="topbar-brand-group">
        {(nestedView || (activeView === "companion" && toolRequest?.mapSearch)) && activeView !== "city" && activeView !== "cities" && <button className="topbar-back" onClick={goBack} aria-label={copy("Önceki ekrana dön", "Go back")}><Icon name="back" size={21} /></button>}
        <button className="brand-button" onClick={() => navigate("home")} aria-label={copy("LetsGo2Travel ana sayfa", "LetsGo2Travel home")}><BrandMark decorative /></button>
      </div>
      <div className="topbar-actions">
        <HeaderThemeToggle />
        <LanguagePicker />
        <button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label={`${copy("Bildirimler", "Notifications")}${visibleUnreadCount ? `, ${visibleUnreadCount} ${copy("okunmamış", "unread")}` : ""}`}><Icon name="bell" size={20} />{visibleUnreadCount > 0 && <span className="notification-badge" aria-hidden="true">{visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}</span>}</button>
      </div>
    </header>

    {!online && <div className="offline-banner"><Icon name="offline" size={16} /> {copy("Çevrimdışısın. Kayıtlı planların ve yerel keşif araçların çalışmaya devam eder.", "You're offline. Saved plans and offline travel tools remain available.")}</div>}
    {(pullDistance > 0 || refreshing) && <div className={`pull-indicator ${refreshing ? "refreshing" : ""}`} style={{ transform: `translate(-50%, ${Math.max(0, pullDistance - 38)}px)` }}><Icon name="refresh" size={18} />{refreshing ? copy("Yenileniyor", "Refreshing") : copy("Yenilemek için bırak", "Release to refresh")}</div>}
    <main ref={mainRef} className="app-content" tabIndex={-1} inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      <div key={authUiKey}>
        {/* Keep only the two draft-heavy root screens. Provider flight screens
            unmount so expiring flight data never lives in a hidden tree. */}
        {(["explore", "route"] as const).map(view => (visitedViews.includes(view) || activeView === view) &&
          <Activity key={view} mode={activeView === view ? "visible" : "hidden"}>
            <Suspense fallback={<div className="screen screen-module-loading" role="status"><p>{copy("Ekran hazırlanıyor…", "Getting things ready…")}</p><div className="skeleton-list"><div /><div /></div></div>}>
              <NavigationPane restoreTop={scrollPositions[view] || 0} direction={navigationDirection}>{renderView(view)}</NavigationPane>
            </Suspense>
          </Activity>
        )}
        {activeView !== "explore" && activeView !== "route" &&
          <Suspense key={activeView} fallback={<div className="screen screen-module-loading" role="status"><p>{copy("Ekran hazırlanıyor…", "Getting things ready…")}</p><div className="skeleton-list"><div /><div /></div></div>}>
            <NavigationPane key={activeView === "cities" ? cityDiscoveryCountry || "countries" : activeView} restoreTop={scrollPositions[activeView] || 0} direction={navigationDirection}>{renderView(activeView)}</NavigationPane>
          </Suspense>
        }
      </div>
    </main>

    <nav className="bottom-nav" aria-label={copy("Ana menü", "Main navigation")} inert={interactionBlocked || keyboardOpen} aria-hidden={interactionBlocked || keyboardOpen || undefined}>
      {tabs.map((tab) => <button key={tab.id} data-guide={tab.id === "trips" ? "nav-plans" : tab.id === "companion" ? "nav-tools" : tab.id === "community" ? "nav-community" : tab.id === "profile" ? "nav-profile" : undefined} className={activeTab === tab.id ? "active" : ""} onClick={() => openNavigationView(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}><span><Icon name={tab.icon} size={21} /></span><small>{tab.label}</small></button>)}
    </nav>

    {notice && createPortal(<div className="toast" role="status"><Icon name="info" size={18} /><span>{notice}</span>{noticeAction?.owner === ownerId && <button type="button" className="notice-action" onClick={() => { const action = noticeAction.onClick; setNotice(''); setNoticeAction(null); action(); }}>{noticeAction.label}</button>}<button onClick={() => {setNotice('');setNoticeAction(null);}} aria-label={copy("Bildirimi kapat", "Dismiss notification")}><Icon name="close" size={15} /></button></div>, document.body)}
    <NotificationCenter open={notificationsOpen} ownerId={ownerId} accessToken={auth.accessToken} online={online} onClose={() => setNotificationsOpen(false)} onNavigate={navigate} onOpenSocial={intent=>{setSocialIntent(intent);navigate('community');}} onOpenRelease={() => setReleaseOpen(true)} onUnreadChange={setUnreadCount} />
    {socialPlace&&socialPlace.owner===ownerId&&<SocialRoutePicker key={ownerId||'guest'} place={socialPlace.place} ownerId={ownerId} onClose={()=>setSocialPlace(null)} onNotice={showNotice} onCreate={place=>{setRoutePlaceName(place.name);setRouteArea(undefined);setSurpriseRoute(null);setRouteResetToken(value=>value+1);navigate('route');}}/>}
    {journeyGuideMap&&journeyGuideMap.owner===ownerId&&<LazyOverlay title={copy("Gezi planın","Your itinerary","Itinerari yt")} loadingMessage={copy("Plan açılıyor…","Opening itinerary…","Po hapet itinerari…")} onClose={()=>setJourneyGuideMap(null)}><Sheet open size="large" className="mj-sheet" title={copy("Gezi planın","Your itinerary","Itinerari yt")} onClose={()=>setJourneyGuideMap(null)}><MapJourneyPlanner key={`${ownerId||'guest'}:${journeyGuideMap.journey.id}`} ownerId={ownerId} accessToken={auth.accessToken} initialJourney={journeyGuideMap.journey} initialDay={journeyGuideMap.day} initialDayRequestId={journeyGuideMap.requestId} onClose={()=>setJourneyGuideMap(null)} onOpenAccount={()=>setAccountOpen(true)} onNotice={showNotice} onOpenSaved={id=>{setJourneyGuideMap(null);setSavedRouteId(id||'');openSavedRoutes();}}/></Sheet></LazyOverlay>}
    {accountOpen && <LazyOverlay title={copy("Hesap", "Account")} loadingMessage={copy("Hesap hazırlanıyor…", "Opening your account…")} onClose={() => closeAccount()}>
      <AccountSheet open onEditProfile={openProfileEditor} onClose={() => closeAccount()} onAuthenticated={() => closeAccount(true)} auth={auth} onNotice={showNotice} />
    </LazyOverlay>}
    {searchOpen && <LazyOverlay title={copy('Uygulamada ara', 'Search the app', 'Kërko në aplikacion')} loadingMessage={copy('Arama hazırlanıyor…', 'Preparing search…', 'Po përgatitet kërkimi…')} onClose={() => setSearchOpen(false)}>
      <GlobalSearchSheet key={authUiKey} open onClose={() => setSearchOpen(false)} ownerId={ownerId} accessToken={auth.accessToken} initialQuery={globalQuery}
        onNavigate={openNavigationView} onOpenTool={openTool} onOpenJourneyTool={openJourneyTool} onOpenGuide={reopenGuide} onSearchDestination={searchDestinations} onOpenCity={openCity}
        onOpenCountry={code => { setNewsCountryCode(alpha2FromAlpha3(code)); navigate('country-news'); }}
        onPlanPlace={(name, area) => { setRoutePlaceName(name); setRouteArea(area); setSurpriseRoute(null); setRouteResetToken(value => value + 1); setMapRequestId(value => value + 1); navigate('route'); }}
        onOpenCountryGuide={code => openTool('guide', alpha2FromAlpha3(code))}
        onOpenTrip={id => { setCockpitFocusTripId(id); navigate('cockpit'); }}
        onOpenSavedRoute={id => { setSavedRouteId(id); navigate('trips'); setSavedSection('routes'); }} />
    </LazyOverlay>}
    {guestImportOpen && <LazyOverlay title={copy("Misafir kayıtları", "Guest items")} loadingMessage={copy("Kayıtlar hazırlanıyor…", "Preparing saved items…")} onClose={() => setGuestImportOpen(false)}>
    <GuestDataImportSheet
      open={guestImportOpen}
      summary={guestSummary}
      busy={guestImportBusy}
      onClose={() => setGuestImportOpen(false)}
      onKeepSeparate={() => {
        if (!ownerId) return;
        try {
          markGuestDataImportDecision(ownerId, "keep_separate");
          setGuestImportOpen(false);
          showNotice(copy("Misafir kayıtların ayrı tutulacak.", "Your guest items will remain separate."));
        } catch {
          showNotice(copy("Seçimin kaydedilemedi. Daha sonra tekrar deneyebilirsin.", "Your choice could not be saved. Try again later."));
        }
      }}
      onImport={() => { void (async () => {
        if (!ownerId || guestImportBusy) return;
        setGuestImportBusy(true);
        let localImportCompleted = false;
        try {
          const result = importGuestDataForUser(ownerId);
          localImportCompleted = true;
          setGuestImportOpen(false);
          setRefreshTick((value) => value + 1);
          if (!auth.accessToken) {
            showNotice(result.added.total
              ? copy(`${result.added.total} misafir kaydı hesabına eklendi.`, `${result.added.total} guest items were added to your account.`, `${result.added.total} regjistrime si vizitor u shtuan në llogarinë tënde.`)
              : copy("Kayıtların zaten hesabında bulunuyor.", "Your items are already in your account."));
            return;
          }

          showNotice(result.added.total
            ? copy(`${result.added.total} kayıt eklendi; web hesabınla eşitleniyor…`, `${result.added.total} items added; syncing with your web account…`, `${result.added.total} regjistrime u shtuan; po sinkronizohen me llogarinë tënde në web…`)
            : copy("Kayıtların web hesabınla kontrol ediliyor…", "Checking your items against your web account…"));
          const guestSync = await import("./lib/guestDataSync");
          const sync = await guestSync.flushPendingGuestDataSync(ownerId, auth.accessToken);
          if (!sync) {
            showNotice(copy("Kayıtların hesabında hazır.", "Your items are ready in your account."));
            return;
          }
          if (sync.status === "synced" || sync.status === "unchanged") {
            showNotice(result.added.total
              ? copy(`${result.added.total} misafir kaydı uygulama ve web hesabınla eşitlendi.`, `${result.added.total} guest items synced with your app and web account.`, `${result.added.total} regjistrime si vizitor u sinkronizuan me aplikacionin dhe llogarinë tënde në web.`)
              : copy("Kayıtların uygulama ve web hesabınla eşitlendi.", "Your items are synced across the app and web."));
          } else if (sync.status === "partial") {
            showNotice(copy("Kayıtların cihazda güvende; bazıları web hesabıyla daha sonra eşitlenecek.", "Your items are safe on this device; some will sync with the web later."));
          } else {
            showNotice(copy("Kayıtların cihaza eklendi fakat web eşitlemesi şu an tamamlanamadı.", "Your items were added to this device, but web sync could not finish right now."));
          }
        } catch {
          showNotice(localImportCompleted
            ? copy("Kayıtların cihaza eklendi fakat web eşitlemesi şu an tamamlanamadı.", "Your items were added to this device, but web sync could not finish right now.")
            : copy("Misafir kayıtları eklenemedi; hiçbir kayıt silinmedi.", "Guest items could not be added; nothing was deleted."));
        } finally {
          setGuestImportBusy(false);
        }
      })(); }}
    />
    </LazyOverlay>}
    {releaseOpen && <LazyOverlay title={copy("Yenilikler", "What's new")} loadingMessage={copy("Yenilikler hazırlanıyor…", "Loading what's new…")} onClose={closeRelease}><ReleaseNotesSheet open onClose={closeRelease} /></LazyOverlay>}
    {onboardingOpen && <Onboarding signedIn={Boolean(ownerId)} guestAllowed={!auth.loading && !auth.recoveryPending && !hasBudgetSignInResume()} onComplete={completeWelcome} />}
    <GuideMenu open={guideMenuOpen} hasRouteDraft={visitedViews.includes('route')} onClose={() => setGuideMenuOpen(false)} onChoose={(destination, mode) => {
      setGuideMenuOpen(false);
      if (destination === 'route' && mode === 'example') { startGuide('routeExample'); setRouteExampleOpen(true); return; }
      if (destination === 'route') { stopGuide(); openNavigationView('route'); return; }
      if (destination === 'trips') setGuideLibraryRequest(value => value + 1);
      startGuide(destination === 'trips' ? 'saved' : destination === 'events' ? 'events' : destination === 'companion' ? 'onTrip' : 'inspiration');
      openNavigationView(destination);
    }} />
    {routeExampleOpen && <LazyOverlay title={copy("Örnekle öğren", "Learn with an example", "Mëso me një shembull")} loadingMessage={copy("Örnek hazırlanıyor…", "Preparing the example…", "Po përgatitet shembulli…")} onClose={() => {setRouteExampleOpen(false); stopGuide();}}><RouteExampleLesson open ownerId={ownerId} key={authUiKey} onClose={() => {setRouteExampleOpen(false); stopGuide();}} onPlanOwn={() => {setRouteExampleOpen(false); stopGuide(); openNavigationView('route');}} onOpenSaved={id => {setRouteExampleOpen(false); stopGuide(); setSavedRouteId(id); openSavedRoutes();}} /></LazyOverlay>}
    <AppGuide view={activeView} task={guideTask} intent={readWelcomePreferences().intent || 'explore'} active={guideActive} revision={guideRevision} paused={interactionBlocked || routeExampleOpen || guideMenuOpen || accountOpen || releaseOpen || notificationsOpen || searchOpen || guestImportOpen} keyboardOpen={keyboardOpen} onStop={stopGuide} onComplete={() => setGuideActive(false)} onOpenExample={() => { startGuide('routeExample'); setRouteExampleOpen(true); }} />
  </div>;
}
