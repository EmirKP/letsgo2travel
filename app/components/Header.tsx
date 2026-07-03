"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase-client";

import { Sparkles, Globe, ShieldCheck, BookOpen, Ticket, Plane, User, MessageSquare, Trophy, FileText } from "lucide-react";
import LanguageSelector from "./LanguageSelector";

const TripDashboard = dynamic(() => import("./TripDashboard"), { ssr: false });

const navItems = [
  { href: "/", label: "Bilet Ara", icon: Plane },
  { href: "/kampanyalar", label: "Fırsatlar", icon: Ticket },
  { href: "/pasaport-gucu", label: "Pasaport Gücü", icon: ShieldCheck },
  { href: "/akilli-plan", label: "Rota Asistanı", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessageSquare }
];

const moreItems = [
  { href: "/vizesiz-ulkeler", label: "Vizesiz Ülkeler", icon: Globe },
  { href: "/vize-merkezi", label: "Vize Merkezi", icon: FileText },
  { href: "/kasifler-ligi", label: "Kaşifler Ligi", icon: Trophy },
  { href: "/rehber-merkezi", label: "Rehber Merkezi", icon: BookOpen },
  { href: "/topluluk-kurallari", label: "Topluluk Kuralları", icon: ShieldCheck },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();

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
            onMouseEnter={() => setMoreOpen(true)}
            onMouseLeave={() => setMoreOpen(false)}
          >
            <button
              type="button"
              className={`l2t-nav-link l2t-nav-dropdown-trigger${moreItems.some((h) => isActive(h.href)) ? " l2t-nav-active" : ""}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
            >
              Daha Fazla <span className="l2t-caret">▾</span>
            </button>
            {moreOpen && (
              <div className="l2t-dropdown" role="menu">
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
          <LanguageSelector />
          
          {isLoggedIn ? (
            <Link href="/profil" className="l2t-btn l2t-btn-outline l2t-hide-mobile" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={16} /> Profil
            </Link>
          ) : (
            <Link href="/auth/login" className="l2t-btn l2t-btn-outline l2t-hide-mobile" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={16} /> Giriş
            </Link>
          )}

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
