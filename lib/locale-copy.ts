import { RO_MESSAGES } from '../mobile/src/lib/locales/ro';
import { translateMessageTemplates } from '../mobile/src/lib/locale';

/** Translate application-owned copy only. Never pass arbitrary user content. */
export function translateAppCopy(locale: string | null | undefined, tr: string, en: string, sq?: string): string {
  if (locale === 'tr') return tr;
  if (locale === 'sq') return sq ?? en;
  if (locale === 'ro') return translateMessageTemplates(RO_MESSAGES, en);
  return en;
}
