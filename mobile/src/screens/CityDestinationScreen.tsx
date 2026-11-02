import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { DestinationPhoto } from '../components/DestinationPhoto';
import { CityHeartButton } from '../components/CityHeartButton';
import { CityPhotoCredits } from '../components/CityPhotoCredits';
import { CountryFlag } from '../components/CountryFlag';
import { Sheet } from '../components/Sheet';
import { cityHighlightDetails } from '../data/cityHighlightDetails';
import { cityEssentials } from '../data/cityEssentials';
import { cityEssentialPhoto } from '../data/cityEssentialPhotos';
import { openExternal } from '../lib/native';
import type { CityDestination } from '../data/cityDestinations';
import { useI18n } from '../lib/i18n';
import './city-destination.css';

type Props = {
  destination: CityDestination;
  saved: boolean;
  onToggleSaved: () => void;
  onPlan: () => void;
  onBudget: () => void;
  onMap: (point?: CityDestination['highlights'][number]) => void;
  onSearchPlace?: (name: string) => void;
  onEvents: () => void;
  onBack: () => void;
  onOpenReadyRoute: () => void;
};

type Detail = { kind: 'place'; id: string } | { kind: 'route' };

function ItinerarySteps({ steps, compact = false }: { steps: readonly string[]; compact?: boolean }) {
  return <ol className={`city-route-steps${compact ? ' is-compact' : ''}`}>{steps.map((step, index) => {
    const separator = step.indexOf(':');
    const hasHeading = separator > 0 && separator < 40;
    return <li key={`${index}:${step}`}><span className="city-route-step-dot" aria-hidden="true"/><div>
      {hasHeading ? <><strong>{step.slice(0, separator + 1)}</strong><span>{step.slice(separator + 1)}</span></> : <span>{step}</span>}
    </div></li>;
  })}</ol>;
}

