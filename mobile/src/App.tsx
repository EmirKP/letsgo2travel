import { inspirationRouteCodes, toggleInspirationRoute } from "./lib/inspirationRoutes";
import { Activity, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import { AnimatedSplash } from "./components/AnimatedSplash";
import { Icon, type IconName } from "./components/Icon";
import { MenuSheet } from "./components/MenuSheet";
import { NotificationCenter } from "./components/NotificationCenter";
import { Onboarding } from "./components/Onboarding";
import { useAuth } from "./hooks/useAuth";
import { getMobileAdminAccess, getMobileAdminOverview, type MobileAdminOverview } from "./lib/admin";
import { ApiError } from "./lib/api";
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
import type { TravelAssistantTool } from './lib/appTools';
import { alpha2FromAlpha3 } from './data/countryIso';
import type { RouteSuggestion, TabId, ViewId } from "./types";

// Ana ekran ilk karede hazır kalır; diğer modüller yalnız açıldığında
// indirilir. Böylece açılış paketi ve düşük bağlantıda ilk etkileşim hafifler.
const CountryNewsScreen = lazy(() => import("./screens/CountryNewsScreen").then(m => ({ default: m.CountryNewsScreen })));
const CostsScreen = lazy(() => import("./screens/CostsScreen").then(m => ({ default: m.CostsScreen })));
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
const GuestDataImportSheet = lazy(() => import("./components/GuestDataImportSheet").then(module => ({ default: module.GuestDataImportSheet })));
const ReleaseNotesSheet = lazy(() => import("./components/ReleaseNotesSheet").then(module => ({ default: module.ReleaseNotesSheet })));
const GlobalSearchSheet = lazy(() => import('./components/GlobalSearchSheet').then(module => ({ default: module.GlobalSearchSheet })));

const tabDefinitions: Array<{ id: TabId; icon: IconName }> = [
  { id: "home", icon: "home" },
  { id: "trips", icon: "calendar" },
  { id: "community", icon: "users" },
  { id: "companion", icon: "suitcase" },
  { id: "profile", icon: "user" },
];

const validViews = new Set<ViewId>(["home", "explore", "route", "trips", "profile", "passport", "surprise", "cockpit", "community", "alerts", "events", "companion", "phrases", "admin", "costs", "airports", "country-news"]);

function viewFromUrl(value: string): ViewId | null {
  try {
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
  if (view === "explore" || view === "surprise" || view === "events") return "home";
  if (view === "costs" || view === "airports" || view === "country-news" || view === "passport" || view === "phrases") return "companion";
  if (view === "route" || view === "cockpit" || view === "alerts") return "trips";
  if (view === "admin") return "profile";
  return view as TabId;
}

function highlightedTabFor(view: ViewId): TabId | null {
  return rootTabFor(view);
}

export default function App() {
  const { locale, copy } = useI18n();
  const { resolved: resolvedTheme } = useTheme();
  const [launching, setLaunching] = useState(() => isNativePlatform());
  const [openTransfer, setOpenTransfer] = useState(false);
  const [exploreCode, setExploreCode] = useState("");
  const [exploreSearch, setExploreSearch] = useState({ query: "", requestId: 0 });
  const [homeSavedRoutes, setHomeSavedRoutes] = useState<{ owner: string | null; codes: string[] } | null>(null);
  const [newsCountryCode, setNewsCountryCode] = useState("TR");
  const [activeView, setActiveView] = useState<ViewId>(() => pendingTripInvite(window.location.href) ? "trips" : viewFromUrl(window.location.href) || "home");
  const [visitedViews, setVisitedViews] = useState<ViewId[]>(() => [viewFromUrl(window.location.href) || "home"]);
  const [scrollPositions, setScrollPositions] = useState<Partial<Record<ViewId, number>>>({});
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "back">("forward");
  const [savedSection, setSavedSection] = useState<"all" | "routes" | "places" | "events">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [savedRouteId, setSavedRouteId] = useState('');
  const [toolRequest, setToolRequest] = useState<{ tool: TravelAssistantTool; id: number } | null>(null);
  const toolRequestCounter = useRef(0);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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
  const [cockpitFocusTripId, setCockpitFocusTripId] = useState("");
  const [cockpitInviteCode, setCockpitInviteCode] = useState(() => pendingTripInvite(window.location.href));
  const [communityCountryCode, setCommunityCountryCode] = useState("");
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
  const accessTokenRef = useRef(auth.accessToken);
  // Giriş geçişi tespiti "" ile başlar: geri yüklenen oturumda da (soğuk
  // açılış) ilk dolu değerde senkron çalışır.
  const lastLiveActivityOwnerRef = useRef("");
  const lastPushOwnerRef = useRef("");
  const lastUiOwnerRef = useRef(ownerId || "guest");
  const adminTokenRef = useRef("");
  const authUiKey = ownerId ? `user-${ownerId}` : "guest";
  const [cockpitJourneyIntent, setCockpitJourneyIntent] = useState<CockpitJourneyIntent | null>(null);
  const activeTab = highlightedTabFor(activeView);
  const visibleUnreadCount = notificationsEnabled ? unreadCount : 0;
  const nestedView = !tabDefinitions.some(tab => tab.id === activeView);
  const nativeUiRef = useRef({
    accountOpen,
    activeView,
    menuOpen,
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
      "country-news": copy("Ülke Gündemi", "Country Updates"), costs: copy("Ülke Maliyetleri", "Country Costs"), airports: copy("Havalimanı Rehberi", "Airport Guide"),
      home: copy("Keşfet", "Explore"), explore: copy("Rotaları keşfet", "Explore destinations"), route: copy("Rota Planla", "Plan a Route"), trips: copy("Planlar", "Plans"), profile: copy("Profil", "Profile"), passport: copy("Pasaport Gücü", "Passport Power"), surprise: copy("Beni Şaşırt", "Surprise Me"), cockpit: copy("Seyahat Kokpiti", "Travel Cockpit"), community: copy("Topluluk", "Community"), alerts: copy("Fiyat Alarmlarım", "Price Alerts"), events: copy("Etkinlik Radarı", "Event Radar"), companion: copy("Araçlar", "Tools"), phrases: copy("Hazır İfadeler", "Offline Phrases"), admin: copy("Yönetim Merkezi", "Admin Centre"),
    };
    document.title = `${titles[activeView]} · LetsGo2Travel`;
  }, [activeView, copy, locale]);

  useEffect(() => {
    nativeUiRef.current = {
      accountOpen,
      activeView,
      menuOpen,
      nestedView,
      notificationsOpen,
      onboardingOpen,
      releaseOpen,
    };
  }, [accountOpen, activeView, menuOpen, nestedView, notificationsOpen, onboardingOpen, releaseOpen]);

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 4200);
  }, []);

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

  const toggleHomeRoute = (route: RouteSuggestion) => {
    const code = route.destinationCode?.toUpperCase();
    if (!code || !/^[A-Z0-9]{2,8}$/.test(code)) return;
    try {
      const saved = !toggleInspirationRoute(route, ownerId);
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
    window.history.replaceState({ view: activeView, depth: 0 }, "", `#${activeView}`);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPopState = (event: PopStateEvent) => {
      const next = event.state && typeof event.state.view === "string" && validViews.has(event.state.view)
        ? event.state.view as ViewId
        : viewFromUrl(window.location.href);
      if (next) {
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

  const navigate = useCallback((view: ViewId, options?: { replace?: boolean; communityCountryCode?: string }) => {
    const current = activeViewRef.current;
    if (current === view && !options?.replace) {
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
    setActiveView(view);
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ view, depth: nextDepth }, "", `#${view}`);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    void impact();
  }, []);

  const openNavigationView = useCallback((view: ViewId) => {
    // Switching tabs keeps the current plan and its form selections.
    if (view === "trips") setSavedSection("all");
    if (view === "companion") setToolRequest(null);
    navigate(view);
  }, [navigate]);

  const openTool = useCallback((tool: TravelAssistantTool) => {
    setToolRequest({ tool, id: ++toolRequestCounter.current });
    navigate('companion');
    setScrollPositions(positions => ({ ...positions, companion: 0 }));
  }, [navigate]);
  const openGlobalSearch = useCallback((query = '') => { setGlobalQuery(query); setSearchOpen(true); }, []);

  const openSeededRoute = useCallback((route: RouteSuggestion, kind: "surprise" | "explore") => {
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

  const goBack = useCallback(() => {
    if (historyDepth.current > 0) {
      window.history.back();
      return;
    }
    navigate(rootTabFor(activeViewRef.current), { replace: true });
  }, [navigate]);

  useEffect(() => {
    const nextOwner = ownerId || "guest";
    if (lastUiOwnerRef.current === nextOwner) return;
    lastUiOwnerRef.current = nextOwner;

    // Hesap değişiminde önceki kullanıcının taslakları, seçili seyahati veya
    // açık yönetim/topluluk yüzeyi yeni hesaba taşınmasın. İçerik alt ağacı da
    // authUiKey ile yeniden kurulur; geç tamamlanan A hesabı istekleri B
    // hesabının ekran durumuna yazamaz.
    setSurpriseRoute(null);
    setExploreSearch({ query: "", requestId: 0 });
    setRouteSeedKind("surprise");
    setRouteResetToken((value) => value + 1);
    setCockpitFocusTripId("");
    setCockpitJourneyIntent(null);
    setVisitedViews([activeViewRef.current]);
    setScrollPositions({});
    setSavedSection("all");
    setSearchOpen(false);
    setGlobalQuery('');
    setSavedRouteId('');
    setToolRequest(null);
    setAdminOverview(null);
    setMenuOpen(false);
    setAccountOpen(false);
    setNotificationsOpen(false);
    setGuestImportOpen(false);
    if (activeViewRef.current === "admin") navigate("profile", { replace: true });
  }, [navigate, ownerId]);

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
      if (state.accountOpen) return setAccountOpen(false);
      if (state.menuOpen) return setMenuOpen(false);
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
      const target = url ? viewFromUrl(url) : null;
      const tripId = url ? tripIdFromUrl(url) : null;
      const inviteCode = url ? tripInviteFromUrl(url) : "";
      if (tripId) setCockpitFocusTripId(tripId);
      if (inviteCode) setCockpitInviteCode(rememberTripInvite(inviteCode));
      if (inviteCode) navigate("trips");
      else if (target) navigate(target);
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
          const target = viewFromUrl(url);
          const tripId = tripIdFromUrl(url);
          const inviteCode = tripInviteFromUrl(url);
          if (tripId) setCockpitFocusTripId(tripId);
          if (inviteCode) setCockpitInviteCode(rememberTripInvite(inviteCode));
          if (inviteCode) navigate("trips", { replace: true });
          else if (target) navigate(target, { replace: true });
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

  const completeWelcome = () => {
    completeOnboarding();
    // İlk açılış tanıtımından hemen sonra ikinci bir pencere göstermek
    // kullanıcıyı daha ana sayfayı görmeden yoruyordu. Yeni kullanıcı bu
    // sürümün özelliklerini tanıtımda zaten gördüğü için sürüm notunu okundu
    // say; sonraki build'in yenilikleri yine normal biçimde gösterilir.
    markReleaseSeen(releaseId);
    setOnboardingOpen(false);
  };

  const closeRelease = () => {
    markReleaseSeen(releaseId);
    setReleaseOpen(false);
  };

  const startPull = (event: React.TouchEvent) => {
    edgeSwipeStart.current = null;
    pullStart.current = null;
    const touch = event.touches[0];
    if (!touch || onboardingOpen || releaseOpen || notificationsOpen || accountOpen || menuOpen || hasOpenSheet()) return;
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
    if (!ownerId || !auth.accessToken) { setAccountOpen(true); return; }
    if (!validJourneyIntent(intent, ownerId)) return;
    setCockpitJourneyIntent(intent); navigate("cockpit");
  };
  const renderView = (view: ViewId) => {
    if (view === "home") return <HomeScreen onOpenGlobalSearch={openGlobalSearch} onOpenTool={openTool} initialSearchQuery={exploreSearch.query} onSearchDestination={searchDestinations} onToggleSaved={toggleHomeRoute} savedRouteIds={homeSavedRoutes?.owner === ownerId ? homeSavedRoutes.codes : []} onOpenTrip={id => { setCockpitFocusTripId(id); navigate("cockpit"); }} onOpenSaved={section => { navigate("trips"); setSavedSection(section); }} user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} refreshToken={refreshTick} onNavigate={openNavigationView} onOpenCommunity={(countryCode) => navigate("community", { communityCountryCode: countryCode })} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onBuildRoute={route => openSeededRoute(route, "explore")} onNotice={showNotice} />;
    if (view === "explore") return <ExploreScreen initialSearchQuery={exploreSearch.query} searchRequestId={exploreSearch.requestId} initialDestinationCode={exploreCode} ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onBuildRoute={route => openSeededRoute(route, "explore")} onNotice={showNotice} />;
    if (view === "events") return <EventsScreen key={ownerId || "guest"} focusEventId={focusEventId} onFocusHandled={() => setFocusEventId("")} ownerId={ownerId} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onOpenSaved={() => { navigate("trips"); setSavedSection("events"); }} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "country-news") return <CountryNewsScreen key={newsCountryCode} initialCountry={newsCountryCode}/>;
    if (view === "costs") return <CostsScreen ownerId={ownerId} onPrepareCockpitBudget={prepareCockpitJourney} onOpenCountryNews={code => { setNewsCountryCode(code); navigate("country-news"); }}/>;
    if (view === "airports") return <AirportGuideScreen onOpenTransfer={() => { navigate("trips"); setOpenTransfer(true); }} onNotice={showNotice} />;
    if (view === "companion" || view === "phrases") return <TravelCompanionScreen key={`${ownerId || "guest"}-${toolRequest?.id || 0}`} initialTool={toolRequest?.tool} ownerId={ownerId} accessToken={auth.accessToken} onSignIn={() => setAccountOpen(true)} initialTab={view === "phrases" ? "phrases" : "assistant"} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "passport") return <PassportScreen onOpenCountryNews={code => { setNewsCountryCode(code); navigate("country-news"); }}/>;
    if (view === "surprise") return <SurpriseScreen initialRoute={surpriseRoute} onSelect={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); }} onBuildRoute={route => openSeededRoute(route, "surprise")} onNotice={showNotice} />;
    if (view === "route") return <RouteAssistantScreen key={`planner-${ownerId || "guest"}-${routeResetToken}`} surpriseRoute={surpriseRoute} routeSeedKind={routeSeedKind} ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "trips") return <TripsScreen initialRouteId={savedRouteId} onInitialRouteHandled={() => setSavedRouteId("")} onPrepareCockpit={prepareCockpitJourney} initialSection={savedSection} onOpenEvent={id => { setFocusEventId(id); navigate("events"); }} key={ownerId || "guest"} initialTool={openTransfer ? "airport" : undefined} onOpenDestination={(code) => { navigate("explore"); setExploreCode(code); }} user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} inviteCode={cockpitInviteCode || undefined} onInviteHandled={() => { rememberTripInvite(""); setCockpitInviteCode(""); }} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onNotice={showNotice} />;
    if (view === "cockpit") return <CockpitScreen journeyIntent={cockpitJourneyIntent?.ownerId === ownerId ? cockpitJourneyIntent : null} onJourneyHandled={() => setCockpitJourneyIntent(null)} user={auth.user} accessToken={auth.accessToken} focusTripId={cockpitFocusTripId || undefined} onFocusHandled={() => setCockpitFocusTripId("")} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (view === "community") return <CommunityScreen user={auth.user} accessToken={auth.accessToken} initialCountryCode={communityCountryCode} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onSearchDestination={searchDestinations} onNotice={showNotice} />;
    if (view === "alerts") return <PriceAlertsScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (view === "admin" && adminAllowed && Boolean(auth.accessToken)) return <AdminScreen accessToken={auth.accessToken} initialOverview={adminOverview} checking={adminChecking || !adminOverview} onOverviewChange={setAdminOverview} onNotice={showNotice} />;
    return <ProfileScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} isAdmin={adminAllowed} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onOpenOnboarding={() => setOnboardingOpen(true)} onNotice={showNotice} />;
  };

  const tabs = tabDefinitions.map((tab) => ({
    ...tab,
    label: tab.id === "home" ? copy("Keşfet", "Explore") : tab.id === "trips" ? copy("Planlar", "Plans") : tab.id === "community" ? copy("Topluluk", "Community") : tab.id === "companion" ? copy("Araçlar", "Tools") : copy("Profil", "Profile"),
  }));

  return <div className={`app-shell editorial-app shared-shell view-${activeView} ${keyboardOpen ? "keyboard-open" : ""}`} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={endPull} onTouchCancel={cancelPull}>
    {launching && <AnimatedSplash onFinish={finishLaunching} />}
    <header className="topbar shared-topbar" inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      <div className="topbar-brand-group">
        {nestedView && <button className="topbar-back" onClick={goBack} aria-label={copy("Önceki ekrana dön", "Go back")}><Icon name="back" size={21} /></button>}
        <button className="brand-button" onClick={() => navigate("home")} aria-label={copy("LetsGo2Travel ana sayfa", "LetsGo2Travel home")}><BrandMark decorative /></button>
      </div>
      <div className="topbar-actions">
        <HeaderThemeToggle />
        <LanguagePicker />
        <button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label={`${copy("Bildirimler", "Notifications")}${visibleUnreadCount ? `, ${visibleUnreadCount} ${copy("okunmamış", "unread")}` : ""}`}><Icon name="bell" size={20} />{visibleUnreadCount > 0 && <span className="notification-badge" aria-hidden="true">{visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}</span>}</button>
        <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label={copy("Daha fazla", "More")}><Icon name="menu" size={21} /></button>
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
            <NavigationPane restoreTop={scrollPositions[activeView] || 0} direction={navigationDirection}>{renderView(activeView)}</NavigationPane>
          </Suspense>
        }
      </div>
    </main>

    <nav className="bottom-nav" aria-label={copy("Ana menü", "Main navigation")} inert={interactionBlocked || keyboardOpen} aria-hidden={interactionBlocked || keyboardOpen || undefined}>
      {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => openNavigationView(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}><span><Icon name={tab.icon} size={21} /></span><small>{tab.label}</small></button>)}
    </nav>

    {notice && createPortal(<div className="toast" role="status"><Icon name="info" size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label={copy("Bildirimi kapat", "Dismiss notification")}><Icon name="close" size={15} /></button></div>, document.body)}
    <NotificationCenter open={notificationsOpen} ownerId={ownerId} accessToken={auth.accessToken} online={online} onClose={() => setNotificationsOpen(false)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onUnreadChange={setUnreadCount} />
    {accountOpen && <LazyOverlay title={copy("Hesap", "Account")} loadingMessage={copy("Hesap hazırlanıyor…", "Opening your account…")} onClose={() => setAccountOpen(false)}>
      <AccountSheet open onClose={() => setAccountOpen(false)} auth={auth} onNotice={showNotice} />
    </LazyOverlay>}
    <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} online={online} onNavigate={openNavigationView} onOpenAccount={() => setAccountOpen(true)} onOpenGlobalSearch={() => { setMenuOpen(false); openGlobalSearch(); }} accessToken={auth.accessToken} ownerId={ownerId} screen={activeView} />
    {searchOpen && <LazyOverlay title={copy('Uygulamada ara', 'Search the app', 'Kërko në aplikacion')} loadingMessage={copy('Arama hazırlanıyor…', 'Preparing search…', 'Po përgatitet kërkimi…')} onClose={() => setSearchOpen(false)}>
      <GlobalSearchSheet key={authUiKey} open onClose={() => setSearchOpen(false)} ownerId={ownerId} accessToken={auth.accessToken} initialQuery={globalQuery}
        onNavigate={openNavigationView} onOpenTool={openTool} onSearchDestination={searchDestinations}
        onOpenCountry={code => { setNewsCountryCode(alpha2FromAlpha3(code)); navigate('country-news'); }}
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
    {onboardingOpen && <Onboarding onComplete={completeWelcome} />}
  </div>;
}
