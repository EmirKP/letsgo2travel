import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { AccountSheet } from "./components/AccountSheet";
import { Icon, type IconName } from "./components/Icon";
import { MenuSheet } from "./components/MenuSheet";
import { NotificationCenter } from "./components/NotificationCenter";
import { Onboarding } from "./components/Onboarding";
import { ReleaseNotesSheet } from "./components/ReleaseNotesSheet";
import { useAuth } from "./hooks/useAuth";
import { addPluginListener, isNativePlatform, plugin } from "./lib/capacitor";
import { releaseId } from "./lib/config";
import { impact } from "./lib/native";
import { initPushTapListener } from "./lib/push";
import { closeTopSheet, hasOpenSheet } from "./lib/sheetStack";
import {
  completeOnboarding,
  getMobilePreferences,
  hasCompletedOnboarding,
  hasSeenRelease,
  markReleaseSeen,
} from "./lib/storage";
import { ExploreScreen } from "./screens/ExploreScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { CockpitScreen } from "./screens/CockpitScreen";
import { CommunityScreen } from "./screens/CommunityScreen";
import { PassportScreen } from "./screens/PassportScreen";
import { PriceAlertsScreen } from "./screens/PriceAlertsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { RouteAssistantScreen } from "./screens/RouteAssistantScreen";
import { SurpriseScreen } from "./screens/SurpriseScreen";
import { TripsScreen } from "./screens/PlansScreen";
import type { RouteSuggestion, TabId, ViewId } from "./types";

const tabs: Array<{ id: TabId; label: string; icon: IconName }> = [
  { id: "home", label: "Ana Sayfa", icon: "home" },
  { id: "explore", label: "Keşfet", icon: "compass" },
  { id: "route", label: "Rota", icon: "route" },
  { id: "trips", label: "Seyahatlerim", icon: "suitcase" },
  { id: "profile", label: "Profil", icon: "user" },
];

