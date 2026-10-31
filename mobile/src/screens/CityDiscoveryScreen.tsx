import { useMemo, useRef, useState } from 'react';
import { CityHeartButton } from '../components/CityHeartButton';
import { CityPhotoCredits } from '../components/CityPhotoCredits';
import { CountryFlag } from '../components/CountryFlag';
import { DestinationPhoto } from '../components/DestinationPhoto';
import { Icon } from '../components/Icon';
import { cityDestinations } from '../data/cityDestinations';
import { useI18n } from '../lib/i18n';
import { normalizeSearchText } from '../lib/searchText';
import './city-discovery.css';

export function CityDiscoveryScreen({ onBack, onOpenCity, onOpenCountry, countryCode, onToggleCitySaved, savedCityCodes = [], initialQuery = '', onQueryChange }: {
  onBack: () => void;
  onOpenCity: (code: string) => void;
  onOpenCountry: (code: string) => void;
  countryCode?: string | null;
  onToggleCitySaved?: (code: string) => void;
  savedCityCodes?: string[];
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}) {
  const { copy, locale } = useI18n();
  const label = (tr: string, en: string, sq: string, ro: string) => locale === 'ro' ? ro : copy(tr, en, sq);
  const [query, setLocalQuery] = useState(initialQuery);
  const setQuery = (value: string) => { setLocalQuery(value); onQueryChange?.(value); };
  const input = useRef<HTMLInputElement>(null);
  const destinations = useMemo(() => cityDestinations(locale), [locale]);
  const countries = useMemo(() => {
    const groups = new Map<string, { code: string; name: string; cities: typeof destinations }>();
    for (const city of destinations) {
      const group = groups.get(city.countryCode);
      if (group) group.cities.push(city);
      else groups.set(city.countryCode, { code: city.countryCode, name: city.country, cities: [city] });
    }
    return [...groups.values()].sort((first, second) => first.name.localeCompare(second.name, locale));
  }, [destinations, locale]);
  const aliases = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const language of ['tr', 'en'] as const) for (const city of cityDestinations(language)) names.set(city.code, [...(names.get(city.code) || []), city.name, city.country]);
    return names;
  }, []);
  const needle = normalizeSearchText(query);
  const matching = destinations.filter(city => normalizeSearchText([city.name, city.country, ...(aliases.get(city.code) || [])].join(' ')).includes(needle));
  const matchingCodes = new Set(matching.map(city => city.code));
  const visibleCountries = countries.filter(country => country.cities.some(city => matchingCodes.has(city.code)));
  const selectedCode = countryCode?.trim().toUpperCase() || '';
  const selected = countries.find(country => country.code === selectedCode);
  const inCountry = Boolean(selectedCode);
  const visible = selected?.cities.filter(city => matchingCodes.has(city.code)) || [];
  const hasResults = inCountry ? visible.length > 0 : visibleCountries.length > 0;
  const cityCount = (count: number) => label(`${count} şehir`, `${count} ${count === 1 ? 'city' : 'cities'}`, `${count} ${count === 1 ? 'qytet' : 'qytete'}`, `${count}${count >= 20 ? ' de' : ''} ${count === 1 ? 'oraș' : 'orașe'}`);
  const countryCount = (count: number) => label(`${count} ülke`, `${count} ${count === 1 ? 'country' : 'countries'}`, `${count} ${count === 1 ? 'shtet' : 'shtete'}`, `${count}${count >= 20 ? ' de' : ''} ${count === 1 ? 'țară' : 'țări'}`);
  const clear = () => { setQuery(''); input.current?.focus(); };

  return <section className="screen city-discovery" aria-labelledby="city-discovery-title">
    {!inCountry && <header className="city-discovery-root-heading">
      <button className="city-discovery-back" type="button" onClick={onBack} aria-label={label('Keşfet’e dön', 'Back to Discover', 'Kthehu te Zbulo', 'Înapoi la Descoperă')}><Icon name="back" size={20}/></button>
      <h1 id="city-discovery-title">{label('Ülkeler', 'Countries', 'Shtetet', 'Țări')}</h1>
    </header>}
    {inCountry && <><button className="city-discovery-back" type="button" onClick={onBack}><Icon name="back" size={20}/>{selected ? label('Ülkeler', 'Countries', 'Shtetet', 'Țări') : label('Tüm ülkeler', 'All countries', 'Të gjitha shtetet', 'Toate țările')}</button>
    <header className="city-discovery-heading is-country">
      {selected && <span className="city-discovery-selected-flag" aria-hidden="true"><CountryFlag code={selected.code} label={selected.name}/></span>}
      <div><h1 id="city-discovery-title">{selected?.name || label('Ülke bulunamadı', 'Country not found', 'Shteti nuk u gjet', 'Țara nu a fost găsită')}</h1></div>
    </header></>}
    <div className="city-discovery-search" role="search"><Icon name="search" size={20}/><input ref={input} type="search" value={query} maxLength={120} autoComplete="off" enterKeyHint="search" placeholder={label('Şehir veya ülke ara', 'Search cities or countries', 'Kërko qytete ose shtete', 'Caută orașe sau țări')} aria-label={label('Şehir veya ülke ara', 'Search cities or countries', 'Kërko qytete ose shtete', 'Caută orașe sau țări')} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" onClick={clear} aria-label={label('Aramayı temizle', 'Clear search', 'Pastro kërkimin', 'Șterge căutarea')}><Icon name="close" size={18}/></button>}</div>
    <p className="city-discovery-count" role="status">{inCountry ? cityCount(visible.length) : `${countryCount(visibleCountries.length)} · ${cityCount(matching.length)}`}</p>
    {!inCountry && <ul className="city-discovery-country-list">{visibleCountries.map(country => <li key={country.code}><button type="button" className="city-discovery-country-card" aria-label={country.name} onClick={() => onOpenCountry(country.code)}>
      <span className="city-discovery-country-flag" aria-hidden="true"><CountryFlag code={country.code} label={country.name}/></span>
      <strong>{country.name}</strong><Icon name="chevron" size={17}/>
    </button></li>)}</ul>}
    {inCountry && <div className="city-discovery-grid">{visible.map(city => {
      const saved = savedCityCodes.includes(city.code);
      return <article className="city-discovery-tile" key={city.code}>
        <button type="button" className="city-discovery-card" aria-label={city.name} aria-describedby={`city-grid-${city.code}-country`} onClick={() => onOpenCity(city.code)}>
          <DestinationPhoto src={city.photo} code={city.code} countryCode={city.countryCode} label={city.name}/>
          <span className="city-discovery-caption"><strong>{city.name}</strong><small id={`city-grid-${city.code}-country`}>{city.country}</small></span>
        </button>
        {onToggleCitySaved && <CityHeartButton className="city-discovery-heart" saved={saved} onToggle={() => onToggleCitySaved(city.code)} label={saved
          ? label(`${city.name} kaydını kaldır`, `Unsave ${city.name}`, `Hiq ${city.name} nga të ruajturat`, `Elimină ${city.name} din salvate`)
          : label(`${city.name} şehrini kaydet`, `Save ${city.name}`, `Ruaj ${city.name}`, `Salvează ${city.name}`)}/>}
      </article>;
    })}</div>}
    {!hasResults && <div className="city-discovery-empty" role="status"><Icon name="search" size={25}/><h2>{label('Sonuç bulunamadı', 'No results found', 'Nuk u gjetën rezultate', 'Nu am găsit rezultate')}</h2><p>{inCountry && !selected ? label('Ülke listesine dönerek bir ülke seç.', 'Return to the country list to choose a country.', 'Kthehu te lista e shteteve dhe zgjidh një shtet.', 'Întoarce-te la lista de țări și alege o țară.') : label('Başka bir şehir veya ülke adı dene.', 'Try another city or country name.', 'Provo një emër tjetër qyteti ose shteti.', 'Încearcă alt oraș sau altă țară.')}</p><button type="button" onClick={inCountry && !selected ? onBack : clear}>{inCountry ? selected ? label('Tüm şehirleri göster', 'Show all cities', 'Shfaq të gjitha qytetet', 'Arată toate orașele') : label('Tüm ülkeler', 'All countries', 'Të gjitha shtetet', 'Toate țările') : label('Tüm ülkeleri göster', 'Show all countries', 'Shfaq të gjitha shtetet', 'Arată toate țările')}</button></div>}
    {selected && <CityPhotoCredits destinations={selected.cities}/>}
  </section>;
}
