"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { KeyRound, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const [sessionExists, setSessionExists] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const captureSession = async () => {
      let activeSession = false;

      // 1. Check for PKCE 'code' in query params
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      
      if (code) {
        // Try manual exchange, but don't fail immediately if it errors (Supabase might have auto-exchanged it)
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          activeSession = true;
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // 2. Check current session (handles implicit flow #access_token AND auto-exchanged PKCE)
      if (!activeSession) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          activeSession = true;
          // Clear URL if it had tokens
          if (window.location.hash || window.location.search.includes('code=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      }

      if (activeSession && mounted) {
        setSessionExists(true);
        return;
      }

      // 3. Fallback: Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session && mounted) {
          setSessionExists(true);
          if (window.location.hash || window.location.search.includes('code=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      });

      // Timeout for invalid/expired links
      setTimeout(() => {
        if (mounted) {
          setSessionExists((prev) => (prev === null ? false : prev));
        }
      }, 1500);

      return () => {
        subscription.unsubscribe();
      };
    };

    captureSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sessionExists === false) {
      setStatus("error");
      setMessage("Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeniden şifre sıfırlama e-postası isteyin.");
      return;
    }

    if (!password || !confirmPassword) return;

    if (password.length < 8) {
      setStatus("error");
      setMessage("Şifre en az 8 karakter olmalı.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Şifreler eşleşmiyor.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password: password });

    if (error) {
      setStatus("error");
      setMessage(`Şifre güncellenirken bir hata oluştu: ${error.message}`);
    } else {
      setStatus("success");
      setMessage("Şifren güncellendi. Giriş yapabilirsin.");
    }
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
            background: "linear-gradient(135deg, #10B981, #059669)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(16,185,129,0.25)",
          }}>
            <KeyRound size={30} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.7rem", color: "#061433", fontWeight: "800", margin: "0 0 8px" }}>
            Yeni Şifre Belirle
          </h1>
          <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: 0 }}>
            Lütfen hesabın için en az 8 karakterli yeni bir şifre oluştur.
          </p>
        </div>

        {sessionExists === null ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--l2t-soft)" }}>
            Bağlantı kontrol ediliyor... Lütfen bekleyin.
          </div>
        ) : sessionExists === false ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626",
              padding: "16px", borderRadius: "12px", fontSize: "0.95rem", marginBottom: "24px"
            }}>
              Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.
            </div>
            <Link href="/sifremi-unuttum" className="l2t-btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Yeniden Bağlantı İste
            </Link>
          </div>
        ) : status === "success" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ background: "#dcfce3", color: "#065f46", padding: "16px", borderRadius: "16px", marginBottom: "24px", fontSize: "0.95rem", lineHeight: "1.5", fontWeight: "600" }}>
              <CheckCircle2 size={32} style={{ margin: "0 auto 12px" }} />
              {message}
            </div>
            <Link href="/auth/login" className="l2t-btn" style={{ width: "100%", display: "inline-block", padding: "14px", textDecoration: "none", background: "linear-gradient(135deg, #1476F2, #0f5ec9)" }}>
              Giriş Yap
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ position: "relative" }}>
              <KeyRound size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="password"
                placeholder="Yeni Şifre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%", padding: "14px 14px 14px 46px", borderRadius: "12px",
                  border: "1px solid #e2e8f0", fontSize: "1rem", outline: "none",
                  color: "var(--l2t-navy)", transition: "border-color 0.2s", boxSizing: "border-box"
                }}
                onFocus={(e) => (e.target.style.borderColor = "#10B981")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>

            <div style={{ position: "relative" }}>
              <KeyRound size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Yeni Şifre (Tekrar)"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                onFocus={(e) => (e.target.style.borderColor = "#10B981")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>

            {status === "error" && (
              <div style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#DC2626",
                padding: "12px 16px",
                borderRadius: "10px",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
                <AlertCircle size={16} />
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              style={{
                width: "100%",
                padding: "14px",
                background: status === "loading" ? "#94a3b8" : "linear-gradient(135deg, #10B981, #059669)",
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
              {status === "loading" ? "Güncelleniyor..." : <><span>Şifreyi Güncelle</span><ArrowRight size={20} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
