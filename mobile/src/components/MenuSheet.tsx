import { useState } from "react";
import { config } from "../lib/config";
import { openExternal } from "../lib/native";
import { Icon, type IconName } from "./Icon";
import { LegalSheet, type LegalSlug } from "./LegalSheet";
import { Sheet } from "./Sheet";
import type { ViewId } from "../types";

const nativeLinks: Array<{ label: string; text: string; icon: IconName; view: ViewId }> = [
  { label: "Pasaport Gücü", text: "Türkiye pasaportu için giriş koşulları", icon: "passport", view: "passport" },
  { label: "Rota Asistanı", text: "Tercihlerine göre uygulamada plan oluştur", icon: "route", view: "route" },
  { label: "Seyahat Kokpiti", text: "Tarihlerini ve hazırlık listeni yönet", icon: "suitcase", view: "cockpit" },
  { label: "Fiyat Alarmı", text: "Hedef fiyata düşünce haber al", icon: "bell", view: "alerts" },
  { label: "Topluluk", text: "Gezgin soruları ve Kaşifler Ligi", icon: "users", view: "community" },
];

// Yasal metinler artık UYGULAMA İÇİNDE okunur (tarayıcıya yönlendirme yok).
const legalSheets: Array<{ label: string; text: string; icon: IconName; slug: LegalSlug }> = [
  { label: "Gizlilik Politikası", text: "Veri kullanım bilgileri", icon: "lock", slug: "gizlilik-politikasi" },
  { label: "Kullanım Şartları", text: "Hizmet koşulları", icon: "info", slug: "kullanim-sartlari" },
];

export function MenuSheet({ open, onClose, online, onNavigate, onOpenAccount }: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  onNavigate: (view: ViewId) => void;
  onOpenAccount: () => void;
}) {
  const [legalSlug, setLegalSlug] = useState<LegalSlug | null>(null);

  const openNative = (view: ViewId) => {
    onClose();
    onNavigate(view);
  };

  return <Sheet open={open} title="Daha Fazla" onClose={onClose} size="large">
    <div className="menu-profile-card">
      <div className="menu-brand">LetsGo<span>2</span>Travel</div>
      <p>Seyahat keşfi, pasaport bilgileri ve rota planlama tek uygulamada.</p>
      <div className={`connection-badge ${online ? "online" : "offline"}`}><Icon name={online ? "wifi" : "offline"} size={15} /> {online ? "İnternet bağlantısı var" : "Çevrimdışı mod"}</div>
    </div>

    <p className="menu-section-label">UYGULAMA İÇİNDE</p>
    <div className="menu-link-list">
      {nativeLinks.map((link) => <button key={link.view} onClick={() => openNative(link.view)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16} /></button>)}
    </div>

    <p className="menu-section-label">DESTEK VE HUKUKİ</p>
    <div className="menu-link-list compact-links">
      {legalSheets.map((link) => <button key={link.slug} onClick={() => setLegalSlug(link.slug)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16} /></button>)}
      <button onClick={() => { onClose(); onOpenAccount(); }}><span><Icon name="trash" size={20} /></span><div><strong>Hesap ve veri silme</strong><small>Hesap bölümünden uygulama içinde talep et</small></div><Icon name="chevron" size={16} /></button>
      <button onClick={() => void openExternal(`mailto:${config.supportEmail}?subject=LetsGo2Travel%20Mobil%20Destek`)}><span><Icon name="mail" size={20} /></span><div><strong>Destek</strong><small>{config.supportEmail}</small></div><Icon name="chevron" size={16} /></button>
    </div>

    <p className="version-note">LetsGo2Travel {config.appVersion} · Build {config.buildNumber}</p>

    {legalSlug && <LegalSheet open={Boolean(legalSlug)} slug={legalSlug} onClose={() => setLegalSlug(null)} />}
  </Sheet>;
}
