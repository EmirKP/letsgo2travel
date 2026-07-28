import Icon from "../components/Icon";
import { openExternal } from "../lib/native";
import type { FlightDeal, Screen, Session } from "../types";
import { absoluteUrl } from "../config";

export default function FavoritesScreen({
  favorites,
  session,
  onToggle,
  navigate,
}: {
  favorites: FlightDeal[];
  session: Session | null;
  onToggle: (deal: FlightDeal) => void;
  navigate: (screen: Screen) => void;
}) {
  return (
    <main className="content favorites-content">
      <section className="page-hero favorites-hero"><span className="page-hero-icon"><Icon name="heart" size={26}/></span><div><small>KAYDETTİKLERİN</small><h1>Favori Rotalarım</h1><p>Beğendiğin uçuş fırsatlarını karşılaştır ve seyahat planına ekle.</p></div></section>

      {favorites.length === 0 ? (
        <section className="empty-card large-empty"><span><Icon name="heart" size={34}/></span><h2>Henüz favorin yok</h2><p>Uçuş fırsatlarındaki kalp simgesine dokunduğunda kaydettiklerin burada görünür.</p><button className="wide-primary" onClick={() => navigate("flights")}><Icon name="plane" size={18}/>Fırsatları keşfet</button></section>
      ) : (
        <>
          <div className="section-head-row"><div><span className="section-kicker">FAVORİLER</span><h2>{favorites.length} uçuş fırsatı</h2></div>{session ? <span className="sync-badge"><Icon name="wifi" size={13}/>Hesapla eşleşir</span> : null}</div>
          <div className="favorite-grid">
            {favorites.map((deal) => (
              <article className="favorite-card" key={deal.id}>
                <div className="favorite-card-head"><span>{deal.visa_type || "Uçuş"}</span><button onClick={() => onToggle(deal)} aria-label="Favorilerden çıkar"><Icon name="heart" size={19} filled/></button></div>
                <small>{deal.region || "Seyahat fırsatı"}</small>
                <h3>{deal.destination}</h3>
                <p>{deal.origin_code} → {deal.destination_code}</p>
                <em>{deal.travel_period || "Esnek tarih"}</em>
                <div><strong>{Number(deal.price || 0).toLocaleString("tr-TR")} {deal.currency?.toUpperCase() === "TRY" || !deal.currency ? "TL" : deal.currency}</strong><button disabled={!deal.affiliate_url} onClick={() => deal.affiliate_url && openExternal(absoluteUrl(deal.affiliate_url))}>Bilete git <Icon name="external" size={14}/></button></div>
              </article>
            ))}
          </div>
        </>
      )}

      {!session ? <section className="account-prompt"><span><Icon name="user" size={22}/></span><div><strong>Favorilerini hesabında sakla</strong><p>Giriş yaptığında desteklenen favorilerin web sitesiyle eşleştirilir.</p></div><button onClick={() => navigate("auth")}>Giriş yap</button></section> : null}
    </main>
  );
}
