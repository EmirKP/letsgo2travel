import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { ProfilePhoto } from "../components/ProfilePhoto";
import { Sheet } from "../components/Sheet";
import { CommunityBlocksSheet } from "../components/CommunitySafetySheet";
import { LegalSheet } from "../components/LegalSheet";
import { COUNTRY_LIST } from "../data/countries";
import { profileIdsForAlpha3 } from "../data/countryCodes";
import { alpha3FromAlpha2 } from "../data/countryIso";
import { reconcileProfileCountries } from "../lib/profileCountries";
import { config } from "../lib/config";
import { getTravelVerifications, sendTestPushNotification } from "../lib/api";
import { VerificationForm } from "../components/VerificationForm";
import { addPluginListener, plugin } from "../lib/capacitor";
import { shareContent } from "../lib/native";
import { disablePush, enablePushForUser, getPushPermissionState, isPushEnabledForDevice, type PushPermissionSummary } from "../lib/push";
import { getSupabaseDataErrorMessage, getUserProfile, updateUserProfile, type UserProfileData } from "../lib/supabaseData";
import {
  getFavoriteDestinations,
  getMobilePreferences,
  getSavedRoutePlans,
  getVisitedCountries,
  getPendingGuestDataSync,
  saveMobilePreferences,
  setFavoriteDestinations,
  setVisitedCountries,
  toggleVisitedCountry,
} from "../lib/storage";
import type { AuthUser, FavoriteDestination, MobilePreferences, TravelVerification, ViewId } from "../types";
import { useI18n } from "../lib/i18n";
import profileCover from "../assets/reference/coastal-traveler.webp";
import "./reference-community-profile.css";
import "./profile-passport-polish.css";

function displayName(user: AuthUser | null) {
  if (!user) return "Misafir Kaşif";
  return String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || user.email?.split("@")[0] || "Gezgin");
}

function explorerLevel(count: number) {
  if (count >= 25) return "Dünya Gezgini";
  if (count >= 10) return "Balkan Kaşifi";
  if (count >= 5) return "Rota Meraklısı";
  return "Yeni Kaşif";
}

function profileIdsForDestinations(original: string[], destinations: FavoriteDestination[]) {
  return profileIdsForAlpha3(original, destinations.map(country => country.alpha3));
}

