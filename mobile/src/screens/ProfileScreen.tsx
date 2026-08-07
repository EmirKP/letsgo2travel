import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { COUNTRY_LIST } from "../data/countries";
import { config } from "../lib/config";
import { openExternal, shareContent } from "../lib/native";
import {
  getFavoriteDestinations,
  getMobilePreferences,
  getSavedRoutePlans,
  getVisitedCountries,
  saveMobilePreferences,
  toggleVisitedCountry,
} from "../lib/storage";
import type { AuthUser, MobilePreferences, ViewId } from "../types";

function displayName(user: AuthUser | null) {
  if (!user) return "Misafir Kaşif";
  return String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || user.email?.split("@")[0] || "Gezgin");
}

function explorerLevel(count: number) {
  if (count >= 30) return "Dünya Gezgini";
  if (count >= 15) return "Deneyimli Kaşif";
  if (count >= 5) return "Gezgin";
  return "Yeni Kaşif";
}

export function ProfileScreen({ user, ownerId, onOpenAccount, onNavigate, onOpenRelease, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  onOpenAccount: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenRelease: () => void;
  onNotice: (message: string) => void;
}) {
  const [tick, setTick] = useState(0);
  const [visitedOpen, setVisitedOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState<MobilePreferences>(() => getMobilePreferences());

  useEffect(() => {
    const update = () => setTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  const visited = useMemo(() => getVisitedCountries(ownerId), [ownerId, tick]);
  const favorites = useMemo(() => getFavoriteDestinations(ownerId), [ownerId, tick]);
  const routes = useMemo(() => getSavedRoutePlans(ownerId), [ownerId, tick]);
  const name = displayName(user);
  const level = explorerLevel(visited.length);
  const progress = Math.min(100, Math.max(8, Math.round((visited.length / 30) * 100)));
  const countries = useMemo(() => COUNTRY_LIST.filter((country) => country.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [query]);

  const updatePreference = (key: keyof MobilePreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveMobilePreferences(next);
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
        <div><small>{user ? "DOĞRULANMIŞ HESAP" : "MİSAFİR MODU"}</small><h1>{name}</h1><p>{user?.email || "Kayıtlarını bu cihazda güvenle saklıyorsun."}</p></div>
      </div>
      <button onClick={onOpenAccount}><Icon name={user ? "settings" : "user"} size={18} /> {user ? "Hesabı yönet" : "Giriş yap"}</button>
    </section>

    <section className="explorer-card">
      <div className="explorer-card-head"><span><Icon name="globe" size={23} /></span><div><small>DİJİTAL KAŞİF KARTI</small><strong>{level}</strong></div><button onClick={() => void shareCard()} aria-label="Kaşif kartını paylaş"><Icon name="share" size={18} /></button></div>
      <div className="explorer-stats"><div><strong>{visited.length}</strong><span>Ülke</span></div><div><strong>{routes.length}</strong><span>Rota</span></div><div><strong>{favorites.length}</strong><span>Favori</span></div></div>
      <div className="explorer-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{visited.length >= 30 ? "Dünya Gezgini seviyesindesin" : `${Math.max(0, 30 - visited.length)} ülke sonra Dünya Gezgini`}</small></div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>SEYAHAT PROFİLİN</span><h2>Kaşif alanın</h2></div></div>
      <div className="profile-action-list">
        <button onClick={() => setVisitedOpen(true)}><span><Icon name="flag" size={21} /></span><div><strong>Ziyaret ettiğim ülkeler</strong><small>{visited.length ? visited.map((item) => item.name).slice(0, 3).join(" · ") : "Haritana ilk ülkeyi ekle"}</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => onNavigate("trips")}><span><Icon name="suitcase" size={21} /></span><div><strong>Seyahatlerim</strong><small>Rotalar, aramalar ve fiyat alarmları</small></div><Icon name="chevron" size={17} /></button>
        <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/kasifler-ligi")}><span><Icon name="users" size={21} /></span><div><strong>Kaşifler Ligi</strong><small>Gezgin sıralaması ve topluluk</small></div><Icon name="external" size={16} /></button>
        <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/profil/dogrulamalar")}><span><Icon name="shield" size={21} /></span><div><strong>Belgeli Gezgin</strong><small>Seyahatlerini doğrula, rozetini kazan</small></div><Icon name="external" size={16} /></button>
      </div>
    </section>

    <section className="profile-section">
      <div className="section-heading"><div><span>UYGULAMA</span><h2>Ayarlar</h2></div></div>
      <div className="settings-card">
        <label><span><Icon name="bell" size={19} /><em><strong>Uygulama içi bildirimler</strong><small>Rota ve fiyat alarmı özetleri</small></em></span><input type="checkbox" checked={preferences.inAppNotifications} onChange={(event) => updatePreference("inAppNotifications", event.target.checked)} /></label>
        <label><span><Icon name="sparkles" size={19} /><em><strong>Dokunma titreşimi</strong><small>Desteklenen cihazlarda hafif geri bildirim</small></em></span><input type="checkbox" checked={preferences.haptics} onChange={(event) => updatePreference("haptics", event.target.checked)} /></label>
        <button onClick={onOpenRelease}><span><Icon name="info" size={19} /><em><strong>Sürüm yenilikleri</strong><small>Build 4 ile gelenleri gör</small></em></span><Icon name="chevron" size={17} /></button>
        <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/gizlilik-politikasi")}><span><Icon name="lock" size={19} /><em><strong>Gizlilik ve hesap</strong><small>Veri hakların ve politikalar</small></em></span><Icon name="external" size={16} /></button>
      </div>
      <p className="profile-version">LetsGo2Travel {config.appVersion} · Build 4</p>
    </section>

    <Sheet open={visitedOpen} title="Ziyaret ettiğim ülkeler" onClose={() => setVisitedOpen(false)} size="large">
      <div className="search-input"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ülke ara" /></div>
      <p className="visited-helper">Gittiğin ülkelere dokun. Bu liste yalnızca mevcut hesap alanında saklanır.</p>
      <div className="visited-country-list">
        {countries.map((country) => {
          const selected = visited.some((item) => item.alpha3 === country.alpha3);
          return <button className={selected ? "selected" : ""} key={country.alpha3} onClick={() => { toggleVisitedCountry(country, ownerId); setTick((value) => value + 1); }}><span><Icon name={selected ? "check" : "plus"} size={17} /></span><strong>{country.name}</strong><small>{country.alpha3}</small></button>;
        })}
      </div>
    </Sheet>
  </div>;
}
