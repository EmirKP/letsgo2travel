import { useMemo, useState } from "react";
import { PageHero } from "../components/PageHero";
import { CountryFlag } from "../components/CountryFlag";
import { Sheet } from "../components/Sheet";
import { Icon } from "../components/Icon";
import { useI18n } from "../lib/i18n";
import { COST_EXAMPLES, budgetTotal, costPerDay, type CostEstimate } from "../data/costEstimates";

export function CostsScreen() {
  const {copy,locale}=useI18n();
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<"low"|"high"|"name">("low");
  const [selected,setSelected]=useState<CostEstimate|null>(null);
  const [amounts,setAmounts]=useState(["0","0","0","0"]);
  const [days,setDays]=useState("3");
  const [people,setPeople]=useState("1");
  const [custom,setCustom]=useState(false);
  const money=(n:number)=>new Intl.NumberFormat(locale === "tr" ? "tr-TR":"en-GB",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(n);
  const items=useMemo(()=>COST_EXAMPLES.filter(i=>`${i.country} ${i.countryEn} ${i.city} ${i.cityEn}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).sort((a,b)=>sort==="name" ? (locale==="tr"?a.country:a.countryEn).localeCompare(locale==="tr"?b.country:b.countryEn,locale) : (costPerDay(a)-costPerDay(b))*(sort==="low"?1:-1)),[query,sort,locale]);
  const total=budgetTotal(amounts,days,people);
  const open=(item:CostEstimate)=>{setSelected(item);setAmounts([item.hotel,item.food,item.transport,item.activities].map(String));setCustom(false);};
  return <div className="screen costs-screen">
    <PageHero scene="coast" title={copy("Ülke Maliyetleri","Travel Costs")} subtitle={copy("Seyahat bütçeni planla, sürprizlere hazır ol.","Plan your budget before you go.")} />
    <label className="guide-search"><Icon name="search" size={18}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={copy("Ülke veya şehir ara…","Search country or city…")} aria-label={copy("Maliyet örneklerinde ara","Search budget examples")}/></label>
    <div className="cost-toolbar" role="group" aria-label={copy("Bütçeleri sırala","Sort budgets")}>{(["low","name","high"] as const).map(id=><button key={id} aria-pressed={sort===id} className={sort===id?"active":""} onClick={()=>setSort(id)}>{id==="low"?copy("Düşük bütçe","Lower budget"):id==="high"?copy("Yüksek bütçe","Higher budget"):copy("Ülke adı","Country name")}</button>)}</div>
    <div className="guide-note"><strong>{copy("Örnek bütçeler · Canlı fiyat değil","Example budgets · Not live prices")}</strong><br/>{copy("Aşağıdaki tutarlar mevcut uygulamanın planlama örnekleridir; güncel ülke ortalaması değildir. Kişi başı günlük TL tutarlarını kendi fiyatlarınla düzenle. Uçuşlar dahil değil.","These are the app’s planning examples, not current country averages. Edit daily TRY amounts per traveller with your own quotes. Flights are excluded.")}</div>
    <div className="cost-list">{items.map(item=><button className="cost-row" key={item.code} onClick={()=>open(item)}><CountryFlag code={item.code} label={locale==="tr"?item.country:item.countryEn}/><span><strong>{locale==="tr"?item.country:item.countryEn}</strong><small>{locale==="tr"?item.city:item.cityEn} · {copy("kişi / gün","person / day")}</small></span><span><em>{money(costPerDay(item))}</em><small className="estimate-tag">{copy("Örnek tahmin","Example estimate")}</small></span><Icon name="chevron" size={16}/></button>)}</div>
    {!items.length&&<p className="search-empty">{copy("Bu ülke için örnek yok. Kendi bütçeni oluşturabilirsin.","No example for this country. You can create your own budget.")}</p>}
    <button className="primary-wide" onClick={()=>{setSelected({...COST_EXAMPLES[0],country:copy("Kendi bütçem","My budget"),countryEn:"My budget"});setAmounts(["0","0","0","0"]);setCustom(true);}}><Icon name="plus" size={18}/>{copy("Kendi bütçemi hesapla","Calculate my own budget")}</button>
    <Sheet open={Boolean(selected)} title={custom?copy("Kendi bütçem","My budget"):selected?(locale==="tr"?selected.country:selected.countryEn):""} onClose={()=>setSelected(null)}>
      <div className="cost-editor"><p className="guide-note">{custom?copy("Girdiğin tutarlarla hesaplanır. Her kalem kişi başı, günlük TL tutarıdır.","Calculated from your entries. Each amount is daily TRY per traveller."):copy("Örnek tahminleri kendi araştırdığın fiyatlarla değiştirebilirsin. Kişi başı günlük TL; uçuş dahil değil.","Replace example estimates with your own quotes. Daily TRY per traveller; flights excluded.")}</p>
        <div className="cost-inputs">{[copy("Konaklama","Accommodation"),copy("Yeme & içme","Food & drink"),copy("Yerel ulaşım","Local transport"),copy("Etkinlikler","Activities")].map((label,i)=><label key={label}>{label}<input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={amounts[i]} onChange={e=>setAmounts(prev=>prev.map((v,j)=>i===j?e.target.value:v))}/></label>)}<label>{copy("Gün","Days")}<input type="number" min="1" max="365" step="1" inputMode="numeric" value={days} onChange={e=>setDays(e.target.value)}/></label><label>{copy("Kişi","Travellers")}<input type="number" min="1" max="99" step="1" inputMode="numeric" value={people} onChange={e=>setPeople(e.target.value)}/></label></div>
        {total===null?<p className="field-error" role="alert">{copy("Tutarlar 0–1.000.000 TL, gün 1–365 ve kişi 1–99 aralığında olmalı.","Amounts must be 0–1,000,000 TRY, days 1–365 and travellers 1–99.")}</p>:<div className="cost-total" aria-live="polite"><small>{copy("Hesaplanan toplam bütçe","Calculated total budget")}</small><strong>{money(total)}</strong><small>{copy("Girdiğin tutarlara göre; rezervasyon fiyatı değildir.","Based on your entries; not a booking quote.")}</small></div>}
      </div>
    </Sheet>
  </div>;
}
