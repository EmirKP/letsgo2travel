"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Ticket, Search, Globe, User } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav className="l2t-bottom-nav">
      <Link href="/" className={`l2t-bn-item ${isActive("/") ? "l2t-bn-active" : ""}`}>
        <Home size={22} />
        <span>Ana Sayfa</span>
      </Link>
      
      <Link href="/kampanyalar" className={`l2t-bn-item ${isActive("/kampanyalar") ? "l2t-bn-active" : ""}`}>
        <Ticket size={22} />
        <span>Fırsatlar</span>
      </Link>
      
      <Link href="/#bilet-ara" className="l2t-bn-item l2t-bn-search">
        <div className="l2t-bn-search-inner">
          <Search size={22} />
        </div>
        <span>Bilet Ara</span>
      </Link>
      
      <Link href="/vizesiz-ulkeler" className={`l2t-bn-item ${isActive("/vizesiz-ulkeler") ? "l2t-bn-active" : ""}`}>
        <Globe size={22} />
        <span>Vizesiz</span>
      </Link>
      
      <Link href="/profil" className={`l2t-bn-item ${isActive("/profil") ? "l2t-bn-active" : ""}`}>
        <User size={22} />
        <span>Profil</span>
      </Link>
    </nav>
  );
}
