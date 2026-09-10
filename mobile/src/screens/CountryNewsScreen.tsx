import { useMemo, useState } from "react";
import { PageHero } from "../components/PageHero";
import { CountryPicker } from "../components/CountryPicker";
import { AdvisoryCard } from "../components/CountryAdvisory";
import { Icon } from "../components/Icon";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { useCountryData, type CountryBrief, type NewsItem } from "../lib/countryIntelligence";
import { ISO_COUNTRIES } from "../../../lib/countries/isoSource";

const IMPACT: Record<NewsItem["topic"], [string, string]> = {
  elections: ["Seçim veya sandık haberleri ulaşımı ve kalabalıkları etkileyebilir. Haberdeki olay tarihini ve ziyaret edeceğin şehri kontrol et; haberin görünmesi bugün seçim olduğu anlamına gelmez.", "Election coverage may affect crowds and transport. Check the event date and city; a headline does not establish that voting is happening today."],
  transport: ["Uçuş, grev veya ulaşım değişikliği rotanı etkileyebilir. Biletinin durumunu doğrudan havayolu ya da işletmeciden kontrol et.", "Flight, strike or transport changes may affect your route. Confirm your own booking directly with the airline or operator."],
  weather: ["Hava ve afet haberleri bölgesel olabilir. Konaklayacağın yerin uyarılarını ve ulaşımın çalışıp çalışmadığını kontrol et.", "Weather and disaster reports can be regional. Check alerts at your destination and whether your transport is operating."],
  security: ["Haberin geçtiği bölge ile kendi rotanı karşılaştır. Seyahat kararında yukarıdaki resmî uyarıyı ve güncel konsolosluk duyurularını birlikte değerlendir.", "Compare the affected area with your itinerary. Read the official advice above together with current consular announcements."],
  general: ["Haberdeki yer ve olay tarihini kontrol et. Başlık tek başına bütün ülkenin durumunu veya hizmetlerin açık olduğunu göstermez.", "Check the location and event date. A headline alone cannot describe the whole country or confirm services are open."],
};

function impactFor(item: NewsItem): [string, string] {
  if (/airspace.{0,35}(clos|shut)|hava sahası.{0,30}kapat/iu.test(item.title)) return ["Başlık hava sahası kapanmasına ilişkin. Uçuş numaranı havayolunda kontrol et; aktarma ülkesindeki değişiklikler de seni etkileyebilir. Bu yorum kapanmanın halen sürdüğünü doğrulamaz.", "The headline concerns an airspace closure. Check your flight number with the airline, including transit-country changes. This note does not verify that the closure is still in effect."];
  if (/strike|grev/iu.test(item.title)) return ["Haberde grev geçiyor. İşletmeci, hat ve grev gününü kendi biletinle eşleştir; bütün şehirde ulaşım durduğunu varsayma.", "The report mentions a strike. Match the operator, route and strike date against your ticket; do not assume all city transport has stopped."];
  if (/wildfire|yangın/iu.test(item.title)) return ["Başlık yangınla ilgili. Otelinin, yürüyüş parkurunun ve yolunun etkilenen alanda olup olmadığını yerel acil durum kaynağından doğrula.", "The headline concerns a fire. Use local emergency sources to check whether your hotel, trail or road is in the affected area."];
  if (/flood|sel baskını|flooding/iu.test(item.title)) return ["Başlık su baskınına işaret ediyor. Yol ve toplu taşıma duyurularını kontrol et; kapalı veya su altında kalan güzergâhları kullanma.", "The headline concerns flooding. Check road and public transport notices; do not use closed or flooded routes."];
  if (/protest|demonstration|gösteri/iu.test(item.title)) return ["Haberde gösteri veya protesto geçiyor. Adres ve zamanı kontrol ederek yoğun alanların çevresinden alternatif rota planla; ülkenin tamamı için hüküm çıkarma.", "The report mentions a demonstration. Check its location and time and plan an alternative route around busy areas; do not extrapolate to the whole country."];
  return IMPACT[item.topic];
}

