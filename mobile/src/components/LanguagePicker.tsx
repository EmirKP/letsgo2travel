import { useState } from 'react';
import { useI18n, type AppLocale } from '../lib/i18n';
import { countryFlagAsset } from '../data/flagAssets';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import './language-picker.css';

const LANGUAGES: { id: AppLocale; name: string; code: string }[] = [
  { id: 'tr', name: 'Türkçe', code: 'TR' },
  { id: 'en', name: 'English', code: 'EN' },
  { id: 'sq', name: 'Shqip', code: 'SQ' },
];

export function LanguageFlag({ locale }: { locale: AppLocale }) {
  return <span className={`language-flag language-flag-${locale}`} aria-hidden="true">
    {locale === 'sq' ? <><img src={countryFlagAsset('XK')} alt=""/><img className="language-flag-al" src={countryFlagAsset('AL')} alt=""/></>
      : <img src={countryFlagAsset(locale === 'tr' ? 'TR' : 'GB')} alt=""/>}
  </span>;
}

export function LanguagePicker() {
  const { locale, setLocale, copy } = useI18n();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="language-toggle" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${copy('Uygulama dili', 'App language')}: ${LANGUAGES.find(item => item.id === locale)?.name}`}>
      <LanguageFlag locale={locale}/><span className="language-code">{locale.toUpperCase()}</span>
    </button>
    <Sheet open={open} title={copy('Dil seç', 'Choose language', 'Zgjidh gjuhën')} onClose={() => setOpen(false)}>
      <div className="language-options" role="group" aria-label={copy('Uygulama dili', 'App language')}>
        {LANGUAGES.map(language => <button type="button" key={language.id} lang={language.id} aria-pressed={locale === language.id} onClick={() => { setLocale(language.id); setOpen(false); }}>
          <LanguageFlag locale={language.id}/><span><strong>{language.name}</strong><small>{language.code}</small></span>{locale === language.id && <Icon name="check" size={21}/>}
        </button>)}
      </div>
    </Sheet>
  </>;
}
