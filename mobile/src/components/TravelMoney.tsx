import { useEffect, useState } from 'react';
import { CURRENCIES, parseAmount } from '../../../lib/travel-assistant/money';
import type { FxQuote } from '../../../lib/travel-assistant/types';
import { storedQuote, loadQuote } from '../lib/travelAssistant';
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
  const [base, setBase] = useState('EUR'); const [quote, setQuote] = useState('TRY'); const [amount, setAmount] = useState('1');
  const [value, setValue] = useState<FxQuote | null>(null); const [status, setStatus] = useState<'loading'|'online'|'saved'|'missing'>('loading');
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    const saved = storedQuote(base, quote);
    setValue(saved); setStatus('loading');
    void loadQuote(base,quote).then(v => { if (alive) { setValue(v); setStatus('online'); } })
      .catch(() => { if (alive) { setValue(saved); setStatus(saved ? 'saved' : 'missing'); } });
    return () => { alive = false; };
  }, [base,quote,retry]);
  const current = value?.base === base && value.quote === quote ? value : null;
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
      {QUICK_PAIRS.map(currency => <button type="button" key={currency} aria-pressed={base === currency && quote === 'TRY'} onClick={() => { setBase(currency); setQuote('TRY'); }}>
        <span aria-hidden="true" className={`tm-currency-coin tm-currency-${currency.toLowerCase()}`}>{SYMBOLS[currency]}</span><span className="tm-quick-pair-label">{currency}<small>/ TRY</small></span>
      </button>)}
    </div>
    <section className="tm-board" aria-label={copy('Seçili kur', 'Selected exchange rate')}>
      <div className="tm-board-top">
        <span className="tm-reference-label"><Icon name="clock" size={14}/>{old && current ? copy('KAYITLI REFERANS', 'SAVED REFERENCE') : copy('GÜNLÜK REFERANS', 'DAILY REFERENCE')}</span>
        <button type="button" className="tm-refresh" disabled={status === 'loading'} onClick={() => setRetry(count => count + 1)} aria-label={copy('Kuru yenile', 'Refresh rate')}><Icon name="refresh" size={18}/></button>
      </div>
      <div className="tm-pair"><strong>{base}<span>/</span>{quote}</strong><span>{currencyName(base)} → {currencyName(quote)}</span></div>
      <div className="tm-rate-line">
        <div className="tm-rate"><span className="tm-rate-base">1 {base} =</span><strong>{current ? rateFormat.format(current.rate) : '—'}</strong><span>{quote}</span></div>
        {hasComparison && <span className={`tm-movement is-${direction}`} aria-label={`${movementLabel}: ${changeText}`}><MovementArrow direction={direction}/><span><strong>{changeText}</strong><small>{movementLabel}</small></span></span>}
      </div>
      <div className="tm-rate-context" aria-live="polite">
        {current && <span><Icon name="calendar" size={14}/>{copy('Kur tarihi', 'Rate date')}: {dateText(current.date)}</span>}
        {status === 'loading' && <span>{copy('Kur güncelleniyor…', 'Updating rate…')}</span>}
        {status === 'saved' && <span className="tm-saved-status"><Icon name="offline" size={14}/>{copy('Çevrimdışı · son kayıt', 'Offline · saved rate')}</span>}
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
      <label className="tm-amount-label" htmlFor="tm-amount">{copy('Çevirmek istediğin tutar', 'Amount to convert')}</label>
      <div className="tm-amount-field"><input id="tm-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={number === null} aria-describedby={number === null ? 'tm-amount-error' : undefined}/><span>{base}</span></div>
      <div className="tm-currency-fields">
        <label>{copy('Kaynak para', 'From')}<select value={base} onChange={event => setBase(event.target.value)}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select><small>{currencyName(base)}</small></label>
        <button type="button" className="tm-swap" onClick={() => { setBase(quote); setQuote(base); }} aria-label={copy('Para birimlerini değiştir', 'Swap currencies')}><Icon name="swap" size={20}/></button>
        <label>{copy('Hedef para', 'To')}<select value={quote} onChange={event => setQuote(event.target.value)}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select><small>{currencyName(quote)}</small></label>
      </div>
      {number === null && <p id="tm-amount-error" className="tm-form-message" role="alert">{copy('Sıfır veya pozitif bir tutar gir; binlik ayırıcı kullanma.', 'Enter zero or a positive amount without thousands separators.')}</p>}
      <div className="tm-conversion" aria-live="polite">
        <span>{copy('Yaklaşık karşılığı', 'Approximate value')}</span>
        <strong>{conversion !== null ? `≈ ${nf.format(conversion)}` : '—'} <small>{quote}</small></strong>
        {conversion !== null && number !== null && <span>{nf.format(number)} {base} · {copy('referans kurla', 'at the reference rate')}</span>}
        {old && status !== 'loading' && <p role="status">{copy('Son 7 güne ait kullanılabilir kur yok. Güncel dönüşüm hesaplanmıyor.', 'No usable rate from the last seven days. A current conversion cannot be calculated.')}</p>}
      </div>
    </section>
    <aside className="tm-source-note"><Icon name="info" size={18}/><div><p>{copy('Günlük yayımlanan referans kurlarıdır; anlık alış/satış fiyatı değildir. Banka ve döviz bürosu komisyonları dahil değildir.', 'Published daily reference rates, not real-time buy/sell prices. Bank and exchange-office fees are excluded.')}</p><button type="button" onClick={() => void openExternal('https://frankfurter.dev/')}>{copy('Kur kaynağı: Frankfurter', 'Rate source: Frankfurter')}<Icon name="external" size={13}/></button></div></aside>
  </section>;
}
