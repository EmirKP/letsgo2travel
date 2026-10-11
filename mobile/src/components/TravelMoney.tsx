import { useEffect, useRef, useState } from 'react';
import { CURRENCIES, identityQuote, parseAmount } from '../../../lib/travel-assistant/money';
import type { FxQuote } from '../../../lib/travel-assistant/types';
import { storedQuote, loadQuote } from '../lib/travelAssistant';
import { locateDeviceArea } from '../lib/deviceArea';
import { moneyCurrencyForCountry, readMoneyPair, saveMoneyPair, type MoneyPair } from '../lib/moneyPreferences';
import { useI18n } from '../lib/i18n';
import { appCurrencyName, formatAppDate } from '../lib/localeFormatting';
import { openExternal } from '../lib/native';
import { Icon } from './Icon';
import moneyIllustration from '../assets/money-exchange.png';
import './travel-money.css';

const QUICK_PAIRS = ['EUR', 'USD', 'GBP'];
const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

function MovementArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={direction === 'up' ? 'M5 17 19 5M9 5h10v10' : direction === 'down' ? 'M5 7 19 19M9 19h10V9' : 'M4 12h16m-5-5 5 5-5 5'}/>
  </svg>;
}

export function TravelMoney() {
  const { copy, locale } = useI18n();
  const [initialPair] = useState(readMoneyPair);
  const [pair, setPair] = useState<MoneyPair>(initialPair || { base: 'EUR', quote: 'TRY' });
  const { base, quote } = pair;
  const manualChoice = useRef(!!initialPair);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'auto' | 'manual' | 'unavailable'>(initialPair ? 'manual' : 'loading');
  const [amount, setAmount] = useState('1');
  const choosePair = (next: MoneyPair) => { manualChoice.current = true; setLocationStatus('manual'); setPair(next); saveMoneyPair(next); };
  useEffect(() => {
    if (manualChoice.current) return;
    let active = true;
    void locateDeviceArea().then(area => {
      if (!active || manualChoice.current) return;
      const currency = moneyCurrencyForCountry(area.country);
      if (!currency) { setLocationStatus('unavailable'); return; }
      setPair({ base: currency, quote: currency === 'TRY' ? 'EUR' : 'TRY' });
      setLocationStatus('auto');
    }).catch(() => { if (active && !manualChoice.current) setLocationStatus('unavailable'); });
    return () => { active = false; };
  }, []);
  const [value, setValue] = useState<FxQuote | null>(null); const [status, setStatus] = useState<'loading'|'online'|'saved'|'missing'>('loading');
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    if (identityQuote(base, quote)) { setValue(null); setStatus('online'); return; }
    const saved = storedQuote(base, quote);
    setValue(saved); setStatus('loading');
    void loadQuote(base,quote).then(v => { if (alive) { setValue(v); setStatus('online'); } })
      .catch(() => { if (alive) { setValue(saved); setStatus(saved ? 'saved' : 'missing'); } });
    return () => { alive = false; };
  }, [base,quote,retry]);
  const identity = identityQuote(base, quote, now);
  const current = identity || (value?.base === base && value.quote === quote ? value : null);
  const old = !current || now - Date.parse(current.date) > 7 * 86400000 || Date.parse(current.date) > now;
  const number = parseAmount(amount);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
  const smallestRate = current ? Math.min(current.rate, current.previousRate ?? current.rate) : 1;
  const rateFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: smallestRate < 0.01 ? 8 : smallestRate < 1 ? 6 : 4 });
  const currencyName = (code: string) => appCurrencyName(code, locale);
  const dateText = (date: string) => formatAppDate(new Date(`${date}T12:00:00Z`), locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const change = current?.changePercent;
  const hasComparison = change != null && current?.previousRate != null && current.previousDate != null;
  const direction = change != null && change > 0 ? 'up' : change != null && change < 0 ? 'down' : 'flat';
  const movementLabel = direction === 'up' ? copy('Yükseliş', 'Increase') : direction === 'down' ? copy('Düşüş', 'Decrease') : copy('Değişim yok', 'Unchanged');
  const changeText = change != null && Math.abs(change) > 0 && Math.abs(change) < 0.0001
    ? `<${nf.format(0.0001)}%` : `${nf.format(Math.abs(change || 0))}%`;
  const conversion = current && !old && number !== null ? number * current.rate : null;

  return <section className="ta-panel ta-money" aria-label={copy('Döviz çevirici', 'Currency converter')}>
    <div className="tm-welcome"><div><span className="tm-eyebrow">{copy('SEYAHAT CÜZDANIN', 'YOUR TRAVEL WALLET', 'PORTOFOLI YT I UDHËTIMIT')}</span><h2>{copy('Paran dünyayı gezsin.', 'Make your money travel.', 'Paratë e tua, kudo në botë.')}</h2><p className="tm-intro">{copy('Kuru karşılaştır, seyahat harcamanı kolayca hesapla.', 'Compare rates and work out your travel spending.')}</p></div><img src={moneyIllustration} alt="" width="136" height="122" decoding="async"/></div>
    <div className="tm-quick-pairs" role="group" aria-label={copy('Sık kullanılan kurlar', 'Popular currency pairs')}>
      {QUICK_PAIRS.map(currency => <button type="button" key={currency} aria-pressed={base === currency && quote === 'TRY'} onClick={() => choosePair({ base: currency, quote: 'TRY' })}>
        <span aria-hidden="true" className={`tm-currency-coin tm-currency-${currency.toLowerCase()}`}>{SYMBOLS[currency]}</span><span className="tm-quick-pair-label">{currency}<small>/ TRY</small></span>
      </button>)}
    </div>
    <section className="tm-board" aria-label={copy('Seçili kur', 'Selected exchange rate')}>
      <div className="tm-board-top">
        <span className="tm-reference-label"><Icon name="clock" size={14}/>{identity ? copy('AYNI PARA BİRİMİ', 'SAME CURRENCY', 'E NJËJTA MONEDHË') : old && current ? copy('KAYITLI REFERANS', 'SAVED REFERENCE') : copy('GÜNLÜK REFERANS', 'DAILY REFERENCE')}</span>
        {!identity && <button type="button" className="tm-refresh" disabled={status === 'loading'} onClick={() => setRetry(count => count + 1)} aria-label={copy('Kuru yenile', 'Refresh rate')}><Icon name="refresh" size={18}/></button>}
      </div>
      <div className="tm-pair"><strong>{base}<span>/</span>{quote}</strong><span>{currencyName(base)} → {currencyName(quote)}</span></div>
      <div className="tm-rate-line">
        <div className="tm-rate"><span className="tm-rate-base">1 {base} =</span><strong>{current ? rateFormat.format(current.rate) : '—'}</strong><span>{quote}</span></div>
        {hasComparison && <span className={`tm-movement is-${direction}`} aria-label={`${movementLabel}: ${changeText}`}><MovementArrow direction={direction}/><span><strong>{changeText}</strong><small>{movementLabel}</small></span></span>}
      </div>
      <div className="tm-rate-context" aria-live="polite">
        {identity ? <span>{copy('İnternet veya kur bilgisi gerekmez.', 'No connection or exchange rate is needed.', 'Nuk nevojitet lidhje ose kurs këmbimi.')}</span> : current && <span><Icon name="calendar" size={14}/>{copy('Kur tarihi', 'Rate date')}: {dateText(current.date)}</span>}
        {status === 'loading' && <span>{copy('Kur güncelleniyor…', 'Updating rate…')}</span>}
        {status === 'saved' && <span className="tm-saved-status"><Icon name="offline" size={14}/>{copy('Güncellenemedi · son kayıt', 'Update unavailable · saved rate', 'Përditësimi mungon · kursi i ruajtur')}</span>}
        {status === 'missing' && <span>{copy('Kur şu an alınamıyor. Yenileyerek tekrar dene.', 'The rate is unavailable. Refresh to try again.')}</span>}
      </div>
      {hasComparison && current && <details className="tm-history"><summary>{copy('Kur değişiminin detayı', 'Rate change details', 'Hollësitë e ndryshimit të kursit')}<Icon name="chevron" size={15}/></summary><div className="tm-comparison">
        <div><span>{copy('Önceki referans', 'Previous reference')}</span><strong>{rateFormat.format(current.previousRate!)} <small>{quote}</small></strong><time dateTime={current.previousDate!}>{dateText(current.previousDate!)}</time></div>
        <span className={`tm-comparison-arrow is-${direction}`} aria-hidden="true"><MovementArrow direction={direction}/></span>
        <div><span>{copy('Son referans', 'Latest reference')}</span><strong>{rateFormat.format(current.rate)} <small>{quote}</small></strong><time dateTime={current.date}>{dateText(current.date)}</time></div>
        <p>{copy('Değişim, önceki yayımlanan kura göredir.', 'Change is compared with the previous published rate.')}</p>
      </div></details>}
      {current && !hasComparison && <p className="tm-no-comparison">{base === quote ? copy('Aynı para birimi; kur farkı yok.', 'Same currency; no exchange difference.') : copy('Önceki referans bulunmadığı için değişim gösterilmiyor.', 'Change is unavailable without a previous reference rate.')}</p>}
    </section>
    <section className="tm-converter" aria-labelledby="tm-converter-title">
      <div className="tm-section-heading"><span><Icon name="swap" size={20}/></span><h3 id="tm-converter-title">{copy('Ne kadar eder?', 'How much is it?')}</h3></div>
      <p className="tm-location-note" aria-live="polite">{locationStatus === 'loading' ? copy('Konumuna göre para birimi belirleniyor…', 'Finding your local currency…', 'Po përcaktohet monedha vendore…') : locationStatus === 'auto' ? copy('Kaynak para konumuna göre seçildi. İstersen değiştirebilirsin.', 'Your local currency is selected. You can change it anytime.', 'U zgjodh monedha vendore. Mund ta ndryshosh.') : locationStatus === 'unavailable' ? copy('Konumdan para birimi belirlenemedi. Kaynak parayı seçebilirsin.', 'Your local currency could not be determined. Choose it below.', 'Monedha vendore nuk u përcaktua. Zgjidhe më poshtë.') : copy('Seçtiğin para birimleri hatırlanır.', 'Your currency choices are remembered.', 'Zgjedhjet e monedhave ruhen.')}</p>
      <div className="tm-exchange-input">
      <label className="tm-amount-label" htmlFor="tm-amount">{copy('Çevirmek istediğin tutar', 'Amount to convert')}</label>
      <div className="tm-amount-field"><input id="tm-amount" type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" maxLength={24} placeholder="0" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={number === null} aria-describedby={number === null ? 'tm-amount-error' : undefined}/><label className="tm-currency-choice"><span>{copy('Kaynak para', 'From')}</span><select aria-label={copy('Kaynak para', 'From')} value={base} onChange={event => choosePair({ base: event.target.value, quote })}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label></div>
      <small className="tm-currency-name">{currencyName(base)}</small>
      </div>
      {number === null && <p id="tm-amount-error" className="tm-form-message" role="alert">{copy('Sıfır veya pozitif bir tutar gir; binlik ayırıcı kullanma.', 'Enter zero or a positive amount without thousands separators.')}</p>}
      <div className="tm-swap-divider"><button type="button" className="tm-swap" onClick={() => choosePair({ base: quote, quote: base })} aria-label={copy('Para birimlerini değiştir', 'Swap currencies')}><Icon name="swap" size={20}/></button></div>
      <div className="tm-conversion" aria-live="polite">
        <span>{identity ? copy('Karşılığı', 'Value', 'Vlera') : copy('Yaklaşık karşılığı', 'Approximate value')}</span>
        <div className="tm-result-line"><strong>{conversion !== null ? `${identity ? '=' : '≈'} ${nf.format(conversion)}` : '—'}</strong><label className="tm-currency-choice"><span>{copy('Hedef para', 'To')}</span><select aria-label={copy('Hedef para', 'To')} value={quote} onChange={event => choosePair({ base, quote: event.target.value })}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label></div>
        <span>{currencyName(quote)}</span>
        {conversion !== null && number !== null && <span className="tm-result-reference">{nf.format(number)} {base} · {identity ? copy('aynı para birimi', 'same currency', 'e njëjta monedhë') : copy('referans kurla', 'at the reference rate')}</span>}
        {old && status !== 'loading' && <p role="status">{copy('Son 7 güne ait kullanılabilir kur yok. Güncel dönüşüm hesaplanmıyor.', 'No usable rate from the last seven days. A current conversion cannot be calculated.')}</p>}
      </div>
    </section>
    {!identity && <aside className="tm-source-note"><Icon name="info" size={18}/><div><p>{copy('Günlük yayımlanan referans kurlarıdır; anlık alış/satış fiyatı değildir. Banka ve döviz bürosu komisyonları dahil değildir.', 'Published daily reference rates, not real-time buy/sell prices. Bank and exchange-office fees are excluded.')}</p><button type="button" onClick={() => void openExternal('https://frankfurter.dev/')}>{copy('Kur kaynağı: Frankfurter', 'Rate source: Frankfurter')}<Icon name="external" size={13}/></button></div></aside>}
  </section>;
}
