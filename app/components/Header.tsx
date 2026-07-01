"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase-client";

import { Sparkles, Map, Globe, ShieldCheck, BookOpen, Calculator, Wifi, Hotel, Compass, Ticket, Plane, User, MessageSquare, Trophy } from "lucide-react";

const TripDashboard = dynamic(() => import("./TripDashboard"), { ssr: false });

const navItems = [
  { href: "/", label: "Bilet Ara", icon: Plane },
  { href: "/kampanyalar", label: "Fırsatlar", icon: Ticket },
  { href: "/vizesiz-ulkeler", label: "Vizesiz Ülkeler", icon: Globe },
  { href: "/akilli-plan", label: "AI Planlayıcı", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessageSquare }
];

const moreItems = [
  { href: "/rehber-merkezi", label: "Rehber Merkezi", icon: BookOpen },
  { href: "/pasaport-gucu", label: "Pasaport Gücü", icon: ShieldCheck },
  { href: "/kasifler-ligi", label: "Kaşifler Ligi", icon: Trophy },
  { href: "/blog", label: "Blog", icon: BookOpen },
  { href: "/harita", label: "Harita", icon: Map },
  { href: "/esim", label: "eSIM", icon: Wifi },
  { href: "/oteller", label: "Oteller", icon: Hotel },
  { href: "/turlar", label: "Turlar", icon: Compass },
  { href: "/butce-hesapla", label: "Bütçe Hesapla", icon: Calculator },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const moreCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const openMoreMenu = () => {
    if (moreCloseTimer.current) {
      clearTimeout(moreCloseTimer.current);
      moreCloseTimer.current = null;
    }
    setMoreOpen(true);
  };

  const closeMoreMenuSoon = () => {
    if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current);
    moreCloseTimer.current = setTimeout(() => setMoreOpen(false), 1200);
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsLoggedIn(!!data.session);
    };
    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <header className="l2t-header">
      <div className="l2t-wrap l2t-header-inner">
        {/* Logo */}
        <Link href="/" className="l2t-brand" aria-label="Letsgo2Travel">
          <span className="l2t-logo-text">
            <span className="l2t-logo-lets">Letsgo</span>
            <span className="l2t-logo-two">2</span>
            <span className="l2t-logo-travel">Travel</span>
            <span className="l2t-logo-plane"><Plane size={24} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="l2t-nav" aria-label="Ana menü">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`l2t-nav-link${isActive(item.href) ? " l2t-nav-active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}

          {/* Daha fazla dropdown */}
          <div
            className="l2t-nav-dropdown-wrap"
            onMouseEnter={openMoreMenu}
            onMouseLeave={closeMoreMenuSoon}
          >
            <button
              type="button"
              className={`l2t-nav-link l2t-nav-dropdown-trigger${moreItems.some((h) => isActive(h.href)) ? " l2t-nav-active" : ""}`}
              onMouseEnter={openMoreMenu}
              onFocus={openMoreMenu}
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
            >
              Daha Fazla <span className="l2t-caret">▾</span>
            </button>
            {moreOpen && (
              <div className="l2t-dropdown" role="menu" onMouseEnter={openMoreMenu} onMouseLeave={closeMoreMenuSoon}>
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={isActive(item.href) ? "l2t-dropdown-active" : ""}
                      onClick={() => setMoreOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <Icon size={16} color="var(--l2t-soft)" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Sağ Alan */}
        <div className="l2t-header-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <TripDashboard />
          
          {isLoggedIn ? (
            <Link href="/profil" className="l2t-btn l2t-btn-outline l2t-hide-mobile" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={16} /> Profil
            </Link>
          ) : (
            <Link href="/auth/login" className="l2t-btn l2t-btn-outline l2t-hide-mobile" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={16} /> Giriş
            </Link>
          )}

          <Link href="/kampanyalar" className="l2t-btn l2t-hide-mobile" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Plane size={16} /> Bilet Ara
          </Link>

          <button
            className="l2t-burger l2t-hide-mobile"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menü"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobil menü */}
      {mobileOpen && (
        <nav className="l2t-mobile-nav" aria-label="Mobil menü">
          {[...navItems, ...moreItems].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`l2t-mobile-link${isActive(item.href) ? " l2t-mobile-active" : ""}`}
                onClick={() => setMobileOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
