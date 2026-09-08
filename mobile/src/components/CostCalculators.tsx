import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import { CountryPicker } from "./CountryPicker";
import { Icon } from "./Icon";
import { openExternal } from "../lib/native";
import { useCountryData, type InflationData, type Rate } from "../lib/countryIntelligence";
import { COST_CURRENCIES } from "../../../lib/country-intelligence/currencies";
import { estimateCost, quoteComparison } from "../../../lib/country-intelligence/cost-model";

export function InflationCalculator({ initialCountry = "TR" }: { initialCountry?: string }) {
  const { copy, locale } = useI18n();
  const [code, setCode] = useState(initialCountry);
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const { data, loading, error, retry } = useCountryData<{ inflation: InflationData | null; fx: Rate | null }>(path);
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return Object.keys(COST_CURRENCIES).map(code => ({ code, name: names.of(code) || code, meta: COST_CURRENCIES[code] })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const currency = COST_CURRENCIES[code];
  const value = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    && month <= new Date().toISOString().slice(0, 7) && Number(month.slice(0, 4)) >= new Date().getFullYear() - 4;
  const result = data && valid ? estimateCost({ ...data, baseline: { code, city: { tr: "", en: "" }, currency, daily: value, referenceMonth: month, source: null, quality: "user-quote" } }, "average") : null;
  const money = (n: number, c: string) => new Intl.NumberFormat(locale, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);
  return <section className="ci-section ci-calculator"><h2>{copy("Eski fiyatı bugüne taşı", "Update an older price")}</h2><p className="ci-muted">{copy("Elindeki fiyatı yerel para birimi ve ait olduğu ayla gir. Aylık fiyat endeksi varsa en son yayımlanan aya taşır, güncel kurla TL'ye çevirir.", "Enter a local-currency quote and its month. Where monthly CPI exists, we adjust it to the latest published month and convert using the latest exchange rate.")}</p>
    <CountryPicker value={code} options={options} onChange={v => { setCode(v); setAmount(""); setPath(null); }} label={copy("Fiyatın ait olduğu ülke", "Country of the quote")} placeholder={copy("Ülke seç", "Choose country")}/>
    <div className="ci-fields"><label>{copy("Yerel fiyat", "Local price")} · {currency}<input type="text" inputMode="decimal" value={amount} placeholder="0,00" onChange={e => { setAmount(e.target.value); setPath(null); }}/></label><label>{copy("Fiyatın ayı", "Quote month")}<input type="month" min={`${new Date().getFullYear() - 4}-01`} max={new Date().toISOString().slice(0, 7)} value={month} onChange={e => { setMonth(e.target.value); setPath(null); }}/></label></div>
    <button type="button" className="ci-button" disabled={!valid || loading} onClick={() => { const next = `/api/country-costs?country=${code}&currency=${currency}&referenceMonth=${month}`; if (path === next) retry(); else setPath(next); }}>{loading ? copy("Hesaplanıyor…", "Calculating…") : copy("Kur ve enflasyonla hesapla", "Calculate with exchange rate and CPI")}</button>
    {error && <button type="button" className="ci-text-button" onClick={retry}>{copy("Veri alınamadı · Tekrar dene", "Data unavailable · Retry")}</button>}
    {result && <div className="ci-result" aria-live="polite"><span>{result.inflationApplied ? `${copy("Endeks dönemi", "Index period")}: ${month} → ${data?.inflation?.period}` : copy("Enflasyon uygulanamadı · Yalnız kur karşılığı", "CPI adjustment unavailable · Exchange conversion only")}</span><strong>{result.converted === null ? money(result.localDaily, currency) : money(result.converted, "TRY")}</strong><span>{money(result.localDaily, currency)}{result.inflationApplied ? ` · ${((result.inflationFactor - 1) * 100).toLocaleString(locale, { maximumFractionDigits: 1, signDisplay: "always" })}%` : ""}</span>
      <p>{result.inflationApplied ? copy("Genel tüketici fiyat endeksine dayalı tahmin; belirli bir otelin bugünkü teklifini göstermez.", "An estimate based on general consumer prices, not a current quote from a specific hotel.") : copy("Uyumlu aylık endeks veya baz ay bulunamadı. Yıllık enflasyon oranını fiyatına otomatik eklemedik.", "A compatible monthly index or baseline month is unavailable. An annual inflation rate has not been added to your quote.")}</p>
      {!result.rateUsable && <p>{copy("Güncel kur bulunamadığı için TL karşılığı gösterilmiyor.", "No current exchange rate is available, so the TRY conversion is omitted.")}</p>}
      {data?.inflation?.freshness === "last-known" && <p>{copy("Canlı endeks alınamadı; son doğrulanan kayıt kullanıldı", "Live index unavailable; used the last verified record")}: {data.inflation.checkedAt.slice(0, 10)}.</p>}
      {data?.inflation && <button className="ci-text-button" type="button" onClick={() => void openExternal(data.inflation!.sourceUrl)}>{data.inflation.provider} · {data.inflation.period}<Icon name="external" size={14}/></button>}
      {result.rateUsable && <small>{copy("Kur tarihi", "Exchange date")}: {data?.fx?.date} · Frankfurter</small>}
    </div>}
  </section>;
}

export function LocationCalculator({ currency }: { currency: string }) {
  const { copy, locale } = useI18n();
  const [values, setValues] = useState(["", "", "", "3", "4", "2"]);
  const filled = values.every(value => value.trim() !== "");
  const n = values.map(value => Number(value.replace(",", ".")));
  const result = filled ? quoteComparison(n[0], n[1], n[2], n[3], n[4], n[5]) : null;
  const labels = [copy("Merkez · oda / gece", "Centre · room / night"), copy("Merkez dışı · oda / gece", "Outside · room / night"), copy("Ek ulaşım · kişi / gün", "Extra transport · person / day"), copy("Gece", "Nights"), copy("Gün", "Days"), copy("Kişi", "Travellers")];
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  return <section className="ci-section ci-calculator"><h2>{copy("Merkez mi, merkez dışı mı?", "Centre or outside?")}</h2><p className="ci-muted">{copy("Bulduğun iki konaklama teklifini karşılaştır. Oda fiyatı tüm oda içindir; ek ulaşım kişi başı, günlük gidiş-dönüş farkıdır. Tüm tutarlar aynı para biriminde olmalı.", "Compare two accommodation quotes. Room prices cover the whole room; extra transport is the daily return-trip difference per traveller. Use the same currency throughout.")} ({currency})</p>
    <div className="ci-fields">{labels.map((label, index) => <label key={label}>{label}<input type="text" inputMode={index < 3 ? "decimal" : "numeric"} placeholder={index < 3 ? currency : ""} value={values[index]} onChange={event => setValues(prev => prev.map((value, i) => i === index ? event.target.value : value))}/></label>)}</div>
    {filled && !result && <p role="alert" className="ci-error">{copy("Tutarları ve kişi/gece sayılarını kontrol et. Gün sayısı geceden az olamaz.", "Check amounts and traveller/night counts. Days cannot be fewer than nights.")}</p>}
    {result && <div className="ci-result" aria-live="polite"><div className="ci-compare"><span>{copy("Merkez toplamı", "Centre total")}<strong>{money(result.centre)}</strong></span><span>{copy("Dışarıda + ek ulaşım", "Outside + extra transport")}<strong>{money(result.outside)}</strong></span></div><p>{result.saving === 0 ? copy("İki seçenek aynı tutarda.", "Both options cost the same.") : `${result.saving > 0 ? copy("Merkez dışında tasarruf", "Savings outside the centre") : copy("Merkezde tasarruf", "Savings in the centre")}: ${money(Math.abs(result.saving))}`}</p><small>{copy("Yemek, diğer harcamalar ve yolculuk süresinin değeri dahil değil.", "Excludes food, other spending and the value of travel time.")}</small></div>}
  </section>;
}
