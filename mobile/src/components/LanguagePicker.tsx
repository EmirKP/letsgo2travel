import { useState } from 'react';
import { useI18n, type AppLocale } from '../lib/i18n';
import { countryFlagAsset } from '../data/flagAssets';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import './language-picker.css';

const LANGUAGES: { id: AppLocale; name: string }[] = [
  { id: 'tr', name: 'Türkçe' },
  { id: 'en', name: 'English' },
  { id: 'sq', name: 'Shqip' },
  { id: 'ro', name: 'Română' },
];

export function LanguageFlag({ locale }: { locale: AppLocale }) {
  return <span className={`language-flag language-flag-${locale}`} aria-hidden="true">
    {locale === 'sq' ? <><img src={countryFlagAsset('XK')} alt=""/><img className="language-flag-al" src={countryFlagAsset('AL')} alt=""/></>
      : <img src={countryFlagAsset(locale === 'tr' ? 'TR' : locale === 'ro' ? 'RO' : 'GB')} alt=""/>}
  </span>;
}

export function LanguagePicker() {
  const { locale, setLocale, pendingLocale, failedLocale, copy } = useI18n();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="language-toggle" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${copy('Uygulama dili', 'App language')}: ${LANGUAGES.find(item => item.id === locale)?.name}`}>
      <LanguageFlag locale={locale}/>
    </button>
    <Sheet open={open} title={copy('Dil seç', 'Choose language', 'Zgjidh gjuhën')} onClose={() => setOpen(false)}>
      <div className="language-options" role="group" aria-label={copy('Uygulama dili', 'App language')}>
        {LANGUAGES.map(language => <button type="button" key={language.id} lang={language.id} aria-pressed={locale === language.id} aria-busy={pendingLocale === language.id} onClick={async () => { if (await setLocale(language.id)) setOpen(false); }}>
          <LanguageFlag locale={language.id}/><span><strong>{language.name}</strong></span>{locale === language.id && <Icon name="check" size={21}/>}
        </button>)}
      </div>
      {pendingLocale && <p role="status">{copy('Dil yükleniyor…', 'Loading language…', 'Duke ngarkuar gjuhën…')}</p>}
      {failedLocale && <p role="alert">{copy('Dil yüklenemedi. Tekrar seç veya başka bir dil kullan.', 'Language could not load. Select it again or choose another language.', 'Gjuha nuk u ngarkua. Zgjidhe përsëri ose përdor një gjuhë tjetër.')}</p>}
    </Sheet>
  </>;
}
