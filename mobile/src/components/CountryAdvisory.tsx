import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { useCountryData, type Advisory } from "../lib/countryIntelligence";
import { advisoryReports, prominentAdvisory } from "../../../lib/country-intelligence/advisory-reports";
import type { AdvisoryReport, TurkishTravelNotices } from "../../../lib/country-intelligence/types";
import { TURKISH_TRAVEL_SOURCES } from "../../../lib/country-intelligence/turkish-travel-sources";

const TITLES = {
  "avoid-all": ["Ülke geneli için seyahat etmeme uyarısı", "Advice against all travel countrywide"],
  "essential-only": ["Ülke genelinde yalnız zorunlu seyahat", "Essential travel only countrywide"],
  regional: ["Bazı bölgeler için seyahat uyarısı", "Travel warnings for some regions"],
  "no-specific-warning": ["Genel seyahat tavsiyesi", "General travel advice"],
  unavailable: ["Güncel uyarı alınamadı", "Current advice unavailable"],
} as const;
const reportTitle = (report: AdvisoryReport): readonly [string, string] => report.level === "no-specific-warning" && report.precaution === "heightened"
  ? ["Daha yüksek dikkat öneriliyor", "Exercise a high degree of caution"] as const : TITLES[report.level];

export function CountryRiskBadge({ advisory: input }: { advisory?: Advisory }) {
  const { copy } = useI18n();
  const advisory = input && prominentAdvisory(input);
  if (!advisory || advisory.level === "unavailable") return <span className="ci-risk ci-risk-unavailable"><Icon name="info" size={13}/>{copy("Uyarı doğrulanmadı", "Advice unverified")}</span>;
  if (advisory.level === "no-specific-warning" && !advisory.precaution) return null;
  return <span className={`ci-risk ci-risk-${advisory.precaution ? "regional" : advisory.level}`} title={copy(...reportTitle(advisory))}><Icon name="alert" size={14}/>{advisory.freshness === "last-known" ? copy("Son bilinen uyarı", "Last known warning") : advisory.scope === "regional" ? copy("Bölgesel uyarı", "Regional warning") : advisory.precaution ? copy("Ek dikkat", "Extra caution") : copy("Seyahat uyarısı", "Travel warning")}</span>;
}

function TurkishAdvisoryCard({ data }: { data?: TurkishTravelNotices }) {
  const { copy, locale } = useI18n();
  const date = (value: string) => new Date(value).toLocaleDateString(locale, { timeZone: "UTC" });
  const notices = data?.notices ?? [];
  return <section className="ci-advisory ci-advisory-turkey" aria-label={copy("Türkiye Dışişleri seyahat duyuruları", "Turkish MFA travel notices")}>
    <span className="ci-eyebrow">{copy("Türk vatandaşları için", "For Turkish citizens")}</span>
    <div className="ci-card-title"><Icon name="globe" size={21}/><h2>T.C. Dışişleri Bakanlığı</h2></div>
    {data?.state === "unavailable" && <p>{copy("Canlı duyuru listesi alınamadı. Güncel durumu Bakanlık ve dış temsilciliklerden kontrol et.", "The live notice list is unavailable. Check the Ministry and its overseas missions for the current situation.")}</p>}
    {!data && <p>{copy("Türk vatandaşlarına yönelik seyahat duyurularını Bakanlığın resmî sayfasından kontrol edebilirsin.", "Check the Ministry’s official page for travel notices for Turkish citizens.")}</p>}
    {notices.length > 0 && <div className="ci-provider-list">{notices.map(notice => <div className="ci-provider-row" key={notice.url}>
      <button type="button" className="ci-text-button" onClick={() => void openExternal(notice.url)}>{notice.title}<Icon name="external" size={14}/></button>
      <small>{copy("Duyuru tarihi", "Published")}: {date(notice.publishedAt)}</small>
    </div>)}</div>}
    {notices.length > 0 && <small>{copy("Bu tarihten sonra yeni duyurular yayımlanmış olabilir; güncel durum için kaynağı aç.", "Further notices may have been published since this date; open the source for the current situation.")}</small>}
    {data?.state === "ok" && !notices.length && <p>{copy("Bakanlığın son duyuru listesinde bu ülkeye ait kayıt bulunamadı. Önceki duyuruları ve dış temsilcilik açıklamalarını da kontrol et.", "No matching notice was found in the Ministry’s latest list. Also check earlier notices and mission announcements.")}</p>}
    {data?.verifiedAt && <small>{copy(data.state === "ok" ? "Liste kontrolü" : "Bağlantıların son kontrolü", data.state === "ok" ? "List checked" : "Links last checked")}: {date(data.verifiedAt)}</small>}
    <div className="ci-official-links">
      <button type="button" className="ci-text-button" onClick={() => void openExternal(TURKISH_TRAVEL_SOURCES.notices)}>{copy("Yurt dışı seyahat duyuruları", "Overseas travel notices")}<Icon name="external" size={14}/></button>
      <button type="button" className="ci-text-button" onClick={() => void openExternal(TURKISH_TRAVEL_SOURCES.missions)}>{copy("Büyükelçilik ve konsolosluklar", "Embassies and consulates")}<Icon name="external" size={14}/></button>
    </div>
  </section>;
}

