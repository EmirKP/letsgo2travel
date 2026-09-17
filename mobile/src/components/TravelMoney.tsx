import { useEffect, useState } from 'react';
import { CURRENCIES, parseAmount } from '../../../lib/travel-assistant/money';
import type { FxQuote } from '../../../lib/travel-assistant/types';
import { storedQuote, loadQuote } from '../lib/travelAssistant';
import { useI18n } from '../lib/i18n';
import { openExternal } from '../lib/native';

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
  const change = current?.changePercent;
  return <section className="ta-panel"><h3>{copy('Para Merkezi', 'Money centre')}</h3>
    <p className="ta-muted">{copy('Günlük yayımlanan referans kurlarıdır; anlık alış/satış fiyatı değildir. Banka ve döviz bürosu komisyonları dahil değildir.', 'Published daily reference rates, not real-time buy/sell prices. Bank and exchange-office fees are excluded.')}</p>
    <div className="ta-form-row"><label>{copy('Tutar','Amount')}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={number === null}/></label>
      <label>{copy('Kaynak para','From')}<select value={base} onChange={e => setBase(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>{copy('Hedef para','To')}<select value={quote} onChange={e => setQuote(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
    <button type="button" className="secondary-wide" onClick={() => { setBase(quote); setQuote(base); }}>{copy('Para birimlerini değiştir','Swap currencies')}</button>
    {number === null && <p role="alert">{copy('Geçerli bir pozitif tutar gir; binlik ayırıcı kullanma.', 'Enter a valid non-negative amount without thousands separators.')}</p>}
    <div aria-live="polite" className="ta-money-result">
      {status === 'loading' && <p>{copy('Kur güncelleniyor…','Updating rate…')}</p>}
      {status === 'saved' && <p>{copy('Bağlantı kurulamadı — son kayıtlı kur.', 'Connection unavailable — last saved rate.')}</p>}
      {current && !old && number !== null && <strong>{nf.format(number)} {base} ≈ {nf.format(number * current.rate)} {quote}</strong>}
      {current && <><p>1 {base} = {nf.format(current.rate)} {quote} · {current.date}</p>
        {change != null && current.previousRate != null && <p>{base}/{quote}: {change > 0 ? '↑' : change < 0 ? '↓' : '↔'} {nf.format(Math.abs(change))}% · {copy('önceki yayımlanan kura göre','versus previous published rate')} ({current.previousDate}: {nf.format(current.previousRate)})</p>}</>}
      {old && status !== 'loading' && <p role="status">{copy('Son 7 güne ait kullanılabilir kur yok. Güncel dönüşüm hesaplanmıyor.', 'No usable rate from the last seven days. A current conversion cannot be calculated.')}</p>}
    </div>
    <div className="ta-actions"><button type="button" disabled={status === 'loading'} onClick={() => setRetry(v => v+1)}>{copy('Yenile','Refresh')}</button><button type="button" onClick={() => void openExternal('https://frankfurter.dev/')}>{copy('Kur kaynağı: Frankfurter','Rate source: Frankfurter')}</button></div>
  </section>;
}
