import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { AccountSheet } from "./components/AccountSheet";
import { AnimatedSplash } from "./components/AnimatedSplash";
import { GuestDataImportSheet } from "./components/GuestDataImportSheet";
import { Icon, type IconName } from "./components/Icon";
import { MenuSheet } from "./components/MenuSheet";
import { NotificationCenter } from "./components/NotificationCenter";
import { Onboarding } from "./components/Onboarding";
import { ReleaseNotesSheet } from "./components/ReleaseNotesSheet";
import { useAuth } from "./hooks/useAuth";
import { getMobileAdminAccess, getMobileAdminOverview, type MobileAdminOverview } from "./lib/admin";
import { ApiError } from "./lib/api";
import { addPluginListener, isNativePlatform, plugin } from "./lib/capacitor";
import { releaseId } from "./lib/config";
import { impact } from "./lib/native";
import { tripIdFromUrl } from "./lib/deepLink";
import { tripInviteFromUrl, pendingTripInvite, rememberTripInvite } from "./lib/tripCollaboration";
import { initFlightReminderTapListener } from "./lib/liveActivity";
import { initEventReminderTapListener } from "./lib/eventReminders";
import { useI18n } from "./lib/i18n";
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
import type { RouteSuggestion, TabId, ViewId } from "./types";

// Ana ekran ilk karede hazır kalır; diğer modüller yalnız açıldığında
// indirilir. Böylece açılış paketi ve düşük bağlantıda ilk etkileşim hafifler.
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

const tabDefinitions: Array<{ id: TabId; icon: IconName }> = [
  { id: "home", icon: "home" },
  { id: "explore", icon: "compass" },
  { id: "route", icon: "route" },
  { id: "trips", icon: "suitcase" },
  { id: "profile", icon: "user" },
];

const validViews = new Set<ViewId>(["home", "explore", "route", "trips", "profile", "passport", "surprise", "cockpit", "community", "alerts", "events", "companion", "phrases", "admin"]);

