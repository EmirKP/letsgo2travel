"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Home, ShieldCheck, Sparkles } from "lucide-react";

const items = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/pasaport-gucu", label: "Pasaport", icon: ShieldCheck },
  { href: "/ulke-rehberi", label: "Keşfet", icon: Compass, main: true },
  { href: "/rota-asistani", label: "Rota", icon: Sparkles },
  { href: "/planlarim", label: "Planlarım", icon: Bookmark },
];

export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);

  return (
    <nav className="l2t-bottom-nav l2t-bottom-nav-v24" aria-label="Uygulama menüsü">
      {items.map(({ href, label, icon: Icon, main }) => (
        <Link href={href} key={href} className={`${isActive(href) ? "is-active" : ""}${main ? " is-main" : ""}`} aria-label={label}>
          <span className="l2t-bottom-nav-icon"><Icon size={main ? 23 : 21} /></span><small>{label}</small>
        </Link>
      ))}
    </nav>
  );
}