export function ProfileScreen({ user, ownerId, accessToken, isAdmin, onOpenAccount, onNavigate, onOpenRelease, onOpenOnboarding, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  isAdmin: boolean;
  onOpenAccount: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenRelease: () => void;
  onOpenOnboarding: () => void;
  onNotice: (message: string) => void;
}) {
  const { copy, countryName, locale } = useI18n();
  const [tick, setTick] = useState(0);
  const [visitedOpen, setVisitedOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCountryCount, setVisibleCountryCount] = useState(60);
  const [preferences, setPreferences] = useState<MobilePreferences>(() => getMobilePreferences());
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [profileReload, setProfileReload] = useState(0);
  const [profileBusy, setProfileBusy] = useState("");
  const [verifications, setVerifications] = useState<TravelVerification[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [pushState, setPushState] = useState<PushPermissionSummary>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [nativeVersion, setNativeVersion] = useState<{ version: string; build: string } | null>(null);
  useEffect(() => { let current = true; const app = plugin("App"); if (app?.getInfo) void app.getInfo().then((raw: unknown) => { const info = raw as {version?:unknown;build?:unknown}; if (current && typeof info?.version === "string" && typeof info?.build === "string") setNativeVersion({version:info.version,build:info.build}); }).catch(() => {}); return () => { current = false; }; }, []);

  useEffect(() => {
    const update = () => setTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshPushState = () => {
      void getPushPermissionState().then((state) => {
        if (!active) return;
        setPushState(state);
        setPushEnabled(state === "granted" && isPushEnabledForDevice());
      });
    };
    refreshPushState();
    // Kullanıcı iOS Ayarlar'dan izni değiştirip geri döndüğünde durum
    // güncellensin: uygulama öne gelince yeniden oku.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshPushState();
    };
    document.addEventListener("visibilitychange", onVisible);
    let appStateHandle: { remove: () => Promise<void> } | null = null;
    void addPluginListener("App", "appStateChange", (event) => {
      if (event.isActive) refreshPushState();
    }).then((handle) => {
      if (!active) { void handle?.remove().catch(() => undefined); return; }
      appStateHandle = handle;
    });
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void appStateHandle?.remove().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user || !accessToken) {
      setProfile(null);
      setVerifications([]);
      setProfileLoading(false);
      setProfileError(false); setVerificationLoading(false); setVerificationError(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(false); setVerificationLoading(true); setVerificationError(false);
    void Promise.allSettled([getUserProfile(user.id, accessToken), getTravelVerifications(accessToken)])
      .then(([profileResult, verificationResult]) => {
        if (!active) return;
        if (verificationResult.status === "fulfilled") setVerifications(verificationResult.value);
        else setVerificationError(true);
        if (profileResult.status !== "fulfilled" || !profileResult.value) {
          setProfileError(true);
          onNotice(profileResult.status === "rejected"
            ? getSupabaseDataErrorMessage(profileResult.reason, copy("Profil eşitlenemedi.", "Your profile could not be synced."))
            : copy("Profil kaydı bulunamadı.", "Your profile record could not be found."));
          return;
        }

        const remote = profileResult.value;
        const pendingImport = Boolean(ownerId && getPendingGuestDataSync(ownerId)?.profile);
        const mergedVisited = reconcileProfileCountries(remote.visitedCountries, getVisitedCountries(ownerId), pendingImport);
        const mergedWishlist = reconcileProfileCountries(remote.wishlistCountries, getFavoriteDestinations(ownerId), pendingImport);
        setVisitedCountries(mergedVisited, ownerId);
        setFavoriteDestinations(mergedWishlist, ownerId);
        setProfile(remote);
      })
      .finally(() => { if (active) { setProfileLoading(false); setVerificationLoading(false); } });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, ownerId, user, profileReload]);

  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, tick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, tick]);
  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, tick]);
  const rawName = displayName(user);
  const name = !user && rawName === "Misafir Kaşif" ? copy("Misafir Kaşif", "Guest Explorer") : rawName;
  const level = explorerLevel(visited.length);
  const localizedLevel = level === "Dünya Gezgini" ? copy(level, "World Traveller") : level === "Balkan Kaşifi" ? copy(level, "Balkan Explorer") : level === "Rota Meraklısı" ? copy(level, "Route Enthusiast") : copy(level, "New Explorer");
  const progress = Math.min(100, Math.max(0, Math.round((visited.length / 25) * 100)));
  const approvedCount = verifications.filter((item) => item.status === "approved").length;
  const countries = useMemo(() => COUNTRY_LIST.filter((country) => `${country.name} ${countryName(country.alpha3, country.name)}`.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))), [countryName, locale, query]);
  const visibleCountries = useMemo(() => countries.slice(0, visibleCountryCount), [countries, visibleCountryCount]);
  const visitedCodes = useMemo(() => new Set(visited.map((item) => item.alpha3)), [visited]);

  useEffect(() => {
    setVisibleCountryCount(60);
  }, [query, visitedOpen]);

  const updatePreference = (key: keyof MobilePreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveMobilePreferences(next);
  };

  const pushStateText = pushState === "unsupported"
    ? copy("Bu cihazda kullanılamıyor", "Not available on this device")
    : pushEnabled
      ? copy("Açık · Telefon bildirimlerini kapat", "On · Turn off phone notifications")
      : pushState === "denied"
        ? copy("İzin verilmedi · Cihaz ayarlarından izin verip tekrar dene", "Permission denied · Enable it in device settings")
        : copy("Kapalı · Telefon bildirimlerini aç", "Off · Turn on phone notifications");

  const togglePushSetting = async () => {
    if (pushBusy || pushState === "unsupported") return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        const ok = await disablePush(() => accessToken, user?.id || "");
        setPushEnabled(false);
        onNotice(ok ? copy("Telefon bildirimleri kapatıldı.", "Phone notifications are off.") : copy("Telefon bildirimleri bu cihazda kapatıldı.", "Phone notifications are off on this device."));
        return;
      }
      if (!user || !accessToken) {
        onOpenAccount();
        return;
      }
      const result = await enablePushForUser(() => accessToken);
      if (result.ok) {
        setPushEnabled(true);
        setPushState("granted");
        onNotice(copy("Telefon bildirimleri açıldı. Fiyat alarmların hedefe inince bildirim gelir.", "Phone notifications are on. You will be notified when a fare reaches your target."));
      } else if (result.reason === "denied") {
        setPushState("denied");
        onNotice(copy("Bildirim izni verilmedi. İzni cihaz ayarlarından açabilirsin; e-posta bildirimleri çalışmaya devam eder.", "Notification permission was denied. Enable it in device settings; email alerts will keep working."));
      } else if (result.reason === "unsupported") {
        setPushState("unsupported");
        onNotice(copy("Telefon bildirimleri yalnızca uygulamanın cihaz sürümünde açılabilir.", "Phone notifications are available only in the installed app."));
      } else {
        onNotice(copy("Telefon bildirimleri şu an açılamadı. Daha sonra tekrar dene.", "Phone notifications could not be enabled. Try again later."));
      }
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    if (testBusy || !user || !accessToken) return;
    setTestBusy(true);
    try {
      const result = await sendTestPushNotification(accessToken);
      onNotice(
        locale === "tr" && result.message
          ? result.message
          : result.success
            ? copy("Test bildirimi gönderildi.", "Test notification sent.")
            : copy("Test bildirimi gönderilemedi.", "Test notification could not be sent."),
      );
    } catch {
      onNotice(copy("Test bildirimi şu an gönderilemedi. Biraz sonra tekrar dene.", "The test notification could not be sent. Try again shortly."));
    } finally {
      setTestBusy(false);
    }
  };

  const toggleCountry = async (country: Omit<FavoriteDestination, "createdAt">) => {
    if (profileBusy || (user && (profileLoading || profileError || !profile))) return;
    const previous = getVisitedCountries(ownerId);
    const next = toggleVisitedCountry(country, ownerId);
    setTick((value) => value + 1);
    if (!user || !accessToken || !profile) return;

    setProfileBusy(`country-${country.alpha3}`);
    try {
      const updated = await updateUserProfile(user.id, {
        visitedCountries: profileIdsForDestinations(profile.visitedCountries, next),
      }, accessToken);
      if (!updated) throw new Error("profile missing");
      setProfile(updated);
      onNotice(copy("Ziyaret haritan web hesabınla eşitlendi.", "Your visited map is synced with your web account."));
    } catch (error) {
      setVisitedCountries(previous, ownerId);
      setTick((value) => value + 1);
      onNotice(getSupabaseDataErrorMessage(error, copy("Ziyaret kaydedilemedi; değişiklik geri alındı.", "The visit could not be saved; the change was reverted.")));
    } finally {
      setProfileBusy("");
    }
  };

  const toggleLeaderboard = async (enabled: boolean) => {
    if (!user || !accessToken || !profile || profileBusy || profileLoading || profileError) return;
    setProfileBusy("leaderboard");
    const previous = profile;
    setProfile({ ...profile, optInLeaderboard: enabled });
    try {
      const updated = await updateUserProfile(user.id, { optInLeaderboard: enabled }, accessToken);
      if (!updated) throw new Error("profile missing");
      setProfile(updated);
      onNotice(enabled ? copy("Kaşifler Ligi'ne katıldın.", "You joined the Explorer League.") : copy("Profilin ligden gizlendi.", "Your profile is hidden from the league."));
    } catch (error) {
      setProfile(previous);
      onNotice(getSupabaseDataErrorMessage(error, copy("Lig tercihi kaydedilemedi.", "Your league preference could not be saved.")));
    } finally {
      setProfileBusy("");
    }
  };

  const shareCard = async () => {
    const shared = await shareContent({
      title: copy("LetsGo2Travel Kaşif Kartım", "My LetsGo2Travel Explorer Card"),
      text: copy(`${name} · ${level}\n${visited.length} ülke ziyaret ettim, ${favorites.length} rotayı favoriledim.`, `${name} · ${localizedLevel}\nI visited ${visited.length} countries and saved ${favorites.length} routes.`, `${name} · ${localizedLevel}\nKam vizituar ${visited.length} shtete dhe kam ruajtur ${favorites.length} itinerare.`),
      url: "https://www.letsgo2travel.com.tr",
    });
    onNotice(shared ? copy("Kaşif kartın paylaşmaya hazır.", "Your Explorer Card is ready to share.") : copy("Paylaşım açılamadı.", "Sharing could not be opened."));
  };

  return <div className="screen profile-screen reference-profile profile-polished">
    <div className="profile-cover" aria-hidden="true"><img src={profileCover} alt="" width={1200} height={800}/><span><small>{copy("SENİN YOLCULUĞUN", "YOUR JOURNEY")}</small>{copy("Daha fazla keşfet.\nDaha fazla yaşa.", "Discover more.\nLive more.")}</span></div>
    <section className="profile-hero">
      <div className="profile-identity">
        <ProfilePhoto key={user?.id || "guest"} userId={user?.id} accessToken={accessToken} name={name} onSignIn={onOpenAccount} onNotice={onNotice}/>
        <div><small>{user ? approvedCount > 0 ? copy("BELGELİ GEZGİN", "VERIFIED TRAVELLER") : copy("HESAP AÇIK", "SIGNED IN") : copy("MİSAFİR MODU", "GUEST MODE")}</small><h1>{name}</h1><p>{user?.email || copy("Kayıtlarını bu cihazda güvenle saklıyorsun.", "Your saved items are kept safely on this device.")}</p></div>
      </div>
      <button className="profile-account-action" onClick={onOpenAccount} aria-label={user ? copy("Hesabı yönet", "Manage account") : copy("Giriş yap", "Sign in")}><Icon name={user ? "settings" : "user"} size={18} /><span>{user ? copy("Hesap", "Account") : copy("Giriş yap", "Sign in")}</span></button>
    </section>

    <section className="explorer-card">
      <div className="explorer-card-head"><span><Icon name="globe" size={20} /></span><div><small>{copy("KAŞİF KARTIN", "YOUR EXPLORER CARD")}</small><strong>{localizedLevel}</strong></div><button onClick={() => void shareCard()} aria-label={copy("Kaşif kartını paylaş", "Share Explorer Card")}><Icon name="share" size={18} /></button></div>
      <div className="explorer-stats"><div><strong>{visited.length}</strong><span>{copy("Ülke", "Countries")}</span></div><div><strong>{routes.length}</strong><span>{copy("Rota", "Routes")}</span></div><div><strong>{favorites.length}</strong><span>{copy("Favori", "Favourites")}</span></div></div>
      <div className="explorer-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{visited.length >= 25 ? copy("Dünya Gezgini seviyesindesin", "You are a World Traveller") : copy(`${Math.max(0, 25 - visited.length)} ülke sonra Dünya Gezgini`, `${Math.max(0, 25 - visited.length)} countries to World Traveller`, `Edhe ${Math.max(0, 25 - visited.length)} shtete për Eksplorues të Botës`)}</small></div>
    </section>

    <section className="profile-section">
      {profileError && <div className="info-box error" role="alert"><p>{copy("Profil bilgilerin yüklenemedi. Cihazdaki kayıtların korunuyor.", "Your profile could not load. Your saved device data is kept.", "Profili nuk u ngarkua. Të dhënat në pajisje ruhen.")}</p><button type="button" onClick={() => setProfileReload(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
      <div className="section-heading"><div><span>{copy("SEYAHAT PROFİLİN", "YOUR TRAVEL PROFILE")}</span><h2>{copy("Kaşif alanın", "Explorer space")}</h2></div></div>
      {isAdmin && <div className="profile-action-list profile-admin-list"><button className="admin-entry" onClick={() => onNavigate("admin")}><span><Icon name="shield" size={21} /></span><div><strong>{copy("Admin Paneli", "Admin Console")}</strong><small>{copy("Site ve uygulamanın canlı yönetim merkezi", "Live management for web and app")}</small></div><Icon name="chevron" size={17} /></button></div>}
      <div className="profile-action-list profile-travel-shortcuts">
        <button onClick={() => setVisitedOpen(true)}><span><Icon name="flag" size={21} /></span><div><strong>{copy("Ziyaret ettiğim ülkeler", "Countries I've visited")}</strong><small>{visited.length ? visited.map((item) => countryName(item.alpha3, item.name)).slice(0, 3).join(" · ") : copy("Haritana ilk ülkeyi ekle", "Add your first country")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("cockpit")}><span><Icon name="suitcase" size={21} /></span><div><strong>{copy("Seyahatlerim", "My Trips")}</strong><small>{copy("Uçuşların, tarihler ve hazırlık listelerin", "Your flights, dates and checklists")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("trips")}><span><Icon name="heart" size={21} /></span><div><strong>{copy("Kaydedilenler", "Saved")}</strong><small>{copy("Kaydettiğin rotalar, ülkeler ve etkinlikler", "Your saved routes, countries and events")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("alerts")}><span><Icon name="bell" size={21} /></span><div><strong>{copy("Fiyat Alarmlarım", "Price Alerts")}</strong><small>{copy("Takip ettiğin rotalar ve hedef fiyatlar", "Tracked routes and target prices")}</small></div><Icon name="chevron" size={17} /></button>
      </div>
    </section>

    <section className="profile-section" aria-labelledby="profile-community-heading">
      <div className="section-heading"><div><h2 id="profile-community-heading">{copy("Toplulukta sen", "You in the community")}</h2></div></div>
      <div className="profile-action-list">
        <button onClick={() => onNavigate("community")}><span><Icon name="users" size={21} /></span><div><strong>{copy("Kaşifler Ligi", "Explorer League")}</strong><small>{copy("Gezgin sıralaması ve topluluk", "Traveller ranking and community")}</small></div><Icon name="chevron" size={16} /></button>
        <button onClick={() => user ? setVerificationOpen(true) : onOpenAccount()}><span><Icon name="shield" size={21} /></span><div><strong>{copy("Belgeli Gezgin", "Verified Traveller")}</strong><small>{user ? copy(`${approvedCount} onaylı · ${verifications.filter((item) => item.status === "pending").length} bekleyen`, `${approvedCount} approved · ${verifications.filter((item) => item.status === "pending").length} pending`, `${approvedCount} të miratuara · ${verifications.filter((item) => item.status === "pending").length} në pritje`) : copy("Giriş yaparak doğrulama durumunu gör", "Sign in to view verification status")}</small></div><Icon name="chevron" size={16} /></button>
      </div>
    </section>

    <section className="profile-section profile-settings" aria-labelledby="profile-settings-heading">
      <div className="section-heading"><div><span>{copy("SANA GÖRE", "MAKE IT YOURS")}</span><h2 id="profile-settings-heading">{copy("Tercihler ve gizlilik", "Preferences & privacy")}</h2></div></div>
      <details className="profile-preference-group">
        <summary><span className="profile-preference-icon"><Icon name="bell" size={21}/></span><span><strong>{copy("Bildirimler", "Notifications")}</strong><small>{copy("Uygulama içi ve telefon bildirimleri", "In-app and phone notifications")}</small></span><Icon name="chevron" size={18}/></summary>
      <div className="settings-card">
        <label><span><Icon name="bell" size={19} /><em><strong>{copy("Uygulama içi bildirimler", "In-app notifications")}</strong><small>{copy("Rota ve vize güncellemeleri", "Route and visa updates")}</small></em></span><input type="checkbox" checked={preferences.inAppNotifications} onChange={(event) => updatePreference("inAppNotifications", event.target.checked)} /></label>
        <button disabled={pushBusy || pushState === "unsupported"} onClick={() => void togglePushSetting()}><span><Icon name="bell" size={19} /><em><strong>{copy("Telefon bildirimleri", "Phone notifications")}</strong><small>{pushStateText}</small></em></span>{pushBusy ? <span className="button-loader dark" /> : <Icon name="chevron" size={17} />}</button>
        {user && pushEnabled && (
          <button disabled={testBusy} onClick={() => void sendTestPush()}><span><Icon name="sparkles" size={19} /><em><strong>{copy("Test bildirimi gönder", "Send test notification")}</strong><small>{copy("Bildirimlerin bu cihazda çalıştığını doğrula", "Check that notifications work on this device")}</small></em></span>{testBusy ? <span className="button-loader dark" /> : <Icon name="chevron" size={17} />}</button>
        )}
      </div>
      </details>
      <details className="profile-preference-group">
        <summary><span className="profile-preference-icon"><Icon name="lock" size={21}/></span><span><strong>{copy("Gizlilik ve topluluk", "Privacy & community")}</strong><small>{copy("Görünürlük, engellenenler ve veri hakların", "Visibility, blocked users and your data rights")}</small></span><Icon name="chevron" size={18}/></summary>
      <div className="settings-card">
        {user && <label><span><Icon name="users" size={19} /><em><strong>{copy("Kaşifler Ligi'nde görün", "Appear in Explorer League")}</strong><small>{copy("Yalnız güvenli profil özeti paylaşılır", "Only a safe profile summary is shared")}</small></em></span><input type="checkbox" checked={profile?.optInLeaderboard || false} disabled={!profile || profileLoading || profileError || Boolean(profileBusy)} onChange={(event) => void toggleLeaderboard(event.target.checked)} /></label>}
        <button onClick={() => user && accessToken ? setBlocksOpen(true) : onOpenAccount()}><span><Icon name="unlock" size={19} /><em><strong>{copy("Engellenen kullanıcılar", "Blocked users")}</strong><small>{copy("Engellediğin kişileri gör ve engeli kaldır", "View and unblock people")}</small></em></span><Icon name="chevron" size={17} /></button>
        <button onClick={() => setLegalOpen(true)}><span><Icon name="lock" size={19} /><em><strong>{copy("Gizlilik ve veri işlemleri", "Privacy & data use")}</strong><small>{copy("Veri hakların ve gizlilik politikası (uygulama içinde)", "Your data rights and privacy policy in the app")}</small></em></span><Icon name="chevron" size={17} /></button>
      </div>
      </details>
      <details className="profile-preference-group">
        <summary><span className="profile-preference-icon"><Icon name="settings" size={21}/></span><span><strong>{copy("Uygulama", "App")}</strong><small>{copy("Dokunma hissi, yenilikler ve kısa tur", "Touch feedback, updates and a quick tour")}</small></span><Icon name="chevron" size={18}/></summary>
        <div className="settings-card">
          <label><span><Icon name="sparkles" size={19} /><em><strong>{copy("Dokunma titreşimi", "Touch feedback")}</strong><small>{copy("Desteklenen cihazlarda hafif geri bildirim", "Gentle feedback on supported devices")}</small></em></span><input type="checkbox" checked={preferences.haptics} onChange={(event) => updatePreference("haptics", event.target.checked)} /></label>
          <button onClick={onOpenRelease}><span><Icon name="info" size={19} /><em><strong>{copy("Sürüm yenilikleri", "What's new")}</strong><small>{copy(`Build ${config.buildNumber} ile gelenleri gör`, `See what's included in Build ${config.buildNumber}`, `Shiko çfarë përfshin versioni ${config.buildNumber}`)}</small></em></span><Icon name="chevron" size={17} /></button>
          <button onClick={onOpenOnboarding}><span><Icon name="compass" size={19} /><em><strong>{copy("Uygulama turu", "App tour")}</strong><small>{copy("Temel özellikleri yeniden, adım adım gör", "Review the main features step by step")}</small></em></span><Icon name="chevron" size={17} /></button>
        </div>
      <p className="profile-version">LetsGo2Travel {nativeVersion?.version || config.appVersion} · Build {nativeVersion?.build || config.buildNumber}<br/>{config.updateId} · {config.sourceCommit}</p>
      </details>
    </section>

    {blocksOpen && user && accessToken && <CommunityBlocksSheet key={user.id} accessToken={accessToken} onClose={() => setBlocksOpen(false)} onChanged={() => onNotice(copy("Kullanıcının engeli kaldırıldı.", "User unblocked."))} />}
    <LegalSheet open={legalOpen} slug="gizlilik-politikasi" onClose={() => setLegalOpen(false)} />

    {visitedOpen && <Sheet open title={copy("Ziyaret ettiğim ülkeler", "Countries I've visited")} onClose={() => setVisitedOpen(false)} size="large">
      <label className="sr-only" htmlFor="visited-country-search">{copy("Ülke ara", "Search countries")}</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="visited-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke ara", "Search countries")} /></div>
      <p className="visited-helper">{copy("Gittiğin ülkelere dokun. Giriş yaptıysan seçimlerin web seyahat haritanla da eşitlenir.", "Tap the countries you've visited. When signed in, your choices sync with your web travel map.")}</p>
      <div className="visited-country-list">
        {visibleCountries.map((country) => {
          const selected = visitedCodes.has(country.alpha3);
          return <button type="button" className={selected ? "selected" : ""} key={country.alpha3} aria-pressed={selected} disabled={Boolean(profileBusy) || Boolean(user && (profileLoading || profileError || !profile))} onClick={() => void toggleCountry(country)}><span><Icon name={selected ? "check" : "plus"} size={17} /></span><strong>{countryName(country.alpha3, country.name)}</strong><small>{profileBusy === `country-${country.alpha3}` ? copy("Kaydediliyor", "Saving") : country.alpha3}</small></button>;
        })}
      </div>
      {visibleCountryCount < countries.length && <button className="country-load-more" type="button" onClick={() => setVisibleCountryCount((count) => count + 60)}>{copy("Daha fazla ülke göster", "Show more countries")} <span>{copy(`${countries.length - visibleCountryCount} kaldı`, `${countries.length - visibleCountryCount} left`, `Edhe ${countries.length - visibleCountryCount}`)}</span></button>}
    </Sheet>}

    <Sheet open={verificationOpen} title={copy("Belgeli Gezgin", "Verified Traveller")} onClose={() => setVerificationOpen(false)} size="large">
      <div className="verification-summary"><span><Icon name="shield" size={28} /></span><div><small>{copy("SEYAHAT DOĞRULAMALARI", "TRAVEL VERIFICATIONS")}</small><strong>{copy(`${approvedCount} onaylı kayıt`, `${approvedCount} approved`, `${approvedCount} të miratuara`)}</strong><p>{copy("Başvurular aynı hesapla web ve mobilde birlikte çalışır; belge gönderimi artık uygulama içinde tamamlanır.", "Applications stay in sync on web and mobile, and documents can be submitted in the app.")}</p></div></div>

      {user && accessToken && <VerificationForm
        accessToken={accessToken}
        onNotice={onNotice}
        onSubmitted={() => {
          setProfileReload(value => value + 1);
        }}
      />}

      <div className="verification-list">
        {verificationLoading && <p role="status">{copy("Doğrulamalar yükleniyor…", "Loading verifications…", "Duke ngarkuar verifikimet…")}</p>}
        {verificationError && <div className="info-box error" role="alert"><p>{copy("Doğrulamalar yüklenemedi. Başvuruların silinmedi; tekrar deneyebilirsin.", "Verifications could not load. Your submissions were not removed; try again.", "Verifikimet nuk u ngarkuan. Aplikimet nuk janë fshirë; provo sërish.")}</p><button type="button" onClick={() => setProfileReload(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
        {verifications.map((item) => <article key={item.id}>
          <span className={`verification-status status-${item.status || "pending"}`}><Icon name={item.status === "approved" ? "check" : item.status === "rejected" ? "close" : "info"} size={17} /></span>
          <div>
            <strong>{countryName(alpha3FromAlpha2(item.country_code || ""), item.country_name || item.country_code || copy("Seyahat belgesi", "Travel document"))}</strong>
            <small>{item.status === "approved" ? copy("Onaylandı", "Approved") : item.status === "rejected" ? copy("Reddedildi", "Rejected") : item.status === "expired" ? copy("Süresi doldu", "Expired") : copy("İnceleniyor", "Under review")}</small>
            {item.status === "rejected" && item.admin_note && <p className="verification-reject-note">{copy("Ret nedeni", "Reason")}: {item.admin_note}</p>}
          </div>
        </article>)}
        {!verificationLoading && !verificationError && !verifications.length && <div className="empty-state compact"><span><Icon name="shield" size={26} /></span><strong>{copy("Henüz doğrulama yok", "No verifications yet")}</strong><p>{copy("İlk başvurunu yukarıdaki formla uygulama içinden gönderebilirsin.", "Submit your first application with the form above.")}</p></div>}
      </div>
    </Sheet>
  </div>;
}
