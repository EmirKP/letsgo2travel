import { useState } from "react";
import { BrandHero } from "../components/BrandHero";
import { AirportField } from "../components/AirportField";
import { Sheet } from "../components/Sheet";
import { Icon, type IconName } from "../components/Icon";
import { AIRPORT_GUIDES } from "../data/airportGuides";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import type { AirportOption } from "../lib/airports";


export function AirportsScreen({onOpenTransfer,onNotice}:{onOpenTransfer:()=>void;onNotice:(text:string)=>void}) {
 const {copy,locale}=useI18n();
 const [region,setRegion]=useState("all");
 const [selected,setSelected]=useState<AirportOption|null>(null);
 const guide=AIRPORT_GUIDES.find(g=>g.iata===selected?.iata);
 const services:Array<{label:string;icon:IconName}>=[{label:copy("Yeme & içme","Food & drink"),icon:"info"},{label:copy("Alışveriş","Shopping"),icon:"suitcase"},{label:"Lounge",icon:"user"},{label:copy("Ulaşım","Transport"),icon:"route"},{label:"Wi-Fi",icon:"wifi"},{label:copy("Bagaj hizmetleri","Baggage services"),icon:"suitcase"}];
 const visit=async(url:string)=>{if(!await openExternal(url))onNotice(copy("Bağlantı açılamadı. İnternet bağlantını kontrol et.","Could not open the link. Check your connection."));};
 return <div className="screen airports-screen">
  <BrandHero kind="airport" title={copy("Havalimanı Rehberi","Airport Guide")} subtitle={copy("Daha rahat bir yolculuk için hazırlan.","Get ready for a more comfortable journey.")} />
  <AirportField label={copy("Havalimanı ara","Search airports")} value={null} onChange={setSelected} placeholder={copy("Şehir, havalimanı veya IATA kodu…","City, airport or IATA code…")} />
  <div className="cost-toolbar" role="group" aria-label={copy("Bölge","Region")}>{["all","turkey","europe","world"].map(id=><button key={id} onClick={()=>setRegion(id)} aria-pressed={region===id} className={region===id?"active":""}>{id==="all"?copy("Seçilenler","Featured"):id==="turkey"?copy("Türkiye","Türkiye"):id==="europe"?copy("Avrupa","Europe"):copy("Diğer","Elsewhere")}</button>)}</div>
  <div className="airport-guide-list">{AIRPORT_GUIDES.filter(g=>region==="all"||g.region===region).map(g=><button key={g.iata} className="airport-guide-row" onClick={()=>setSelected({iata:g.iata,name:locale==="tr"?g.name:g.nameEn,city:g.city,country:g.countryCode,countryCode:g.countryCode})}><span className="airport-code">{g.iata}</span><span><strong>{locale==="tr"?g.name:g.nameEn}</strong><small>{g.city} · {copy("Resmî yolcu rehberi","Official passenger guide")}</small></span><Icon name="chevron" size={16}/></button>)}</div>
  <p className="guide-note">{copy("Hizmetlerin açık olma durumu, ücretleri ve terminal bilgileri resmî havalimanı kaynağında yer alır. Burada canlı uçuş veya olanak verisi sunulmuyor.","Check availability, prices and terminal details with the official airport source. This directory does not provide live flight or facility data.")}</p>
  <button className="primary-wide" onClick={onOpenTransfer}><Icon name="swap" size={18}/>{copy("Aktarma yardımcısını aç","Open transfer assistant")}</button>
  <Sheet open={Boolean(selected)} title={selected?`${selected.iata} · ${selected.name}`:""} onClose={()=>setSelected(null)} size="large">
   <p className="guide-note">{guide?copy("Olanak ve ulaşım bilgilerini havalimanının resmî rehberinden kontrol et. Aşağıdaki başlıklar rehberde arayacağın konulardır; hizmetin mevcut veya ücretsiz olduğu anlamına gelmez.","Check facilities and transport in the official airport guide. The topics below are a checklist, not a claim that services are available or free."):copy("Bu havalimanı için doğrulanmış resmî rehber bağlantısı henüz eklenmedi. Hizmet bilgisi gösterilmiyor.","A verified official guide link has not yet been added for this airport. Facility information is unavailable.")}</p>
   <div className="airport-service-grid">{services.map(s=><div className="airport-service-topic" key={s.label}><Icon name={s.icon} size={24}/><strong>{s.label}</strong><small>{copy("Rehberden kontrol et","Check the guide")}</small></div>)}</div>
   {guide&&<button className="primary-wide" onClick={()=>void visit(guide.url)}><Icon name="external" size={18}/>{copy("Resmî yolcu rehberini aç","Open official passenger guide")}</button>}
   <p className="guide-note">{copy("Aktarma yardımcısı Kaydedilenler içindeki seyahat araçlarında bulunur.","Find the transfer assistant in the travel tools under Saved.")}</p>
  </Sheet>
 </div>;
}
