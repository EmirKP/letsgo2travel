"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";
import { Send, AlertTriangle, ShieldCheck, Loader2, User } from "lucide-react";
import Link from "next/link";

export default function ForumReplyForm({ topicId, topicTitle }: { topicId: string, topicTitle?: string }) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!session) {
      setError("Cevap yazmak için giriş yapmalısın.");
      return;
    }

    if (content.trim().length < 3) {
      setError("Cevabınız en az 3 karakter olmalıdır.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase.from("forum_replies").insert([
        {
          topic_id: topicId,
          user_id: session.user.id,
          author_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || "GizliKullanıcı",
          content: content.trim(),
          status: "pending" // Varsayılan beklemede durumu
        }
      ]);

      if (dbError) {
        // Tablo yoksa genelde 42P01 hatası döner
        if (dbError.code === "42P01") {
          setError("Forum cevap altyapısı şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.");
        } else {
          console.error("Supabase error:", dbError);
          setError("Forum cevap altyapısı şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.");
        }
      } else {
        setSuccess("Cevabın başarıyla gönderildi ve onay sırasına alındı.");
        setContent("");
      }
    } catch (err: any) {
      setError("Bağlantı hatası oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div style={{ background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", textAlign: "center" }}>
        <Loader2 size={32} color="var(--l2t-blue)" className="animate-spin" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", textAlign: "center", border: "1px solid #e2e8f0" }}>
        <User size={48} color="var(--l2t-soft)" style={{ margin: "0 auto 16px" }} />
        <h4 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "700", marginBottom: "8px" }}>Söyleyeceklerin mi var?</h4>
        <p style={{ color: "var(--l2t-soft)", marginBottom: "24px", fontSize: "0.95rem" }}>Cevap yazmak ve bu konuya katkıda bulunmak için giriş yapmalısın.</p>
        <Link href="/auth/login" className="l2t-btn" style={{ display: "inline-flex", background: "var(--l2t-navy)", color: "#fff", padding: "12px 32px" }}>
          Giriş Yap / Kayıt Ol
        </Link>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", border: "1px solid #e2e8f0" }}>
      <h4 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        Cevap Yaz
      </h4>
      
      {/* Kişisel Veri Uyarısı */}
      <div style={{ background: "#F0FDF4", borderLeft: "4px solid #10B981", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
        <ShieldCheck size={20} color="#059669" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, color: "#065F46", fontSize: "0.85rem", fontWeight: "500", lineHeight: "1.4" }}>
          Lütfen telefon, kimlik, pasaport numarası veya özel adres gibi kişisel bilgilerini forumda paylaşma. Topluluk kurallarına uyduğun için teşekkürler!
        </p>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", borderLeft: "4px solid #EF4444", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: "20px", color: "#991B1B", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {success && (
        <div style={{ background: "#ECFDF5", borderLeft: "4px solid #10B981", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: "20px", color: "#065F46", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={18} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <textarea 
          placeholder="Bu konu hakkında kendi deneyimini veya tavsiyeni paylaş..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isSubmitting}
          style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", outline: "none", fontSize: "1rem", color: "var(--l2t-navy)", minHeight: "140px", resize: "vertical", fontFamily: "inherit", marginBottom: "16px", transition: "border-color 0.2s", background: isSubmitting ? "#f8fafc" : "#fff" }}
        ></textarea>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>En az 3 karakter</span>
          <button 
            type="submit" 
            disabled={isSubmitting || content.trim().length < 3}
            className="l2t-btn" 
            style={{ background: "var(--l2t-blue)", color: "#fff", padding: "12px 32px", border: "none", borderRadius: "100px", fontSize: "1rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px", opacity: (isSubmitting || content.trim().length < 3) ? 0.6 : 1, cursor: (isSubmitting || content.trim().length < 3) ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {isSubmitting ? "Gönderiliyor..." : "Cevabı Gönder"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Dummy checkcircle icon component missing from imports
const CheckCircle2 = ({size, className}:any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
);
