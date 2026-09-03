import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { LegalSheet } from "../components/LegalSheet";
import { COUNTRY_LIST } from "../data/countries";
import { alpha3ToGeoId, geoIdToAlpha3 } from "../data/countryCodes";
import { config } from "../lib/config";
import { getTravelVerifications, sendTestPushNotification } from "../lib/api";
import { VerificationForm } from "../components/VerificationForm";
import { addPluginListener } from "../lib/capacitor";
import { shareContent } from "../lib/native";
import { disablePush, enablePushForUser, getPushPermissionState, isPushEnabledForDevice, type PushPermissionSummary } from "../lib/push";
import { getSupabaseDataErrorMessage, getUserProfile, updateUserProfile, type UserProfileData } from "../lib/supabaseData";
import {
  getFavoriteDestinations,
  getMobilePreferences,
  getSavedRoutePlans,
  getVisitedCountries,
  saveMobilePreferences,
  setFavoriteDestinations,
  setVisitedCountries,
  toggleVisitedCountry,
} from "../lib/storage";
import type { AuthUser, FavoriteDestination, MobilePreferences, TravelVerification, ViewId } from "../types";
import { useI18n } from "../lib/i18n";

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

const COUNTRY_BY_ALPHA3 = new Map(COUNTRY_LIST.map((country) => [country.alpha3, country]));

function alpha3FromProfileId(id: string) {
  const normalized = id.trim().toUpperCase();
  if (COUNTRY_BY_ALPHA3.has(normalized)) return normalized;
  return geoIdToAlpha3(normalized);
}

function destinationsFromProfileIds(ids: string[]): FavoriteDestination[] {
  return ids.flatMap((id) => {
    const alpha3 = alpha3FromProfileId(id);
    const country = alpha3 ? COUNTRY_BY_ALPHA3.get(alpha3) : null;
    return country ? [{ ...country, createdAt: new Date(0).toISOString() }] : [];
  });
}

function mergeDestinations(...lists: FavoriteDestination[][]) {
  return lists.flat().filter((item, index, all) => all.findIndex((other) => other.alpha3 === item.alpha3) === index);
}

