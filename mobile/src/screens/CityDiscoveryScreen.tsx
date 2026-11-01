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

export function CityDiscoveryScreen({ onBack, onOpenCity, onOpenCountry, onSearchAllCountries, countryCode, onToggleCitySaved, savedCityCodes = [], savedUnavailable = false, onRetrySaved, initialQuery = '', onQueryChange, initialSavedOnly = false, onSavedOnlyChange }: {
  onBack: () => void;
  onOpenCity: (code: string) => void;
  onOpenCountry: (code: string) => void;
  onSearchAllCountries?: (query: string) => void;
  countryCode?: string | null;
  onToggleCitySaved?: (code: string) => void;
  savedCityCodes?: string[];
  savedUnavailable?: boolean;
  onRetrySaved?: () => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  initialSavedOnly?: boolean;
  onSavedOnlyChange?: (value: boolean) => void;
}) {
  const { copy, locale } = useI18n();
  const label = (tr: string, en: string, sq: string, ro: string) => locale === 'ro' ? ro : copy(tr, en, sq);
  const [query, setLocalQuery] = useState(initialQuery);
  const [savedOnly, setLocalSavedOnly] = useState(initialSavedOnly);
  const setSavedOnly = (value: boolean) => { setLocalSavedOnly(value); onSavedOnlyChange?.(value); };
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
    for (const language of ['tr', 'en', 'sq', 'ro'] as const) for (const city of cityDestinations(language)) names.set(city.code, [...(names.get(city.code) || []), city.name, city.country]);
    return names;
  }, []);
  const savedCodes = new Set(savedCityCodes);
  const needle = normalizeSearchText(query);
  const matching = destinations.filter(city => (!savedOnly || savedCodes.has(city.code)) && normalizeSearchText([city.name, city.country, ...(aliases.get(city.code) || [])].join(' ')).includes(needle));
  const matchingCodes = new Set(matching.map(city => city.code));
  const visibleCountries = countries.filter(country => country.cities.some(city => matchingCodes.has(city.code)));
  const selectedCode = countryCode?.trim().toUpperCase() || '';
  const selected = countries.find(country => country.code === selectedCode);
  const inCountry = Boolean(selectedCode);
  const visible = selected ? selected.cities.filter(city => matchingCodes.has(city.code)) : inCountry ? [] : savedOnly ? matching : [];
  const showCities = inCountry || savedOnly;
  const hasResults = showCities ? visible.length > 0 : visibleCountries.length > 0;
  const savedInScope = (selected ? selected.cities : destinations).filter(city => savedCodes.has(city.code));
  const noSavedCities = savedOnly && savedInScope.length === 0;
  const savedReadFailed = savedOnly && savedUnavailable;
  const cityCount = (count: number) => label(`${count} şehir`, `${count} ${count === 1 ? 'city' : 'cities'}`, `${count} ${count === 1 ? 'qytet' : 'qytete'}`, `${count}${count >= 20 ? ' de' : ''} ${count === 1 ? 'oraș' : 'orașe'}`);
  const countryCount = (count: number) => label(`${count} ülke`, `${count} ${count === 1 ? 'country' : 'countries'}`, `${count} ${count === 1 ? 'shtet' : 'shtete'}`, `${count}${count >= 20 ? ' de' : ''} ${count === 1 ? 'țară' : 'țări'}`);
  const clear = () => { setQuery(''); input.current?.focus(); };
  const searchLabel = selected
    ? label(`${selected.name} içinde şehir ara`, `Search cities in ${selected.name}`, `Kërko qytete në ${selected.name}`, `Caută orașe în ${selected.name}`)
    : savedOnly ? label('Kaydettiğin şehirlerde ara', 'Search saved cities', 'Kërko qytete të ruajtura', 'Caută orașe salvate')
      : label('Şehir veya ülke ara', 'Search cities or countries', 'Kërko qytete ose shtete', 'Caută orașe sau țări');
  const showAll = () => { setSavedOnly(false); clear(); };
  const searchAllCountries = () => { setSavedOnly(false); onSearchAllCountries?.(query.trim()); };
  const recoverCountries = () => {
    if (!onSearchAllCountries) { onBack(); return; }
    setSavedOnly(false); setQuery(''); onSearchAllCountries('');
  };

  return <section className="screen city-discovery" aria-labelledby="city-discovery-title">
    {!inCountry && <header className="city-discovery-root-heading">
      <button className="city-discovery-back" type="button" onClick={onBack} aria-label={label('Geri', 'Back', 'Prapa', 'Înapoi')}><Icon name="back" size={20}/></button>
      <h1 id="city-discovery-title">{savedOnly ? label('Kaydettiklerim', 'Saved cities', 'Qytetet e ruajtura', 'Orașe salvate') : label('Ülkeler', 'Countries', 'Shtetet', 'Țări')}</h1>
    </header>}
    {inCountry && <><button className="city-discovery-back" type="button" onClick={onBack}><Icon name="back" size={20}/>{label('Geri', 'Back', 'Prapa', 'Înapoi')}</button>
    <header className="city-discovery-heading is-country">
      {selected && <span className="city-discovery-selected-flag" aria-hidden="true"><CountryFlag code={selected.code} label={selected.name}/></span>}
      <div><h1 id="city-discovery-title">{selected?.name || label('Ülke bulunamadı', 'Country not found', 'Shteti nuk u gjet', 'Țara nu a fost găsită')}</h1></div>
    </header></>}
    <div className="city-discovery-filters" role="group" aria-label={label('Şehir listesi', 'City list', 'Lista e qyteteve', 'Lista orașelor')}>
      <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>{label('Tümü', 'All', 'Të gjitha', 'Toate')}</button>
      <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}><Icon name="heart" size={16}/>{label('Kaydettiklerim', 'Saved', 'Të ruajturat', 'Salvate')}</button>
    </div>
    <div className="city-discovery-search" role="search"><Icon name="search" size={20}/><input ref={input} type="search" value={query} maxLength={120} autoComplete="off" enterKeyHint="search" placeholder={searchLabel} aria-label={searchLabel} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" onClick={clear} aria-label={label('Aramayı temizle', 'Clear search', 'Pastro kërkimin', 'Șterge căutarea')}><Icon name="close" size={18}/></button>}</div>
    {inCountry && onSearchAllCountries && <button className="city-discovery-search-all" type="button" onClick={searchAllCountries}><Icon name="globe" size={17}/>{label('Tüm ülkelerde ara', 'Search all countries', 'Kërko në të gjitha shtetet', 'Caută în toate țările')}<Icon name="chevron" size={15}/></button>}
    {!savedReadFailed && <p className="city-discovery-count" role="status">{showCities ? cityCount(visible.length) : `${countryCount(visibleCountries.length)} · ${cityCount(matching.length)}`}</p>}
    {!showCities && <ul className="city-discovery-country-list">{visibleCountries.map(country => <li key={country.code}><button type="button" className="city-discovery-country-card" aria-label={country.name} onClick={() => onOpenCountry(country.code)}>
      <span className="city-discovery-country-flag" aria-hidden="true"><CountryFlag code={country.code} label={country.name}/></span>
      <strong>{country.name}</strong><Icon name="chevron" size={17}/>
    </button></li>)}</ul>}
    {showCities && !savedReadFailed && <div className="city-discovery-grid">{visible.map(city => {
      const saved = savedCodes.has(city.code);
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
    {savedReadFailed && <div className="city-discovery-empty" role="alert"><Icon name="heart" size={25}/>
      <h2>{label('Kaydedilen şehirler şu anda okunamıyor', 'Saved cities cannot be read right now', 'Qytetet e ruajtura nuk mund të lexohen tani', 'Orașele salvate nu pot fi citite momentan')}</h2>
      {onRetrySaved && <button type="button" onClick={onRetrySaved}>{label('Yeniden dene', 'Try again', 'Provo sërish', 'Încearcă din nou')}</button>}
    </div>}
    {!savedReadFailed && !hasResults && <div className="city-discovery-empty" role="status"><Icon name={noSavedCities ? 'heart' : 'search'} size={25}/>
      <h2>{noSavedCities ? selected ? label('Bu ülkede kayıtlı şehrin yok', 'No saved cities in this country', 'Nuk ke qytete të ruajtura në këtë shtet', 'Nu ai orașe salvate în această țară') : label('Henüz şehir kaydetmedin', 'No saved cities yet', 'Ende nuk ke ruajtur qytete', 'Nu ai salvat încă orașe') : label('Sonuç bulunamadı', 'No results found', 'Nuk u gjetën rezultate', 'Nu am găsit rezultate')}</h2>
      <p>{noSavedCities ? label('Şehir kartlarındaki kalbe dokunarak buraya ekleyebilirsin.', 'Tap the heart on a city card to add it here.', 'Prek zemrën në kartën e një qyteti për ta shtuar këtu.', 'Apasă inima de pe cardul unui oraș ca să-l adaugi aici.')
        : inCountry && !selected ? label('Ülke listesine dönerek bir ülke seç.', 'Return to the country list to choose a country.', 'Kthehu te lista e shteteve dhe zgjidh një shtet.', 'Întoarce-te la lista de țări și alege o țară.')
          : selected ? label(`${selected.name} içinde başka bir şehir dene veya tüm ülkelerde ara.`, `Try another city in ${selected.name} or search all countries.`, `Provo një qytet tjetër në ${selected.name} ose kërko në të gjitha shtetet.`, `Încearcă alt oraș din ${selected.name} sau caută în toate țările.`)
            : savedOnly ? label('Kaydettiğin şehirlerde başka bir ad dene.', 'Try another name among your saved cities.', 'Provo një emër tjetër te qytetet e ruajtura.', 'Încearcă alt nume printre orașele salvate.')
              : label('Başka bir şehir veya ülke adı dene.', 'Try another city or country name.', 'Provo një emër tjetër qyteti ose shteti.', 'Încearcă alt oraș sau altă țară.')}</p>
      <button type="button" onClick={inCountry && !selected ? recoverCountries : noSavedCities ? showAll : clear}>{(!inCountry || Boolean(selected)) && savedOnly && !noSavedCities ? label('Aramayı temizle', 'Clear search', 'Pastro kërkimin', 'Șterge căutarea') : inCountry ? selected ? label('Tüm şehirleri göster', 'Show all cities', 'Shfaq të gjitha qytetet', 'Arată toate orașele') : label('Tüm ülkeler', 'All countries', 'Të gjitha shtetet', 'Toate țările') : label('Tüm ülkeleri göster', 'Show all countries', 'Shfaq të gjitha shtetet', 'Arată toate țările')}</button>
    </div>}
    {showCities && !savedReadFailed && <CityPhotoCredits destinations={visible}/>}
  </section>;
}
