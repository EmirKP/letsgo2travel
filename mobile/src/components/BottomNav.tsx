import Icon, { type IconName } from "./Icon";
import type { Screen } from "../types";

const ITEMS: { id: Screen; icon: IconName; label: string }[] = [
  { id: "home", icon: "home", label: "Ana Sayfa" },
  { id: "passport", icon: "passport", label: "Pasaport" },
  { id: "flights", icon: "search", label: "Bilet Ara" },
  { id: "route", icon: "route", label: "Rota" },
  { id: "plans", icon: "plans", label: "Planlarım" },
];

export default function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Alt menü">
      {ITEMS.map((item) => (
        <button key={item.id} className={screen === item.id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(item.id)}>
          <span className={item.id === "flights" ? "search-bubble" : ""}><Icon name={item.icon} size={item.id === "flights" ? 22 : 20}/></span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
