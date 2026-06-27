import ClientPage from "./ClientPage";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";

export const dynamic = "force-dynamic";

function FallbackUI() {
  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px", paddingTop: "40px" }}>
      <div className="l2t-wrap" style={{ maxWidth: "600px", margin: "0 auto", padding: "0 20px" }}>
        <Link href="/forum" style={{ color: "#64748B", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "500" }}>
          <ArrowLeft size={16} /> Foruma Dön
        </Link>
        <div style={{ background: "#fff", padding: "48px 32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", textAlign: "center", border: "1px solid #e2e8f0" }}>
          <User size={64} color="var(--l2t-soft)" style={{ margin: "0 auto 24px" }} />
          <h1 style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px" }}>Giriş Yapmanız Gerekiyor</h1>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", fontSize: "1.05rem", lineHeight: "1.6" }}>
            Yeni bir konu açmak ve deneyimlerinizi toplulukla paylaşmak için lütfen giriş yapın veya ücretsiz kayıt olun.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth/login" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", padding: "14px 40px", fontSize: "1.1rem" }}>
              Giriş yap
            </Link>
            <Link href="/auth/register" className="l2t-btn" style={{ background: "#fff", color: "var(--l2t-navy)", border: "1px solid #e2e8f0", padding: "14px 40px", fontSize: "1.1rem" }}>
              Hesap oluştur
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewTopicServerPage() {
  return (
    <Suspense fallback={<FallbackUI />}>
      <ClientPage />
    </Suspense>
  );
}
