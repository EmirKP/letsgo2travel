import { useState } from 'react';
import { destinationArtwork } from '../data/artwork';
import { CountryFlag } from './CountryFlag';
import { useI18n } from '../lib/i18n';
import './destination-search-fallback.css';

/** Never fall through to another place's photo when a bundled asset fails. */
export function DestinationPhoto({ code, countryCode, label, src: imageSrc }: { code?: string; countryCode?: string; label: string; src?: string }) {
  const { copy } = useI18n();
  const src = imageSrc || destinationArtwork(code);
  const [failed, setFailed] = useState('');
  return <span className="destination-photo" aria-hidden="true">{src && !src.startsWith('data:') && failed !== src
    ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)}/>
    : <span className="destination-photo-unavailable">{countryCode && <CountryFlag code={countryCode} label={label}/>}<small>{copy('Fotoğraf kullanılamıyor', 'Photo unavailable', 'Fotografia nuk është e disponueshme')}</small></span>}</span>;
}
