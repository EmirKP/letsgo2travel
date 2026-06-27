"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { Flag, X, AlertTriangle, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";

type ReportModalProps = {
  targetId: string;
  targetType: "topic" | "reply";
};

export default function ForumReportButton({ targetId, targetType }: ReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOpen = () => {
    if (!session) {
      alert("İçerik raporlamak için giriş yapmalısınız.");
      window.location.href = "/auth/login";
      return;
    }
    setIsOpen(true);
    setSuccess(null);
    setError(null);
    setReason("");
  };

  const handleClose = () => {
    setIsOpen(false);
    if (success) {
      // Başarılıysa butonu "Raporlandı" olarak işaretleyebiliriz ama şimdilik state resetliyoruz
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason) {
      setError("Lütfen bir rapor nedeni seçin.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Önce bu kullanıcının bu içeriği daha önce raporlayıp raporlamadığını kontrol edebiliriz
      // Ancak DB table "forum_reports" yoksa crash olmaması için doğrudan insert deneyelim
      // ve hata durumunda exception yakalayalım.

      const { error: dbError } = await supabase.from("forum_reports").insert([
        {
          target_id: targetId,
          target_type: targetType,
          user_id: session.user.id,
          reason: reason,
          status: "open" // Rapor varsayılan olarak açık/beklemede
        }
      ]);

      if (dbError) {
        if (dbError.code === "42P01") {
          setError("Raporlama altyapısı şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.");
        } else if (dbError.code === "23505") { // Unique constraint violation
          setError("Bu içeriği zaten raporladınız.");
        } else {
          console.error("Supabase error:", dbError);
          setError("Raporun şu anda kaydedilemedi. Forum veri altyapısı aktif hale getirildikten sonra tekrar deneyebilirsin.");
        }
      } else {
        setSuccess("Raporunuz incelenmek üzere gönderildi. Topluluğa katkınız için teşekkürler.");
      }
    } catch (err: any) {
      setError("Bağlantı hatası oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reportReasons = [
    "Spam",
    "Hakaret / Küfür",
    "Yanıltıcı Bilgi",
    "Dolandırıcılık Şüphesi",
    "Yasa Dışı Yönlendirme",
    "Kişisel Veri Paylaşımı",
    "Diğer"
  ];

  return (
    <>
      <button 
        onClick={handleOpen}
        style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", transition: "color 0.2s" }} 
        className="hover-text-red"
        title="Rapor Et"
      >
        <Flag size={14} /> Rapor Et
      </button>

      {isOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "500px", borderRadius: "24px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldAlert size={20} color="#EF4444" /> İçeriği Rapor Et
              </h3>
              <button onClick={handleClose} style={{ background: "#f1f5f9", border: "none", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748B" }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px" }}>
              {success ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <CheckCircle2 size={48} color="#10B981" style={{ margin: "0 auto 16px" }} />
                  <h4 style={{ color: "var(--l2t-navy)", fontSize: "1.2rem", fontWeight: "700", marginBottom: "8px" }}>Rapor Gönderildi</h4>
                  <p style={{ color: "var(--l2t-soft)", margin: 0, lineHeight: "1.6" }}>{success}</p>
                  <button onClick={handleClose} className="l2t-btn" style={{ background: "var(--l2t-navy)", color: "#fff", width: "100%", marginTop: "24px" }}>Kapat</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <p style={{ color: "var(--l2t-soft)", marginBottom: "20px", fontSize: "0.95rem", lineHeight: "1.5" }}>
                    Lütfen bu içeriğin topluluk kurallarımızı neden ihlal ettiğini düşünüyorsanız ilgili nedeni seçin.
                  </p>

                  {error && (
                    <div style={{ background: "#FEF2F2", borderLeft: "4px solid #EF4444", padding: "12px", borderRadius: "0 8px 8px 0", marginBottom: "20px", color: "#991B1B", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
                      <AlertTriangle size={16} /> {error}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
                    {reportReasons.map((r) => (
                      <label key={r} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: reason === r ? "#EFF6FF" : "#F8FAFC", border: `1px solid ${reason === r ? "var(--l2t-blue)" : "#e2e8f0"}`, borderRadius: "12px", cursor: "pointer", transition: "all 0.2s" }}>
                        <input 
                          type="radio" 
                          name="reportReason" 
                          value={r} 
                          checked={reason === r} 
                          onChange={() => setReason(r)}
                          style={{ accentColor: "var(--l2t-blue)", width: "18px", height: "18px" }}
                        />
                        <span style={{ color: "var(--l2t-navy)", fontWeight: reason === r ? "600" : "500" }}>{r}</span>
                      </label>
                    ))}
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSubmitting || !reason}
                    className="l2t-btn" 
                    style={{ background: "#EF4444", color: "#fff", width: "100%", border: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", opacity: (isSubmitting || !reason) ? 0.6 : 1, cursor: (isSubmitting || !reason) ? "not-allowed" : "pointer" }}
                  >
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : "Raporu Gönder"}
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
