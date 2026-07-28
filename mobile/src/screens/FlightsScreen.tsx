import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { createFlightAlert, fetchAirports, fetchDeals, getFlightSearchUrl } from "../lib/api";
import { lightHaptic, openExternal } from "../lib/native";
import type { Airport, FlightDeal, SavedPlan, Session } from "../types";
import { absoluteUrl } from "../config";

const COMMON_AIRPORTS: Airport[] = [
  { id: "IST", code: "IST", name: "İstanbul", type: "city", countryName: "Türkiye" },
  { id: "SAW", code: "SAW", name: "İstanbul Sabiha Gökçen", type: "airport", countryName: "Türkiye" },
  { id: "ESB", code: "ESB", name: "Ankara", type: "city", countryName: "Türkiye" },
  { id: "ADB", code: "ADB", name: "İzmir", type: "city", countryName: "Türkiye" },
  { id: "AYT", code: "AYT", name: "Antalya", type: "city", countryName: "Türkiye" },
  { id: "DXB", code: "DXB", name: "Dubai", type: "city", countryName: "BAE" },
  { id: "LON", code: "LON", name: "Londra", type: "city", countryName: "İngiltere" },
  { id: "PAR", code: "PAR", name: "Paris", type: "city", countryName: "Fransa" },
  { id: "FCO", code: "FCO", name: "Roma", type: "city", countryName: "İtalya" },
  { id: "TBS", code: "TBS", name: "Tiflis", type: "city", countryName: "Gürcistan" },
  { id: "GYD", code: "GYD", name: "Bakü", type: "city", countryName: "Azerbaycan" },
  { id: "SJJ", code: "SJJ", name: "Saraybosna", type: "city", countryName: "Bosna Hersek" },
];

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeCode(value: string) {
  const match = value.toUpperCase().match(/\b[A-Z]{3}\b/);
  return match?.[0] || value.trim().slice(0, 3).toUpperCase();
}

