import { useEffect, useMemo, useState } from 'react';
import { CountryFlag } from './CountryFlag';
import { useI18n } from '../lib/i18n';
import { destinationCountryMatches, canSearchDestinationPlaces } from '../lib/destinationSearch';
import { searchJourneyArea, type JourneyArea } from '../lib/mapJourneyClient';
import './destination-search-fallback.css';

export type DestinationSearchFallbackProps = {
  query: string;
  hasReadyResult?: boolean;
  onPlanPlace: (name: string, area?: JourneyArea) => void;
  onOpenCountryGuide: (alpha3: string) => void;
  onOpenCountryEvents?: (alpha2: string, city?: string) => void;
};
type SearchResult = { key: string; status: 'loading' | 'success' | 'error'; areas: JourneyArea[] };

export function DestinationSearchFallback({ query, hasReadyResult = false, onPlanPlace, onOpenCountryGuide, onOpenCountryEvents }: DestinationSearchFallbackProps) {
  const { copy, locale } = useI18n();
  const term = query.trim();
  const key = `${locale}:${term}`;
  const countries = useMemo(() => destinationCountryMatches(query, locale), [query, locale]);
  const enabled = canSearchDestinationPlaces(query, hasReadyResult);
  const [result, setResult] = useState<SearchResult>({ key: '', status: 'loading', areas: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      setResult({ key, status: 'loading', areas: [] });
      void searchJourneyArea(term, request.signal, locale).then(areas => {
        if (!request.signal.aborted) setResult({ key, status: 'success', areas });
      }).catch(() => { if (!request.signal.aborted) setResult({ key, status: 'error', areas: [] }); });
    }, 400);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [enabled, key, term, locale, retry]);
  const current = result.key === key ? result : { key, status: 'loading', areas: [] } as SearchResult;
  if (hasReadyResult) return null;
  return <div className="destination-search-fallback">
    {countries.length > 0 && <section aria-label={copy('Eşleşen ülkeler', 'Matching countries', 'Shtetet që përputhen')}><h3>{copy('Ülkeler', 'Countries', 'Shtetet')}</h3><p>{copy('Ülke rehberini açabilir veya kendi rotanı planlayabilirsin.', 'Open a country guide or plan your own route.', 'Hap udhëzuesin e shtetit ose planifiko itinerarin tënd.')}</p><div className="destination-country-matches">{countries.map(country => <article key={country.alpha3}><div className="destination-match-heading"><CountryFlag code={country.alpha2} label={country.name}/><div><strong>{country.name}</strong><small>{copy('Ülke', 'Country', 'Shtet')} · {country.alpha2}</small></div></div><div className="destination-match-actions"><button type="button" onClick={() => onOpenCountryGuide(country.alpha3)}>{copy('Ülke rehberi', 'Country guide', 'Udhëzuesi i shtetit')}</button><button type="button" onClick={() => onPlanPlace(country.name)}>{copy('Rota oluştur', 'Build a route', 'Krijo itinerar')}</button>{onOpenCountryEvents && <button type="button" onClick={() => onOpenCountryEvents(country.alpha2)}>{copy('Etkinlikler', 'Events', 'Aktivitetet')}</button>}</div></article>)}</div></section>}
    <section aria-label={copy('Şehir ve bölge araması', 'City and region search', 'Kërkimi i qyteteve dhe rajoneve')}><h3>{copy('Şehirler ve bölgeler', 'Cities and regions', 'Qytetet dhe rajonet')}</h3>
      {!enabled ? <p role="status">{copy('Şehir veya bölge aramak için en az 3 karakter yaz.', 'Type at least 3 characters to search for a city or region.', 'Shkruaj të paktën 3 karaktere për të kërkuar një qytet ose rajon.')}</p> : current.status === 'loading' ? <p role="status">{copy(`“${term}” için yerler aranıyor…`, `Searching places for “${term}”…`, `Po kërkohen vende për “${term}”…`)}</p> : current.status === 'error' ? <div className="destination-search-error" role="alert"><p>{copy('Yer arama servisine şu anda ulaşılamıyor. Ülke sonuçlarını kullanabilir veya tekrar deneyebilirsin.', 'Place search is unavailable right now. You can use the country results or retry.', 'Kërkimi i vendeve nuk është i disponueshëm. Përdor rezultatet e shteteve ose provo sërish.')}</p><button type="button" onClick={() => { setResult({ key, status: 'loading', areas: [] }); setRetry(value => value + 1); }}>{copy('Tekrar ara', 'Retry search', 'Kërko sërish')}</button></div> : !current.areas.length ? <p role="status">{copy('Bu adla eşleşen yer bulunamadı. Daha tam bir ad veya ülke ekleyerek deneyebilirsin.', 'No places matched this name. Try a fuller name or add the country.', 'Nuk u gjetën vende me këtë emër. Provo një emër më të plotë ose shto shtetin.')}</p> : <div className="destination-place-matches">{current.areas.map(area => <article key={`${area.name}:${area.latitude}:${area.longitude}`}><strong>{area.name}</strong>{area.address && <p>{area.address}</p>}<small>{copy('Yer sonucu · hazır rota içermez', 'Place result · no ready-made itinerary', 'Rezultat vendi · pa itinerar të gatshëm')}</small><button type="button" onClick={() => onPlanPlace(area.name, area)}>{copy('Bu yer için rota oluştur', 'Build a route for this place', 'Krijo itinerar për këtë vend')}</button></article>)}</div>}
    </section>
  </div>;
}
