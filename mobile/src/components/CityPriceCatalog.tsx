import { useEffect, useMemo, useState } from "react";
import { CITY_BENCHMARKS, CITY_PRICE_MONTH, CITY_PRICE_SOURCE, CITY_FX_REFERENCE_DATE } from "../../../lib/country-intelligence/city-benchmarks";
import { COST_CURRENCIES } from "../../../lib/country-intelligence/currencies";
import { estimateCost } from "../../../lib/country-intelligence/cost-model";
import { useAdvisories, useCountryData, type InflationData, type Rate } from "../lib/countryIntelligence";
import { useI18n } from "../lib/i18n";
import { appRegionName } from "../lib/localeFormatting";
import { openExternal } from "../lib/native";
import { Sheet } from "./Sheet";
import { CountryFlag } from "./CountryFlag";
import { CountryRiskBadge, CountryAdvisory } from "./CountryAdvisory";
import { LocationCalculator } from "./CostCalculators";
import { Icon } from "./Icon";
import { BUDGET_CURRENCIES, tripBudget, usableBudgetRate } from "../../../lib/country-intelligence/trip-budget";
import { readBudgetPreferences, saveBudgetPreferences, type BudgetPreferences } from "../lib/budgetPreferences";
import { loadQuote, storedQuote } from "../lib/travelAssistant";
import type { FxQuote } from "../../../lib/travel-assistant/types";
import { createBudgetCockpitIntent, type BudgetCockpitIntent } from "../lib/budgetCockpitIntent";
import "./city-budget.css";

