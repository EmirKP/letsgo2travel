"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type SessionPayload = {
  authenticated?: boolean;
  role?: string;
  error?: string;
};

function roleCanAccess(path: string, role: string) {
  if (["admin", "super_admin"].includes(role)) return true;

  const moderatorPrefixes = [
    "/admin/forum",
    "/admin/raporlar",
    "/admin/moderasyon",
    "/admin/dogrulamalar",
    "/admin/seyahat-dogrulama",
    "/admin/vize-randevulari",
  ];
  const editorPrefixes = ["/admin/blog", "/admin/rehber"];

  if (role === "moderator") return moderatorPrefixes.some((prefix) => path.startsWith(prefix));
  if (role === "editor") return editorPrefixes.some((prefix) => path.startsWith(prefix));
  return path === "/admin";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    let unmounted = false;
    const originalFetch = window.fetch;

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const sessionResponse = await originalFetch("/api/admin/session", {
          method: session ? "POST" : "GET",
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          cache: "no-store",
        });
        const sessionPayload = (await sessionResponse.json().catch(() => ({}))) as SessionPayload;
        const role = sessionPayload.role || "user";
        const isAdminAuth = sessionResponse.ok && sessionPayload.authenticated === true;
        const path = window.location.pathname;

        localStorage.removeItem("l2t-admin-password");

        if (path === "/admin/login") {
          if (!unmounted) {
            setIsAuthorized(true);
            setIsReady(true);
          }
          return;
        }

        if (!isAdminAuth) {
          router.replace("/admin/login");
          return;
        }

        const roleAllowed = roleCanAccess(path, role);
        if (!unmounted) {
          if (!roleAllowed) {
            setAuthMessage("Bu yönetim alanı için yetkiniz bulunmuyor.");
          }
          setIsAuthorized(roleAllowed);
        }

        // Supabase ile giriş yapan yöneticilerde API isteklerine erişim belirtecini ekle.
        window.fetch = async (...args) => {
          const [resource, config] = args;
          const url =
            typeof resource === "string"
              ? resource
              : resource instanceof Request
                ? resource.url
                : "";

          if (url.includes("/api/admin/") && session?.access_token) {
            const headers = new Headers(
              config?.headers || (resource instanceof Request ? resource.headers : undefined),
            );
            if (!headers.has("Authorization")) {
              headers.set("Authorization", `Bearer ${session.access_token}`);
            }
            return originalFetch(resource, { ...config, headers });
          }
          return originalFetch(...args);
        };

        if (!unmounted) setIsReady(true);
      } catch {
        if (!unmounted) {
          setAuthMessage("Yönetici oturumu doğrulanamadı.");
          setIsAuthorized(false);
          setIsReady(true);
        }
      }
    };

    void initAuth();

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