export function CountryNewsScreen({ initialCountry = "TR" }: { initialCountry?: string }) {
  const { copy, locale } = useI18n();
  const [country, setCountry] = useState(initialCountry || "TR");
  const [filter, setFilter] = useState<"all" | "security" | "transport" | "calendar">("all");
  const { data, loading, error, retry } = useCountryData<CountryBrief>(`/api/country-brief?country=${country}`);
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return ISO_COUNTRIES.map(row => ({ code: row.alpha2, name: names.of(row.alpha2) || row.name })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const news = data?.news.filter(item => filter === "all" || filter === item.topic) || [];
  const date = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <div className="screen country-news-screen ci-screen">
    <PageHero scene="city" title={copy("Ülke Gündemi", "Country Updates")} subtitle={copy("Gitmeden önce, bulunduğun yerde olup biteni bil.", "Know what is happening before you go.")}/>
    <div className="ci-content">
      <CountryPicker value={country} options={options} onChange={setCountry} label={copy("Gideceğin ülke", "Your destination")} placeholder={copy("Ülke seç", "Choose country")}/>
      <div className="ci-heading"><p>{data ? `${date(data.today)} · ${copy("Referans saat dilimi", "Reference time zone")}: ${data.timeZone}` : copy("Güncel kaynaklar kontrol ediliyor", "Checking current sources")}</p><button type="button" className="ci-icon-button" disabled={loading} onClick={retry} aria-label={copy("Gündemi yenile", "Refresh updates")}><Icon name="refresh" size={19}/></button></div>
      {loading && <div className="ci-empty" role="status">{copy("Uyarılar, haberler ve takvim yükleniyor…", "Loading advice, news and calendar…")}</div>}
      {error && <div className="ci-empty" role="alert"><strong>{copy("Gündeme şu an ulaşılamıyor", "Updates are unavailable")}</strong><p>{copy("Bağlantını kontrol edip yeniden dene. Eski haberleri güncelmiş gibi göstermiyoruz.", "Check your connection and try again. Old news is not shown as current.")}</p><button type="button" className="ci-button" onClick={retry}>{copy("Tekrar dene", "Try again")}</button></div>}
      {data && <>
        <AdvisoryCard advisory={data.advisory}/>
        <div className="ci-segments" role="group" aria-label={copy("Gündem filtresi", "Update filter")}>{(["all", "security", "transport", "calendar"] as const).map(id => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{id === "all" ? copy("Tümü", "All") : id === "security" ? copy("Güvenlik", "Security") : id === "transport" ? copy("Ulaşım", "Transport") : copy("Takvim", "Calendar")}</button>)}</div>
        {(filter === "all" || filter === "calendar") && <section className="ci-section"><h2>{copy("Önümüzdeki 30 gün", "The next 30 days")}</h2><p className="ci-muted">{copy("Resmî tatil kapsamı ülkeye göre değişir. Seçim takvimi şu an İsveç ve Yeni Zelanda resmî kayıtlarıyla sınırlı; bir kaydın olmaması seçim olmadığı anlamına gelmez.", "Holiday coverage varies. Election dates currently cover verified Swedish and New Zealand authority records only; missing entries do not mean there is no election.")}</p>
          {data.calendar.map(item => <article className="ci-calendar-row" key={item.id}><div className="ci-date-tile"><strong>{item.date.slice(8)}</strong><small>{new Date(`${item.date}T12:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" })}</small></div><div><span className="ci-eyebrow">{item.date === data.today ? `${copy("Bugün", "Today")} · ` : ""}{item.type === "election" ? copy("Planlanan seçim", "Scheduled election") : item.type === "observance" ? copy("Anma günü · Resmî tatil değil", "Observance · Not a public holiday") : copy("Resmî tatil", "Public holiday")}</span><h3>{locale === "tr" ? item.name.tr : item.name.en}</h3><p>{item.type === "election" ? copy("Sandık çevreleri ve tören alanlarında kalabalık olabilir; yerel ulaşım duyurularını kontrol et. Seçim günü tek başına tatil veya ülke genelinde tehlike anlamına gelmez.", "Polling places and event areas may be busy; check local transport notices. Election day alone does not mean a holiday or countrywide danger.") : item.type === "observance" ? copy("09.05'te anma törenleri yapılır. Sirenleri acil durumla karıştırma; çevredeki törenlere saygı göster.", "Remembrance ceremonies take place at 09:05. Do not confuse the sirens with an emergency; be mindful of local ceremonies.") : `${item.countryWide ? copy("Ülke geneli", "Nationwide") : `${copy("Bölgesel", "Regional")}${item.regions.length ? ` · ${item.regions.join(", ")}` : ""}`}. ${copy("Kurumların ve ulaşımın çalışma saatleri değişebilir.", "Institution and transport hours may change.")}`}</p><button type="button" className="ci-text-button" onClick={() => void openExternal(item.sourceUrl)}>{item.verification === "last-known" ? copy("Son kayıt · Güncel tarihi doğrula", "Last record · Verify current date") : copy("Takvim kaynağı", "Calendar source")}<Icon name="external" size={13}/></button></div></article>)}
          {!data.calendar.length && <p className="ci-muted">{data.calendarState === "ok" ? copy("Kaynakta bu aralık için resmî tatil kaydı yok.", "The source lists no public holiday in this period.") : copy("Bu ülkenin takvimi alınamadı; önemli gün olmadığı anlamına gelmez.", "This country's calendar is unavailable; important dates may still exist.")}</p>}
          {data.calendar.length > 0 && data.calendarState === "unavailable" && <p className="ci-muted">{copy("Takvim kapsamı eksik olabilir.", "Calendar coverage may be incomplete.")}</p>}
        </section>}
        {filter !== "calendar" && <section className="ci-section"><h2>{copy("Son haberler", "Recent news")}</h2><p className="ci-muted">{copy("GDELT, Anadolu Ajansı ve BBC kaynaklarından son 7 gün. Yayın tarihi varsa ayrı gösterilir; haber tarihi olayın gerçekleştiği tarih değildir. Başlıklar özgün dilindedir.", "The last 7 days from GDELT, Anadolu Agency and BBC. Publication dates are shown when supplied; a news date is not the event date. Headlines retain their original language.")}</p>
          {news.map(item => <article className="ci-news-card" key={item.url}><span className="ci-eyebrow">{item.publisher} · {item.publishedAt ? copy("Yayın", "Published") : copy("Bulundu", "Found")}: {date(item.publishedAt || item.firstSeenAt)}</span><h3><button type="button" onClick={() => void openExternal(item.url)}>{item.title}<Icon name="external" size={15}/></button></h3><div className="ci-impact"><strong>{copy("Seyahatine etkisi · Otomatik yorum", "Travel impact · Automated note")}</strong><p>{copy(...impactFor(item))}</p></div></article>)}
          {!news.length && <div className="ci-empty" role="status">{data.newsState === "ok" ? copy("Bu filtre için güncel haber bulunamadı.", "No recent headlines match this filter.") : <>
            <p>{copy("Bu ülkenin haberleri şu an alınamadı. Biraz sonra yeniden dene.", "News for this country could not be loaded. Please try again shortly.")}</p>
            <button type="button" className="ci-button" onClick={retry} disabled={loading}>{copy("Haberleri yeniden yükle", "Reload news")}</button>
          </>}</div>}
        </section>}
        {(filter === "all" || filter === "security") && data.advisory.updates.length > 0 && <details className="ci-method"><summary>{copy("Resmî duyuru geçmişi", "Official update history")}</summary><p>{copy("Kaynağın özgün dili ve gerçek güncelleme tarihiyle gösterilir.", "Shown in the source language with its actual update date.")}</p>{data.advisory.updates.map((update, index) => <p key={`${update.date}-${index}`}><strong>{date(update.date)}</strong><br/>{update.text}</p>)}</details>}
        <p className="ci-muted ci-footnote">{copy("Son kontrol", "Last checked")}: {new Date(data.checkedAt).toLocaleString(locale)} · {copy("Anlık acil durum bildirimi değildir.", "Not a real-time emergency notification.")}</p>
      </>}
    </div>
  </div>;
}
