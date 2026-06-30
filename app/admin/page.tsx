import Link from "next/link";
import LogoutButton from "./components/LogoutButton";
import { LayoutDashboard, BellRing, Settings, ShieldCheck, Users, Trophy, BarChart3 } from "lucide-react";

export default function AdminHome() {
  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" }}>
        <div>
          <p className="l2t-kicker" style={{ display: "flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={16} /> Admin Merkezi</p>
          <h1 style={{ fontSize: "2.8rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Letsgo2Travel Yönetim</h1>
          <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", margin: 0 }}>Sistem modüllerini, fırsatları ve ayarları yönetin.</p>
        </div>
        <LogoutButton />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
        <Link href="/admin/dashboard" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#e0e7ff", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Dashboard</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Bilet fırsatlarını yönet, metrikleri incele ve yeni uçuş fırsatları ekle.</p>
          <span style={{ color: "#4f46e5", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Panele Git &rarr;</span>
        </Link>

        <Link href="/admin/fiyat-alarmlari" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BellRing size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Fiyat Alarmları</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Kullanıcıların fiyat alarmlarını ve bülten (newsletter) aboneliklerini yönet.</p>
          <span style={{ color: "#d97706", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Alarmları Yönet &rarr;</span>
        </Link>

        <Link href="/admin/ayarlar" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#e2e8f0", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Settings size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Site Ayarları</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Affiliate linklerini (Travelpayouts, Aviasales vb.) ve sistem SEO ayarlarını güncelle.</p>
          <span style={{ color: "#475569", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Ayarları Aç &rarr;</span>
        </Link>

        <Link href="/admin/kullanicilar" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#d1fae5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Kullanıcı Yönetimi</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Kayıtlı kullanıcıları listele, yönet ve güvenli şifre sıfırlama işlemlerini yap.</p>
          <span style={{ color: "#059669", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Kullanıcıları Yönet &rarr;</span>
        </Link>

        <Link href="/admin/seyahat-dogrulama" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#ecfdf5", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Seyahat Doğrulama</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Kullanıcıların konum ve belge doğrulama taleplerini incele, onayla veya reddet.</p>
          <span style={{ color: "#10b981", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Doğrulamaları Aç &rarr;</span>
        </Link>



        <Link href="/admin/affiliate-raporlari" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#fff7ed", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BarChart3 size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Affiliate Raporları</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Uçak bileti, otel, eSIM ve tur yönlendirmelerinin tıklama performansını takip et.</p>
          <span style={{ color: "#ea580c", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Raporları Aç &rarr;</span>
        </Link>

        <Link href="/admin/kasifler-ligi" className="glass-panel hover-tilt" style={{ padding: "32px", borderRadius: "24px", background: "#fff", textDecoration: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#fef3c7", color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Kaşifler Ligi & Ödül</h3>
          <p style={{ margin: 0, color: "var(--l2t-soft)", lineHeight: "1.6" }}>Ayın Kaşifi kazananlarını yönet, liderlik tablosunu denetle ve şüpheli hesapları gizle.</p>
          <span style={{ color: "#F59E0B", fontWeight: "700", marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>Lig Yönetimi &rarr;</span>
        </Link>
      </div>
    </section>
  );
}
