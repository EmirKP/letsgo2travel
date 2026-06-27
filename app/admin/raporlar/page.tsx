import Link from "next/link";
import { ArrowLeft, Flag, AlertTriangle } from "lucide-react";

export default function AdminReportsPage() {
  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "60px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", background: "#fff", padding: "48px", borderRadius: "24px", boxShadow: "0 24px 50px rgba(0,0,0,0.05)", maxWidth: "500px", margin: "0 auto" }}>
        <div style={{ width: "80px", height: "80px", background: "linear-gradient(135deg, #EF4444, #B91C1C)", borderRadius: "20px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "#fff" }}>
          <Flag size={40} />
        </div>
        <h1 style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", marginBottom: "16px", fontWeight: "800" }}>Raporlanan İçerikler</h1>
        
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "16px", borderRadius: "0 12px 12px 0", marginBottom: "32px", display: "flex", gap: "12px", textAlign: "left" }}>
          <AlertTriangle size={24} color="#D97706" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, color: "#92400E", fontSize: "0.95rem", lineHeight: "1.5" }}>
            <strong>Supabase Migration Bekleniyor:</strong> Raporların gösterilmesi ve yönetilmesi için `supabase_migrations.sql` dosyasındaki tabloların veritabanına uygulanması gerekmektedir.
          </p>
        </div>

        <Link href="/admin/dashboard" className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <ArrowLeft size={18} /> Dashboard'a Dön
        </Link>
      </div>
    </div>
  );
}
