import type { AppLocale } from './locale';

export function routeAllowanceLabel(remaining: number, locale: AppLocale): string {
  if (locale === 'ro') return `Azi ai ${remaining} ${remaining === 1 ? 'traseu disponibil' : 'trasee disponibile'}`;
  if (locale === 'sq') return `Sot ke ${remaining} ${remaining === 1 ? 'itinerar të mbetur' : 'itinerare të mbetura'}`;
  if (locale === 'en') return `${remaining} ${remaining === 1 ? 'route' : 'routes'} available today`;
  return `Bugün ${remaining} rota hakkın var`;
}