const validViews = new Set<ViewId>(["home", "explore", "route", "trips", "profile", "passport", "surprise", "cockpit", "community", "alerts"]);

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
    };
    const candidate = aliases[raw] || raw as ViewId;
    return validViews.has(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function rootTabFor(view: ViewId): TabId {
  if (view === "passport" || view === "surprise") return "explore";
  if (view === "cockpit") return "trips";
  if (view === "community" || view === "alerts") return "profile";
  return view as TabId;
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>(() => viewFromUrl(window.location.href) || "home");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(() => hasCompletedOnboarding() && !hasSeenRelease(releaseId));
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasCompletedOnboarding());
  const [online, setOnline] = useState(navigator.onLine);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [surpriseRoute, setSurpriseRoute] = useState<RouteSuggestion | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const noticeTimer = useRef<number | null>(null);
  const pullStart = useRef<number | null>(null);
  const edgeSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const activeViewRef = useRef(activeView);
  const historyDepth = useRef(0);
  const auth = useAuth();
  const ownerId = auth.user?.id || null;
  const activeTab = rootTabFor(activeView);
  const nestedView = activeView === "passport" || activeView === "surprise" || activeView === "cockpit" || activeView === "community" || activeView === "alerts";

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

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

  const navigate = useCallback((view: ViewId, options?: { replace?: boolean }) => {
    const current = activeViewRef.current;
    if (current === view && !options?.replace) {
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    // Bildirime dokunulduğunda "Fiyat Alarmlarım" ekranı açılır (web'de sessiz no-op).
    return initPushTapListener(() => navigate("alerts"));
  }, [navigate]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const statusBar = plugin("StatusBar");
    void statusBar?.setStyle?.({ style: "LIGHT" }).catch(() => undefined);
    void statusBar?.setBackgroundColor?.({ color: "#071B33" }).catch(() => undefined);
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
    if (!isNativePlatform()) return;
    let backListener: { remove: () => Promise<void> } | null = null;
    let urlListener: { remove: () => Promise<void> } | null = null;

    void addPluginListener("App", "backButton", () => {
      if (onboardingOpen) return;
      if (closeTopSheet()) return;
      if (releaseOpen) return setReleaseOpen(false);
      if (notificationsOpen) return setNotificationsOpen(false);
      if (accountOpen) return setAccountOpen(false);
      if (menuOpen) return setMenuOpen(false);
      if (historyDepth.current > 0 || nestedView) return goBack();
      if (activeView !== "home") return navigate("home", { replace: true });
      const app = plugin("App");
      void app?.exitApp?.().catch(() => undefined);
    }).then((handle) => { backListener = handle; });

    void addPluginListener("App", "appUrlOpen", (event) => {
      const url = typeof event.url === "string" ? event.url : "";
      if (/\/auth\/callback|auth\/callback/i.test(url)) return;
      const target = url ? viewFromUrl(url) : null;
      if (target) navigate(target);
    }).then((handle) => { urlListener = handle; });

    const app = plugin("App");
    if (app?.getLaunchUrl) {
      void app.getLaunchUrl().then((value) => {
        const url = value && typeof value === "object" && "url" in value ? String((value as { url?: string }).url || "") : "";
        if (url && !/\/auth\/callback|auth\/callback/i.test(url)) {
          const target = viewFromUrl(url);
          if (target) navigate(target, { replace: true });
        }
      });
    }

    return () => {
      void backListener?.remove();
      void urlListener?.remove();
    };
  }, [accountOpen, activeView, goBack, menuOpen, navigate, nestedView, notificationsOpen, onboardingOpen, releaseOpen]);

  const completeWelcome = () => {
    completeOnboarding();
    setOnboardingOpen(false);
    if (!hasSeenRelease(releaseId)) setReleaseOpen(true);
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
        showNotice(online ? "İçerik yenilendi." : "Çevrimdışı kayıtlar yenilendi.");
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
    if (activeView === "home") return <HomeScreen user={auth.user} ownerId={ownerId} refreshToken={refreshTick} onNavigate={navigate} onSurprise={(route) => { setSurpriseRoute(route); navigate("surprise"); }} onNotice={showNotice} />;
    if (activeView === "explore") return <ExploreScreen ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onSurprise={(route) => { setSurpriseRoute(route); navigate("surprise"); }} onNotice={showNotice} />;
    if (activeView === "passport") return <PassportScreen />;
    if (activeView === "surprise") return <SurpriseScreen initialRoute={surpriseRoute} onSelect={setSurpriseRoute} onBuildRoute={(route) => { setSurpriseRoute(route); navigate("route"); }} onNotice={showNotice} />;
    if (activeView === "route") return <RouteAssistantScreen surpriseRoute={surpriseRoute} ownerId={ownerId} accessToken={auth.accessToken} onNotice={showNotice} />;
    if (activeView === "trips") return <TripsScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} onNavigate={navigate} onNotice={showNotice} />;
    if (activeView === "cockpit") return <CockpitScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (activeView === "community") return <CommunityScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    if (activeView === "alerts") return <PriceAlertsScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNotice={showNotice} />;
    return <ProfileScreen user={auth.user} ownerId={ownerId} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onNavigate={navigate} onOpenRelease={() => setReleaseOpen(true)} onNotice={showNotice} />;
  }, [activeView, auth.accessToken, auth.user, navigate, ownerId, refreshTick, showNotice, surpriseRoute]);

  const notificationsEnabled = getMobilePreferences().inAppNotifications;

  return <div className={`app-shell ${keyboardOpen ? "keyboard-open" : ""}`} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={endPull} onTouchCancel={cancelPull}>
    <header className="topbar">
      <div className="topbar-brand-group">
        {nestedView && <button className="topbar-back" onClick={goBack} aria-label="Önceki ekrana dön"><Icon name="back" size={21} /></button>}
        <button className="brand-button" onClick={() => navigate("home")} aria-label="Ana sayfa"><span className="brand">LetsGo<strong>2</strong>Travel</span></button>
      </div>
      <div className="topbar-actions">
        <span className={`network-dot ${online ? "online" : "offline"}`} role="status" aria-label={online ? "Çevrimiçi" : "Çevrimdışı"} title={online ? "Çevrimiçi" : "Çevrimdışı"} />
        <button className="icon-button" onClick={() => setNotificationsOpen(true)} aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ""}`}><Icon name="bell" size={20} />{notificationsEnabled && unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 9)}</span>}</button>
        <button className="icon-button" onClick={() => navigate("profile")} aria-label="Profil"><Icon name="user" size={20} />{auth.user && <span className="account-dot" />}</button>
        <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="Daha fazla"><Icon name="menu" size={21} /></button>
      </div>
    </header>

    {!online && <div className="offline-banner"><Icon name="offline" size={16} /> Çevrimdışısın. Kayıtlı planların ve yerel keşif araçların çalışmaya devam eder.</div>}
    {(pullDistance > 0 || refreshing) && <div className={`pull-indicator ${refreshing ? "refreshing" : ""}`} style={{ transform: `translate(-50%, ${Math.max(0, pullDistance - 38)}px)` }}><Icon name="refresh" size={18} />{refreshing ? "Yenileniyor" : "Yenilemek için bırak"}</div>}
    <main ref={mainRef} className="app-content" tabIndex={-1}>{content}</main>

    <nav className="bottom-nav" aria-label="Ana menü">
      {tabs.map((tab) => <button key={tab.id} className={`${activeTab === tab.id ? "active" : ""} ${tab.id === "route" ? "center-tab" : ""}`} onClick={() => navigate(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}><span><Icon name={tab.icon} size={tab.id === "route" ? 23 : 21} /></span><small>{tab.label}</small></button>)}
    </nav>

    {notice && <div className="toast" role="status"><Icon name="info" size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Bildirimi kapat"><Icon name="close" size={15} /></button></div>}
    <NotificationCenter open={notificationsOpen} ownerId={ownerId} accessToken={auth.accessToken} online={online} onClose={() => setNotificationsOpen(false)} onNavigate={navigate} onUnreadChange={setUnreadCount} />
    <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth} onNotice={showNotice} />
    <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} online={online} onNavigate={navigate} />
    <ReleaseNotesSheet open={releaseOpen} onClose={closeRelease} />
    {onboardingOpen && <Onboarding onComplete={completeWelcome} />}
  </div>;
}
