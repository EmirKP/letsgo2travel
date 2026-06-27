"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSupabaseAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (profile && ['moderator', 'editor', 'admin', 'super_admin'].includes(profile.role)) {
          // Set cookie and bypass
          document.cookie = "admin_session=true; path=/; max-age=86400";
          window.location.href = "/admin";
        }
      }
    };
    checkSupabaseAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        window.location.href = "/admin";
      } else {
        setError(data.error || "Giriş başarısız.");
        setLoading(false);
      }
    } catch {
      setError("Sunucu hatası. Tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #061433 0%, #0f2460 100%)",
      padding: "20px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "#fff",
        borderRadius: "24px",
        padding: "48px 40px",
        boxShadow: "0 40px 80px rgba(0,0,0,0.3)",
      }}>
        {/* Logo / İkon */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            width: "72px",
            height: "72px",
            background: "linear-gradient(135deg, #1476F2, #0f5ec9)",
            borderRadius: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(20,118,242,0.3)",
          }}>
            <Shield size={36} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.6rem", color: "#061433", fontWeight: "800", margin: "0 0 8px" }}>
            Yönetici Girişi
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
            LetsGo2Travel Admin Paneli
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ position: "relative" }}>
            <Lock size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="password"
              placeholder="Admin Şifresi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              style={{
                width: "100%",
                padding: "14px 14px 14px 46px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "1rem",
                outline: "none",
                color: "#061433",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#1476F2")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          {error && (
            <div style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              color: "#DC2626",
              padding: "12px 16px",
              borderRadius: "10px",
              fontSize: "0.875rem",
              textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%",
              padding: "14px",
              background: loading ? "#94a3b8" : "linear-gradient(135deg, #1476F2, #0f5ec9)",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              fontSize: "1rem",
              fontWeight: "700",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              marginTop: "8px",
            }}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "0.8rem", color: "#cbd5e1" }}>
          Bu alan yalnızca yetkili yöneticiler içindir.
        </p>
      </div>
    </div>
  );
}
