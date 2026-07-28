import Icon from "./Icon";
import type { Screen, Session } from "../types";

export default function AppHeader({
  screen,
  session,
  onProfile,
  onMenu,
  onBack,
}: {
  screen: Screen;
  session: Session | null;
  onProfile: () => void;
  onMenu: () => void;
  onBack: () => void;
}) {
  const showBack = !["home", "passport", "flights", "route", "plans"].includes(screen);
  return (
    <header className="topbar">
      <div className="topbar-left">
        {showBack ? (
          <button className="icon-button compact" aria-label="Geri" onClick={onBack}><Icon name="back" size={20}/></button>
        ) : null}
        <button className="brand-button" onClick={onBack} aria-label="LetsGo2Travel ana sayfa">
          <span>LetsGo</span><strong>2</strong><span>Travel</span>
        </button>
      </div>
      <div className="topbar-actions">
        <button className={`icon-button ${session ? "signed" : ""}`} aria-label="Profil" onClick={onProfile}>
          <Icon name="user" size={20}/>
          {session ? <i/> : null}
        </button>
        <button className="icon-button" aria-label="Menü" onClick={onMenu}><Icon name="menu" size={21}/></button>
      </div>
    </header>
  );
}
