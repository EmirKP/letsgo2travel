"use client";

import Link from "next/link";
import { useState } from "react";
import { User, Lock, Mail, ArrowRight, Plane, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl}/auth/callback`,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err: any) {
      console.error(err);
      setError("Google ile kayıt başlatılamadı. Lütfen tekrar deneyin.");
      setIsGoogleLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, username: username },
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        setError("Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin.");
      } else {
        setError("Kayıt başarısız: " + authError.message);
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #F0FFF4 0%, #DCFCE7 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}>
        <div style={{
          textAlign: "center",
          background: "#fff",
          borderRadius: "24px",
          padding: "48px 40px",
          maxWidth: "420px",
          boxShadow: "0 20px 60px rgba(16,185,129,0.1)",
        }}>
          <div style={{
            width: "72px",
            height: "72px",
            background: "#10B981",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <CheckCircle size={40} color="#fff" />
          </div>
          <h2 style={{ color: "#065F46", fontSize: "1.5rem", fontWeight: "800", margin: "0 0 12px" }}>
            Hesabın Oluşturuldu!
          </h2>
          <p style={{ color: "#6B7280", marginBottom: "32px" }}>
            Kaydını onaylamak için e-posta adresine bir doğrulama linki gönderdik. Lütfen e-postanı kontrol et.
          </p>
          <Link
            href="/auth/login"
            style={{
              display: "inline-block",
              background: "#10B981",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: "12px",
              fontWeight: "700",
              textDecoration: "none",
            }}
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

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
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            background: "linear-gradient(135deg, #1476F2, #0f5ec9)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(20,118,242,0.25)",
          }}>
            <Plane size={30} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.7rem", color: "#061433", fontWeight: "800", margin: "0 0 8px" }}>
            Hesap Oluştur
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
            Letsgo2Travel topluluğuna katıl.
          </p>
        </div>

        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Name */}
          <div style={{ position: "relative" }}>
            <User size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              required
              placeholder="Ad Soyad"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              onFocus={(e) => (e.target.style.borderColor = "#1476F2")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          {/* Username */}
          <div style={{ position: "relative" }}>
            <User size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              required
              placeholder="Kullanıcı Adı"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              onFocus={(e) => (e.target.style.borderColor = "#1476F2")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          {/* Email */}
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
              onFocus={(e) => (e.target.style.borderColor = "#1476F2")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          {/* Password */}
          <div style={{ position: "relative" }}>
            <Lock size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="password"
              required
              placeholder="Şifre (en az 6 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              onFocus={(e) => (e.target.style.borderColor = "#1476F2")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          {/* Error */}
          {error && (
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
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isGoogleLoading}
            style={{
              width: "100%",
              padding: "14px",
              background: loading || isGoogleLoading ? "#94a3b8" : "linear-gradient(135deg, #1476F2, #0f5ec9)",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              fontSize: "1rem",
              fontWeight: "700",
              cursor: loading || isGoogleLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s",
              marginTop: "8px",
            }}
          >
            {loading ? "Oluşturuluyor..." : <><span>Hesap Oluştur</span><ArrowRight size={20} /></>}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }}></div>
          <span style={{ padding: "0 12px", color: "#94a3b8", fontSize: "0.85rem", fontWeight: "600" }}>VEYA</span>
          <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }}></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading || isGoogleLoading}
          style={{
            width: "100%",
            padding: "14px",
            background: "#fff",
            color: "#334155",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            fontSize: "1rem",
            fontWeight: "600",
            cursor: loading || isGoogleLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            transition: "all 0.2s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          }}
          onMouseOver={(e) => {
            if (!loading && !isGoogleLoading) e.currentTarget.style.background = "#f8fafc";
          }}
          onMouseOut={(e) => {
            if (!loading && !isGoogleLoading) e.currentTarget.style.background = "#fff";
          }}
        >
          {isGoogleLoading ? (
            <span style={{ color: "#64748B" }}>Yönlendiriliyor...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Google ile devam et</span>
            </>
          )}
        </button>

        <div style={{ textAlign: "center", marginTop: "32px", fontSize: "0.9rem", color: "#94a3b8" }}>
          Zaten hesabın var mı?{" "}
          <Link href="/auth/login" style={{ color: "#1476F2", fontWeight: "700", textDecoration: "none" }}>
            Giriş Yap
          </Link>
        </div>
      </div>
    </div>
  );
}