export function AdvisoryCard({ advisory }: { advisory: Advisory }) {
  return <div className="ci-advisory-stack"><TurkishAdvisoryCard data={advisory.turkishNotices}/><OtherAdvisoryCard advisory={advisory}/></div>;
}

function OtherAdvisoryCard({ advisory: input }: { advisory: Advisory }) {
  const { copy, locale } = useI18n();
  const advisory = prominentAdvisory(input);
  const reports = advisoryReports(input);
  const date = (value: string) => new Date(value).toLocaleDateString(locale, { timeZone: "UTC" });
  return <section className={`ci-advisory ci-advisory-${advisory.precaution ? "regional" : advisory.level}`}>
    <span className="ci-eyebrow">{copy("Diğer ülkelerin resmî uyarıları", "Other countries’ official advice")}</span>
    {advisory.freshness === "last-known" && <p className="ci-fallback-note"><strong>{copy("Canlı doğrulama alınamadı", "Live verification unavailable")}</strong><br/>{copy("Son doğrulanan kayıt gösteriliyor", "Showing the last verified record")}: {new Date(advisory.source.checkedAt).toLocaleDateString(locale)}. {copy("Güncel durum için kaynağı aç.", "Open the source for the current situation.")}</p>}
    <div className="ci-card-title"><Icon name={advisory.level === "no-specific-warning" && !advisory.precaution ? "info" : "alert"} size={21}/><h2>{copy(...reportTitle(advisory))}</h2></div>
    {advisory.topics.length > 0 && <div className="ci-tags">{advisory.topics.map(topic => <span key={topic}>{topic === "conflict" ? copy("Çatışma ve gerilim", "Conflict and tensions") : topic === "diplomatic" ? copy("Konsolosluk ve diplomasi", "Consular and diplomatic advice") : copy("Güvenlik", "Security")}</span>)}</div>}
    <p>{advisory.level === "unavailable" ? copy("Kaynak şu an yanıt vermiyor. Uyarı görünmemesi, risk olmadığı anlamına gelmez.", "The source is unavailable. Missing advice does not mean there is no risk.") : advisory.level === "regional" ? copy("Kısıtlamalar ülkenin tamamı için aynı değil. Gideceğin bölgeyi ve geçiş güzergâhını kaynakta kontrol et.", "Restrictions differ by region. Check your destination and transit route in the source.") : copy("Güncel resmî tavsiyenin özetidir. Ayrıntılar ve istisnalar kaynak sayfasındadır.", "A summary of the current official advice. See the source for details and exceptions.")}</p>
    <small>{copy("Yukarıdaki uyarının kaynağı", "Source of the advice above")}: {advisory.source.name}. {copy("Her kurum kendi vatandaşlarına yönelik tavsiye yayımlar.", "Each authority advises its own citizens.")}</small>
    <div className="ci-provider-list">{reports.map(report => <div className="ci-provider-row" key={report.source.name}>
      <button type="button" className="ci-text-button" onClick={() => void openExternal(report.source.url)}>{report.source.name}<Icon name="external" size={14}/></button>
      <span>{copy(...reportTitle(report))}</span>
      <small>{report.freshness === "last-known" ? `${copy("Son doğrulama", "Last verified")}: ${date(report.source.checkedAt)}` : report.updatedAt ? `${copy("Kaynak güncellemesi", "Source updated")}: ${date(report.updatedAt)}` : copy("Güncel kayıt alınamadı · Kaynaktan kontrol et", "Current record unavailable · Check the source")}</small>
    </div>)}</div>
  </section>;
}

export function CountryAdvisory({ code, onOpenNews }: { code: string; onOpenNews: (code: string) => void }) {
  const { copy } = useI18n();
  const { data, loading, error, retry } = useCountryData<{ data: Advisory[] }>(`/api/country-advisories?countries=${encodeURIComponent(code)}`);
  return <div className="ci-inline-advice">{loading && <p role="status">{copy("Ülke uyarıları kontrol ediliyor…", "Checking country advice…")}</p>}{data?.data[0] && <AdvisoryCard advisory={data.data[0]}/>}{error && <button type="button" className="ci-text-button" onClick={retry}>{copy("Uyarı alınamadı · Tekrar dene", "Advice unavailable · Retry")}</button>}<button type="button" className="ci-link-row" onClick={() => onOpenNews(code)}><Icon name="globe" size={20}/><span><strong>{copy("Ülke gündemi", "Country updates")}</strong><small>{copy("Haberler, seyahat uyarıları ve önemli günler", "News, travel advice and important dates")}</small></span><Icon name="chevron" size={18}/></button></div>;
}
