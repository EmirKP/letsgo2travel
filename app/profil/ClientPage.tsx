"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, Heart, Bell, Settings, LogOut, ChevronRight, Sparkles, Map, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export default function ProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [userRole, setUserRole] = useState("user");
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        
        try {
          const { data: profile, error } = await supabase.from("profiles").select("role, username").eq("id", session.user.id).single();
          
          if (error) {
            const { data: fallbackProfile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
            if (fallbackProfile) {
              setUserRole(fallbackProfile.role);
            }
          } else if (profile) {
            setUserRole(profile.role);
            setUser((prev: any) => ({ ...prev, username: profile.username }));
          }
        } catch (e) {
           console.error("Profile fetch error", e);
        }
      }
    };
    checkUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  };

  if (!user) {
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
            
            {/* Kilitli Kartlar */}
            <div style={{ textAlign: "left", marginTop: "40px" }}>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", marginBottom: "16px", fontWeight: "700" }}>Premium Özellikler</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Rota */}
                <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "16px", opacity: 0.7 }}>
                  <div style={{ width: "48px", height: "48px", background: "#e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MapPin size={24} color="#94a3b8" />
                  </div>
                  <div>
                    <strong style={{ display: "block", color: "var(--l2t-navy)", fontSize: "1.05rem" }}>Özel Rotalar</strong>
                    <span style={{ fontSize: "0.9rem", color: "var(--l2t-soft)" }}>Kaydettiğin rotaları görmek için giriş yap.</span>
                  </div>
                </div>

                {/* Alarm */}
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

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "100vh", padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      
      {/* Profil Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px", padding: "24px", background: "#fff", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.04)", border: "1px solid #f1f5f9" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: user ? "linear-gradient(135deg, #1476f2, #0A1F4A)" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <User size={32} color={user ? "#fff" : "#94a3b8"} />
        </div>
        <div style={{ flex: 1 }}>
          {user ? (
            <>
              <h1 style={{ fontSize: "1.3rem", margin: "0 0 4px", color: "var(--l2t-navy)", fontWeight: "800" }}>
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </h1>
              <p style={{ margin: "0 0 4px", color: "var(--l2t-soft)", fontSize: "0.9rem" }}>{user.email}</p>
              <p style={{ margin: 0, color: "var(--l2t-blue)", fontSize: "0.85rem", fontWeight: "600" }}>
                @{user.username || "Belirtilmemiş"}
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: "1.3rem", margin: "0 0 4px", color: "var(--l2t-navy)", fontWeight: "800" }}>
                Gezgin
              </h1>
              <p style={{ margin: 0, color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Seyahatlerini planlamak için giriş yap</p>
            </>
          )}
        </div>
      </div>

      {!user && (
        <div style={{ marginBottom: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <Link href="/auth/login" className="l2t-btn" style={{ width: "100%", padding: "14px", display: "flex", justifyContent: "center", fontSize: "1.05rem" }}>
            E-posta ile Giriş Yap / Kayıt Ol
          </Link>

          <button
            onClick={async () => {
              setIsGoogleLoading(true);
              try {
                const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: `${siteUrl}/auth/callback` },
                });
              } catch (err) {
                console.error(err);
                setIsGoogleLoading(false);
              }
            }}
            disabled={isGoogleLoading}
            style={{
              width: "100%",
              padding: "14px",
              background: "#fff",
              color: "#334155",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              fontSize: "1.05rem",
              fontWeight: "600",
              cursor: isGoogleLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              transition: "all 0.2s",
              boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
            }}
            onMouseOver={(e) => {
              if (!isGoogleLoading) e.currentTarget.style.background = "#f8fafc";
            }}
            onMouseOut={(e) => {
              if (!isGoogleLoading) e.currentTarget.style.background = "#fff";
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
        </div>
      )}

      {!user && (
        <div style={{ marginTop: "32px" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--l2t-soft)", marginBottom: "16px", fontWeight: "600", textAlign: "center" }}>Giriş yapanlara özel özellikler:</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { emoji: "🗺️", title: "Seyahat Haritan", desc: "Ziyaret ettiğin ülkeleri işaretle" },
              { emoji: "❤️", title: "Favori Rotalar", desc: "Rotalarını kaydet" },
              { emoji: "🔔", title: "Fiyat Alarmları", desc: "Düşen fiyatta bildirim al" },
              { emoji: "🏆", title: "Kaşifler Ligi", desc: "Gezginlerle yarış" },
            ].map((item, i) => (
              <div key={i} style={{ background: "#f8fafc", borderRadius: "16px", padding: "16px", border: "1px solid #e2e8f0", opacity: 0.7 }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>{item.emoji}</div>
                <div style={{ fontWeight: "700", fontSize: "0.95rem", color: "var(--l2t-navy)", marginBottom: "4px" }}>{item.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--l2t-soft)" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profil Menü Listesi */}
      <div style={{ background: "#fff", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.04)", border: "1px solid #f1f5f9", overflow: "hidden" }}>
        
        {user && ['moderator', 'editor', 'admin', 'super_admin'].includes(userRole) && (
          <Link href="/admin" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", textDecoration: "none", background: "#f8fafc" }} className="hover-tilt">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(245, 158, 11, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b" }}>
                <Settings size={20} />
              </div>
              <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Admin Paneli</span>
            </div>
            <ChevronRight size={20} color="var(--l2t-muted)" />
          </Link>
        )}

        {user && (
          <Link href="/profil/harita" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", textDecoration: "none" }} className="hover-tilt">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
                <Map size={20} />
              </div>
              <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Dünyam & Liderlik</span>
            </div>
            <ChevronRight size={20} color="var(--l2t-muted)" />
          </Link>
        )}

        <Link href={user ? "/profil/harita" : "/auth/login"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", textDecoration: "none" }} className="hover-tilt">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
              <Heart size={20} />
            </div>
            <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Favori Rotalarım</span>
          </div>
          <ChevronRight size={20} color="var(--l2t-muted)" />
        </Link>

        <Link href="/fiyat-kontrolu" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", textDecoration: "none" }} className="hover-tilt">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(20, 118, 242, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-blue)" }}>
              <Bell size={20} />
            </div>
            <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Fiyat Alarmlarım</span>
          </div>
          <ChevronRight size={20} color="var(--l2t-muted)" />
        </Link>

        <Link href={user ? "/profil/harita" : "/auth/login"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", textDecoration: "none" }} className="hover-tilt">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(245, 158, 11, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F59E0B" }}>
              <Sparkles size={20} />
            </div>
            <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Kaydedilen Seyahat Planlarım</span>
          </div>
          <ChevronRight size={20} color="var(--l2t-muted)" />
        </Link>

        <Link href="#" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: user ? "1px solid #f1f5f9" : "none", textDecoration: "none" }} className="hover-tilt">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(100, 116, 139, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              <Settings size={20} />
            </div>
            <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)" }}>Bildirim Tercihlerim</span>
          </div>
          <ChevronRight size={20} color="var(--l2t-muted)" />
        </Link>

        {user && (
          <button onClick={handleLogout} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-soft)" }}>
                <LogOut size={20} />
              </div>
              <span style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-soft)" }}>Çıkış Yap</span>
            </div>
          </button>
        )}
      </div>

    </div>
  );
}
