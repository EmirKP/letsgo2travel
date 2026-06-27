import ClientPage from "./ClientPage";
import { Suspense } from "react";
import Link from "next/link";
import { User, MapPin, Bell } from "lucide-react";

export const dynamic = "force-dynamic";

function ProfilFallback() {
  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px", paddingTop: "40px" }}>
      <div className="l2t-wrap" style={{ maxWidth: "600px", margin: "0 auto", padding: "0 20px" }}>
        <div style={{ background: "#fff", padding: "48px 32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", textAlign: "center", border: "1px solid #e2e8f0" }}>
          <User size={64} color="var(--l2t-soft)" style={{ margin: "0 auto 24px" }} />
          <h1 style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px" }}>Gezgin</h1>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", fontSize: "1.05rem", lineHeight: "1.6" }}>
            Seyahatlerini planlamak için giriş yap.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginBottom: "40px" }}>
            <Link href="/auth/login" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", padding: "14px 40px", fontSize: "1.1rem" }}>
              Giriş yap
            </Link>
            <Link href="/auth/register" className="l2t-btn" style={{ background: "#fff", color: "var(--l2t-navy)", border: "1px solid #e2e8f0", padding: "14px 40px", fontSize: "1.1rem" }}>
              Hesap oluştur
            </Link>
          </div>
          
          <div style={{ textAlign: "left", marginTop: "40px" }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", marginBottom: "16px", fontWeight: "700" }}>Premium Özellikler</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "16px", opacity: 0.7 }}>
                <div style={{ width: "48px", height: "48px", background: "#e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={24} color="#94a3b8" />
                </div>
                <div>
                  <strong style={{ display: "block", color: "var(--l2t-navy)", fontSize: "1.05rem" }}>Özel Rotalar</strong>
                  <span style={{ fontSize: "0.9rem", color: "var(--l2t-soft)" }}>Kaydettiğin rotaları görmek için giriş yap.</span>
                </div>
              </div>

              <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "16px", opacity: 0.7 }}>
                <div style={{ width: "48px", height: "48px", background: "#e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={24} color="#94a3b8" />
                </div>
                <div>
                  <strong style={{ display: "block", color: "var(--l2t-navy)", fontSize: "1.05rem" }}>Fiyat Alarmları</strong>
                  <span style={{ fontSize: "0.9rem", color: "var(--l2t-soft)" }}>Bilet fiyatları düştüğünde haberin olsun.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilServerPage() {
  return (
    <Suspense fallback={<ProfilFallback />}>
      <ClientPage />
    </Suspense>
  );
}
