import { useEffect, useState } from "react";
import { CITY_FX_REFERENCE_DATE, CITY_PRICE_MONTH, CITY_PRICE_SOURCE } from "../../../lib/country-intelligence/city-benchmarks";
import { routeBudgetDays, routeBudgetEstimate, routeCityBenchmark, routeInflation, type BudgetQuote, type RouteBudgetAdjustment } from "../../../lib/country-intelligence/route-budget";
import { normalizePlannerPreferences } from "../../../lib/planner-preferences";
import { useCountryData } from "../lib/countryIntelligence";
import { useI18n } from "../lib/i18n";
import { loadQuote, storedQuote } from "../lib/travelAssistant";
import { openExternal } from "../lib/native";
import type { PlannerInput, RouteSuggestion } from "../types";
import { Icon } from "./Icon";

function useRouteQuote(base: string | null, currency: string, revision: number) {
  const pair = base && base !== currency ? `${base}-${currency}` : null;
  const [state, setState] = useState<{ pair: string | null; quote: BudgetQuote | null; loading: boolean }>({ pair: null, quote: null, loading: false });
  useEffect(() => {
    if (!pair || !base) return;
    let current = true;
    const saved = storedQuote(base, currency);
    setState({ pair, quote: saved, loading: true });
    void loadQuote(base, currency).then(quote => {
      if (current) setState({ pair, quote, loading: false });
    }).catch(() => {
      if (current) setState({ pair, quote: saved, loading: false });
    });
    return () => { current = false; };
  }, [base, currency, pair, revision]);
  return { quote: pair && state.pair === pair ? state.quote : null, loading: !!pair && (state.pair !== pair || state.loading) };
}

