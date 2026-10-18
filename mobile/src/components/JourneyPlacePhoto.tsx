import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';
import { validJourneyPhoto, CATEGORY_LABELS } from '../../../lib/travel-assistant/places';
import type { JourneyPlace } from '../lib/mapJourney';
import { Icon, type IconName } from './Icon';

export function JourneyPlacePhoto({ place, compact = false }: { place: JourneyPlace; compact?: boolean }) {
  const { copy, locale } = useI18n();
  const [failed, setFailed] = useState('');
  const category = CATEGORY_LABELS[place.category]?.[locale === 'tr' ? 0 : locale === 'sq' ? 2 : 1] || place.category;
  const icon: IconName = ['park', 'garden', 'hiking'].includes(place.category) ? 'leaf'
    : ['cafe', 'bakery', 'restaurant', 'sweets', 'market'].includes(place.category) ? 'smile'
    : ['museum', 'historic', 'palace', 'monument'].includes(place.category) ? 'book'
    : ['transit'].includes(place.category) ? 'train' : 'compass';
  const visible = place.imageUrl && failed !== place.imageUrl && validJourneyPhoto(place);
  return <figure className={`mj-venue-photo${compact ? ' compact' : ''}${visible ? '' : ' fallback'}`}>
    {visible ? <img src={place.imageUrl} alt={place.name} width={640} height={480} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(place.imageUrl!)} />
      : <div className="mj-photo-placeholder"><Icon name={icon} size={compact ? 26 : 34} /><span>{category}{!compact && <small>{copy('Bu mekân için doğrulanmış fotoğraf yok.','No verified photo is available for this place.','Nuk ka foto të verifikuar për këtë vend.')}</small>}</span></div>}
    {visible && <figcaption><details><summary>{copy('Fotoğraf kaynağı','Photo credit','Burimi i fotos')}</summary><span>{place.imageAttribution}</span><button type="button" onClick={() => void openExternal(place.imageSourceUrl!)}>Wikimedia Commons</button><button type="button" onClick={() => void openExternal(place.imageLicenseUrl!)}>{place.imageLicenseLabel}</button></details></figcaption>}
  </figure>;
}
