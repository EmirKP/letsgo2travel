import { useEffect, useState } from "react";
import { getFeaturedDeals } from "../lib/api";
import { openExternal } from "../lib/native";
import { randomRoute } from "../data/routes";
import type { FlightDeal, RouteSuggestion, TabId } from "../types";
import { Icon, type IconName } from "../components/Icon";

const quickCards: Array<{ title: string; text: string; icon: IconName; tab: TabId }> = [
  { title: "Pasaport Gücü", text: "Giriş durumlarını ülke ülke karşılaştır.", icon: "passport", tab: "passport" },
  { title: "Bilet Ara", text: "Kalkış ve varış noktanı seç, uçuşları aç.", icon: "search", tab: "search" },
  { title: "Rota Asistanı", text: "Bütçene ve seyahat tarzına göre rota oluştur.", icon: "route", tab: "route" },
  { title: "Planlarım", text: "Kaydettiğin rotaları ve alarmları yönet.", icon: "plans", tab: "plans" },
];

export function HomeScreen({ onNavigate, onSurprise, onNotice }: {
  onNavigate: (tab: TabId) => void;
  onSurprise: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const [deals, setDeals] = useState<FlightDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);

  const loadDeals = async () => {
    setLoadingDeals(true);
    try {
      setDeals((await getFeaturedDeals()).slice(0, 6));
    } catch {
      setDeals([]);
    } finally {
      setLoadingDeals(false);
    }
  };

  useEffect(() => { void loadDeals(); }, []);

  const surprise = () => {
    const selected = randomRoute();
    onSurprise(selected);
    onNotice(`${selected.name} senin için seçildi.`);
  };

  return (
    <div className="screen home-screen">
      <section className="hero">
        <div className="eyebrow"><span><Icon name="globe" size={13} /></span> GLOBAL SEYAHAT KEŞFİ</div>
        <h1>Dünyayı merakından başlayarak keşfet.</h1>
        <p>Pasaportuna uygun ülkeleri gör, rotanı oluştur, uçuşunu ara ve planlarını tek yerde sakla.</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={() => onNavigate("route")}><Icon name="route" size={18} /> Rota oluştur</button>
          <button className="secondary-button" onClick={surprise}><Icon name="globe" size={18} /> Beni şaşırt</button>
        </div>
        <div className="hero-benefits">
          <span><Icon name="check" size={13} /> Giriş durumları</span>
          <span><Icon name="check" size={13} /> Yerel kayıt</span>
          <span><Icon name="check" size={13} /> Canlı servis bağlantısı</span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span>HIZLI BAŞLANGIÇ</span><h2>Nereye gitmek istersin?</h2></div></div>
        <div className="feature-grid">
          {quickCards.map((card) => (
            <button className="feature-card" key={card.tab} onClick={() => onNavigate(card.tab)}>
              <span className="feature-icon"><Icon name={card.icon} size={22} /></span>
              <span className="feature-copy"><strong>{card.title}</strong><small>{card.text}</small></span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      </section>

      <button className="surprise-banner" onClick={surprise}>
        <span className="route-art"><Icon name="globe" size={28} /></span>
        <span><small>BUGÜNÜN SÜRPRİZİ</small><strong>Kararı dünyaya bırak</strong><em>Tek dokunuşla sana uygun bir rota seçelim.</em></span>
        <Icon name="chevron" size={20} />
      </button>

      <section className="section-block deals-block">
        <div className="section-heading">
          <div><span>ÖNE ÇIKANLAR</span><h2>İlham veren rotalar</h2></div>
          <button className="text-button" onClick={() => void loadDeals()} aria-label="Yenile"><Icon name="refresh" size={17} /> Yenile</button>
        </div>
        {loadingDeals ? (
          <div className="skeleton-list"><div /><div /><div /></div>
        ) : deals.length ? (
          <div className="deal-scroll">
            {deals.map((deal) => (
              <article className="deal-card" key={deal.id}>
                <div className="deal-visual" style={deal.image_url ? { backgroundImage: `linear-gradient(180deg,transparent,rgba(3,19,36,.78)),url(${deal.image_url})` } : undefined}>
                  <span>{deal.visa_type || "Rota"}</span>
                  <strong>{deal.destination}</strong>
                  <small>{deal.origin} çıkışlı</small>
                </div>
                <div className="deal-body">
                  <div><small>Başlangıç fiyatı</small><strong>{new Intl.NumberFormat("tr-TR").format(deal.price)} {deal.currency}</strong></div>
                  <button onClick={() => void openExternal(deal.affiliate_url)} aria-label={`${deal.destination} uçuşlarını aç`}><Icon name="external" size={17} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-inline"><Icon name="info" /><div><strong>Canlı fırsatlar şu an alınamadı</strong><span>Bilet arama ve rota asistanı çevrimdışı seçeneklerle kullanılabilir.</span></div></div>
        )}
      </section>
    </div>
  );
}