function viewFromUrl(value: string): ViewId | null {
  try {
    const parsed = new URL(value, window.location.origin);
    const raw = (parsed.hash.replace(/^#\/?/, "") || parsed.searchParams.get("view") || parsed.pathname.split("/").filter(Boolean).pop() || parsed.host).toLocaleLowerCase("tr-TR");
    const aliases: Record<string, ViewId> = {
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
  if (view === "passport" || view === "surprise" || view === "events" || view === "companion" || view === "phrases") return "explore";
  if (view === "cockpit") return "trips";
  if (view === "community" || view === "alerts" || view === "admin") return "profile";
  return view as TabId;
}

function highlightedTabFor(view: ViewId): TabId | null {
  // Özel araçları kullanıcının zihnindeki en yakın ana bölüme bağla:
  // topluluk keşfin, alarmlar seyahatin, yönetim ise hesabın parçasıdır.
  if (view === "community") return "explore";
  if (view === "alerts") return "trips";
  if (view === "admin") return "profile";
  return rootTabFor(view);
}

export default function App() {
  const { locale, setLocale, copy } = useI18n();
  const [launching, setLaunching] = useState(() => isNativePlatform());
  const [activeView, setActiveView] = useState<ViewId>(() => pendingTripInvite(window.location.href) ? "trips" : viewFromUrl(window.location.href) || "home");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => getMobilePreferences().inAppNotifications);
  const [releaseOpen, setReleaseOpen] = useState(() => hasCompletedOnboarding() && !hasSeenRelease(releaseId));
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasCompletedOnboarding());
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
  const activeTab = highlightedTabFor(activeView);
  const nestedView = activeView === "passport" || activeView === "surprise" || activeView === "cockpit" || activeView === "community" || activeView === "alerts" || activeView === "events" || activeView === "companion" || activeView === "phrases" || activeView === "admin";
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
      home: copy("Ana Sayfa", "Home"), explore: copy("Keşfet", "Explore"), route: copy("Rota Planla", "Plan a Route"), trips: copy("Seyahatlerim", "My Trips"), profile: copy("Profil", "Profile"), passport: copy("Pasaport Gücü", "Passport Power"), surprise: copy("Beni Şaşırt", "Surprise Me"), cockpit: copy("Seyahat Kokpiti", "Travel Cockpit"), community: copy("Topluluk", "Community"), alerts: copy("Fiyat Alarmlarım", "Price Alerts"), events: copy("Etkinlik Radarı", "Event Radar"), companion: copy("Seyahat Yardımcısı", "Travel Companion"), phrases: copy("Hazır İfadeler", "Offline Phrases"), admin: copy("Yönetim Merkezi", "Admin Centre"),
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
    const onPopState = (event: PopStateEvent) => {
      const next = event.state && typeof event.state.view === "string" && validViews.has(event.state.view)
        ? event.state.view as ViewId
        : viewFromUrl(window.location.href);
      if (next) {
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
    return () => window.removeEventListener("popstate", onPopState);
    // İlk tarihçe kaydı yalnızca uygulama açılırken yazılır.
  }, []);

  const navigate = useCallback((view: ViewId, options?: { replace?: boolean; communityCountryCode?: string }) => {
    if (view === "community") setCommunityCountryCode(options?.communityCountryCode || "");
    const current = activeViewRef.current;
    if (current === view && !options?.replace) {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
      return;
    }
    const nextDepth = options?.replace ? historyDepth.current : historyDepth.current + 1;
    historyDepth.current = nextDepth;
    activeViewRef.current = view;
    setActiveView(view);
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ view, depth: nextDepth }, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    void impact();
  }, []);

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
    setRouteSeedKind("surprise");
    setRouteResetToken((value) => value + 1);
    setCockpitFocusTripId("");
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

  useEffect(() => initEventReminderTapListener(() => navigate("events")), [navigate]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const statusBar = plugin("StatusBar");
    void statusBar?.setStyle?.({ style: "LIGHT" }).catch(() => undefined);
    void statusBar?.setBackgroundColor?.({ color: "#2352C4" }).catch(() => undefined);
    void statusBar?.setOverlaysWebView?.({ overlay: true }).catch(() => undefined);
  }, []);

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
    if (!viewport) return;
    const update = () => setKeyboardOpen(window.innerHeight - viewport.height > 150);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
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
        showNotice(online ? copy("İçerik yenilendi.", "Content refreshed.") : copy("Çevrimdışı kayıtlar yenilendi.", "Offline items refreshed."));
      }, 550);
    }
    setPullDistance(0);
  };
  const cancelPull = () => {
    edgeSwipeStart.current = null;
    pullStart.current = null;
    setPullDistance(0);
  };

  const content = useMemo(() => {
    if (activeView === "home") return <HomeScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} refreshToken={refreshTick} onNavigate={(view) => { if (view === "route") { setSurpriseRoute(null); setRouteResetToken((value) => value + 1); } navigate(view); }} onOpenCommunity={(countryCode) => navigate("community", { communityCountryCode: countryCode })} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onNotice={showNotice} />;
    if (activeView === "explore") return <ExploreScreen ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onSurprise={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("surprise"); }} onBuildRoute={(route) => { setRouteSeedKind("explore"); setSurpriseRoute(route); navigate("route"); }} onNotice={showNotice} />;
    if (activeView === "events") return <EventsScreen ownerId={ownerId} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onNotice={showNotice} />;
    if (activeView === "companion" || activeView === "phrases") return <TravelCompanionScreen initialTab={activeView === "phrases" ? "phrases" : "now"} onNavigate={navigate} onNotice={showNotice} />;
    if (activeView === "passport") return <PassportScreen />;
    if (activeView === "surprise") return <SurpriseScreen initialRoute={surpriseRoute} onSelect={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); }} onBuildRoute={(route) => { setRouteSeedKind("surprise"); setSurpriseRoute(route); navigate("route"); }} onNotice={showNotice} />;
    if (activeView === "route") return <RouteAssistantScreen key={`planner-${routeResetToken}`} surpriseRoute={surpriseRoute} routeSeedKind={routeSeedKind} ownerId={ownerId} accessToken={auth.accessToken} onNotice={showNotice} />;
    if (activeView === "trips") return <TripsScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} inviteCode={cockpitInviteCode || undefined} onInviteHandled={() => { rememberTripInvite(""); setCockpitInviteCode(""); }} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onNotice={showNotice} />;
    if (activeView === "cockpit") return <CockpitScreen user={auth.user} accessToken={auth.accessToken} focusTripId={cockpitFocusTripId || undefined} onFocusHandled={() => setCockpitFocusTripId("")} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (activeView === "community") return <CommunityScreen user={auth.user} accessToken={auth.accessToken} initialCountryCode={communityCountryCode} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (activeView === "alerts") return <PriceAlertsScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (activeView === "admin" && adminAllowed && Boolean(auth.accessToken)) return <AdminScreen accessToken={auth.accessToken} initialOverview={adminOverview} checking={adminChecking || !adminOverview} onOverviewChange={setAdminOverview} onNotice={showNotice} />;
    return <ProfileScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} isAdmin={adminAllowed} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onOpenOnboarding={() => setOnboardingOpen(true)} onNotice={showNotice} />;
  }, [activeView, adminAllowed, adminChecking, adminOverview, auth.accessToken, auth.user, cockpitFocusTripId, cockpitInviteCode, communityCountryCode, locale, navigate, ownerId, refreshTick, routeResetToken, routeSeedKind, showNotice, surpriseRoute]);

  const tabs = tabDefinitions.map((tab) => ({
    ...tab,
    label: tab.id === "home" ? copy("Ana Sayfa", "Home") : tab.id === "explore" ? copy("Keşfet", "Explore") : tab.id === "route" ? copy("Planla", "Plan") : tab.id === "trips" ? copy("Seyahatlerim", "My Trips") : copy("Profil", "Profile"),
  }));

  return <div className={`app-shell ${keyboardOpen ? "keyboard-open" : ""}`} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={endPull} onTouchCancel={cancelPull}>
    {launching && <AnimatedSplash onFinish={finishLaunching} />}
    <header className="topbar" inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      <div className="topbar-brand-group">
        {nestedView && <button className="topbar-back" onClick={goBack} aria-label={copy("Önceki ekrana dön", "Go back")}><Icon name="back" size={21} /></button>}
        <button className="brand-button" onClick={() => navigate("home")} aria-label={copy("Ana sayfa", "Home")}><span className="brand">LetsGo<strong>2</strong>Travel</span></button>
      </div>
      <div className="topbar-actions">
        {/* Header sade: geri/logo + bildirim + menü. Profil BottomNav'da;
            buradaki kısayol ve işlevi belirsiz durum noktası kaldırıldı
            (çevrimdışı durumu zaten banner ile gösterilir). Bildirim
            rozeti YALNIZ gerçekten okunmamış içerik varken görünür. */}
        <button className="language-toggle" onClick={() => setLocale(locale === "tr" ? "en" : "tr")} aria-label={locale === "tr" ? "Uygulama dilini İngilizce yap" : "Switch app language to Turkish"}><span>{locale === "tr" ? "🇹🇷" : "🇬🇧"}</span><strong>{locale.toUpperCase()}</strong></button>
        <button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label={`${copy("Bildirimler", "Notifications")}${unreadCount ? `, ${unreadCount} ${copy("okunmamış", "unread")}` : ""}`}><Icon name="bell" size={20} />{notificationsEnabled && unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 9)}</span>}</button>
        <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label={copy("Daha fazla", "More")}><Icon name="menu" size={21} /></button>
      </div>
    </header>

    {!online && <div className="offline-banner"><Icon name="offline" size={16} /> {copy("Çevrimdışısın. Kayıtlı planların ve yerel keşif araçların çalışmaya devam eder.", "You're offline. Saved plans and offline travel tools remain available.")}</div>}
    {(pullDistance > 0 || refreshing) && <div className={`pull-indicator ${refreshing ? "refreshing" : ""}`} style={{ transform: `translate(-50%, ${Math.max(0, pullDistance - 38)}px)` }}><Icon name="refresh" size={18} />{refreshing ? copy("Yenileniyor", "Refreshing") : copy("Yenilemek için bırak", "Release to refresh")}</div>}
    <main ref={mainRef} className="app-content" tabIndex={-1} inert={interactionBlocked} aria-hidden={interactionBlocked || undefined}>
      <Suspense key={authUiKey} fallback={<div className="screen screen-module-loading" role="status" aria-label={copy("Bölüm yükleniyor", "Loading section")}><div className="skeleton-list"><div /><div /><div /></div></div>}>
        {content}
      </Suspense>
    </main>

    <nav className="bottom-nav" aria-label={copy("Ana menü", "Main navigation")} inert={interactionBlocked || keyboardOpen} aria-hidden={interactionBlocked || keyboardOpen || undefined}>
      {tabs.map((tab) => <button key={tab.id} className={`${activeTab === tab.id ? "active" : ""} ${tab.id === "route" ? "center-tab" : ""}`} onClick={() => { if (tab.id === "route") { setRouteSeedKind("surprise"); setSurpriseRoute(null); setRouteResetToken((value) => value + 1); } navigate(tab.id); }} aria-current={activeTab === tab.id ? "page" : undefined}><span><Icon name={tab.icon} size={tab.id === "route" ? 23 : 21} /></span><small>{tab.label}</small></button>)}
    </nav>

    {notice && createPortal(<div className="toast" role="status"><Icon name="info" size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label={copy("Bildirimi kapat", "Dismiss notification")}><Icon name="close" size={15} /></button></div>, document.body)}
    <NotificationCenter open={notificationsOpen} ownerId={ownerId} accessToken={auth.accessToken} online={online} onClose={() => setNotificationsOpen(false)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onUnreadChange={setUnreadCount} />
    <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth} onNotice={showNotice} />
    <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} online={online} onNavigate={(view) => { if (view === "route") { setRouteSeedKind("surprise"); setSurpriseRoute(null); setRouteResetToken((value) => value + 1); } navigate(view); }} onOpenAccount={() => setAccountOpen(true)} />
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
              ? copy(`${result.added.total} misafir kaydı hesabına eklendi.`, `${result.added.total} guest items were added to your account.`)
              : copy("Kayıtların zaten hesabında bulunuyor.", "Your items are already in your account."));
            return;
          }

          showNotice(result.added.total
            ? copy(`${result.added.total} kayıt eklendi; web hesabınla eşitleniyor…`, `${result.added.total} items added; syncing with your web account…`)
            : copy("Kayıtların web hesabınla kontrol ediliyor…", "Checking your items against your web account…"));
          const guestSync = await import("./lib/guestDataSync");
          const sync = await guestSync.flushPendingGuestDataSync(ownerId, auth.accessToken);
          if (!sync) {
            showNotice(copy("Kayıtların hesabında hazır.", "Your items are ready in your account."));
            return;
          }
          if (sync.status === "synced" || sync.status === "unchanged") {
            showNotice(result.added.total
              ? copy(`${result.added.total} misafir kaydı uygulama ve web hesabınla eşitlendi.`, `${result.added.total} guest items synced with your app and web account.`)
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
    <ReleaseNotesSheet open={releaseOpen} onClose={closeRelease} />
    {onboardingOpen && <Onboarding onComplete={completeWelcome} />}
  </div>;
}