export function CityDestinationScreen({ destination, saved, onToggleSaved, onPlan, onBudget, onMap, onSearchPlace, onEvents, onBack, onOpenReadyRoute }: Props) {
  const { copy, locale } = useI18n();
  const label = (tr: string, en: string, sq: string, ro: string) => locale === 'ro' ? ro : copy(tr, en, sq);
  const [panel, setPanel] = useState<{ city: string; detail: Detail | null }>(() => ({ city: destination.code, detail: null }));
  const [sourceFailure, setSourceFailure] = useState<{ city: string; source: string; locale: string; panel: typeof panel } | null>(null);
  const sourceRequest = useRef(0);
  const currentCity = panel.city === destination.code;
  // A new city must discard the old panel, including a quick return to it.
  if (!currentCity) setPanel({ city: destination.code, detail: null });
  const highlights = destination.highlights;
  const essentials = cityEssentials(destination.code, locale);
  // Map providers recognise the reviewed international venue names more
  // reliably than translated editorial labels. Keep the page in its locale.
  const mapPlaces = locale === 'en' ? essentials?.places : cityEssentials(destination.code, 'en')?.places;
  const essentialPhotos = !highlights.length && essentials ? essentials.places.flatMap(place => {
    const image = cityEssentialPhoto(destination.code, place.id);
    return image ? [{ code: place.id, name: place.name, ...image }] : [];
  }) : [];
  const route = destination.route;
  const routeTitle = label(`${destination.name} rotası`, `${destination.name} route`, `Itinerar në ${destination.name}`, `Traseu în ${destination.name}`);
  const activeDetail = currentCity ? panel.detail : null;
  const selectedPlace = activeDetail?.kind === 'place' ? highlights.find(point => point.id === activeDetail.id) : undefined;
  const placeDetails = selectedPlace ? cityHighlightDetails(selectedPlace.id, locale) : undefined;
  const selectedRoute = activeDetail?.kind === 'route' ? route : null;
  const openPlace = (id: string) => setPanel({ city: destination.code, detail: { kind: 'place', id } });
  const closeDetail = () => setPanel({ city: destination.code, detail: null });
  useEffect(() => {
    setSourceFailure(null);
    return () => { sourceRequest.current++; };
  }, [destination.code, panel, locale]);
  const openSource = async (url: string, source: string) => {
    const request = ++sourceRequest.current;
    setSourceFailure(null);
    let opened = false;
    try { opened = await openExternal(url); } catch { /* Failed native handoffs remain explicitly retryable. */ }
    if (request === sourceRequest.current && !opened) setSourceFailure({ city: destination.code, source, locale, panel });
  };
  const sourceNotice = (source: string, url: string) => currentCity && sourceFailure?.city === destination.code
    && sourceFailure.panel === panel && sourceFailure.locale === locale && sourceFailure.source === source
    ? <div className="info-box" role="alert"><Icon name="info" size={19}/><div>
      <p>{copy('Resmî sayfa açılamadı. İnternet bağlantını kontrol et.', 'The official page could not open. Check your connection.', 'Faqja zyrtare nuk u hap. Kontrollo lidhjen.')}</p>
      <button className="city-detail-secondary" type="button" onClick={() => void openSource(url, source)}>{copy('Tekrar dene', 'Try again', 'Provo sërish')}</button>
    </div></div> : null;

  return <section className="screen city-destination" aria-labelledby="city-destination-title">
    <div className="city-destination-hero">
      <DestinationPhoto src={destination.heroPhoto || destination.photo} code={destination.code} countryCode={destination.countryCode} label={destination.name}/>
      <div className="city-destination-hero-shade" aria-hidden="true"/>
      <div className="city-destination-hero-tools">
        <button className="city-destination-back" type="button" onClick={onBack} aria-label={label('Geri', 'Back', 'Prapa', 'Înapoi')}>
          <Icon name="back" size={21}/><span>{label('Geri', 'Back', 'Prapa', 'Înapoi')}</span>
        </button>
        <CityHeartButton className="city-destination-heart" onToggle={onToggleSaved} saved={saved} label={saved
          ? label(`${destination.name} kaydını kaldır`, `Unsave ${destination.name}`, `Hiq ${destination.name} nga të ruajturat`, `Elimină ${destination.name} din salvate`)
          : label(`${destination.name} şehrini kaydet`, `Save ${destination.name}`, `Ruaj ${destination.name}`, `Salvează ${destination.name}`)}/>
      </div>
    </div>

    <div className="city-destination-body">
      <div className="city-destination-intro">
        <div className="city-destination-identity">
          <h1 id="city-destination-title">{destination.name}</h1>
          <p><span aria-hidden="true"><CountryFlag code={destination.countryCode} label={destination.country}/></span>{destination.country}</p>
        </div>
        <button className="city-destination-plan" type="button" onClick={onPlan}><Icon name="route" size={20}/>{label('Rota oluştur', 'Create a route', 'Krijo itinerar', 'Creează un traseu')}</button>
      </div>
      {essentials && <p className="city-destination-summary">{essentials.summary}</p>}
      <div className="city-destination-actions" role="group" aria-label={label('Şehir araçları', 'City tools', 'Mjetet e qytetit', 'Instrumente pentru oraș')}>
        <button type="button" onClick={onBudget}><Icon name="wallet" size={21}/><span>{label('Bütçe', 'Budget', 'Buxheti', 'Buget')}</span></button>
        <button type="button" onClick={() => onMap()}><Icon name="map" size={21}/><span>{label('Harita', 'Map', 'Harta', 'Hartă')}</span></button>
        <button type="button" onClick={onEvents}><Icon name="calendar" size={21}/><span>{label('Etkinlikler', 'Events', 'Aktivitete', 'Evenimente')}</span></button>
      </div>

      {highlights.length > 0 && <section className="city-destination-discover" aria-labelledby="city-destination-discover-title">
        <div className="city-destination-section-heading">
          <h2 id="city-destination-discover-title">{label('Şehirde keşfet', 'Explore the city', 'Eksploro qytetin', 'Explorează orașul')}</h2>
          <button className="city-destination-map-link" type="button" onClick={() => onMap()}>{label('Haritada gör', 'See on map', 'Shih në hartë', 'Vezi pe hartă')}<Icon name="chevron" size={16}/></button>
        </div>
        <div className="city-destination-highlights">
          {highlights.map(point => {
            const info = cityHighlightDetails(point.id, locale);
            return <article key={point.id} className="city-place-card">
              <button className="city-place-open" type="button" onClick={() => openPlace(point.id)} aria-label={label(`${point.name} ayrıntılarını aç`, `Open ${point.name} details`, `Hap detajet për ${point.name}`, `Deschide detaliile pentru ${point.name}`)}>
                <DestinationPhoto src={point.photo} countryCode={destination.countryCode} label={point.name}/>
                <span className="city-place-card-copy">
                  {info && <small className="city-place-category">{info.category}</small>}
                  <span className="city-destination-highlight-name"><strong>{point.name}</strong><Icon name="chevron" size={16}/></span>
                  {info && <span className="city-place-summary">{info.summary}</span>}
                </span>
              </button>
              <button className="city-place-map" type="button" onClick={() => onMap(point)} aria-label={label(`${point.name} konumunu haritada gör`, `See ${point.name} on the map`, `Shih ${point.name} në hartë`, `Vezi ${point.name} pe hartă`)}><Icon name="map" size={16}/>{label('Haritada gör', 'See on map', 'Shih në hartë', 'Vezi pe hartă')}</button>
            </article>;
          })}
        </div>
      </section>}

      {highlights.length === 0 && essentials && <section className="city-essentials" aria-labelledby="city-essentials-title">
        <div className="city-destination-section-heading">
          <h2 id="city-essentials-title">{label('Şehirde keşfet', 'Explore the city', 'Eksploro qytetin', 'Explorează orașul')}</h2>
        </div>
        <div className="city-essentials-list">{essentials.places.map((place, index) => {
          const image = essentialPhotos.find(photo => photo.code === place.id);
          return <article className="city-essential" key={place.id}>
          <span className="city-essential-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div className="city-essential-copy"><small>{place.category}</small><h3>{place.name}</h3>
            <div className="city-essential-actions">
              {onSearchPlace && <button type="button" onClick={() => onSearchPlace(mapPlaces?.find(point => point.id === place.id)?.name || place.name)} aria-label={label(`${place.name} için haritada ara`, `Search the map for ${place.name}`, `Kërko ${place.name} në hartë`, `Caută ${place.name} pe hartă`)}><Icon name="map" size={16}/>{label('Haritada ara', 'Search map', 'Kërko në hartë', 'Caută pe hartă')}</button>}
              <button type="button" className="city-essential-source" onClick={() => void openSource(place.source.url, `essential:${place.id}`)} aria-label={label(`${place.name} resmî rehberini aç`, `Open the official guide for ${place.name}`, `Hap udhëzuesin zyrtar për ${place.name}`, `Deschide ghidul oficial pentru ${place.name}`)}>{label('Resmî rehber', 'Official guide', 'Udhëzuesi zyrtar', 'Ghid oficial')}<Icon name="external" size={13}/></button>
            </div>
            {sourceNotice(`essential:${place.id}`, place.source.url)}
          </div>
          {image && <span className="city-essential-photo"><DestinationPhoto src={image.photo} countryCode={destination.countryCode} label={place.name}/></span>}
        </article>;
        })}</div>
      </section>}

      {route && <section className="city-destination-ready-route" aria-labelledby="city-ready-route-title">
        <div className="city-ready-heading">
          <span className="city-destination-ready-icon" aria-hidden="true"><Icon name="route" size={24}/></span>
          <div><span className="city-ready-eyebrow">{label('Hazır şehir rotası', 'Ready-made city route', 'Itinerar i gatshëm në qytet', 'Traseu urban pregătit')}</span><h2 id="city-ready-route-title">{routeTitle}</h2></div>
        </div>
        {route.idealDuration && <p className="city-ready-duration"><Icon name="clock" size={16}/>{route.idealDuration}</p>}
        <ItinerarySteps steps={route.dailyPlan.slice(0, 2)} compact/>
        <div className="city-ready-actions">
          {route.dailyPlan.length > 0 && <button type="button" className="city-detail-secondary" onClick={() => setPanel({ city: destination.code, detail: { kind: 'route' } })}>{label('Tüm planı gör', 'View full plan', 'Shiko planin e plotë', 'Vezi planul complet')}</button>}
          <button type="button" className="city-detail-primary" onClick={onOpenReadyRoute}>{label('Rotayı aç', 'Open route', 'Hap itinerarin', 'Deschide traseul')}<Icon name="chevron" size={17}/></button>
        </div>
      </section>}
      <CityPhotoCredits destinations={[destination, ...highlights.map(point => ({ code: point.id, name: point.name, photoCredit: point.photoCredit })), ...essentialPhotos]}/>
    </div>
    {(selectedPlace || selectedRoute) && <Sheet open title={selectedPlace?.name || routeTitle} onClose={closeDetail} size="large" className="city-detail-sheet">
      {selectedPlace && <div className="city-place-detail">
        <DestinationPhoto src={selectedPlace.photo} countryCode={destination.countryCode} label={selectedPlace.name}/>
        {placeDetails && <>
          <span className="city-place-category">{placeDetails.category}</span>
          <p className="city-place-description">{placeDetails.description}</p>
          <div className="city-place-tip"><Icon name="compass" size={21}/><div><h3>{label('Ziyaret notu', 'Visit note', 'Shënim për vizitën', 'Notă de vizitare')}</h3><p>{placeDetails.tip}</p></div></div>
        </>}
        <button type="button" className="city-detail-primary" onClick={() => { closeDetail(); onMap(selectedPlace); }}><Icon name="map" size={19}/>{label('Haritada gör', 'See on map', 'Shih në hartë', 'Vezi pe hartă')}</button>
        {placeDetails && <><button type="button" className="city-place-source" onClick={() => void openSource(placeDetails.source.url, `highlight:${selectedPlace.id}`)}><span><small>{label('Resmî kaynak', 'Official source', 'Burimi zyrtar', 'Sursa oficială')}</small><strong>{placeDetails.source.title}</strong></span><Icon name="external" size={17}/></button>
          {sourceNotice(`highlight:${selectedPlace.id}`, placeDetails.source.url)}</>}
        <CityPhotoCredits compact destinations={[{ code: selectedPlace.id, name: selectedPlace.name, photoCredit: selectedPlace.photoCredit }]}/>
      </div>}
      {selectedRoute && <div className="city-route-detail">
        {selectedRoute.idealDuration && <p className="city-ready-duration"><Icon name="clock" size={17}/>{selectedRoute.idealDuration}</p>}
        <p className="city-route-description">{selectedRoute.why}</p>
        <ItinerarySteps steps={selectedRoute.dailyPlan}/>
        <button type="button" className="city-detail-primary" onClick={() => { closeDetail(); onOpenReadyRoute(); }}>{label('Rotayı aç', 'Open route', 'Hap itinerarin', 'Deschide traseul')}<Icon name="chevron" size={18}/></button>
      </div>}
    </Sheet>}
  </section>;
}
