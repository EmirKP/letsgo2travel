import { config } from "../lib/config";
import { openExternal } from "../lib/native";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";
import type { ViewId } from "../types";

const nativeLinks: Array<{ label: string; text: string; icon: IconName; view: ViewId }> = [
  { label: "Pasaport Gücü", text: "Türkiye pasaportu için giriş koşulları", icon: "passport", view: "passport" },
  { label: "Rota Asistanı", text: "Tercihlerine göre uygulamada plan oluştur", icon: "route", view: "route" },
  { label: "Seyahat Kokpiti", text: "Tarihlerini ve hazırlık listeni yönet", icon: "suitcase", view: "cockpit" },
  { label: "Fiyat Alarmı", text: "Hedef fiyata düşünce haber al", icon: "bell", view: "alerts" },
  { label: "Kaşifler Ligi", text: "Gerçek gezginlerden ilham al", icon: "users", view: "community" },
];

const legalLinks: Array<{ label: string; text: string; icon: IconName; url: string }> = [
  { label: "Gizlilik Politikası", text: "Veri kullanım bilgileri", icon: "lock", url: "https://www.letsgo2travel.com.tr/gizlilik-politikasi" },
  { label: "Kullanım Şartları", text: "Hizmet koşulları", icon: "info", url: "https://www.letsgo2travel.com.tr/kullanim-sartlari" },
  { label: "Hesap ve veri silme", text: "Silme talebi ve diğer hakların", icon: "trash", url: "https://www.letsgo2travel.com.tr/veri-silme-ve-hak-talebi" },
];

export function MenuSheet({ open, onClose, online, onNavigate }: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  onNavigate: (view: ViewId) => void;
}) {
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
      {legalLinks.map((link) => <button key={link.url} onClick={() => void openExternal(link.url)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text} · Tarayıcıda açılır</small></div><Icon name="external" size={16} /></button>)}
      <button onClick={() => void openExternal(`mailto:${config.supportEmail}?subject=LetsGo2Travel%20Mobil%20Destek`)}><span><Icon name="mail" size={20} /></span><div><strong>Destek</strong><small>{config.supportEmail}</small></div><Icon name="chevron" size={16} /></button>
    </div>

    <p className="version-note">LetsGo2Travel {config.appVersion} · Build {config.buildNumber}</p>
  </Sheet>;
}
