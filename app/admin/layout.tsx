"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    let unmounted = false;
    const originalFetch = window.fetch;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      let role = 'user';
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (profile) role = profile.role;
      }

      const legacyPassword = localStorage.getItem("l2t-admin-password");
      const isLegacyAuth = !!legacyPassword;
      const isSupabaseAuth = ['moderator', 'editor', 'admin', 'super_admin'].includes(role);

      const path = window.location.pathname;

      if (!isSupabaseAuth && !isLegacyAuth && path !== '/admin/login') {
        if (!session) {
          router.push("/admin/login");
          return;
        } else {
          setAuthMessage("Bu alana erişim yetkiniz yok.");
          setIsAuthorized(false);
        }
      } else if (isSupabaseAuth && path !== '/admin/login') {
        // Rol bazlı sayfa yetki kontrolleri
        if (path.startsWith('/admin/ayarlar') || path.startsWith('/admin/kullanicilar') || path.startsWith('/admin/affiliate-raporlari')) {
          if (!['admin', 'super_admin'].includes(role)) {
            setAuthMessage("Site ayarları ve kullanıcı yönetimi için yetkiniz yok.");
            setIsAuthorized(false);
          }
        } else if (path.startsWith('/admin/forum') || path.startsWith('/admin/raporlar')) {
          if (!['moderator', 'admin', 'super_admin'].includes(role)) {
            setAuthMessage("Topluluk ve moderasyon alanına erişim yetkiniz yok.");
            setIsAuthorized(false);
          }
        } else if (path.startsWith('/admin/blog') || path.startsWith('/admin/rehber') || path.startsWith('/admin/kampanyalar')) {
          if (!['editor', 'admin', 'super_admin'].includes(role)) {
            setAuthMessage("İçerik yönetimi alanına erişim yetkiniz yok.");
            setIsAuthorized(false);
          }
        }
      }

      // Intercept fetch to inject Authorization header for admin APIs
      window.fetch = async (...args) => {
        const [resource, config] = args;
        const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';
        
        if (url.includes('/api/admin/') && session) {
          const newConfig = { ...config } as any;
          newConfig.headers = {
            ...newConfig.headers,
            'Authorization': `Bearer ${session.access_token}`
          };
          return originalFetch(resource, newConfig);
        }
        return originalFetch(...args);
      };

      if (!unmounted) setIsReady(true);
    };

    initAuth();

    return () => {
      unmounted = true;
      window.fetch = originalFetch; // Restore fetch
    };
  }, [router]);

  if (!isReady) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="l2t-spinner" /></div>;

  if (!isAuthorized) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", padding: "48px", borderRadius: "24px", textAlign: "center", maxWidth: "400px", width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "#ef4444" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <h1 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", marginBottom: "12px", fontWeight: "800" }}>Erişim Reddedildi</h1>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", lineHeight: "1.5" }}>{authMessage}</p>
          <a href="/" className="l2t-btn" style={{ display: "inline-block", textDecoration: "none", width: "100%", padding: "14px" }}>
            Ana Sayfaya Dön
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
