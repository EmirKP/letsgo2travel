import Link from "next/link";
import { siteSettings, withUtm } from "@/lib/affiliate";

export default function Footer() {
  return (
    <footer className="l2t-footer">
      <div className="l2t-wrap l2t-footer-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr", gap: "2rem" }}>
        <div>
          <img src="/logo.png" alt="Letsgo2Travel" className="l2t-footer-logo" />
          <p className="l2t-muted" style={{ marginBottom: "12px", maxWidth: "400px" }}>
            Uçak bileti fırsatları, vizesiz rotalar, otel, eSIM ve aktiviteleri tek yerde toplayan modern seyahat asistanı.
          </p>
          <p className="l2t-disclaimer" style={{ marginTop: "12px", padding: "12px", background: "rgba(0,0,0,0.05)", borderRadius: "8px", fontSize: "0.8rem", lineHeight: "1.5", maxWidth: "400px" }}>
            🤝 LetsGo2Travel bazı bağlantılardan komisyon kazanabilir. Bu, kullanıcıya ek maliyet oluşturmaz.
          </p>
        </div>
        <div>
          <h3>Keşfet</h3>
          <Link href="/">Bilet Ara</Link>
          <Link href="/kampanyalar">Fırsatlar</Link>
          <Link href="/vizesiz-ulkeler">Vizesiz Ülkeler</Link>
          <Link href="/akilli-plan">AI Planlayıcı</Link>
          <Link href="/forum">Forum</Link>
        </div>
        <div>
          <h3>Partnerler</h3>
          <a href={withUtm(siteSettings.bookingAffiliateUrl)} target="_blank" rel="noreferrer">Oteller (Booking)</a>
          <a href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer">eSIM (Airalo)</a>
          <a href={withUtm(siteSettings.getYourGuideAffiliateUrl)} target="_blank" rel="noreferrer">Tur & Aktivite</a>
        </div>
      </div>
      <div className="l2t-wrap" style={{ paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", fontSize: "0.8rem", color: "var(--l2t-muted)" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Link href="/kvkk-aydinlatma-metni">KVKK</Link>
          <Link href="/acik-riza-metni">Açık Rıza</Link>
          <Link href="/gizlilik-politikasi">Gizlilik</Link>
          <Link href="/kullanim-sartlari">Kullanım Şartları</Link>
          <Link href="/topluluk-kurallari">Topluluk Kuralları</Link>
        </div>
        <span>© {new Date().getFullYear()} LetsGo2Travel. Tüm hakları saklıdır.</span>
      </div>
    </footer>
  );
}