function profileIdsForDestinations(original: string[], destinations: FavoriteDestination[]) {
  const preserved = original.filter((id) => !alpha3FromProfileId(id));
  const mapped = destinations.flatMap((item) => {
    const geoId = alpha3ToGeoId(item.alpha3);
    return geoId ? [geoId] : [];
  });
  return Array.from(new Set([...preserved, ...mapped]));
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
  const [legalOpen, setLegalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCountryCount, setVisibleCountryCount] = useState(60);
  const [preferences, setPreferences] = useState<MobilePreferences>(() => getMobilePreferences());
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBusy, setProfileBusy] = useState("");
  const [verifications, setVerifications] = useState<TravelVerification[]>([]);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [pushState, setPushState] = useState<PushPermissionSummary>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

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
      return;
    }

    setProfileLoading(true);
    void Promise.allSettled([getUserProfile(user.id, accessToken), getTravelVerifications(accessToken)])
      .then(async ([profileResult, verificationResult]) => {
        if (!active) return;
        if (verificationResult.status === "fulfilled") setVerifications(verificationResult.value);
        if (profileResult.status !== "fulfilled" || !profileResult.value) {
          onNotice(profileResult.status === "rejected"
            ? getSupabaseDataErrorMessage(profileResult.reason, copy("Profil eşitlenemedi.", "Your profile could not be synced."))
            : copy("Profil kaydı bulunamadı.", "Your profile record could not be found."));
          return;
        }

        const remote = profileResult.value;
        const mergedVisited = mergeDestinations(destinationsFromProfileIds(remote.visitedCountries), getVisitedCountries(ownerId));
        const mergedWishlist = mergeDestinations(destinationsFromProfileIds(remote.wishlistCountries), getFavoriteDestinations(ownerId));
        setVisitedCountries(mergedVisited, ownerId);
        setFavoriteDestinations(mergedWishlist, ownerId);
        const nextVisitedIds = profileIdsForDestinations(remote.visitedCountries, mergedVisited);
        const nextWishlistIds = profileIdsForDestinations(remote.wishlistCountries, mergedWishlist);
        const needsMerge = JSON.stringify(nextVisitedIds) !== JSON.stringify(remote.visitedCountries)
          || JSON.stringify(nextWishlistIds) !== JSON.stringify(remote.wishlistCountries);
        if (needsMerge) {
          try {
            const synced = await updateUserProfile(user.id, { visitedCountries: nextVisitedIds, wishlistCountries: nextWishlistIds }, accessToken);
            if (active) setProfile(synced);
          } catch {
            if (active) setProfile(remote);
          }
        } else {
          setProfile(remote);
        }
      })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, ownerId, user]);

  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, tick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, tick]);
  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, tick]);
  const rawName = displayName(user);
  const name = !user && rawName === "Misafir Kaşif" ? copy("Misafir Kaşif", "Guest Explorer") : rawName;
  const level = explorerLevel(visited.length);
  const localizedLevel = level === "Dünya Gezgini" ? copy(level, "World Traveller") : level === "Balkan Kaşifi" ? copy(level, "Balkan Explorer") : level === "Rota Meraklısı" ? copy(level, "Route Enthusiast") : copy(level, "New Explorer");
  const progress = Math.min(100, Math.max(8, Math.round((visited.length / 25) * 100)));
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
    if (profileBusy) return;
    const previous = getVisitedCountries(ownerId);
    const next = toggleVisitedCountry(country, ownerId);
    setTick((value) => value + 1);
    if (!user || !accessToken || !profile) return;

    setProfileBusy(`country-${country.alpha3}`);
    try {
      const updated = await updateUserProfile(user.id, {
        visitedCountries: profileIdsForDestinations(profile.visitedCountries, next),
      }, accessToken);
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
    if (!user || !accessToken || !profile || profileBusy) return;
    setProfileBusy("leaderboard");
    const previous = profile;
    setProfile({ ...profile, optInLeaderboard: enabled });
    try {
      setProfile(await updateUserProfile(user.id, { optInLeaderboard: enabled }, accessToken));
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
      text: copy(`${name} · ${level}\n${visited.length} ülke ziyaret ettim, ${favorites.length} rotayı favoriledim.`, `${name} · ${localizedLevel}\nI visited ${visited.length} countries and saved ${favorites.length} routes.`),
      url: "https://www.letsgo2travel.com.tr",
    });
    onNotice(shared ? copy("Kaşif kartın paylaşmaya hazır.", "Your Explorer Card is ready to share.") : copy("Paylaşım açılamadı.", "Sharing could not be opened."));
  };

  return <div className="screen profile-screen">
    <section className="profile-hero">
      <div className="profile-identity">
        <span className="profile-initial">{name.slice(0, 1).toLocaleUpperCase(locale)}</span>
        <div><small>{user ? approvedCount > 0 ? copy("BELGELİ GEZGİN", "VERIFIED TRAVELLER") : copy("HESAP AÇIK", "SIGNED IN") : copy("MİSAFİR MODU", "GUEST MODE")}</small><h1>{name}</h1><p>{user?.email || copy("Kayıtlarını bu cihazda güvenle saklıyorsun.", "Your saved items are kept safely on this device.")}</p></div>
      </div>
      <button onClick={onOpenAccount}><Icon name={user ? "settings" : "user"} size={18} /> {user ? copy("Hesabı yönet", "Manage account") : copy("Giriş yap", "Sign in")}</button>
    </section>

    <section className="explorer-card">
      <div className="explorer-card-head"><span><Icon name="globe" size={23} /></span><div><small>{copy("DİJİTAL KAŞİF KARTI", "DIGITAL EXPLORER CARD")}</small><strong>{localizedLevel}</strong></div><button onClick={() => void shareCard()} aria-label={copy("Kaşif kartını paylaş", "Share Explorer Card")}><Icon name="share" size={18} /></button></div>
      <div className="explorer-stats"><div><strong>{visited.length}</strong><span>{copy("Ülke", "Countries")}</span></div><div><strong>{routes.length}</strong><span>{copy("Rota", "Routes")}</span></div><div><strong>{favorites.length}</strong><span>{copy("Favori", "Favourites")}</span></div></div>
      <div className="explorer-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{visited.length >= 25 ? copy("Dünya Gezgini seviyesindesin", "You are a World Traveller") : copy(`${Math.max(0, 25 - visited.length)} ülke sonra Dünya Gezgini`, `${Math.max(0, 25 - visited.length)} countries to World Traveller`)}</small></div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>{copy("SEYAHAT PROFİLİN", "YOUR TRAVEL PROFILE")}</span><h2>{copy("Kaşif alanın", "Explorer space")}</h2></div></div>
      <div className="profile-action-list">
        {isAdmin && <button className="admin-entry" onClick={() => onNavigate("admin")}><span><Icon name="shield" size={21} /></span><div><strong>{copy("Admin Paneli", "Admin Console")}</strong><small>{copy("Site ve uygulamanın canlı yönetim merkezi", "Live management for web and app")}</small></div><Icon name="chevron" size={17} /></button>}
        <button onClick={() => setVisitedOpen(true)}><span><Icon name="flag" size={21} /></span><div><strong>{copy("Ziyaret ettiğim ülkeler", "Countries I've visited")}</strong><small>{visited.length ? visited.map((item) => countryName(item.alpha3, item.name)).slice(0, 3).join(" · ") : copy("Haritana ilk ülkeyi ekle", "Add your first country")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("trips")}><span><Icon name="suitcase" size={21} /></span><div><strong>{copy("Seyahatlerim", "My Trips")}</strong><small>{copy("Rotaların ve seyahat planların", "Your routes and travel plans")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("events")}><span><Icon name="calendar" size={21} /></span><div><strong>{copy("Kaydettiğim etkinlikler", "Saved events")}</strong><small>{copy("Konser, festival ve etkinlik planların", "Concerts, festivals and event plans")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("alerts")}><span><Icon name="bell" size={21} /></span><div><strong>{copy("Fiyat Alarmlarım", "Price Alerts")}</strong><small>{copy("Takip ettiğin rotalar ve hedef fiyatlar", "Tracked routes and target prices")}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("community")}><span><Icon name="users" size={21} /></span><div><strong>{copy("Kaşifler Ligi", "Explorer League")}</strong><small>{copy("Gezgin sıralaması ve topluluk", "Traveller ranking and community")}</small></div><Icon name="chevron" size={16} /></button>
        <button onClick={() => user ? setVerificationOpen(true) : onOpenAccount()}><span><Icon name="shield" size={21} /></span><div><strong>{copy("Belgeli Gezgin", "Verified Traveller")}</strong><small>{user ? copy(`${approvedCount} onaylı · ${verifications.filter((item) => item.status === "pending").length} bekleyen`, `${approvedCount} approved · ${verifications.filter((item) => item.status === "pending").length} pending`) : copy("Giriş yaparak doğrulama durumunu gör", "Sign in to view verification status")}</small></div><Icon name="chevron" size={16} /></button>
      </div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>{copy("BİLDİRİMLER", "NOTIFICATIONS")}</span><h2>{copy("Bildirim tercihlerin", "Notification preferences")}</h2></div></div>
      <div className="settings-card">
        <label><span><Icon name="bell" size={19} /><em><strong>{copy("Uygulama içi bildirimler", "In-app notifications")}</strong><small>{copy("Rota ve vize güncellemeleri", "Route and visa updates")}</small></em></span><input type="checkbox" checked={preferences.inAppNotifications} onChange={(event) => updatePreference("inAppNotifications", event.target.checked)} /></label>
        <button disabled={pushBusy || pushState === "unsupported"} onClick={() => void togglePushSetting()}><span><Icon name="bell" size={19} /><em><strong>{copy("Telefon bildirimleri", "Phone notifications")}</strong><small>{pushStateText}</small></em></span>{pushBusy ? <span className="button-loader dark" /> : <Icon name="chevron" size={17} />}</button>
        {user && pushEnabled && (
          <button disabled={testBusy} onClick={() => void sendTestPush()}><span><Icon name="sparkles" size={19} /><em><strong>{copy("Test bildirimi gönder", "Send test notification")}</strong><small>{copy("Bildirimlerin bu cihazda çalıştığını doğrula", "Check that notifications work on this device")}</small></em></span>{testBusy ? <span className="button-loader dark" /> : <Icon name="chevron" size={17} />}</button>
        )}
      </div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>{copy("UYGULAMA VE GİZLİLİK", "APP & PRIVACY")}</span><h2>{copy("Ayarlar", "Settings")}</h2></div></div>
      <div className="settings-card">
        <label><span><Icon name="sparkles" size={19} /><em><strong>{copy("Dokunma titreşimi", "Touch feedback")}</strong><small>{copy("Desteklenen cihazlarda hafif geri bildirim", "Gentle feedback on supported devices")}</small></em></span><input type="checkbox" checked={preferences.haptics} onChange={(event) => updatePreference("haptics", event.target.checked)} /></label>
        {user && <label><span><Icon name="users" size={19} /><em><strong>{copy("Kaşifler Ligi'nde görün", "Appear in Explorer League")}</strong><small>{copy("Yalnız güvenli profil özeti paylaşılır", "Only a safe profile summary is shared")}</small></em></span><input type="checkbox" checked={profile?.optInLeaderboard || false} disabled={!profile || profileLoading || Boolean(profileBusy)} onChange={(event) => void toggleLeaderboard(event.target.checked)} /></label>}
        <button onClick={onOpenRelease}><span><Icon name="info" size={19} /><em><strong>{copy("Sürüm yenilikleri", "What's new")}</strong><small>{copy(`Build ${config.buildNumber} ile gelenleri gör`, `See what's included in Build ${config.buildNumber}`)}</small></em></span><Icon name="chevron" size={17} /></button>
        <button onClick={onOpenOnboarding}><span><Icon name="compass" size={19} /><em><strong>{copy("Uygulama turu", "App tour")}</strong><small>{copy("Temel özellikleri yeniden, adım adım gör", "Review the main features step by step")}</small></em></span><Icon name="chevron" size={17} /></button>
        <button onClick={() => setLegalOpen(true)}><span><Icon name="lock" size={19} /><em><strong>{copy("Gizlilik ve veri işlemleri", "Privacy & data use")}</strong><small>{copy("Veri hakların ve gizlilik politikası (uygulama içinde)", "Your data rights and privacy policy in the app")}</small></em></span><Icon name="chevron" size={17} /></button>
      </div>
      <p className="profile-version">LetsGo2Travel {config.appVersion} · Build {config.buildNumber}</p>
    </section>

    <LegalSheet open={legalOpen} slug="gizlilik-politikasi" onClose={() => setLegalOpen(false)} />

    {visitedOpen && <Sheet open title={copy("Ziyaret ettiğim ülkeler", "Countries I've visited")} onClose={() => setVisitedOpen(false)} size="large">
      <label className="sr-only" htmlFor="visited-country-search">{copy("Ülke ara", "Search countries")}</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="visited-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Ülke ara", "Search countries")} /></div>
      <p className="visited-helper">{copy("Gittiğin ülkelere dokun. Giriş yaptıysan seçimlerin web seyahat haritanla da eşitlenir.", "Tap the countries you've visited. When signed in, your choices sync with your web travel map.")}</p>
      <div className="visited-country-list">
        {visibleCountries.map((country) => {
          const selected = visitedCodes.has(country.alpha3);
          return <button type="button" className={selected ? "selected" : ""} key={country.alpha3} aria-pressed={selected} disabled={Boolean(profileBusy)} onClick={() => void toggleCountry(country)}><span><Icon name={selected ? "check" : "plus"} size={17} /></span><strong>{countryName(country.alpha3, country.name)}</strong><small>{profileBusy === `country-${country.alpha3}` ? copy("Kaydediliyor", "Saving") : country.alpha3}</small></button>;
        })}
      </div>
      {visibleCountryCount < countries.length && <button className="country-load-more" type="button" onClick={() => setVisibleCountryCount((count) => count + 60)}>{copy("Daha fazla ülke göster", "Show more countries")} <span>{copy(`${countries.length - visibleCountryCount} kaldı`, `${countries.length - visibleCountryCount} left`)}</span></button>}
    </Sheet>}

    <Sheet open={verificationOpen} title={copy("Belgeli Gezgin", "Verified Traveller")} onClose={() => setVerificationOpen(false)} size="large">
      <div className="verification-summary"><span><Icon name="shield" size={28} /></span><div><small>{copy("SEYAHAT DOĞRULAMALARI", "TRAVEL VERIFICATIONS")}</small><strong>{copy(`${approvedCount} onaylı kayıt`, `${approvedCount} approved`)}</strong><p>{copy("Başvurular aynı hesapla web ve mobilde birlikte çalışır; belge gönderimi artık uygulama içinde tamamlanır.", "Applications stay in sync on web and mobile, and documents can be submitted in the app.")}</p></div></div>

      {user && accessToken && <VerificationForm
        accessToken={accessToken}
        onNotice={onNotice}
        onSubmitted={() => {
          void getTravelVerifications(accessToken).then((rows) => setVerifications(rows)).catch(() => undefined);
        }}
      />}

      <div className="verification-list">
        {verifications.map((item) => <article key={item.id}>
          <span className={`verification-status status-${item.status || "pending"}`}><Icon name={item.status === "approved" ? "check" : item.status === "rejected" ? "close" : "info"} size={17} /></span>
          <div>
            <strong>{item.country_name || item.country_code || copy("Seyahat belgesi", "Travel document")}</strong>
            <small>{item.status === "approved" ? copy("Onaylandı", "Approved") : item.status === "rejected" ? copy("Reddedildi", "Rejected") : item.status === "expired" ? copy("Süresi doldu", "Expired") : copy("İnceleniyor", "Under review")}</small>
            {item.status === "rejected" && item.admin_note && <p className="verification-reject-note">{copy("Ret nedeni", "Reason")}: {item.admin_note}</p>}
          </div>
        </article>)}
        {!verifications.length && <div className="empty-state compact"><span><Icon name="shield" size={26} /></span><strong>{copy("Henüz doğrulama yok", "No verifications yet")}</strong><p>{copy("İlk başvurunu yukarıdaki formla uygulama içinden gönderebilirsin.", "Submit your first application with the form above.")}</p></div>}
      </div>
    </Sheet>
  </div>;
}
