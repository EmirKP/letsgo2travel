import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { useCountryData, type Advisory } from "../lib/countryIntelligence";
import { advisoryReports, prominentAdvisory } from "../../../lib/country-intelligence/advisory-reports";
import type { AdvisoryReport } from "../../../lib/country-intelligence/types";

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

export function AdvisoryCard({ advisory: input }: { advisory: Advisory }) {
  const { copy, locale } = useI18n();
  const advisory = prominentAdvisory(input);
  const reports = advisoryReports(input);
  const date = (value: string) => new Date(value).toLocaleDateString(locale, { timeZone: "UTC" });
  return <section className={`ci-advisory ci-advisory-${advisory.precaution ? "regional" : advisory.level}`}>
    <span className="ci-eyebrow">{copy("Resmî seyahat uyarıları", "Official travel advice")}</span>
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
    <button type="button" className="ci-text-button" onClick={() => void openExternal("https://www.mfa.gov.tr/duyurular.tr.mfa")}>{copy("Türkiye Dışişleri duyuruları", "Turkish MFA announcements")}<Icon name="external" size={14}/></button>
  </section>;
}

export function CountryAdvisory({ code, onOpenNews }: { code: string; onOpenNews: (code: string) => void }) {
  const { copy } = useI18n();
  const { data, loading, error, retry } = useCountryData<{ data: Advisory[] }>(`/api/country-advisories?countries=${encodeURIComponent(code)}`);
  return <div className="ci-inline-advice">{loading && <p role="status">{copy("Ülke uyarıları kontrol ediliyor…", "Checking country advice…")}</p>}{data?.data[0] && <AdvisoryCard advisory={data.data[0]}/>}{error && <button type="button" className="ci-text-button" onClick={retry}>{copy("Uyarı alınamadı · Tekrar dene", "Advice unavailable · Retry")}</button>}<button type="button" className="ci-link-row" onClick={() => onOpenNews(code)}><Icon name="globe" size={20}/><span><strong>{copy("Ülke gündemi", "Country updates")}</strong><small>{copy("Haberler, seyahat uyarıları ve önemli günler", "News, travel advice and important dates")}</small></span><Icon name="chevron" size={18}/></button></div>;
}
