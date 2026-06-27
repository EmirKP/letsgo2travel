"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    setMessage("");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/sifre-yenile`,
    });

    if (error) {
      // For security, do not reveal if email exists or not. Show a generic success message or handled error.
      console.error(error.message); // Only for debugging but in production we can hide this.
    }

    // Always show a generic success message to prevent email enumeration
    setStatus("success");
    setMessage("Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Lütfen gelen kutunu (ve gerekiyorsa spam klasörünü) kontrol et.");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #F8FBFF 0%, #EEF4FF 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "#fff",
        borderRadius: "24px",
        padding: "48px 40px",
        boxShadow: "0 20px 60px rgba(20,118,242,0.08)",
        border: "1px solid rgba(20,118,242,0.08)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(245,158,11,0.25)",
          }}>
            <Lock size={30} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.7rem", color: "#061433", fontWeight: "800", margin: "0 0 8px" }}>
            Şifremi Unuttum
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
            Kayıtlı olduğun e-posta adresini gir. Sana şifre sıfırlama linki göndereceğiz.
          </p>
        </div>

        {status === "success" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ background: "#dcfce3", color: "#065f46", padding: "16px", borderRadius: "16px", marginBottom: "24px", fontSize: "0.95rem", lineHeight: "1.5" }}>
              <CheckCircle2 size={32} style={{ margin: "0 auto 12px" }} />
              {message}
            </div>
            <Link href="/auth/login" className="l2t-btn" style={{ width: "100%", display: "inline-block", padding: "14px", textDecoration: "none" }}>
              Giriş Ekranına Dön
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ position: "relative" }}>
              <Mail size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="email"
                required
                placeholder="E-posta adresi"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px 14px 14px 46px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  fontSize: "1rem",
                  outline: "none",
                  color: "#061433",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#f59e0b")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              style={{
                width: "100%",
                padding: "14px",
                background: status === "loading" ? "#94a3b8" : "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontSize: "1rem",
                fontWeight: "700",
                cursor: status === "loading" ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s",
                marginTop: "8px",
              }}
            >
              {status === "loading" ? "Gönderiliyor..." : <><span>Sıfırlama Linki Gönder</span><ArrowRight size={20} /></>}
            </button>
          </form>
        )}

        {status !== "success" && (
          <div style={{ textAlign: "center", marginTop: "32px", fontSize: "0.9rem", color: "#94a3b8" }}>
            Hatırladın mı?{" "}
            <Link href="/auth/login" style={{ color: "#1476F2", fontWeight: "700", textDecoration: "none" }}>
              Giriş Yap
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
