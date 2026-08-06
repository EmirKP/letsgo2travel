import { useState } from "react";
import { config } from "../lib/config";
import { checkApiHealth } from "../lib/api";
import { openExternal } from "../lib/native";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

const links: Array<{ label: string; text: string; icon: IconName; url: string }> = [
  { label: "LetsGo2Travel web", text: "Tüm seyahat içerikleri", icon: "globe", url: "https://www.letsgo2travel.com.tr" },
  { label: "Rehber Merkezi", text: "Ülke ve seyahat rehberleri", icon: "map", url: "https://www.letsgo2travel.com.tr/rehber-merkezi" },
  { label: "Gezgin Forumu", text: "Sor, paylaş ve deneyim oku", icon: "users", url: "https://www.letsgo2travel.com.tr/forum" },
  { label: "Gizlilik Politikası", text: "Veri kullanım bilgileri", icon: "lock", url: "https://www.letsgo2travel.com.tr/gizlilik-politikasi" },
  { label: "Kullanım Şartları", text: "Hizmet koşulları", icon: "info", url: "https://www.letsgo2travel.com.tr/kullanim-sartlari" },
  { label: "Hesap ve veri silme", text: "Silme talebi ve diğer hakların", icon: "trash", url: "https://www.letsgo2travel.com.tr/veri-silme-ve-hak-talebi" },
];

export function MenuSheet({ open, onClose, online, onNotice }: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  onNotice: (message: string) => void;
}) {
  const [health, setHealth] = useState<"idle" | "checking" | "ok" | "partial" | "error">("idle");

  const testConnection = async () => {
    setHealth("checking");
    try {
      const result = await checkApiHealth();
      setHealth(result.ok ? "ok" : "partial");
      onNotice(result.ok ? "Web servisi ve veritabanı bağlantısı çalışıyor." : "Web servisi açık ancak bazı backend servisleri eksik.");
    } catch (error) {
      setHealth("error");
      onNotice(error instanceof Error ? error.message : "Bağlantı testi başarısız.");
    }
  };

  return <Sheet open={open} title="Daha Fazla" onClose={onClose} size="large">
    <div className="menu-profile-card">
      <div className="menu-brand">LetsGo<span>2</span>Travel</div>
      <p>Seyahat keşfi, pasaport bilgileri ve rota planlama tek uygulamada.</p>
      <div className={`connection-badge ${online ? "online" : "offline"}`}><Icon name={online ? "wifi" : "offline"} size={15} /> {online ? "İnternet bağlantısı var" : "Çevrimdışı mod"}</div>
    </div>

    <div className="menu-link-list">
      {links.map((link) => <button key={link.url} onClick={() => void openExternal(link.url)}><span><Icon name={link.icon} size={20} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="external" size={16} /></button>)}
      <button onClick={() => void openExternal(`mailto:${config.supportEmail}?subject=LetsGo2Travel%20Mobil%20Destek`)}><span><Icon name="mail" size={20} /></span><div><strong>Destek</strong><small>{config.supportEmail}</small></div><Icon name="chevron" size={16} /></button>
    </div>

    <section className="system-card">
      <div><small>SİSTEM DURUMU</small><strong>{health === "ok" ? "Tüm temel servisler hazır" : health === "partial" ? "Bazı servisler eksik" : health === "error" ? "Bağlantı kurulamadı" : "Bağlantıyı doğrula"}</strong></div>
      <button disabled={health === "checking" || !online} onClick={() => void testConnection()}>{health === "checking" ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} Test et</button>
    </section>
    <p className="version-note">Uygulama sürümü {config.appVersion} · API: {config.apiBaseUrl.replace(/^https?:\/\//, "")}</p>
  </Sheet>;
}
