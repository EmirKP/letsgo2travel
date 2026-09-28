import { lazy, Suspense, useRef, useState } from 'react';
import { GUIDE_CARDS } from '../../../lib/travel-assistant/guides';
import { COUNTRY_LIST } from '../data/countries';
import { alpha2FromAlpha3 } from '../data/countryIso';
import { usePassportPreference } from '../hooks/usePassportPreference';
import { useI18n } from '../lib/i18n';
import { CountryPicker } from './CountryPicker';
import { readTravelCountry, selectTravelCountry } from '../lib/travelSelection';
import { normalizeSearchText } from '../lib/searchText';
import { EmbassyCards, EvidenceLine, TravelSafety } from './TravelSafety';
import { evidenceStatus } from '../../../lib/travel-assistant/evidence';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import './travel-assistant.css';
const TravelNearby = lazy(() => import('./TravelNearby').then(m => ({default:m.TravelNearby})));
const TravelMoney = lazy(() => import('./TravelMoney').then(m => ({default:m.TravelMoney})));
const TravelTranslation = lazy(() => import('./TravelTranslation').then(m => ({default:m.TravelTranslation})));
const TravelTransit = lazy(() => import('./TravelTransit').then(m => ({default:m.TravelTransit})));
const TravelPhotoGuide = lazy(() => import('./TravelPhotoGuide').then(m => ({default:m.TravelPhotoGuide})));
const TravelOfflineMap = lazy(() => import('./TravelOfflineMap').then(m => ({default:m.TravelOfflineMap})));
const TravelSavedPlaces = lazy(() => import('./TravelSavedPlaces').then(m => ({default:m.TravelSavedPlaces})));
type Tool = 'safety'|'needs'|'explore'|'embassies'|'money'|'guide'|'translate'|'transit'|'photo'|'offline'|'saved';
const labels: Record<Tool,[string,string]> = {safety:['Acil Mod','Emergency'],needs:['İhtiyaç haritası','Essentials map'],explore:['Gezi haritası','Sightseeing map'],saved:['Kayıtlı yerler','Saved places'],embassies:['Konsolosluk','Consulate'],money:['Para Merkezi','Money'],guide:['Gitmeden Önce Bil','Before you go'],translate:['Çeviri','Translate'],transit:['Ulaşım','Transport'],photo:['Fotoğraftan rehber','Photo guide'],offline:['Çevrimdışı harita','Offline map']};
const icons: Record<Tool,IconName> = {safety:'shield',needs:'map',explore:'compass',saved:'bookmark',embassies:'flag',money:'wallet',guide:'info',translate:'languages',transit:'train',photo:'camera',offline:'offline'};
const descriptions: Record<Tool,[string,string]> = {
  safety:['Acil numaralar ve yardım','Emergency numbers and help'],
  needs:['Hastane, eczane, ATM ve diğer ihtiyaçlar','Hospitals, pharmacies, ATMs and essentials'],
  explore:['Gezilecek yerleri haritada bul','Find places to visit on the map'],
  saved:['Kaydettiğin yerler, notlar ve gezi sıran','Your saved places, notes and day list'],
  embassies:['Konsolosluk ve büyükelçilik bilgileri','Consulate and embassy information'],
  money:['Döviz çevir, masrafını hesapla','Convert currencies and work out costs'],
  guide:['Su, çalışma saatleri ve yerel kurallar','Water, opening hours and local rules'],
  translate:['Metin çevir ve kayıtlı çevirilerini aç','Translate text and open saved translations'],
  transit:['Toplu taşıma için güzergâh bul','Find a public transport journey'],
  photo:['Bir fotoğraf hakkında bilgi al','Learn about a photo'],
  offline:['Gitmeden harita indir, internetsiz aç','Download an area to use without internet'],
};
const quickTools: Tool[] = ['explore','translate','money','saved'];
const otherTools: Tool[] = ['needs','transit','offline','guide','embassies','photo'];
const keywords: Record<Tool,string> = {
  safety:'polis ambulans itfaiye police ambulance fire',
  needs:'eczane hastane tuvalet wifi hospital pharmacy toilet cash',
  explore:'muze müze tarihi gezilecek museum sightseeing',
  saved:'favori favoriler not liste durak favourite favorite list notes',
  embassies:'buyukelcilik büyükelçilik pasaport embassy consulate passport',
  money:'kur dolar euro lira bahşiş bahsis döviz doviz currency exchange rate tip',
  guide:'musluk suyu tax free saat kanun kültür kultur tap water laws culture',
  translate:'çeviri ceviri tercüme tercume dil language translation',
  transit:'metro tren otobüs otobus toplu taşıma tasima bus subway rail',
  photo:'kamera fotoğraf fotograf camera picture',
  offline:'internetsiz çevrimdışı cevrimdisi indir download offline',
};
export function TravelAssistant({initialCountry='',onPhrases,onNotice,accessToken,onSignIn}:{initialCountry?:string;onPhrases:(country:string)=>void;onNotice:(message:string)=>void;accessToken:string;onSignIn:()=>void}) {
  const { copy,locale,countryName } = useI18n(); const passport = usePassportPreference();
  const [country,setCountry] = useState(() => initialCountry || readTravelCountry()); const [citizenship,setCitizenship] = useState(passport.country);
  const [tool,setTool] = useState<Tool|null>(null);
  const [query,setQuery] = useState('');
  const [showAll,setShowAll] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const now = useCurrentTime();
  const options = COUNTRY_LIST.map(c => ({code:alpha2FromAlpha3(c.alpha3),name:countryName(c.alpha3,c.name)})).filter(c => c.code);
  const cards = GUIDE_CARDS.filter(c => c.country === country);
  const languageIndex = locale === 'tr' ? 0 : 1;
  const search = normalizeSearchText(query);
  const searchResults = (Object.keys(labels) as Tool[]).filter(t => normalizeSearchText([...labels[t],...descriptions[t],keywords[t]].join(' ')).includes(search));
  const chooseTool = (next: Tool|null) => {
    setTool(next);
    window.requestAnimationFrame(() => heading.current?.focus());
  };
  const toolButton = (t: Tool) => <button type="button" key={t} onClick={() => chooseTool(t)} className="ta-tool-card">
    <span className="ta-tool-icon"><Icon name={icons[t]} size={22}/></span><span><strong>{labels[t][languageIndex]}</strong><small>{descriptions[t][languageIndex]}</small></span><Icon name="chevron" size={16}/>
  </button>;
  return <div className="travel-assistant">
    {tool ? <div className="ta-tool-header">
      <button type="button" onClick={() => chooseTool(null)}><Icon name="back" size={18}/>{copy('Tüm araçlar','All tools')}</button>
      <h2 ref={heading} tabIndex={-1}>{labels[tool][languageIndex]}</h2>
    </div> : <>
      <h2 className="ta-directory-title" ref={heading} tabIndex={-1}>{copy('Neye ihtiyacın var?','What do you need?')}</h2>
      <p className="ta-intro">{copy('Bir araç seç; yalnız gereken bilgileri soralım.','Choose a tool. We’ll ask only for what it needs.')}</p>
      <button type="button" className="ta-emergency-shortcut" onClick={() => chooseTool('safety')}><Icon name="shield" size={20}/><span><strong>{copy('Acil yardım','Emergency help')}</strong><small>{copy('Acil numaralar ve yakınındaki yardım','Emergency numbers and nearby help')}</small></span><Icon name="chevron" size={16}/></button>
      <label className="ta-tool-search"><Icon name="search" size={19}/><span className="sr-only">{copy('Araç ara','Search tools')}</span><input ref={searchInput} type="search" aria-label={copy('Araç ara','Search tools')} value={query} onChange={e => setQuery(e.target.value)} placeholder={copy('Örn. eczane, çeviri, harita','e.g. pharmacy, translation, map')}/>{query && <button type="button" aria-label={copy('Aramayı temizle','Clear search')} onClick={() => {setQuery('');searchInput.current?.focus();}}><Icon name="close" size={18}/></button>}</label>
      <nav aria-label={copy('Seyahat Asistanı araçları','Travel assistant tools')}>
        {search ? <><p className="ta-muted" role="status">{searchResults.length} {copy('araç bulundu','tools found')}</p><div className="ta-tool-grid">{searchResults.map(toolButton)}</div>{!searchResults.length && <p className="ta-empty">{copy('Başka bir kelime dene veya aramayı temizleyerek tüm araçları gör.','Try another word or clear the search to see all tools.')}</p>}</> : <>
          <div className="ta-tool-grid">{quickTools.map(toolButton)}</div>
          <button type="button" className="ta-more-tools" aria-expanded={showAll} aria-controls="ta-other-tools" onClick={() => setShowAll(value => !value)}><Icon name={showAll ? 'back' : 'plus'} size={18}/>{showAll ? copy('Diğer araçları gizle','Hide more tools') : copy('Diğer araçlar','More tools')}<small>{copy('Ulaşım, ihtiyaçlar, çevrimdışı harita…','Transport, essentials, offline map…')}</small></button>
          <div id="ta-other-tools" hidden={!showAll} className="ta-tool-grid">{otherTools.map(toolButton)}</div>
        </>}
      </nav>
    </>}
    {(tool === 'safety' || tool === 'embassies' || tool === 'guide') && <div className="ta-country-context"><CountryPicker value={country} options={options} onChange={code => {setCountry(code);selectTravelCountry(code);}} label={copy('Hangi ülke için?','For which country?')} placeholder={copy('Ülke seç','Choose a country')}/>{!country && <p className="ta-muted">{copy('Doğru yerel bilgileri gösterebilmemiz için ülkeyi seç.','Choose a country to see the relevant local information.')}</p>}</div>}
    <Suspense fallback={<p role="status">{copy('Araç açılıyor…','Opening tool…')}</p>}>
      {tool==='safety' && country && <TravelSafety country={country} onNotice={onNotice} onOpen={t => t==='phrases' ? onPhrases(country) : chooseTool(t)}/>}
      {(tool==='needs'||tool==='explore') && <TravelNearby key={tool} mode={tool} citizenship={citizenship}/>}
      {tool==='money' && <TravelMoney/>}
      {tool==='translate' && <TravelTranslation onPhrases={()=>onPhrases(country)}/>}
      {tool==='transit' && <TravelTransit/>}
      {tool==='photo' && <TravelPhotoGuide key={accessToken ? 'signed-in' : 'guest'} accessToken={accessToken} onSignIn={onSignIn}/>}
      {tool==='offline' && <TravelOfflineMap/>}
      {tool==='saved' && <TravelSavedPlaces onExplore={() => chooseTool('explore')}/>}
      {tool==='embassies' && country && <><CountryPicker value={citizenship} options={options} onChange={setCitizenship} label={copy('Vatandaşlığın','Your citizenship')} placeholder={copy('Vatandaşlık seç','Choose citizenship')}/><EmbassyCards country={country} citizenship={citizenship}/></>}
      {tool==='guide' && country && <section className="ta-panel">{cards.length ? <p className="ta-muted">{copy('Bu ülke için mevcut bilgi kartları aşağıda. Her konu henüz eklenmiş olmayabilir. Genel saatler, belirli bir işletmenin açık olduğu anlamına gelmez.','Available cards for this country are shown below. Some topics may not be covered yet. General hours do not mean a particular business is open.')}</p> : <p className="ta-empty" role="status">{copy('Bu ülke için doğrulanmış rehber kartları henüz hazır değil. Aşağıdan hazır seyahat ifadelerini açabilir veya başka bir ülke seçebilirsin.','Verified guide cards for this country are not ready yet. Open useful travel phrases below or choose another country.')}</p>}
        {(['water','tax-free','hours','law','culture'] as const).filter(category => cards.some(c => c.category === category)).map(category => <section key={category} className="ta-guide-section"><h3>{{water:copy('Musluk suyu','Tap water'),'tax-free':'Tax Free',hours:copy('Genel çalışma saatleri','Typical hours'),law:copy('Yerel kanunlar','Local laws'),culture:copy('Kültürel tavsiyeler','Cultural guidance')}[category]}</h3>
          {cards.filter(c=>c.category===category).map(c => {
            const status = evidenceStatus(c, new Date(now));
            const usable = status !== 'expired' && status !== 'unverified';
            const statusIcon: IconName | null = !usable ? null : c.status === 'drinkable' ? 'check' : c.status === 'regional' ? 'alert' : c.status === 'avoid' ? 'close' : null;
            return <article className="ta-card" key={c.title.en}><h4 className="ta-inline-status">{statusIcon && <Icon name={statusIcon} size={18}/>}<span>{c.title[locale]}</span></h4><EvidenceLine item={c}/>{usable && <p>{c.text[locale]}</p>}{c.validUntil && <p>{copy('Kapsadığı son tarih:','Applies through:')} {c.validUntil}</p>}</article>;
          })}
        </section>)}
        <button className="secondary-wide" type="button" onClick={()=>onPhrases(country)}>{copy('Hazır ifadeler ve kültürel tavsiyeler','Phrases and cultural guidance')}</button>
      </section>}
    </Suspense>
  </div>;
}