function AirportField({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (airport: Airport) => void;
  placeholder: string;
}) {
  const [items, setItems] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setItems(COMMON_AIRPORTS.slice(0, 6));
      return;
    }
    timer.current = window.setTimeout(() => {
      void fetchAirports(value)
        .then((result) => setItems(result.length ? result : COMMON_AIRPORTS.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase("tr").includes(value.toLocaleLowerCase("tr")))))
        .catch(() => setItems(COMMON_AIRPORTS.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase("tr").includes(value.toLocaleLowerCase("tr")))));
    }, 260);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  return (
    <label className="form-field airport-field">
      <span>{label}</span>
      <div className="input-shell"><Icon name="location" size={18}/><input value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 160)} onChange={(event) => { onChange(event.target.value); setOpen(true); }}/></div>
      {open && items.length ? (
        <div className="airport-popover">
          {items.slice(0, 8).map((item) => (
            <button type="button" key={`${item.id}-${item.code}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item); setOpen(false); }}>
              <span><strong>{item.name}</strong><small>{item.countryName || item.type}</small></span><em>{item.code || item.id}</em>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

export default function FlightsScreen({
  session,
  isOnline,
  favorites,
  onToggleFavorite,
  onSavePlan,
  notify,
}: {
  session: Session | null;
  isOnline: boolean;
  favorites: FlightDeal[];
  onToggleFavorite: (deal: FlightDeal) => void;
  onSavePlan: (plan: SavedPlan) => void;
  notify: (message: string) => void;
}) {
  const [origin, setOrigin] = useState("İstanbul (IST)");
  const [destination, setDestination] = useState("Dubai (DXB)");
  const [originLabel, setOriginLabel] = useState("İstanbul");
  const [destinationLabel, setDestinationLabel] = useState("Dubai");
  const [departureDate, setDepartureDate] = useState(todayPlus(21));
  const [returnDate, setReturnDate] = useState(todayPlus(27));
  const [tripType, setTripType] = useState("round_trip");
  const [adults, setAdults] = useState(1);
  const [cabinClass, setCabinClass] = useState("economy");
  const [email, setEmail] = useState(session?.user.email || "");
  const [targetPrice, setTargetPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);
  const [deals, setDeals] = useState<FlightDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
  }, [session]);

  useEffect(() => {
    if (!isOnline) return;
    setDealsLoading(true);
    void fetchDeals().then((items) => setDeals(items.slice(0, 8))).catch(() => setDeals([])).finally(() => setDealsLoading(false));
  }, [isOnline]);

  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);

  function selectOrigin(airport: Airport) {
    const code = airport.code || airport.id;
    setOrigin(`${airport.name} (${code})`);
    setOriginLabel(airport.name);
  }

  function selectDestination(airport: Airport) {
    const code = airport.code || airport.id;
    setDestination(`${airport.name} (${code})`);
    setDestinationLabel(airport.name);
  }

  function swap() {
    setOrigin(destination);
    setDestination(origin);
    setOriginLabel(destinationLabel);
    setDestinationLabel(originLabel);
    lightHaptic();
  }

  async function searchFlights() {
    if (!isOnline) return notify("Canlı bilet araması için internet bağlantısı gerekli.");
    const originCode = normalizeCode(origin);
    const destinationCode = normalizeCode(destination);
    if (originCode.length !== 3 || destinationCode.length !== 3) return notify("Çıkış ve varış için geçerli bir havalimanı seç.");
    if (!departureDate) return notify("Gidiş tarihini seç.");

    setBusy(true);
    try {
      const result = await getFlightSearchUrl(originCode, destinationCode);
      onSavePlan({
        id: crypto.randomUUID(),
        kind: "flight",
        title: `${originLabel} → ${destinationLabel}`,
        subtitle: `${departureDate}${tripType === "round_trip" && returnDate ? ` – ${returnDate}` : ""} · ${adults} yolcu`,
        savedAt: Date.now(),
        payload: { originCode, destinationCode, originLabel, destinationLabel, departureDate, returnDate, tripType, adults, cabinClass, url: result.url },
      });
      await openExternal(absoluteUrl(result.url));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Uçuş araması açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createAlert() {
    if (!isOnline) return notify("Fiyat alarmı kurmak için internet bağlantısı gerekli.");
    if (!email.includes("@")) return notify("Geçerli bir e-posta adresi yaz.");
    const originCode = normalizeCode(origin);
    const destinationCode = normalizeCode(destination);
    setAlertBusy(true);
    try {
      const result = await createFlightAlert({
        originCode,
        originLabel,
        destinationCode,
        destinationLabel,
        departureDate,
        returnDate: tripType === "round_trip" ? returnDate : undefined,
        tripType,
        adults,
        children: 0,
        infants: 0,
        cabinClass,
        email,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        thresholdPercent: 5,
      }, session);
      notify(result.message || "Fiyat alarmın kuruldu.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Fiyat alarmı kurulamadı.");
    } finally {
      setAlertBusy(false);
    }
  }

  return (
    <main className="content flights-content">
      <section className="page-hero compact-hero">
        <span className="page-hero-icon"><Icon name="plane" size={25}/></span>
        <div><small>UÇUŞ MERKEZİ</small><h1>Bilet Ara</h1><p>Rotanı seç, güvenli yönlendirme ile güncel seçeneklere devam et.</p></div>
      </section>

      <section className="panel flight-form-panel">
        <div className="panel-head"><div><span className="section-kicker">UÇUŞ BİLGİLERİ</span><h2>Nereye gidiyorsun?</h2></div><button className="round-action" onClick={swap} aria-label="Yönleri değiştir"><Icon name="swap" size={19}/></button></div>
        <div className="form-grid">
          <AirportField label="Nereden" value={origin} onChange={setOrigin} onSelect={selectOrigin} placeholder="Şehir veya havalimanı"/>
          <AirportField label="Nereye" value={destination} onChange={setDestination} onSelect={selectDestination} placeholder="Şehir veya havalimanı"/>
          <label className="form-field"><span>Gidiş tarihi</span><div className="input-shell"><Icon name="calendar" size={18}/><input type="date" value={departureDate} min={todayPlus(0)} onChange={(event) => setDepartureDate(event.target.value)}/></div></label>
          {tripType === "round_trip" ? <label className="form-field"><span>Dönüş tarihi</span><div className="input-shell"><Icon name="calendar" size={18}/><input type="date" value={returnDate} min={departureDate} onChange={(event) => setReturnDate(event.target.value)}/></div></label> : null}
        </div>

        <div className="segmented"><button className={tripType === "round_trip" ? "active" : ""} onClick={() => setTripType("round_trip")}>Gidiş–dönüş</button><button className={tripType === "one_way" ? "active" : ""} onClick={() => setTripType("one_way")}>Tek yön</button></div>

        <div className="form-row-2">
          <label className="form-field"><span>Yolcu</span><div className="stepper"><button onClick={() => setAdults(Math.max(1, adults - 1))}>−</button><strong>{adults}</strong><button onClick={() => setAdults(Math.min(9, adults + 1))}>+</button></div></label>
          <label className="form-field"><span>Kabin</span><div className="input-shell"><Icon name="users" size={18}/><select value={cabinClass} onChange={(event) => setCabinClass(event.target.value)}><option value="economy">Ekonomi</option><option value="business">Business</option><option value="first">First</option></select></div></label>
        </div>

        <button className="wide-primary" disabled={busy} onClick={searchFlights}><Icon name="search" size={19}/>{busy ? "Arama hazırlanıyor..." : "Uçuşları ara"}</button>
        <p className="form-disclaimer">Bilet sonuçları iş ortağı sayfasında açılır. Satın almadan önce tarih, bagaj ve iade koşullarını doğrula.</p>
      </section>

      <section className="panel alert-create-panel">
        <div className="panel-head"><div><span className="section-kicker">FİYAT TAKİBİ</span><h2>Bu rota için alarm kur</h2></div><span className="soft-icon"><Icon name="bell" size={20}/></span></div>
        <div className="form-grid">
          <label className="form-field"><span>E-posta</span><div className="input-shell"><Icon name="mail" size={18}/><input type="email" value={email} placeholder="ornek@email.com" onChange={(event) => setEmail(event.target.value)}/></div></label>
          <label className="form-field"><span>Hedef fiyat (isteğe bağlı)</span><div className="input-shell"><Icon name="wallet" size={18}/><input type="number" min="0" value={targetPrice} placeholder="Örn. 4500" onChange={(event) => setTargetPrice(event.target.value)}/></div></label>
        </div>
        <button className="wide-secondary" disabled={alertBusy} onClick={createAlert}><Icon name="bell" size={18}/>{alertBusy ? "Alarm kuruluyor..." : "Fiyat alarmı kur"}</button>
      </section>

      <section className="deals-section">
        <div className="section-head-row"><div><span className="section-kicker">GÜNCEL FIRSATLAR</span><h2>Öne çıkan uçuşlar</h2></div>{dealsLoading ? <span className="mini-loader">Yükleniyor</span> : null}</div>
        {!isOnline ? <div className="empty-card"><Icon name="offline" size={30}/><h3>Fırsatlar çevrimdışı</h3><p>İnternet geldiğinde canlı fırsatlar burada yenilenir.</p></div> : null}
        {isOnline && !dealsLoading && deals.length === 0 ? <div className="empty-card"><Icon name="plane" size={30}/><h3>Şu anda fırsat yüklenemedi</h3><p>Biraz sonra tekrar deneyebilirsin.</p></div> : null}
        <div className="deal-list">
          {deals.map((deal) => (
            <article className="deal-card" key={deal.id}>
              <div className="deal-top"><span>{deal.visa_type || "Uçuş"}</span><button className={favoriteIds.has(deal.id) ? "favorite active" : "favorite"} onClick={() => onToggleFavorite(deal)}><Icon name="heart" size={18} filled={favoriteIds.has(deal.id)}/></button></div>
              <h3>{deal.destination}</h3>
              <p>{deal.origin_code} → {deal.destination_code} · {deal.travel_period || "Esnek tarih"}</p>
              <div className="deal-bottom"><strong>{Number(deal.price || 0).toLocaleString("tr-TR")} {deal.currency?.toUpperCase() === "TRY" || !deal.currency ? "TL" : deal.currency}</strong><button onClick={() => deal.affiliate_url && openExternal(absoluteUrl(deal.affiliate_url))}>İncele <Icon name="external" size={14}/></button></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
