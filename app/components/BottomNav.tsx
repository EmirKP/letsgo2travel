"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Globe, User, Sparkles } from "lucide-react";

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
      
      <Link href="/pasaport-gucu" className={`l2t-bn-item ${isActive("/pasaport-gucu") ? "l2t-bn-active" : ""}`}>
        <Globe size={22} />
        <span>Pasaport</span>
      </Link>
      
      <Link href="/#bilet-ara" className="l2t-bn-item l2t-bn-search">
        <div className="l2t-bn-search-inner">
          <Search size={22} />
        </div>
        <span>Bilet Ara</span>
      </Link>
      
      <Link href="/rota-asistani" className={`l2t-bn-item ${isActive("/rota-asistani") ? "l2t-bn-active" : ""}`}>
        <Sparkles size={22} />
        <span>Rota</span>
      </Link>
      
      <Link href="/profil" className={`l2t-bn-item ${isActive("/profil") ? "l2t-bn-active" : ""}`}>
        <User size={22} />
        <span>Profil</span>
      </Link>
    </nav>
  );
}