export function RouteBudgetAnalysis({ route, input, onActivityBudget, onCurrency }: { route: RouteSuggestion; input: PlannerInput; onActivityBudget?: (value: number | undefined) => void; onCurrency?: (value: NonNullable<PlannerInput["currency"]>) => void }) {
  const { copy, locale } = useI18n();
  const row = routeCityBenchmark(route);
  const preferences = normalizePlannerPreferences(input);
  const { currency, party } = preferences;
  const days = routeBudgetDays(input, route.idealDuration);
  const { data, loading, error, retry } = useCountryData<RouteBudgetAdjustment>(row ? `/api/country-costs?benchmark=${row.id}` : null);
  const inflation = routeInflation(data);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  const localCurrency = inflation ? data?.currency : undefined;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const gbp = useRouteQuote(row ? "GBP" : null, currency, refresh);
  const local = useRouteQuote(row && localCurrency ? localCurrency : null, currency, refresh);
  const gbpQuote = gbp.quote, localQuote = local.quote;
  const rateLoading = gbp.loading || local.loading;
  const estimate = row && days ? routeBudgetEstimate(row, input, days, data, gbpQuote, localQuote, now) : null;
  const money = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  const tier = preferences.tier === "economy" ? copy("Ekonomik", "Economy", "Ekonomik") : preferences.tier === "plus" ? "Plus" : copy("Orta", "Balanced", "Mesatar");
  const usedQuote = estimate?.inflationApplied ? localQuote : gbpQuote;
  return <section className="route-budget-analysis" aria-label={copy("Rota maliyet analizi", "Route cost analysis", "Analiza e kostos së itinerarit")}>
    <div className="planner-itinerary-heading"><h3><Icon name="wallet" size={20}/>{copy("Maliyet analizi", "Cost analysis", "Analiza e kostos")}</h3>{row && <button type="button" className="planner-edit-link" disabled={loading || rateLoading} onClick={() => { retry(); setRefresh(value => value + 1); }}>{loading || rateLoading ? copy("Güncelleniyor…", "Updating…", "Po përditësohet…") : copy("Güncelle", "Refresh", "Rifresko")}</button>}</div>
    <p>{days ? copy(`${days} gün`, `${days} days`, `${days} ditë`) : copy("Süre belirtilmedi", "No duration", "Pa kohëzgjatje")} · {copy(`${party.adults} yetişkin, ${party.children} çocuk`, `${party.adults} adults, ${party.children} children`, `${party.adults} të rritur, ${party.children} fëmijë`)} · {tier} · {currency}</p>
    {onCurrency && <label className="planner-result-currency">{copy("Para birimi", "Currency", "Monedha")}<select value={currency} onChange={event => onCurrency(event.target.value as NonNullable<PlannerInput["currency"]>)}>{["TRY", "EUR", "USD", "GBP"].map(value => <option key={value}>{value}</option>)}</select></label>}
    {!input.dayCount && <p className="planner-budget-note">{copy("Hazır rotalarda süre aralığının ilk günü sayısı kullanılır.", "For saved sample duration ranges, the lower number of days is used.", "Për intervalet e planeve të gatshme përdoret numri më i vogël i ditëve.")}</p>}
    {!row || !days ? <p role="status">{copy("Bu şehir için doğrulanabilir fiyat tabanımız yok. Başka bir şehrin fiyatını kullanarak toplam üretmiyoruz; konaklama, yemek, ulaşım ve aktivite tekliflerini ayrıca kontrol et.", "No sourced price baseline is available for this city. We cannot estimate a total using another city's prices; check accommodation, food, transport and activity quotes separately.", "Nuk ka bazë çmimesh me burim për këtë qytet. Nuk llogarisim total me çmimet e një qyteti tjetër; kontrollo veçmas akomodimin, ushqimin, transportin dhe aktivitetet.")}</p> : <>
      <div className="planner-cost-lines">
        {[[copy("Konaklama", "Accommodation", "Akomodimi"), estimate?.hotel], [copy("Yemek · günde bir akşam yemeği", "Food · one dinner per day", "Ushqimi · një darkë në ditë"), estimate?.meals], [copy("Şehir içi ulaşım", "Local transport", "Transporti lokal"), estimate?.travel], [copy("Aktiviteler · senin ayırdığın tutar", "Activities · your allowance", "Aktivitetet · shuma jote"), estimate?.activities]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{money(value as number | undefined)}</strong></div>)}
      </div>
      {onActivityBudget && <label className="planner-activity-budget">{copy(`Aktivite payın · kişi başı/gün (${currency})`, `Your activity allowance · per person/day (${currency})`, `Shuma për aktivitete · për person/ditë (${currency})`)}<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={input.activityBudgetPerPersonDay ?? ""} placeholder={copy("Belirlenmedi", "Not specified", "E papërcaktuar")} onChange={event => { const value = event.target.value === "" ? undefined : Number(event.target.value); if (value === undefined || (Number.isFinite(value) && value >= 0 && value <= 100000)) onActivityBudget(value); }}/></label>}
      <div className="planner-cost-total"><span>{estimate?.partial ? copy("Hesaplanabilen ara toplam", "Estimated subtotal", "Nëntotali i vlerësuar") : copy("Bu kapsamda tahmini toplam", "Estimated total for this scope", "Totali i vlerësuar për këtë përfshirje")}<strong>{money(estimate?.total)}</strong></span><small>{copy("Kişi başı", "Per person", "Për person")}: {money(estimate?.perPerson)} · {copy("Kişi başı/gün", "Per person/day", "Për person/ditë")}: {money(estimate?.perPersonDay)}</small></div>
      {estimate?.total === null && !rateLoading && <p role="status">{copy("Son 7 güne ait kullanılabilir kur yok; seçilen para biriminde tutar hesaplanamadı.", "No usable exchange rate from the last seven days; amounts in your selected currency are unavailable.", "Nuk ka kurs të përdorshëm nga shtatë ditët e fundit; shumat në monedhën e zgjedhur mungojnë.")}</p>}
      <p className="planner-budget-note">{copy(`${days - 1} gece, ${estimate?.rooms} çift kişilik oda; çocuklar yetişkin fiyatıyla sayılır, çocuk indirimi varsayılmaz. Uçuş ve diğer öğünler dahil değil.`, `${days - 1} nights, ${estimate?.rooms} double rooms; children use adult prices, with no assumed child discount. Excludes flights and other meals.`, `${days - 1} net, ${estimate?.rooms} dhoma dyshe; fëmijët llogariten me çmim të rrituri, pa ulje të supozuar. Nuk përfshin fluturimet dhe vaktet e tjera.`)}</p>
      {estimate?.partial && <p className="planner-budget-note">{copy("Aktivite fiyatı bilinmiyor ve ara toplama dahil değil. Ücretsiz aktiviteler planlıyorsan 0 girebilirsin.", "Activity prices are unknown and excluded from the subtotal. Enter 0 if you plan free activities.", "Çmimet e aktiviteteve mungojnë dhe nuk përfshihen në nëntotal. Vendos 0 për aktivitete falas.")}</p>}
      <details className="planner-cost-methodology"><summary>{copy("Hesaplama ve kaynaklar", "Method and sources", "Llogaritja dhe burimet")}</summary>
      <p className="planner-budget-note">{copy("Ekonomik: otel ×0,75, yemek ×0,80; Orta: kaynak fiyat; Plus: otel ×1,50, yemek ×1,35, ulaşım ×1,30. Bunlar planlama varsayımlarıdır; sınıflara ait ölçülmüş fiyat değildir.", "Economy: hotel ×0.75, dinner ×0.80; Balanced: source prices; Plus: hotel ×1.50, dinner ×1.35, transport ×1.30. These are planning assumptions, not measured prices by class.", "Ekonomik: hotel ×0,75, darkë ×0,80; Mesatar: çmimet burimore; Plus: hotel ×1,50, darkë ×1,35, transport ×1,30. Janë supozime planifikimi, jo çmime të matura sipas klasës.")}</p>
      <div className="planner-budget-sources"><button type="button" onClick={() => void openExternal(CITY_PRICE_SOURCE)}>Post Office City Costs Barometer · {CITY_PRICE_MONTH}<Icon name="external" size={14}/></button>
        {estimate?.inflationApplied ? <p>{copy("Ülkenin aylık fiyat endeksiyle güncellendi", "Adjusted with the country's monthly price index", "Përshtatur me indeksin mujor të çmimeve të vendit")}: {data?.inflation?.period} · {data?.inflation?.provider}. {copy("Yaklaşık kaynak kur tarihi", "Approximate source FX bridge date", "Data e përafërt e kursit burimor")}: {CITY_FX_REFERENCE_DATE}.</p> : <p>{copy("Uygun aylık enflasyon endeksi ve kur çifti birlikte bulunamadı; enflasyon uygulanmadı. Mayıs 2026 fiyat tabanı kullanılıyor.", "A matching monthly inflation index and exchange-rate pair are unavailable; no inflation was applied. Uses the May 2026 price baseline.", "Indeksi mujor i inflacionit dhe çifti i kurseve nuk janë të disponueshëm së bashku; inflacioni nuk u zbatua. Përdoret baza e majit 2026.")}</p>}
        {usedQuote && <p>{copy("Kur tarihi", "Exchange-rate date", "Data e kursit")}: {usedQuote.date} · {usedQuote.base}/{usedQuote.quote}</p>}
        {estimate?.inflationApplied && data?.inflation?.sourceUrl && <button type="button" onClick={() => void openExternal(data.inflation!.sourceUrl)}>{copy("Fiyat endeksi kaynağı", "Price index source", "Burimi i indeksit të çmimeve")}<Icon name="external" size={14}/></button>}
        {error && <p>{copy("Güncel ekonomik veri alınamadı; kaynak fiyatlar korunuyor.", "Economic data could not be refreshed; source prices are preserved.", "Të dhënat ekonomike nuk u rifreskuan; çmimet burimore ruhen.")}</p>}
      </div>
      </details>
      <p className="planner-budget-note">{copy("Tahmini planlama hesabıdır; canlı teklif veya gelecek enflasyon tahmini değildir. AI'ın yazdığı bütçe açıklamasından bağımsız hesaplanır.", "A planning estimate, not a live quote or future inflation forecast. Calculated independently of the AI budget description.", "Vlerësim planifikimi, jo ofertë e drejtpërdrejtë ose parashikim inflacioni. Llogaritet veçmas nga përshkrimi i buxhetit nga AI.")}</p>
    </>}
  </section>;
}
