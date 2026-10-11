import { useEffect, useRef, useState } from 'react';
import { getWeather } from '../lib/api';
import { onAccountResume } from '../lib/accountResume';
import { createRouteWeatherStore, staleRouteWeather, type RouteWeatherReading } from '../lib/routeWeather';
import { useI18n } from '../lib/i18n';
import { formatAppDate } from '../lib/localeFormatting';
import { Icon } from './Icon';

const weatherStore = createRouteWeatherStore(getWeather);
export function RouteWeather({ place }: { place: string }) {
  const { copy, locale } = useI18n();
  const [reading, setReading] = useState<RouteWeatherReading>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let requested = Boolean(weatherStore.peek(place, locale));
    let busy = false;
    let failed = false;
    const update = () => {
      if (busy) return;
      requested = true; busy = true; failed = false;
      setLoading(true); setError(false);
      void weatherStore.load(place, locale).then(next => {
        if (alive) { setReading(next); setNow(Date.now()); }
      }).catch(() => { failed = true; if (alive) setError(true); }).finally(() => {
        busy = false; if (alive) setLoading(false);
      });
    };
    refresh.current = update;
    const check = () => {
      setNow(Date.now());
      if (requested && navigator.onLine !== false && (failed || staleRouteWeather(weatherStore.peek(place, locale)))) update();
    };
    setReading(weatherStore.peek(place, locale)); setError(false); setLoading(false);
    check();
    const stop = onAccountResume(check);
    const timer = window.setInterval(() => {
      // Hidden native tabs wake through onAccountResume, without background polling.
      if (document.visibilityState === 'visible') check();
    }, 60_000);
    return () => { alive = false; stop(); window.clearInterval(timer); refresh.current = () => {}; };
  }, [place, locale]);
  const weather = reading?.value;
  const stale = staleRouteWeather(reading, now);
  return <section aria-label={copy('Hava durumu', 'Weather', 'Moti')}>
    {weather && reading && <div className="weather-card"><Icon name={weather.weatherCode <= 2 ? 'sun' : 'cloud'} size={25}/><div>
      <small>{weather.place}</small><strong>{weather.temperature}° · {weather.description}</strong>
      <span>{weather.min}° / {weather.max}° · {copy('Rüzgâr', 'Wind', 'Era')} {weather.windSpeed} km/h</span>
      <span>{copy('Güncellendi', 'Updated', 'Përditësuar')}: <time dateTime={new Date(reading.fetchedAt).toISOString()}>{formatAppDate(new Date(reading.fetchedAt), locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></span>
    </div></div>}
    {stale && weather && <p role="status">{copy('Kayıtlı hava durumu güncel olmayabilir.', 'The saved weather may be out of date.', 'Moti i ruajtur mund të jetë i vjetruar.')}</p>}
    {error && <p role="status">{copy('Hava durumu güncellenemedi. Tekrar deneyebilirsin.', 'Weather could not be updated. Try again.', 'Moti nuk u përditësua. Provo sërish.')}</p>}
    <button type="button" className="secondary-wide" disabled={loading} onClick={() => refresh.current()}>{loading ? <span className="button-loader dark"/> : <Icon name={weather ? 'refresh' : 'cloud'} size={18}/>} {loading ? copy('Hava durumu güncelleniyor', 'Updating weather', 'Po përditësohet moti') : weather ? copy('Hava durumunu yenile', 'Refresh weather', 'Rifresko motin') : copy('Güncel havayı göster', 'Show current weather', 'Shfaq motin aktual')}</button>
  </section>;
}
