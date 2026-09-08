import { useMemo, useState } from "react";
import { PageHero } from "../components/PageHero";
import { CountryFlag } from "../components/CountryFlag";
import { Sheet } from "../components/Sheet";
import { Icon } from "../components/Icon";
import { CountryAdvisory, CountryRiskBadge } from "../components/CountryAdvisory";
import { InflationCalculator, LocationCalculator } from "../components/CostCalculators";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { useCountryData, type CostData, type Advisory } from "../lib/countryIntelligence";
import { budgetTotal } from "../data/costEstimates";
import { PRICE_BASELINES } from "../../../lib/country-intelligence/prices";
import { estimateCost, type Area } from "../../../lib/country-intelligence/cost-model";

const FALLBACK: CostData[] = PRICE_BASELINES.filter(item => item.quality === "traveller-average").map(baseline => ({ baseline, fx: null, inflation: null }));
const AREAS = { average: ["Şehir ortalaması", "City average"], centre: ["Merkez", "Centre"], outside: ["Merkez dışı", "Outside"] } as const;

export function CostsScreen({ onOpenCountryNews }: { onOpenCountryNews: (code: string) => void }) {
  const { copy, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"low" | "high" | "name">("low");
  const [area, setArea] = useState<Area>("average");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState(["0", "0", "0", "0"]);
  const [days, setDays] = useState("3");
  const [people, setPeople] = useState("1");
  const { data, loading, error, retry } = useCountryData<{ data: CostData[]; checkedAt: string }>("/api/country-costs");
  const { data: risks } = useCountryData<{ data: Advisory[] }>("/api/country-advisories?countries=BA,GE,RS,IT,AE");
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const catalog = data?.data.filter(item => item.baseline.quality === "traveller-average") || FALLBACK;
  const items = catalog.filter(item => `${names.of(item.baseline.code)} ${item.baseline.city[locale]}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).map(item => ({ item, estimate: estimateCost(item, area) })).sort((a, b) => {
    if (sort === "name") return (names.of(a.item.baseline.code) || "").localeCompare(names.of(b.item.baseline.code) || "", locale);
    if (a.estimate.converted === null || b.estimate.converted === null) return a.estimate.converted === b.estimate.converted ? 0 : a.estimate.converted === null ? 1 : -1;
    return (a.estimate.converted - b.estimate.converted) * (sort === "low" ? 1 : -1);
  });
  const selected = catalog.find(item => item.baseline.code === selectedCode);
  const estimate = selected ? estimateCost(selected, area) : null;
  const money = (value: number, currency = "TRY") => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  const total = budgetTotal(amounts, days, people);
  return <div className="screen costs-screen ci-screen">
    <PageHero scene="coast" title={copy("Ülke Maliyetleri", "Travel Costs")} subtitle={copy("Yerel fiyatı, kuru ve konumu birlikte değerlendir.", "Compare local prices, exchange rates and location.")}/>
    <div className="ci-content">
      <label className="guide-search"><Icon name="search" size={18}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy("Ülke veya şehir ara…", "Search country or city…")} aria-label={copy("Maliyetlerde ara", "Search costs")}/></label>
      <div className="ci-segments" role="group" aria-label={copy("Konum senaryosu", "Location scenario")}>{(["average", "centre", "outside"] as const).map(id => <button type="button" key={id} aria-pressed={area === id} onClick={() => setArea(id)}>{copy(AREAS[id][0], AREAS[id][1])}</button>)}</div>
      <p className="ci-muted">{area === "average" ? copy("Kaynaklı şehir tahminleri · Kişi başı günlük bütçe, uçuş hariç. Rezervasyon fiyatı değildir.", "Sourced city estimates · Daily budget per traveller, flights excluded. Not booking quotes.") : copy("Konum seçimi bir planlama senaryosudur. Mahalle fiyatı ölçümü değildir; gerçek teklifler için şehir detayındaki karşılaştırmayı kullan.", "Location is a planning scenario, not measured neighbourhood pricing. Use the quote comparison in city details for actual offers.")}</p>
      <div className="ci-heading"><span className="ci-eyebrow">{catalog.length} {copy("şehir · kaynaklı bütçe", "cities · sourced budgets")}</span><select aria-label={copy("Bütçeleri sırala", "Sort budgets")} value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="low">{copy("Düşükten yükseğe", "Low to high")}</option><option value="high">{copy("Yüksekten düşüğe", "High to low")}</option><option value="name">{copy("Ülke adı", "Country name")}</option></select></div>
      {loading && <p className="ci-muted" role="status">{copy("Kur ve enflasyon güncelleniyor…", "Updating exchange rates and inflation…")}</p>}
      {error && <div className="ci-empty"><p>{copy("Canlı veri alınamadı. Yerel tutarlar gösteriliyor; TL karşılığı hesaplanmıyor.", "Live data is unavailable. Local amounts are shown without TRY conversion.")}</p><button className="ci-text-button" type="button" onClick={retry}>{copy("Tekrar dene", "Retry")}</button></div>}
      <div className="ci-cost-list">{items.map(({ item, estimate: row }) => <button type="button" className="ci-cost-row" key={item.baseline.code} onClick={() => setSelectedCode(item.baseline.code)}><CountryFlag code={item.baseline.code} label={names.of(item.baseline.code) || item.baseline.code}/><span className="ci-cost-place"><strong>{names.of(item.baseline.code)}</strong><small>{item.baseline.city[locale]} · {copy("kişi / gün", "person / day")}</small><CountryRiskBadge advisory={risks?.data.find(a => a.code === item.baseline.code)}/></span><span className="ci-cost-price"><strong>{row.converted === null ? money(row.localDaily, item.baseline.currency) : `≈ ${money(row.converted)}`}</strong><small>{row.converted === null ? copy("TL kuru yok", "TRY rate unavailable") : money(row.localDaily, item.baseline.currency)}</small></span><Icon name="chevron" size={16}/></button>)}</div>
      {!items.length && <p className="ci-empty">{copy("Bu ülke için kaynaklı bir şehir bütçemiz henüz yok. Kendi fiyatınla aşağıda hesap yapabilirsin.", "We do not yet have a sourced city budget for this country. Calculate with your own prices below.")}</p>}
      <details className="ci-method"><summary>{copy("Fiyatlar nasıl hesaplanıyor?", "How are estimates calculated?")}</summary><p>{copy("Başlangıç fiyatları Budget Your Trip gezgin harcama ortalamalarıdır; tüm ülkeyi veya bugünkü otel fiyatını temsil etmez. Fiyat toplama ayı bilinmediğinden bu ortalamalara enflasyon eklenmez. Aşağıdaki tarihli fiyat hesabı, uyumlu aylık endeks varsa enflasyonu uygular.", "Baselines are Budget Your Trip traveller spending averages, not countrywide or current hotel prices. Their collection month is unknown, so CPI is not added. The dated-quote calculator below applies inflation where a compatible monthly index exists.")}</p><p>{copy("Konum senaryosu: %40 konaklama, %30 yemek, %15 ulaşım, %15 diğer. Merkezde konaklama +%20, yemek +%10, ulaşım −%20; dışarıda sırasıyla −%20, −%10, +%50 varsayılır. Bunlar ölçülmüş ülke oranları değildir.", "Scenario: 40% accommodation, 30% food, 15% transport, 15% other. Centre assumes +20% accommodation, +10% food, −20% transport; outside assumes −20%, −10%, +50%. These are not measured country rates.")}</p><p>{copy("Kur 7 günden eskiyse TL dönüşümü gösterilmez. Sezon, vergi ve döviz marjı gerçek tutarı değiştirir. Eski Bakü örneği güncel fiyat sıralamasına dahil değildir.", "TRY conversion is omitted for rates older than 7 days. Season, tax and exchange margins affect actual costs. The old Baku example is excluded from current-price rankings.")}</p><button type="button" className="ci-text-button" onClick={() => void openExternal("https://frankfurter.dev/")}>Frankfurter<Icon name="external" size={14}/></button></details>
      <InflationCalculator/>
      <button type="button" className="ci-link-row" onClick={() => onOpenCountryNews("TR")}><Icon name="globe" size={20}/><span><strong>{copy("Ülke gündemini kontrol et", "Check country updates")}</strong><small>{copy("Uyarılar, haberler ve önemli günler", "Advice, news and important dates")}</small></span><Icon name="chevron" size={18}/></button>
      <button type="button" className="ci-button" onClick={() => setCustom(true)}><Icon name="plus" size={18}/>{copy("Kendi günlük bütçemi oluştur", "Create my own daily budget")}</button>
    </div>
    <Sheet open={!!selected} title={selected ? `${names.of(selected.baseline.code)} · ${selected.baseline.city[locale]}` : ""} onClose={() => setSelectedCode(null)}>
      {selected && estimate && <div className="ci-content ci-details"><div className="ci-result"><span>{copy(AREAS[area][0], AREAS[area][1])} · {copy("Kişi / gün", "Person / day")}</span><strong>{estimate.converted === null ? money(estimate.localDaily, selected.baseline.currency) : money(estimate.converted)}</strong>{estimate.low !== null && estimate.high !== null && <span>{copy("Planlama aralığı", "Planning range")}: {money(estimate.low)}–{money(estimate.high)}</span>}<p>{copy("Aralık tahminin %80–130'udur; istatistiksel güven aralığı veya fiyat garantisi değildir.", "Range is 80–130% of the estimate, not a statistical confidence interval or a price guarantee.")}</p><small>{estimate.rateUsable ? `${copy("Kur tarihi", "Exchange date")}: ${selected.fx?.date}` : copy("Güncel kur alınamadı", "Current exchange rate unavailable")}</small></div>
        <div className="ci-source-detail"><strong>{copy("Yerel başlangıç tutarı", "Local baseline")}: {money(selected.baseline.daily, selected.baseline.currency)}</strong><p>{copy("Gözlem ayı kaynakta belirtilmiyor. Kaynak okuma tarihi", "Observation month is unspecified. Source read")}: {selected.baseline.source?.checkedAt.slice(0, 10)}</p><button type="button" className="ci-text-button" onClick={() => void openExternal(selected.baseline.source!.url)}>Budget Your Trip<Icon name="external" size={14}/></button></div>
        <div className="ci-source-detail"><strong>{copy("Enflasyon · Kaynak dönemi", "Inflation · Source period")}</strong>{selected.inflation ? <><p>{selected.inflation.annualPercent === null ? copy("Yıllık oran yok", "Annual rate unavailable") : `${selected.inflation.annualPercent.toLocaleString(locale, { maximumFractionDigits: 1, signDisplay: "always" })}%`} · {selected.inflation.period} · {selected.inflation.provider}</p><p>{copy("Bilgi amaçlıdır; tarihi belirsiz ortalamaya eklenmez.", "For context; not added to the undated baseline.")}</p>{selected.inflation.freshness === "last-known" && <p>{copy("Canlı endeks alınamadı · Son kayıt", "Live index unavailable · Last record")}: {selected.inflation.checkedAt.slice(0, 10)}</p>}<button type="button" className="ci-text-button" onClick={() => void openExternal(selected.inflation!.sourceUrl)}>{copy("Endeks kaynağı", "Index source")}<Icon name="external" size={14}/></button></> : <p>{copy("Bu ülke için veri alınamadı.", "Data unavailable for this country.")}</p>}</div>
        <LocationCalculator key={selected.baseline.code} currency={selected.baseline.currency}/>
        <CountryAdvisory code={selected.baseline.code} onOpenNews={code => { setSelectedCode(null); onOpenCountryNews(code); }}/>
      </div>}
    </Sheet>
    <Sheet open={custom} title={copy("Kendi bütçem", "My budget")} onClose={() => setCustom(false)}><div className="ci-content"><p className="ci-muted">{copy("Her kalem kişi başı, günlük TL tutarıdır. Uçuşlar dahil değil.", "Each amount is daily TRY per traveller. Flights excluded.")}</p><div className="ci-fields">{[copy("Konaklama", "Accommodation"), copy("Yemek", "Food"), copy("Ulaşım", "Transport"), copy("Etkinlikler", "Activities")].map((label, i) => <label key={label}>{label}<input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={amounts[i]} onChange={e => setAmounts(prev => prev.map((value, index) => index === i ? e.target.value : value))}/></label>)}<label>{copy("Gün", "Days")}<input type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)}/></label><label>{copy("Kişi", "Travellers")}<input type="number" min="1" max="99" value={people} onChange={e => setPeople(e.target.value)}/></label></div>{total === null ? <p className="ci-error" role="alert">{copy("Geçerli tutar, gün ve kişi sayısı gir.", "Enter valid amounts, days and traveller counts.")}</p> : <div className="ci-result" aria-live="polite"><span>{copy("Girdiğin tutarlarla toplam", "Total from your entries")}</span><strong>{money(total)}</strong></div>}</div></Sheet>
  </div>;
}
