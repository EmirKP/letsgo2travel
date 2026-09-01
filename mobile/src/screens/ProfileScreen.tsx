import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { COUNTRY_LIST } from "../data/countries";
import { alpha3ToGeoId, geoIdToAlpha3 } from "../data/countryCodes";
import { config } from "../lib/config";
import { getTravelVerifications } from "../lib/api";
import { openExternal, shareContent } from "../lib/native";
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

export function ProfileScreen({ user, ownerId, accessToken, onOpenAccount, onNavigate, onOpenRelease, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  onOpenAccount: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenRelease: () => void;
  onNotice: (message: string) => void;
}) {
  const [tick, setTick] = useState(0);
  const [visitedOpen, setVisitedOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState<MobilePreferences>(() => getMobilePreferences());
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBusy, setProfileBusy] = useState("");
  const [verifications, setVerifications] = useState<TravelVerification[]>([]);
  const [verificationOpen, setVerificationOpen] = useState(false);

  useEffect(() => {
    const update = () => setTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
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
          onNotice(profileResult.status === "rejected" ? getSupabaseDataErrorMessage(profileResult.reason, "Profil eşitlenemedi.") : "Profil kaydı bulunamadı.");
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
  }, [accessToken, onNotice, ownerId, user]);

  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, tick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, tick]);
  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, tick]);
  const name = displayName(user);
  const level = explorerLevel(visited.length);
  const progress = Math.min(100, Math.max(8, Math.round((visited.length / 25) * 100)));
  const approvedCount = verifications.filter((item) => item.status === "approved").length;
  const countries = useMemo(() => COUNTRY_LIST.filter((country) => country.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [query]);

  const updatePreference = (key: keyof MobilePreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveMobilePreferences(next);
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
      onNotice("Ziyaret haritan web hesabınla eşitlendi.");
    } catch (error) {
      setVisitedCountries(previous, ownerId);
      setTick((value) => value + 1);
      onNotice(getSupabaseDataErrorMessage(error, "Ziyaret kaydedilemedi; değişiklik geri alındı."));
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
      onNotice(enabled ? "Kaşifler Ligi'ne katıldın." : "Profilin ligden gizlendi.");
    } catch (error) {
      setProfile(previous);
      onNotice(getSupabaseDataErrorMessage(error, "Lig tercihi kaydedilemedi."));
    } finally {
      setProfileBusy("");
    }
  };

  const shareCard = async () => {
    const shared = await shareContent({
      title: "LetsGo2Travel Kaşif Kartım",
      text: `${name} · ${level}\n${visited.length} ülke ziyaret ettim, ${favorites.length} rotayı favoriledim.`,
      url: "https://www.letsgo2travel.com.tr",
    });
    onNotice(shared ? "Kaşif kartın paylaşmaya hazır." : "Paylaşım açılamadı.");
  };

  return <div className="screen profile-screen">
    <section className="profile-hero">
      <div className="profile-identity">
        <span className="profile-initial">{name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
        <div><small>{user ? approvedCount > 0 ? "BELGELİ GEZGİN" : "HESAP AÇIK" : "MİSAFİR MODU"}</small><h1>{name}</h1><p>{user?.email || "Kayıtlarını bu cihazda güvenle saklıyorsun."}</p></div>
      </div>
      <button onClick={onOpenAccount}><Icon name={user ? "settings" : "user"} size={18} /> {user ? "Hesabı yönet" : "Giriş yap"}</button>
    </section>

    <section className="explorer-card">
      <div className="explorer-card-head"><span><Icon name="globe" size={23} /></span><div><small>DİJİTAL KAŞİF KARTI</small><strong>{level}</strong></div><button onClick={() => void shareCard()} aria-label="Kaşif kartını paylaş"><Icon name="share" size={18} /></button></div>
      <div className="explorer-stats"><div><strong>{visited.length}</strong><span>Ülke</span></div><div><strong>{routes.length}</strong><span>Rota</span></div><div><strong>{favorites.length}</strong><span>Favori</span></div></div>
      <div className="explorer-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{visited.length >= 25 ? "Dünya Gezgini seviyesindesin" : `${Math.max(0, 25 - visited.length)} ülke sonra Dünya Gezgini`}</small></div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>SEYAHAT PROFİLİN</span><h2>Kaşif alanın</h2></div></div>
      <div className="profile-action-list">
        <button onClick={() => setVisitedOpen(true)}><span><Icon name="flag" size={21} /></span><div><strong>Ziyaret ettiğim ülkeler</strong><small>{visited.length ? visited.map((item) => item.name).slice(0, 3).join(" · ") : "Haritana ilk ülkeyi ekle"}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("trips")}><span><Icon name="suitcase" size={21} /></span><div><strong>Seyahatlerim</strong><small>Rotaların ve seyahat planların</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("community")}><span><Icon name="users" size={21} /></span><div><strong>Kaşifler Ligi</strong><small>Gezgin sıralaması ve topluluk</small></div><Icon name="chevron" size={16} /></button>
        <button onClick={() => user ? setVerificationOpen(true) : onOpenAccount()}><span><Icon name="shield" size={21} /></span><div><strong>Belgeli Gezgin</strong><small>{user ? `${approvedCount} onaylı · ${verifications.filter((item) => item.status === "pending").length} bekleyen` : "Giriş yaparak doğrulama durumunu gör"}</small></div><Icon name="chevron" size={16} /></button>
      </div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>UYGULAMA</span><h2>Ayarlar</h2></div></div>
      <div className="settings-card">
        <label><span><Icon name="bell" size={19} /><em><strong>Uygulama içi bildirimler</strong><small>Rota ve vize güncellemeleri</small></em></span><input type="checkbox" checked={preferences.inAppNotifications} onChange={(event) => updatePreference("inAppNotifications", event.target.checked)} /></label>
        <label><span><Icon name="sparkles" size={19} /><em><strong>Dokunma titreşimi</strong><small>Desteklenen cihazlarda hafif geri bildirim</small></em></span><input type="checkbox" checked={preferences.haptics} onChange={(event) => updatePreference("haptics", event.target.checked)} /></label>
        {user && <label><span><Icon name="users" size={19} /><em><strong>Kaşifler Ligi'nde görün</strong><small>Yalnız güvenli profil özeti paylaşılır</small></em></span><input type="checkbox" checked={profile?.optInLeaderboard || false} disabled={!profile || profileLoading || Boolean(profileBusy)} onChange={(event) => void toggleLeaderboard(event.target.checked)} /></label>}
        <button onClick={onOpenRelease}><span><Icon name="info" size={19} /><em><strong>Sürüm yenilikleri</strong><small>Build {config.buildNumber} ile gelenleri gör</small></em></span><Icon name="chevron" size={17} /></button>
        <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/gizlilik-politikasi")}><span><Icon name="lock" size={19} /><em><strong>Gizlilik ve hesap</strong><small>Veri hakların ve politikalar</small></em></span><Icon name="external" size={16} /></button>
      </div>
      <p className="profile-version">LetsGo2Travel {config.appVersion} · Build {config.buildNumber}</p>
    </section>

    <Sheet open={visitedOpen} title="Ziyaret ettiğim ülkeler" onClose={() => setVisitedOpen(false)} size="large">
      <label className="sr-only" htmlFor="visited-country-search">Ülke ara</label>
      <div className="search-input"><Icon name="search" size={18} /><input id="visited-country-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ülke ara" /></div>
      <p className="visited-helper">Gittiğin ülkelere dokun. Giriş yaptıysan seçimlerin web seyahat haritanla da eşitlenir.</p>
      <div className="visited-country-list">
        {countries.map((country) => {
          const selected = visited.some((item) => item.alpha3 === country.alpha3);
          return <button type="button" className={selected ? "selected" : ""} key={country.alpha3} aria-pressed={selected} disabled={Boolean(profileBusy)} onClick={() => void toggleCountry(country)}><span><Icon name={selected ? "check" : "plus"} size={17} /></span><strong>{country.name}</strong><small>{profileBusy === `country-${country.alpha3}` ? "Kaydediliyor" : country.alpha3}</small></button>;
        })}
      </div>
    </Sheet>

    <Sheet open={verificationOpen} title="Belgeli Gezgin" onClose={() => setVerificationOpen(false)} size="large">
      <div className="verification-summary"><span><Icon name="shield" size={28} /></span><div><small>SEYAHAT DOĞRULAMALARI</small><strong>{approvedCount} onaylı kayıt</strong><p>Başvuruların aynı hesap üzerinden web ve mobilde görüntülenir.</p></div></div>
      <div className="verification-list">
        {verifications.map((item) => <article key={item.id}><span className={`verification-status status-${item.status || "pending"}`}><Icon name={item.status === "approved" ? "check" : item.status === "rejected" ? "close" : "info"} size={17} /></span><div><strong>{item.country_name || item.country_code || "Seyahat belgesi"}</strong><small>{item.status === "approved" ? "Onaylandı" : item.status === "rejected" ? "Reddedildi" : item.status === "expired" ? "Süresi doldu" : "İnceleniyor"}</small></div></article>)}
        {!verifications.length && <div className="empty-state compact"><span><Icon name="shield" size={26} /></span><strong>Henüz doğrulama yok</strong><p>Belge yükleme, hassas dosya aktarımı nedeniyle güvenli web formunda tamamlanır.</p></div>}
      </div>
      <button className="secondary-wide" onClick={() => void openExternal("https://www.letsgo2travel.com.tr/profil/dogrulamalar")}><Icon name="external" size={17} /> Güvenli belge gönderimine git</button>
    </Sheet>
  </div>;
}
