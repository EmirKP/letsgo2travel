import { useMemo, useState } from "react";
import { CITY_BENCHMARKS, CITY_PRICE_MONTH, CITY_PRICE_SOURCE, CITY_FX_REFERENCE_DATE } from "../../../lib/country-intelligence/city-benchmarks";
import { COST_CURRENCIES } from "../../../lib/country-intelligence/currencies";
import { estimateCost } from "../../../lib/country-intelligence/cost-model";
import { useAdvisories, useCountryData, type InflationData, type Rate } from "../lib/countryIntelligence";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { Sheet } from "./Sheet";
import { CountryFlag } from "./CountryFlag";
import { CountryRiskBadge, CountryAdvisory } from "./CountryAdvisory";
import { LocationCalculator } from "./CostCalculators";
import { Icon } from "./Icon";

type Adjustment = { currency: string; inflation: InflationData | null; fx: Rate | null; referenceFx: Rate | null };
export function CityPriceCatalog({ onOpenCountryNews }: { onOpenCountryNews: (code: string) => void }) {
  const { copy, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const [sort, setSort] = useState("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const rows = CITY_BENCHMARKS.filter(row => `${row.city.tr} ${row.city.en} ${names.of(row.code)}`.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).sort((a,b) => sort === "price" ? a.basket-b.basket : a.city[locale].localeCompare(b.city[locale], locale));
  const visible = rows.slice(0, limit);
  const risks = useAdvisories(visible.map(row => row.code));
  const selected = CITY_BENCHMARKS.find(row => row.id === selectedId);
  const { data, loading, error, retry } = useCountryData<Adjustment>(selected ? `/api/country-costs?benchmark=${selected.id}` : null);
  const money = (n: number, currency="GBP") => new Intl.NumberFormat(locale, { style:"currency", currency, maximumFractionDigits: 0 }).format(n);
  const adjusted = selected && data?.referenceFx ? estimateCost({ fx: data.fx, inflation: data.inflation, baseline: { code: selected.code, city: selected.city, currency: data.currency, daily: selected.basket * data.referenceFx.rate, referenceMonth: CITY_PRICE_MONTH, source: null, quality: "user-quote" } }, "average") : null;
  return <section className="ci-content ci-city-catalog">
    <div className="ci-heading"><h2>{copy("50 şehir · Tarihli fiyat karşılaştırması", "50 cities · Dated price comparison")}</h2></div>
    <p className="ci-muted">{copy("Mayıs 2026 araştırması: aynı 12 kalemden oluşan iki kişilik hafta sonu sepeti. Kişi başı günlük fiyat veya canlı rezervasyon teklifi değildir.", "May 2026 survey: a comparable 12-item weekend basket for two. Not a daily per-person price or a live booking quote.")}</p>
    <label className="guide-search"><Icon name="search" size={18}/><input type="search" aria-label={copy("50 şehirde ara", "Search 50 cities")} placeholder={copy("Ülke veya şehir ara", "Search country or city")} value={query} onChange={event => {setQuery(event.target.value); setLimit(8);}}/></label>
    <div className="ci-heading"><small>{rows.length} {copy("şehir", "cities")}</small><select aria-label={copy("Şehir sırası", "City order")} value={sort} onChange={e => setSort(e.target.value)}><option value="price">{copy("Aynı sepette ucuzdan pahalıya", "Same basket, low to high")}</option><option value="name">{copy("Şehir adı", "City name")}</option></select></div>
    <div className="ci-cost-list">{visible.map(row => <button type="button" className="ci-cost-row" key={row.id} onClick={() => setSelectedId(row.id)}><CountryFlag code={row.code} label={names.of(row.code)||row.code}/><span className="ci-cost-place"><strong>{row.city[locale]}</strong><small>{names.of(row.code)}</small><CountryRiskBadge advisory={risks.find(r=>r.code===row.code)}/></span><span className="ci-cost-price"><strong>{money(row.basket)}</strong><small>{copy("2 kişi · hafta sonu sepeti", "2 people · weekend basket")}</small></span><Icon name="chevron" size={16}/></button>)}</div>
    {!rows.length && <p className="ci-empty">{copy("Bu şehir için tarihli örnek yok. Aşağıdaki hesaplayıcıya kendi yerel fiyatını girebilirsin.", "No dated sample for this city. Use your own local quote in the calculator below.")}</p>}
    {limit < rows.length && <button type="button" className="country-load-more" onClick={() => setLimit(n=>n+8)}>{copy("Daha fazla şehir", "More cities")} · {Math.min(limit, rows.length)}/{rows.length}</button>}
    <details className="ci-method"><summary>{copy("Kaynak, kapsam ve belirsizlik", "Source, coverage and uncertainty")}</summary><p>{copy("Post Office City Costs Barometer, 22 Mayıs 2026. 12 kalem; şehir merkezinde 3 yıldızlı otelde 2 kişi için 2 gece, yemek, içecek, ulaşım ve gezilecek yerleri kapsayan karşılaştırma sepetidir. Otel teklifi 5–7 Haziran içindir. Fiyatlar erken Mayıs kuru ile GBP'ye çevrilmiştir; en ucuz on otelin ortalaması tüm otelleri temsil etmez. Sezon, semt, vergi ve müsaitlik sonucu değiştirir.", "Post Office City Costs Barometer, 22 May 2026. A 12-item comparison basket including two nights for two in a three-star central hotel, food, drinks, transport and attractions. Hotels were quoted for 5–7 June. Prices used early-May GBP exchange rates; the average of the ten cheapest hotels does not represent all hotels. Season, neighbourhood, tax and availability change the result.")}</p><button className="ci-text-button" type="button" onClick={() => void openExternal(CITY_PRICE_SOURCE)}>{copy("Orijinal fiyat tablosu (PDF)", "Original price table (PDF)")}<Icon name="external" size={14}/></button></details>
    <Sheet open={!!selected} title={selected?.city[locale] || ""} onClose={() => setSelectedId(null)}>{selected && <div className="ci-content ci-details">
      <div className="ci-result"><span>{copy("Kaynak sepeti · 2 kişi / hafta sonu", "Source basket · 2 people / weekend")}</span><strong>{money(selected.basket)}</strong><small>{copy("Fiyat araştırması", "Survey month")}: {CITY_PRICE_MONTH}</small></div>
      <div className="detail-list"><div><span>{copy("Merkez otel · 2 kişi / 2 gece", "Central hotel · 2 people / 2 nights")}</span><strong>{money(selected.hotel)}</strong></div><div><span>{copy("Bir akşam yemeği · 2 kişi", "One dinner · 2 people")}</span><strong>{money(selected.meal)}</strong></div><div><span>{copy("48 saat ulaşım · 1 kişi", "48h transport · 1 person")}</span><strong>{money(selected.travel)}</strong></div></div>
      <p className="ci-muted">{copy("Bu üç kalem toplam 12 kalemlik sepetin alt kümesidir. Sıfır ulaşım tutarı her ulaşım biçiminin ücretsiz olduğu anlamına gelmez; kaynak kapsamını kontrol et.", "These three items are a subset of the 12-item basket. A zero transport price does not mean every transport service is free; check source conditions.")}</p>
      <section className="ci-section"><h2>{copy("Enflasyon ve kurla güncelleme", "CPI and exchange-rate adjustment")}</h2>
        {loading && <p role="status">{copy("Baz kur, güncel kur ve endeks alınıyor…", "Loading reference rate, current rate and price index…")}</p>}
        {error && <button type="button" className="ci-text-button" onClick={retry}>{copy("Kaynak alınamadı · Yeniden dene", "Source unavailable · Retry")}</button>}
        {data && !adjusted && <p className="ci-empty">{copy("Mayıs baz kuru doğrulanamadığından yerel fiyat ve enflasyon hesabı gösterilmiyor. GBP araştırma tutarı yukarıda korunuyor.", "The May reference rate could not be verified, so no local-price or CPI calculation is shown. The original GBP amount is preserved above.")}</p>}
        {adjusted && data && <div className="ci-result"><span>{adjusted.inflationApplied ? `${CITY_PRICE_MONTH} → ${data.inflation?.period} · CPI` : copy("Enflasyon eksik · Yalnız kur tahmini", "CPI unavailable · Exchange estimate only")}</span><strong>{money(adjusted.localDaily, data.currency)}</strong>{adjusted.converted !== null && <span>≈ {money(adjusted.converted,"TRY")}</span>}<small>{copy("Kur tarihi", "Exchange date")}: {data.fx?.date || "—"}</small><p>{copy("Erken Mayıs kuru için 5 Mayıs referansını kullanıyoruz; kaynağın gerçek dönüşüm günü bilinmediği için yerel baz yaklaşık değerdir. Mayıs → son aylık genel fiyat endeksi uygulanır, ardından güncel kurla TL'ye çevrilir. Otelin bugünkü satış fiyatı değildir.", "5 May approximates the source's early-May exchange rate, so the reconstructed local baseline is approximate. May-to-latest monthly general CPI is applied before conversion to TRY at the current rate. This is not today's hotel selling price.")}</p><small>{CITY_FX_REFERENCE_DATE} · Frankfurter {data.inflation ? `· ${data.inflation.provider} ${data.inflation.period}` : ""}</small>{data.inflation?.freshness === "last-known" && <small>{copy("Son kayıt", "Last record")}: {data.inflation.checkedAt.slice(0,10)}</small>}</div>}
      </section>
      <LocationCalculator key={selected.id} currency={COST_CURRENCIES[selected.code]}/>
      <CountryAdvisory code={selected.code} onOpenNews={code => {setSelectedId(null); onOpenCountryNews(code);}}/>
    </div>}</Sheet>
  </section>;
}
