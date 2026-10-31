import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';
import { Icon } from './Icon';
import './city-photo-credits.css';

type CreditDestination = {
  code: string;
  name: string;
  photoCredit?: { title: string; author: string; source: string; license: string; licenseUrl: string };
};

export function CityPhotoCredits({ destinations, compact = false }: { destinations: readonly CreditDestination[]; compact?: boolean }) {
  const { copy, locale } = useI18n();
  const credited = destinations.filter(destination => destination.photoCredit);
  if (!credited.length) return null;
  return <details className={`city-photo-credits${compact ? ' is-compact' : ''}`}>
    <summary>{locale === 'ro' ? 'Sursele fotografiilor' : copy('Fotoğraf kaynakları', 'Photo credits', 'Burimet e fotove')}</summary>
    <ul>{credited.map(destination => {
      const credit = destination.photoCredit!;
      return <li key={destination.code}><strong>{destination.name}</strong><span>{credit.title} · {credit.author}</span><div>
        <button type="button" aria-label={`${destination.name}: ${credit.title}`} onClick={() => void openExternal(credit.source)}>{locale === 'ro' ? 'Sursă' : copy('Kaynak', 'Source', 'Burimi')}<Icon name="external" size={12}/></button>
        <button type="button" aria-label={`${destination.name}: ${credit.license}`} onClick={() => void openExternal(credit.licenseUrl)}>{credit.license}<Icon name="external" size={12}/></button>
      </div></li>;
    })}</ul>
    <p>{locale === 'ro' ? 'Redimensionate, convertite în WebP și decupate pentru afișare.' : copy('Boyutlandırıldı, WebP’ye dönüştürüldü ve ekrana göre kırpılır.', 'Resized, converted to WebP and cropped to fit the display.', 'Të ripërmasuara, të kthyera në WebP dhe të prera sipas ekranit.')}</p>
  </details>;
}
