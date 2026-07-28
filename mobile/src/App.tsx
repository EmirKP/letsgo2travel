import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Icon, type IconName } from "./components/Icon";
import { AccountSheet } from "./components/AccountSheet";
import { MenuSheet } from "./components/MenuSheet";
import { HomeScreen } from "./screens/HomeScreen";
import { PassportScreen } from "./screens/PassportScreen";
import { FlightSearchScreen } from "./screens/FlightSearchScreen";
import { RouteAssistantScreen } from "./screens/RouteAssistantScreen";
import { PlansScreen } from "./screens/PlansScreen";
import { useAuth } from "./hooks/useAuth";
import { impact } from "./lib/native";
import { addPluginListener, isNativePlatform, plugin } from "./lib/capacitor";
import type { RouteSuggestion, TabId } from "./types";

const tabs: Array<{ id: TabId; label: string; icon: IconName }> = [
  { id: "home", label: "Keşfet", icon: "home" },
  { id: "passport", label: "Pasaport", icon: "passport" },
  { id: "search", label: "Bilet Ara", icon: "search" },
  { id: "route", label: "Rota", icon: "route" },
  { id: "plans", label: "Planlar", icon: "plans" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [surpriseRoute, setSurpriseRoute] = useState<RouteSuggestion | null>(null);
  const [flightPrefill, setFlightPrefill] = useState<{ code: string; label: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const auth = useAuth();

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
    const route = window.location.hash.replace("#", "") as TabId;
    if (tabs.some((tab) => tab.id === route)) setActiveTab(route);
  }, []);

  const navigate = useCallback((tab: TabId) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void impact();
  }, []);

  useEffect(() => {
    if (!isNativePlatform()) return;
    let listener: { remove: () => Promise<void> } | null = null;
    void addPluginListener("App", "backButton", () => {
      if (accountOpen) {
        setAccountOpen(false);
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (activeTab !== "home") {
        navigate("home");
        return;
      }
      const app = plugin("App");
      void app?.exitApp?.().catch(() => undefined);
    }).then((handle) => { listener = handle; });
    return () => { void listener?.remove(); };
  }, [accountOpen, activeTab, menuOpen, navigate]);

  const routeToFlight = useCallback((route: RouteSuggestion) => {
    const code = route.destinationCode || "";
    setFlightPrefill({ code, label: code ? `${route.name}, ${route.country} (${code})` : route.name });
    navigate("search");
  }, [navigate]);

  const content = useMemo(() => {
    if (activeTab === "home") return <HomeScreen onNavigate={navigate} onSurprise={(route) => { setSurpriseRoute(route); navigate("route"); }} onNotice={showNotice} />;
    if (activeTab === "passport") return <PassportScreen />;
    if (activeTab === "search") return <FlightSearchScreen prefillDestination={flightPrefill} user={auth.user} accessToken={auth.accessToken} onNotice={showNotice} onOpenAccount={() => setAccountOpen(true)} />;
    if (activeTab === "route") return <RouteAssistantScreen surpriseRoute={surpriseRoute} onFlightSearch={routeToFlight} onNotice={showNotice} />;
    return <PlansScreen user={auth.user} accessToken={auth.accessToken} onOpenAccount={() => setAccountOpen(true)} onFlightSearch={routeToFlight} onNotice={showNotice} />;
  }, [activeTab, auth.accessToken, auth.user, flightPrefill, navigate, routeToFlight, showNotice, surpriseRoute]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => navigate("home")} aria-label="Ana sayfa"><span className="brand">LetsGo<strong>2</strong>Travel</span></button>
        <div className="topbar-actions">
          <span className={`network-dot ${online ? "online" : "offline"}`} title={online ? "Çevrimiçi" : "Çevrimdışı"} />
          <button className="icon-button" onClick={() => setAccountOpen(true)} aria-label="Hesabım"><Icon name="user" size={21} />{auth.user && <span className="account-dot" />}</button>
          <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Menü"><Icon name="menu" size={22} /></button>
        </div>
      </header>

      {!online && <div className="offline-banner"><Icon name="offline" size={16} /> Çevrimdışısın. Pasaport, yerel rota ve kayıtlı planlar çalışmaya devam eder.</div>}
      <main className="app-content">{content}</main>

      <nav className="bottom-nav" aria-label="Ana menü">
        {tabs.map((tab) => <button key={tab.id} className={`${activeTab === tab.id ? "active" : ""} ${tab.id === "search" ? "center-tab" : ""}`} onClick={() => navigate(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}>
          <span><Icon name={tab.icon} size={tab.id === "search" ? 23 : 21} /></span><small>{tab.label}</small>
        </button>)}
      </nav>

      {notice && <div className="toast" role="status"><Icon name="info" size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Bildirimi kapat"><Icon name="close" size={15} /></button></div>}
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth} onNotice={showNotice} />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} online={online} onNotice={showNotice} />
    </div>
  );
}