type Adjustment = { currency: string; inflation: InflationData | null; fx: Rate | null; referenceFx: Rate | null };
export function CityPriceCatalog({ onOpenCountryNews, ownerId, onPrepareCockpitBudget }: { onOpenCountryNews: (code: string) => void; ownerId?: string | null; onPrepareCockpitBudget?: (intent: BudgetCockpitIntent) => void }) {
  const { copy, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const [sort, setSort] = useState("price");
  const [preferences, setPreferences] = useState(readBudgetPreferences);
  const [view, setView] = useState<"trip" | "source">("trip");
  const [rateState, setRateState] = useState<{ currency: string; quote: FxQuote | null; loading: boolean; saved: boolean }>({ currency: "", quote: null, loading: false, saved: false });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const { currency, days, people } = preferences;
  const textLocale = locale === "tr" ? "tr" : "en";
  const update = (next: Partial<BudgetPreferences>) => { const value = { ...preferences, ...next }; setPreferences(value); saveBudgetPreferences(value); };
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (currency === "GBP") return;
    let current = true;
    const saved = storedQuote("GBP", currency);
    setRateState({ currency, quote: saved, loading: true, saved: !!saved });
    void loadQuote("GBP", currency).then(quote => { if (current) setRateState({ currency, quote, loading: false, saved: false }); }).catch(() => { if (current) setRateState({ currency, quote: saved, loading: false, saved: !!saved }); });
    return () => { current = false; };
  }, [currency, revision]);
  const currentQuote = rateState.currency === currency ? rateState.quote : null;
  const rate = usableBudgetRate(currentQuote, currency, now);
  const rateLoading = currency !== "GBP" && (rateState.currency !== currency || rateState.loading);
  const inputValid = !!tripBudget(CITY_BENCHMARKS[0], days, people);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const names = useMemo(() => ({ of: (code: string) => appRegionName(code, locale) }), [locale]);
  const rows = CITY_BENCHMARKS.filter(row => `${row.city.tr} ${row.city.en} ${names.of(row.code)}`.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).sort((a,b) => sort === "price" ? (view === "trip" ? (tripBudget(a, days, people)?.total || 0) - (tripBudget(b, days, people)?.total || 0) : a.basket-b.basket) : a.city[textLocale].localeCompare(b.city[textLocale], locale));
  const visible = rows.slice(0, limit);
  const risks = useAdvisories(visible.map(row => row.code));
  const selected = CITY_BENCHMARKS.find(row => row.id === selectedId);
  const { data, loading, error, retry } = useCountryData<Adjustment>(selected ? `/api/country-costs?benchmark=${selected.id}` : null);
  const money = (n: number, currency="GBP") => new Intl.NumberFormat(locale, { style:"currency", currency, maximumFractionDigits: 0 }).format(n);
  const displayMoney = (gbp: number) => rate === null ? "—" : money(gbp * rate, currency);
  const selectedBudget = selected ? tripBudget(selected, days, people) : null;
  const adjusted = selected && data?.referenceFx ? estimateCost({ fx: data.fx, inflation: data.inflation, baseline: { code: selected.code, city: selected.city, currency: data.currency, daily: selected.basket * data.referenceFx.rate, referenceMonth: CITY_PRICE_MONTH, source: null, quality: "user-quote" } }, "average") : null;
  return <section className="ci-content ci-city-catalog">
    <div className="budget-intro"><span><Icon name="wallet" size={24}/></span><div><h2>{copy("Seyahat bütçeni karşılaştır", "Compare your travel budget", "Krahaso buxhetin e udhëtimit")}</h2><p>{copy("50 şehir · Süreni ve kişi sayısını seç, aynı temelde karşılaştır.", "50 cities · Choose your duration and group size for a like-for-like comparison.", "50 qytete · Zgjidh kohëzgjatjen dhe numrin e personave për një krahasim të barabartë.")}</p></div></div>
    <div className="budget-controls">
      <label>{copy("Para birimi", "Currency", "Monedha")}<select value={currency} onChange={event => update({ currency: event.target.value as BudgetPreferences["currency"] })}>{BUDGET_CURRENCIES.map(code => <option key={code} value={code}>{({ TRY: "₺ TL", EUR: "€ EUR", USD: "$ USD", GBP: "£ GBP" })[code]}</option>)}</select></label>
      <label>{copy("Gün", "Days", "Ditë")}<input type="number" inputMode="numeric" min="1" max="30" step="1" value={days} onChange={event => update({ days: event.target.value })}/></label>
      <label>{copy("Kişi", "Travellers", "Persona")}<input type="number" inputMode="numeric" min="1" max="20" step="1" value={people} onChange={event => update({ people: event.target.value })}/></label>
    </div>
    {!inputValid && <p className="budget-input-error" role="alert">{copy("1–30 gün ve 1–20 kişi arasında tam sayı gir.", "Enter whole numbers: 1–30 days and 1–20 travellers.", "Vendos numra të plotë: 1–30 ditë dhe 1–20 persona.")}</p>}
    <div className="budget-context" aria-live="polite"><span>{copy("Fiyat araştırması: Mayıs 2026", "Price survey: May 2026", "Studimi i çmimeve: maj 2026")}</span>{currency !== "GBP" && <button type="button" disabled={rateLoading} onClick={() => setRevision(value => value + 1)}>{rateLoading ? copy("Kur alınıyor…", "Loading rate…", "Po merret kursi…") : copy("Kuru yenile", "Refresh rate", "Rifresko kursin")}</button>}
      {currency !== "GBP" && currentQuote && rate !== null && <p>{rateState.saved ? copy("Kayıtlı kur", "Saved rate", "Kursi i ruajtur") : copy("Referans kur", "Reference rate", "Kursi referencë")}: {currentQuote.date} · 1 GBP = {currentQuote.rate.toLocaleString(locale, { maximumFractionDigits: 4 })} {currency}</p>}
      {currency !== "GBP" && rate === null && !rateLoading && <p>{copy("Son 7 güne ait kullanılabilir kur yok; seçili para biriminde tutar gösterilmiyor. Kaynak tutarı GBP olarak korunuyor.", "No usable rate from the last seven days; amounts in your selected currency are unavailable. Source GBP prices remain visible.", "Nuk ka kurs të përdorshëm nga 7 ditët e fundit; shumat në monedhën e zgjedhur mungojnë. Çmimet burimore në GBP mbeten të dukshme.")}</p>}
    </div>
    <div className="budget-view-mode" role="group" aria-label={copy("Bütçe görünümü", "Budget view", "Pamja e buxhetit")}><button type="button" aria-pressed={view === "trip"} onClick={() => setView("trip")}>{copy("Seyahat tahminim", "My trip estimate", "Vlerësimi i udhëtimit tim")}</button><button type="button" aria-pressed={view === "source"} onClick={() => setView("source")}>{copy("Kaynak sepeti", "Source basket", "Shporta burimore")}</button></div>
    <p className="budget-model-note">{view === "trip" ? copy("Otel + günde bir akşam yemeği + şehir içi ulaşım tahmini. Uçuş, diğer öğünler ve gezilecek yer ücretleri dahil değil. Bugünkü satış fiyatı değildir.", "Estimate for a hotel, one dinner per day and local transport. Excludes flights, other meals and attraction fees. These are not today's selling prices.", "Vlerësim për hotel, një darkë në ditë dhe transport lokal. Nuk përfshin fluturimet, vaktet e tjera dhe tarifat e atraksioneve. Nuk janë çmime shitjeje të sotme.") : copy("Kaynağın 2 kişi ve 2 gece için 12 kalemlik orijinal sepeti; gün ve kişi seçimlerin bu görünümü değiştirmez.", "The original 12-item basket for two people and two nights; day and traveller selections do not change this view.", "Shporta origjinale me 12 artikuj për dy persona dhe dy net; zgjedhja e ditëve dhe personave nuk e ndryshon këtë pamje.")}</p>
    <label className="guide-search"><Icon name="search" size={18}/><input type="search" aria-label={copy("50 şehirde ara", "Search 50 cities")} placeholder={copy("Ülke veya şehir ara", "Search country or city")} value={query} onChange={event => {setQuery(event.target.value); setLimit(8);}}/></label>
    <div className="ci-heading ci-catalog-sort"><small>{rows.length} {copy("şehir", "cities", "qytete")}</small><select aria-label={copy("Şehir sırası", "City order", "Renditja e qyteteve")} value={sort} onChange={e => setSort(e.target.value)}><option value="price">{copy("Düşük bütçeden yükseğe", "Low to high budget", "Nga buxheti i ulët te i larti")}</option><option value="name">{copy("Şehir adı", "City name", "Emri i qytetit")}</option></select></div>
    <div className="ci-cost-list">{visible.map(row => { const budget = tripBudget(row, days, people); const total = view === "source" ? row.basket : budget?.total; return <button type="button" className="budget-city-row" key={row.id} onClick={() => setSelectedId(row.id)}><CountryFlag code={row.code} label={names.of(row.code)||row.code}/><span className="ci-cost-place"><strong>{row.city[textLocale]}</strong><small>{names.of(row.code)}</small><CountryRiskBadge advisory={risks.find(r=>r.code===row.code)}/></span><Icon name="chevron" size={18}/><span className="budget-row-total"><span>{view === "trip" ? copy(`${days || "—"} gün · ${people || "—"} kişi`, `${days || "—"} days · ${people || "—"} travellers`, `${days || "—"} ditë · ${people || "—"} persona`) : copy("Orijinal sepet", "Original basket", "Shporta origjinale")}<small>{copy("Tahmini toplam", "Estimated total", "Totali i vlerësuar")}</small></span><strong>{total === undefined ? "—" : displayMoney(total)}<small>{total !== undefined && (rate === null ? `${copy("Kaynak tutarı", "Source amount", "Shuma burimore")}: ${money(total)}` : view === "trip" && budget ? `${displayMoney(budget.perPerson)} / ${copy("kişi", "person", "person")}` : "GBP → " + currency)}</small></strong></span></button>; })}</div>
    {!rows.length && <p className="ci-empty">{copy("Bu şehir için tarihli örnek yok. Aşağıdaki hesaplayıcıya kendi yerel fiyatını girebilirsin.", "No dated sample for this city. Use your own local quote in the calculator below.")}</p>}
    {limit < rows.length && <button type="button" className="country-load-more" onClick={() => setLimit(n=>n+8)}>{copy("Daha fazla şehir", "More cities")} · {Math.min(limit, rows.length)}/{rows.length}</button>}
    <details className="ci-method"><summary>{copy("Kaynak, kapsam ve belirsizlik", "Source, coverage and uncertainty")}</summary><p>{copy("Post Office City Costs Barometer, 22 Mayıs 2026. 12 kalem; şehir merkezinde 3 yıldızlı otelde 2 kişi için 2 gece, yemek, içecek, ulaşım ve gezilecek yerleri kapsayan karşılaştırma sepetidir. Otel teklifi 5–7 Haziran içindir. Fiyatlar erken Mayıs kuru ile GBP'ye çevrilmiştir; en ucuz on otelin ortalaması tüm otelleri temsil etmez. Sezon, semt, vergi ve müsaitlik sonucu değiştirir.", "Post Office City Costs Barometer, 22 May 2026. A 12-item comparison basket including two nights for two in a three-star central hotel, food, drinks, transport and attractions. Hotels were quoted for 5–7 June. Prices used early-May GBP exchange rates; the average of the ten cheapest hotels does not represent all hotels. Season, neighbourhood, tax and availability change the result.")}</p><button className="ci-text-button" type="button" onClick={() => void openExternal(CITY_PRICE_SOURCE)}>{copy("Orijinal fiyat tablosu (PDF)", "Original price table (PDF)")}<Icon name="external" size={14}/></button></details>
    <Sheet open={!!selected} title={selected?.city[textLocale] || ""} onClose={() => setSelectedId(null)}>{selected && <div className="ci-content ci-details">
      {selectedBudget && <><section className="budget-detail-total"><span>{copy(`${selectedBudget.days} gün · ${selectedBudget.people} kişi için tahmin`, `Estimate for ${selectedBudget.days} days · ${selectedBudget.people} travellers`, `Vlerësim për ${selectedBudget.days} ditë · ${selectedBudget.people} persona`)}</span><strong>{displayMoney(selectedBudget.total)}</strong><small>{copy("Kişi başı", "Per person", "Për person")}: {displayMoney(selectedBudget.perPerson)} · {copy("Kaynak toplamı", "Source total", "Totali burimor")}: {money(selectedBudget.total)}</small></section>
        <div className="budget-breakdown"><div><span>{copy("Konaklama", "Accommodation", "Akomodimi")}<small>{copy(`${selectedBudget.nights} gece · ${selectedBudget.rooms} iki kişilik oda`, `${selectedBudget.nights} nights · ${selectedBudget.rooms} double rooms`, `${selectedBudget.nights} net · ${selectedBudget.rooms} dhoma dyshe`)}</small></span><strong>{displayMoney(selectedBudget.hotel)}</strong></div><div><span>{copy("Akşam yemekleri", "Dinners", "Darkat")}<small>{copy("Kişi başı günde bir akşam yemeği", "One dinner per traveller per day", "Një darkë për person në ditë")}</small></span><strong>{displayMoney(selectedBudget.meals)}</strong></div><div><span>{copy("Şehir içi ulaşım", "Local transport", "Transporti lokal")}<small>{copy("Kişi başı 48 saatlik kart dönemleri", "48-hour pass periods per traveller", "Periudha me karta 48-orëshe për person")}</small></span><strong>{displayMoney(selectedBudget.travel)}</strong></div></div>
        <p className="budget-model-note">{copy("Bu hesap 12 kalemlik sepetin tamamını çarpmaz: otel 2 kişilik oda/geceye, akşam yemeği kişi sayısına, ulaşım tam 48 saatlik kartlara göre ölçeklenir. Kalan öğün, uçuş, müze, vergi ve ek harcamaları ayrıca ekle. Kaynak fiyatları Mayıs 2026'ya aittir; güncel kur fiyatların güncel olduğu anlamına gelmez.", "This calculation does not multiply the entire 12-item basket: hotel scales by double room/night, dinner by travellers, and transit by complete 48-hour passes. Add other meals, flights, museums, taxes and extras separately. Source prices are from May 2026; a current exchange rate does not make these current prices.", "Kjo llogaritje nuk shumëzon gjithë shportën me 12 artikuj: hoteli llogaritet sipas dhomës dyshe/natës, darka sipas personave dhe transporti sipas kartave të plota 48-orëshe. Shto veçmas vaktet e tjera, fluturimet, muzetë, taksat dhe shpenzimet shtesë. Çmimet janë nga maji 2026; kursi aktual nuk i bën ato çmime aktuale.")}</p></>}
      {selectedBudget && onPrepareCockpitBudget && <button type="button" className="primary-wide" onClick={() => {
        const intent = createBudgetCockpitIntent(selected, days, people, currency, currentQuote, ownerId || null, selected.city[textLocale]);
        if (intent) { setSelectedId(null); onPrepareCockpitBudget(intent); }
      }}><Icon name="wallet" size={18}/>{copy("Bu tahmini Kokpit’e ekle", "Add this estimate to Cockpit", "Shto këtë vlerësim në Kabinë")}</button>}
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
