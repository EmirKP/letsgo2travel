import { lazy, Suspense, useState } from 'react';
import { GUIDE_CARDS } from '../../../lib/travel-assistant/guides';
import { COUNTRY_LIST } from '../data/countries';
import { alpha2FromAlpha3 } from '../data/countryIso';
import { usePassportPreference } from '../hooks/usePassportPreference';
import { useI18n } from '../lib/i18n';
import { CountryPicker } from './CountryPicker';
import { readTravelCountry, selectTravelCountry } from '../lib/travelSelection';
import { EmbassyCards, EvidenceLine, TravelSafety } from './TravelSafety';
import './travel-assistant.css';
const TravelNearby = lazy(() => import('./TravelNearby').then(m => ({default:m.TravelNearby})));
const TravelMoney = lazy(() => import('./TravelMoney').then(m => ({default:m.TravelMoney})));
type Tool = 'safety'|'needs'|'explore'|'embassies'|'money'|'guide';
const labels: Record<Tool,[string,string]> = {safety:['Acil Mod','Emergency'],needs:['İhtiyaç haritası','Essentials map'],explore:['Gezi haritası','Sightseeing map'],embassies:['Konsolosluk','Consulate'],money:['Para Merkezi','Money'],guide:['Gitmeden Önce Bil','Before you go']};
export function TravelAssistant({initialCountry='',onPhrases,onNotice}:{initialCountry?:string;onPhrases:(country:string)=>void;onNotice:(message:string)=>void}) {
  const { copy,locale,countryName } = useI18n(); const passport = usePassportPreference();
  const [country,setCountry] = useState(() => initialCountry || readTravelCountry()); const [citizenship,setCitizenship] = useState(passport.country);
  const [tool,setTool] = useState<Tool>('safety');
  const options = COUNTRY_LIST.map(c => ({code:alpha2FromAlpha3(c.alpha3),name:countryName(c.alpha3,c.name)})).filter(c => c.code);
  const cards = GUIDE_CARDS.filter(c => c.country === country);
  return <div className="travel-assistant">
    <p className="ta-intro">{copy('Seyahatin sırasında ihtiyacın olanlar, tek yerde.','What you need during your trip, in one place.')}</p>
    <CountryPicker value={country} options={options} onChange={code => {setCountry(code);selectTravelCountry(code);}} label={copy('Bulunduğun / gideceğin ülke','Current / destination country')} placeholder={copy('Önce ülke seç','Choose a country first')}/>
    <nav className="ta-tools" aria-label={copy('Seyahat Asistanı araçları','Travel assistant tools')}>{(Object.keys(labels) as Tool[]).map(t => <button type="button" key={t} aria-pressed={tool===t} className={tool===t?'active':''} onClick={() => setTool(t)}>{labels[t][locale==='tr'?0:1]}</button>)}</nav>
    <Suspense fallback={<p role="status">{copy('Araç açılıyor…','Opening tool…')}</p>}>
      {tool==='safety' && <TravelSafety country={country} onNotice={onNotice} onOpen={t => t==='phrases' ? onPhrases(country) : setTool(t)}/>}
      {(tool==='needs'||tool==='explore') && <TravelNearby key={tool} mode={tool} citizenship={citizenship}/>}
      {tool==='money' && <TravelMoney/>}
      {tool==='embassies' && <><CountryPicker value={citizenship} options={options} onChange={setCitizenship} label={copy('Vatandaşlığın (pasaport tercihin başlangıç olarak alındı)','Citizenship (initially from your passport preference)')} placeholder={copy('Vatandaşlık seç','Choose citizenship')}/><EmbassyCards country={country} citizenship={citizenship}/></>}
      {tool==='guide' && <section className="ta-panel"><p className="ta-muted">{copy('Bu kartlar cihazda hazırdır. Her başlık için ülke kapsamı farklıdır. Genel saatler, belirli bir işletmenin açık olduğu anlamına gelmez.','These cards are bundled on-device. Country coverage varies by topic. General hours do not mean a particular business is open.')}</p>
        {(['water','tax-free','hours','law','culture'] as const).map(category => <section key={category} className="ta-guide-section"><h3>{{water:copy('Musluk suyu','Tap water'),'tax-free':'Tax Free',hours:copy('Genel çalışma saatleri','Typical hours'),law:copy('Yerel kanunlar','Local laws'),culture:copy('Kültürel tavsiyeler','Cultural guidance')}[category]}</h3>
          {cards.filter(c=>c.category===category).length===0 && <p className="ta-empty">{copy('Bu ülke için doğrulanmış kayıt henüz yok.','No verified record for this country yet.')}</p>}
          {cards.filter(c=>c.category===category).map(c=><article className="ta-card" key={c.title.en}><h4>{c.status==='drinkable'?'✓ ':c.status==='regional'?'⚠ ':c.status==='avoid'?'✕ ':''}{c.title[locale]}</h4><p>{c.text[locale]}</p>{c.validUntil && <p role="status">{copy('Bu kayıt şu tarihe kadarki sistem için:','This record describes the system through:')} {c.validUntil}{new Date().toISOString().slice(0,10)>c.validUntil ? ` — ${copy('Güncel koşulları kaynaktan doğrula.','Verify current rules at the source.')}`:''}</p>}<EvidenceLine item={c}/></article>)}
        </section>)}
        <button className="secondary-wide" type="button" onClick={()=>onPhrases(country)}>{copy('Hazır ifadeler ve kültürel tavsiyeler','Phrases and cultural guidance')}</button>
      </section>}
    </Suspense>
  </div>;
}
