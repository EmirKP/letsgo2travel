"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase-client";

import { Sparkles, Globe, ShieldCheck, BookOpen, Ticket, Plane, User, MessageSquare, Trophy, FileText } from "lucide-react";
import LanguageSelector from "./LanguageSelector";
import { getL2tDictionary, type L2tLocale } from "@/lib/i18n";

const TripDashboard = dynamic(() => import("./TripDashboard"), { ssr: false });

const navItems = [
  { href: "/", labelKey: "flights", icon: Plane },
  { href: "/kampanyalar", labelKey: "deals", icon: Ticket },
  { href: "/pasaport-gucu", labelKey: "passport", icon: ShieldCheck },
  { href: "/rota-asistani", labelKey: "assistant", icon: Sparkles },
  { href: "/forum", labelKey: "forum", icon: MessageSquare }
] as const;

const moreItems = [
  { href: "/vizesiz-ulkeler", labelKey: "visaFree", icon: Globe },
  { href: "/vize-merkezi", labelKey: "visaCenter", icon: FileText },
  { href: "/kasifler-ligi", labelKey: "explorers", icon: Trophy },
  { href: "/rehber-merkezi", labelKey: "guideCenter", icon: BookOpen },
  { href: "/topluluk-kurallari", labelKey: "communityRules", icon: ShieldCheck },
] as const;

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [locale, setLocale] = useState<L2tLocale>("tr");
  const pathname = usePathname();
  const dict = useMemo(() => getL2tDictionary(locale), [locale]);

  useEffect(() => {
    const saved = window.localStorage.getItem("l2t-locale") as L2tLocale | null;
    if (saved === "tr" || saved === "en") setLocale(saved);

    const localeHandler = (event: Event) => {
      const custom = event as CustomEvent<L2tLocale>;
      if (custom.detail === "tr" || custom.detail === "en") setLocale(custom.detail);
    };
    window.addEventListener("l2t-locale-change", localeHandler);
    return () => window.removeEventListener("l2t-locale-change", localeHandler);
  }, []);

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
    pathname === href || (href !== "/" && pathname.startsWith(href)) ||
    (href === "/rota-asistani" && pathname.startsWith("/akilli-plan"));

  return (
    <header className="l2t-header">
      <div className="l2t-wrap l2t-header-inner">
        <Link href="/" className="l2t-brand" aria-label="Letsgo2Travel">
          <span className="l2t-logo-text">
            <span className="l2t-logo-lets">Letsgo</span>
            <span className="l2t-logo-two">2</span>
            <span className="l2t-logo-travel">Travel</span>
            <span className="l2t-logo-plane"><Plane size={24} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
          </span>
        </Link>

        <nav className="l2t-nav" aria-label="Ana menü">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`l2t-nav-link${isActive(item.href) ? " l2t-nav-active" : ""}`}
              >
                <Icon size={16} />
                {dict.nav[item.labelKey]}
              </Link>
            );
          })}

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
              {dict.nav.more} <span className="l2t-caret">▾</span>
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
                    >
                      <Icon size={16} />
                      {dict.nav[item.labelKey]}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="l2t-header-right">
          <TripDashboard />
          <LanguageSelector />
          {isLoggedIn ? (
            <Link href="/profil" className="l2t-btn l2t-btn-outline l2t-profile-link">
              <User size={16} /> {dict.nav.profile}
            </Link>
          ) : (
            <Link href="/auth/login" className="l2t-btn l2t-btn-outline l2t-profile-link">
              <User size={16} /> {dict.nav.login}
            </Link>
          )}

          <button
            className="l2t-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menü"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

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
              >
                <Icon size={18} />
                {dict.nav[item.labelKey]}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
