import { useState } from "react";
import { AirportField } from "../components/AirportField";
import { Icon, type IconName } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { AIRPORT_PICKS } from "../data/airportPicks";
import type { AirportOption } from "../lib/airports";
import { useI18n } from "../lib/i18n";
import { AIRPORT_GUIDES } from "../data/airportGuides";
import { openExternal } from "../lib/native";

const topics: { icon: IconName; tr: string; en: string; detailTr: string; detailEn: string }[] = [
  {icon:"wifi",tr:"Wi-Fi",en:"Wi-Fi",detailTr:"Ağ adını havalimanı bilgi noktasından doğrula. Bağlantı süresi ve giriş yöntemi terminale göre değişebilir.",detailEn:"Confirm the network name at airport information. Session limits and sign-in methods vary by terminal."},
  {icon:"suitcase",tr:"Bagaj",en:"Baggage",detailTr:"Bagaj etiketindeki varış kodunu kontrol et. Ayrı biletlerde bagajını alıp yeniden vermen gerekebilir.",detailEn:"Check the destination on your baggage tag. Separate tickets may require collection and recheck."},
  {icon:"compass",tr:"Ulaşım",en:"Transport",detailTr:"Resmî ulaşım tabelalarını takip et. Son sefer saati, terminal durağı ve ödeme yöntemini kontrol et.",detailEn:"Follow official transport signs. Check last departures, your terminal stop and payment methods."},
  {icon:"clock",tr:"Lounge",en:"Lounge",detailTr:"Giriş hakkını, terminalini ve açık saatleri havayolundan veya lounge işletmesinden doğrula.",detailEn:"Confirm access eligibility, terminal location and hours with your airline or lounge operator."},
  {icon:"wallet",tr:"Yeme & içme",en:"Food & drink",detailTr:"Güvenlikten sonra açık seçenekleri ve uçuş kapına yürüme süresini kontrol et.",detailEn:"Check open options after security and walking time to your gate."},
  {icon:"info",tr:"Yardım",en:"Assistance",detailTr:"Özel yardım ihtiyacını uçuş öncesinde havayoluna bildir; havalimanında resmî danışma noktasına başvur.",detailEn:"Arrange special assistance with your airline before travel; use the official airport information desk."},
];
export function AirportGuideScreen({ onOpenTransfer, onNotice }: { onOpenTransfer: () => void; onNotice: (message: string) => void }) {
  const { copy } = useI18n();
  const [airport,setAirport] = useState<AirportOption | null>(null);
  const [region,setRegion] = useState("popular");
  const picks = AIRPORT_PICKS.filter(item => region === "tr" ? item.countryCode === "TR" : region === "eu" ? ["GB","FR","IT"].includes(item.countryCode) : region === "world" ? item.countryCode !== "TR" : ["IST","SAW","LHR","CDG","DXB"].includes(item.iata));
  const [topic,setTopic] = useState<number | null>(null);
  const guide = AIRPORT_GUIDES.find(item => item.iata === airport?.iata);
  const openGuide = async () => {
    if (guide && !await openExternal(guide.url)) onNotice(copy("Bağlantı açılamadı. İnternet bağlantını kontrol et.", "Could not open the link. Check your connection."));
  };
  return <div className="screen airport-guide-screen"><PageHero scene="airport" title={copy("Havalimanı Rehberi", "Airport Guide")} subtitle={copy("Havalimanını bul, yolculuğuna hazırlan.", "Find your airport, prepare for your journey.")} />
    <div className="form-card"><AirportField label={copy("Havalimanı ara", "Find an airport")} value={airport} onChange={setAirport} /></div>
    <div className="editorial-segments airport-regions" role="group" aria-label={copy("Havalimanı bölgesi", "Airport region")}>{["popular","tr","eu","world"].map((id,index) => <button type="button" key={id} aria-pressed={region === id} onClick={() => setRegion(id)}>{[copy("Öne çıkan","Featured"),copy("Türkiye","Türkiye"),copy("Avrupa","Europe"),copy("Dünya","World")][index]}</button>)}</div>
    {airport && <section className="editorial-airport-result"><Icon name="plane" size={27} /><div><small>{airport.iata} · {airport.city}, {airport.country}</small><h2>{airport.name}</h2></div></section>}
    <div className="airport-guide-columns"><div className="airport-shortlist">{picks.map(item => <button type="button" key={item.iata} aria-pressed={airport?.iata === item.iata} onClick={() => setAirport(item)}><span className="airport-code-tile">{item.iata}<Icon name="plane" size={14} /></span><span><strong>{item.name}</strong><small>{item.city}</small></span><Icon name="chevron" size={14} /></button>)}</div><section className="airport-amenity-column">
    <div className="editorial-heading"><h2>{copy("Havalimanında ihtiyacın olanlar", "At the airport")}</h2></div>
    <div className="editorial-amenities">{topics.map((item,i) => <button type="button" key={item.en} aria-pressed={topic === i} onClick={() => setTopic(topic === i ? null : i)}><Icon name={item.icon} size={25} /><span>{copy(item.tr,item.en)}</span></button>)}</div>
    </section></div>
    {topic !== null && <section className="editorial-topic" role="status"><h2>{copy(topics[topic].tr,topics[topic].en)}</h2><p>{copy(topics[topic].detailTr,topics[topic].detailEn)}</p></section>}
    <p className="editorial-data-note">{copy("Bu bölüm genel hazırlık rehberidir. Seçilen havalimanındaki olanaklar ve açık saatleri henüz doğrulanmış olarak sunulmuyor.", "General preparation guidance. Facilities and opening hours at the selected airport are not yet provided as verified information.")}</p>
    {guide && <button type="button" className="secondary-wide" onClick={() => void openGuide()}>{copy("Resmî yolcu rehberini aç", "Open official passenger guide")} <Icon name="external" size={17} /></button>}
    <button type="button" className="primary-wide" onClick={onOpenTransfer}>{copy("Aktarma yardımcısını aç", "Open transfer assistant")} <Icon name="chevron" size={17} /></button>
  </div>;
}
