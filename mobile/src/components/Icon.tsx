import type { ReactNode } from "react";

export type IconName =
  | "home" | "passport" | "search" | "route" | "plans" | "user" | "menu"
  | "plane" | "bell" | "map" | "heart" | "chevron" | "back" | "globe"
  | "check" | "alert" | "close" | "swap" | "calendar" | "mail" | "lock"
  | "trash" | "external" | "wifi" | "offline" | "refresh" | "plus"
  | "cloud" | "sun" | "wallet" | "users" | "bookmark" | "info" | "logout";

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
    passport: <><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="11" r="3"/><path d="M9 11h6M12 8v6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    route: <><path d="M5 19c0-5 5-4 5-8s-5-3-5-7"/><path d="M19 5c0 5-5 4-5 8s5 3 5 7"/><circle cx="5" cy="4" r="1.5"/><circle cx="19" cy="20" r="1.5"/></>,
    plans: <path d="M6 4h12v16l-6-3-6 3z"/>,
    bookmark: <path d="M6 4h12v16l-6-3-6 3z"/>,
    user: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    plane: <><path d="m3 11 18-8-6 18-3-7-9-3Z"/><path d="m12 14 4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 19h4"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    back: <path d="m15 18-6-6 6-6"/>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    swap: <path d="M7 7h12l-3-3m3 3-3 3M17 17H5l3 3m-3-3 3-3"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r=".8" fill="currentColor" stroke="none"/></>,
    offline: <><path d="m3 3 18 18M5 12.5a10 10 0 0 1 5-2.7M14 9.8a10 10 0 0 1 5 2.7M9 16a5 5 0 0 1 3-1M15 16l1 1"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6l-2 5M5.5 15A7 7 0 0 0 18 18l2-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    cloud: <path d="M6 18h11a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.3 9 4.5 4.5 0 0 0 6 18Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></>,
    wallet: <><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-4 2.7-6 6-6s5.3 2 6 6"/><path d="M16 5a3 3 0 0 1 0 6M17 14c2.3.5 3.7 2.5 4 6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
