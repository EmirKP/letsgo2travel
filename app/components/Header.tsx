"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Bookmark,
  Calculator,
  FileText,
  Globe,
  Menu,
  MessageSquare,
  Plane,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import LanguageSelector from "./LanguageSelector";
import styles from "./Header.module.css";

const TripDashboard = dynamic(() => import("./TripDashboard"), { ssr: false });

const primaryNav = [
  { href: "/pasaport-gucu", label: "Pasaport", icon: ShieldCheck },
  { href: "/rota-asistani", label: "Rota Asistanı", icon: Sparkles },
  { href: "/kampanyalar", label: "Fırsatlar", icon: Ticket },
  { href: "/forum", label: "Topluluk", icon: MessageSquare },
];

const secondaryNav = [
  { href: "/vizesiz-ulkeler", label: "Vizesiz Ülkeler", icon: Globe },
  { href: "/vize-merkezi", label: "Vize Merkezi", icon: FileText },
  { href: "/kasifler-ligi", label: "Kaşifler Ligi", icon: Trophy },
  { href: "/rehber-merkezi", label: "Rehber Merkezi", icon: BookOpen },
  { href: "/butce-hesapla", label: "Bütçe Hesapla", icon: Calculator },
  { href: "/planlarim", label: "Planlarım", icon: Bookmark },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setIsLoggedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="LetsGo2Travel ana sayfa">
          <span>Letsgo</span><b>2</b><span>Travel</span><Plane size={20} />
        </Link>

        <nav className={styles.desktopNav} aria-label="Ana menü">
          {primaryNav.map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={`${styles.navLink} ${isActive(href) ? styles.active : ""}`}
            >
              <Icon size={16} />{label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <div className={styles.desktopOnly}><TripDashboard /></div>
          <div className={styles.desktopOnly}><LanguageSelector /></div>
          <Link href={isLoggedIn ? "/profil" : "/auth/login"} className={styles.account}>
            <User size={17} /><span>{isLoggedIn ? "Profil" : "Giriş"}</span>
          </Link>
          <button
            type="button"
            className={styles.menuTrigger}
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Menüyü aç veya kapat"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className={styles.drawer}>
          <div className={styles.drawerInner}>
            <div className={styles.drawerPrimary}>
              {primaryNav.map(({ href, label, icon: Icon }) => (
                <Link
                  href={href}
                  key={href}
                  className={`${styles.drawerLink} ${isActive(href) ? styles.active : ""}`}
                >
                  <Icon size={19} /><span>{label}</span>
                </Link>
              ))}
            </div>
            <div className={styles.drawerSecondary}>
              {secondaryNav.map(({ href, label, icon: Icon }) => (
                <Link href={href} key={href} className={styles.drawerLink}>
                  <Icon size={18} /><span>{label}</span>
                </Link>
              ))}
            </div>
            <div className={styles.drawerTools}><TripDashboard /><LanguageSelector /></div>
          </div>
        </div>
      )}
    </header>
  );
}
