import { useState } from "react";
import { config } from "../lib/config";
import { openExternal } from "../lib/native";
import { useI18n } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";
import { LegalSheet, type LegalSlug } from "./LegalSheet";
import { Sheet } from "./Sheet";
import type { ViewId } from "../types";

// Yasal metinler artık UYGULAMA İÇİNDE okunur (tarayıcıya yönlendirme yok).
export function MenuSheet({ open, onClose, online, onNavigate, onOpenAccount }: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  onNavigate: (view: ViewId) => void;
  onOpenAccount: () => void;
}) {
  const { locale, copy } = useI18n();
  const [legalSlug, setLegalSlug] = useState<LegalSlug | null>(null);
  const nativeLinks: Array<{ label: string; text: string; icon: IconName; view: ViewId }> = [
    { label: copy("Etkinlik Radarı", "Event Radar"), text: copy("Konser, festival, spor ve kültür", "Concerts, festivals, sport and culture"), icon: "calendar", view: "events" },
    { label: copy("Seyahat Yardımcısı", "Travel Companion"), text: copy("Anlık öneri, ifadeler ve yerel kurallar", "Live ideas, phrases and local etiquette"), icon: "compass", view: "companion" },
    { label: copy("Pasaport Gücü", "Passport Power"), text: copy("Türkiye pasaportu için giriş koşulları", "Entry rules for a Turkish passport"), icon: "passport", view: "passport" },
    { label: copy("Rota Asistanı", "Route Assistant"), text: copy("Tercihlerine göre uygulamada plan oluştur", "Build a plan around your preferences"), icon: "route", view: "route" },
    { label: copy("Seyahat Kokpiti", "Travel Cockpit"), text: copy("Tarihlerini ve hazırlık listeni yönet", "Manage dates and preparation"), icon: "suitcase", view: "cockpit" },
    { label: copy("Fiyat Alarmı", "Price Alerts"), text: copy("Hedef fiyata düşünce haber al", "Know when the fare reaches your target"), icon: "bell", view: "alerts" },
    { label: copy("Topluluk", "Community"), text: copy("Gezgin soruları ve Kaşifler Ligi", "Traveller questions and Explorer League"), icon: "users", view: "community" },
  ];
  const legalSheets: Array<{ label: string; text: string; icon: IconName; slug: LegalSlug }> = [
    { label: copy("Gizlilik Politikası", "Privacy Policy"), text: copy("Veri kullanım bilgileri", "How data is used"), icon: "lock", slug: "gizlilik-politikasi" },
    { label: copy("Kullanım Şartları", "Terms of Use"), text: copy("Hizmet koşulları", "Service terms"), icon: "info", slug: "kullanim-sartlari" },
  ];

  const openNative = (view: ViewId) => {
    onClose();
    onNavigate(view);
  };

  return <Sheet open={open} title={copy("Daha Fazla", "More")} onClose={onClose} size="large">
    <div className="menu-profile-card">
      <div className="menu-brand">LetsGo<span>2</span>Travel</div>
      <p>{copy("Seyahat keşfi, planlama ve yol araçları tek uygulamada.", "Discovery, planning and on-trip tools in one app.")}</p>
      <div className={`connection-badge ${online ? "online" : "offline"}`}><Icon name={online ? "wifi" : "offline"} size={15} /> {online ? copy("İnternet bağlantısı var", "Online") : copy("Çevrimdışı mod", "Offline mode")}</div>
    </div>

    <p className="menu-section-label">{copy("UYGULAMA İÇİNDE", "IN THE APP")}</p>
    <div className="menu-link-list">
      {nativeLinks.map((link) => <button key={link.view} onClick={() => openNative(link.view)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16} /></button>)}
    </div>

    <p className="menu-section-label">{copy("DESTEK VE HUKUKİ", "SUPPORT & LEGAL")}</p>
    <div className="menu-link-list compact-links">
      {legalSheets.map((link) => <button key={link.slug} onClick={() => setLegalSlug(link.slug)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16} /></button>)}
      <button onClick={() => { onClose(); onOpenAccount(); }}><span><Icon name="trash" size={20} /></span><div><strong>{copy("Hesap ve veri silme", "Account & data deletion")}</strong><small>{copy("Hesap bölümünden uygulama içinde talep et", "Request it inside the account section")}</small></div><Icon name="chevron" size={16} /></button>
      <button onClick={() => void openExternal(`mailto:${config.supportEmail}?subject=LetsGo2Travel%20Mobile%20Support`)}><span><Icon name="mail" size={20} /></span><div><strong>{copy("Destek", "Support")}</strong><small>{config.supportEmail}</small></div><Icon name="chevron" size={16} /></button>
    </div>

    <p className="version-note">LetsGo2Travel {config.appVersion} · Build {config.buildNumber} · {locale.toUpperCase()}</p>

    {legalSlug && <LegalSheet open={Boolean(legalSlug)} slug={legalSlug} onClose={() => setLegalSlug(null)} />}
  </Sheet>;
}
