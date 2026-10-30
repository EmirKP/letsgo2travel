import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { locateDeviceArea } from '../lib/deviceArea';
import { CURRENCIES } from '../../../lib/travel-assistant/money';
import { countryPracticalInfo } from '../../../lib/travel-assistant/country-practical';
import { COUNTRY_LIST } from '../data/countries';
import { alpha2FromAlpha3 } from '../data/countryIso';
import { useI18n } from '../lib/i18n';
import { CountryPicker } from './CountryPicker';
import { CountryQuickFacts } from './CountryQuickFacts';
import { readTravelCountry, selectTravelCountry } from '../lib/travelSelection';
import { normalizeSearchText } from '../lib/searchText';
import { TravelSafety } from './TravelSafety';
import advisoryDestinations from '../../../lib/country-intelligence/advisory-destinations.json';
import { openExternal } from '../lib/native';
import './travel-tools-reliability.css';
import { Icon } from './Icon';
import { TravelToolArtwork } from './TravelToolArtwork';
import type { ReactNode } from 'react';
import type { Coordinates, PointCategory } from '../../../lib/travel-assistant/types';
import { appTools, travelMapSectionForTool, type TravelAssistantTool } from '../lib/appTools';
import type { ViewId } from '../types';
import './travel-assistant.css';
import './travel-tool-artwork.css';
import './feature-entry-artwork.css';
const TravelMap = lazy(() => import('./TravelMap').then(m => ({default:m.TravelMap})));
const TravelMoney = lazy(() => import('./TravelMoney').then(m => ({default:m.TravelMoney})));
const TravelTranslation = lazy(() => import('./TravelTranslation').then(m => ({default:m.TravelTranslation})));
const TravelPhotoGuide = lazy(() => import('./TravelPhotoGuide').then(m => ({default:m.TravelPhotoGuide})));
type Tool = TravelAssistantTool;
const labels: Record<Tool,[string,string,string]> = {map:['Harita','Map','Harta'],nearby:['Yakınımda','Nearby','Pranë meje'],safety:['Acil Mod','Emergency','Urgjenca'],needs:['İhtiyaç haritası','Essentials map','Harta e nevojave'],explore:['Gezi haritası','Sightseeing map','Harta e vizitave'],saved:['Kayıtlı yerler','Saved places','Vendet e ruajtura'],embassies:['Konsolosluk','Consulate','Konsullata'],money:['Para Merkezi','Money','Qendra e parave'],guide:['Ülke Rehberi','Country Guide','Udhëzues shteti'],translate:['Çeviri','Translate','Përkthimi'],transit:['Ulaşım','Transport','Transporti'],photo:['Fotoğraftan rehber','Photo guide','Udhëzues nga fotoja'],offline:['Çevrimdışı harita','Offline map','Harta pa internet']};
const descriptions: Record<Tool,[string,string,string]> = {
  map:['Yakınındaki yerler, kayıtların ve çevrimdışı bölgeler','Nearby places, saved pins and offline areas','Vendet pranë, ruajtjet dhe zonat pa internet'],
  nearby:['Konumuna, saate ve havaya uygun öneriler','Ideas for your location, time and weather','Ide sipas vendndodhjes, orës dhe motit'],
  safety:['Acil numaralar ve yardım','Emergency numbers and help','Numrat e urgjencës dhe ndihma'],
  needs:['Hastane, eczane, ATM ve diğer ihtiyaçlar','Hospitals, pharmacies, ATMs and essentials','Spitale, farmaci, bankomate dhe nevoja të tjera'],
  explore:['Gezilecek yerleri haritada bul','Find places to visit on the map','Gjej në hartë vende për t’u vizituar'],
  saved:['Kaydettiğin yerler, notlar ve gezi sıran','Your saved places, notes and day list','Vendet, shënimet dhe rendi i vizitave që ke ruajtur'],
  embassies:['Konsolosluk ve büyükelçilik bilgileri','Consulate and embassy information','Informacion për konsullatat dhe ambasadat'],
  money:['Döviz çevir, masrafını hesapla','Convert currencies and work out costs','Konverto monedhat dhe llogarit shpenzimet'],
  guide:['Para, priz, acil numaralar ve yerel bilgiler','Currency, plugs, emergency numbers and local advice','Monedha, prizat, numrat e urgjencës dhe këshilla vendase'],
  translate:['Metin çevir ve kayıtlı çevirilerini aç','Translate text and open saved translations','Përkthe tekst dhe hap përkthimet e ruajtura'],
  transit:['Toplu taşıma için güzergâh bul','Find a public transport journey','Gjej një itinerar me transport publik'],
  photo:['Bir fotoğraf hakkında bilgi al','Learn about a photo','Merr informacion për një foto'],
  offline:['Gitmeden harita indir, internetsiz aç','Download an area to use without internet','Shkarko një zonë dhe hape pa internet'],
};
const quickTools: Tool[] = ['map','photo','translate','money'];
const directoryTools: Tool[] = [...quickTools,'safety','guide'];
const keywords: Record<Tool,string> = {
  map:appTools('tr').find(item=>item.tool==='map')?.keywords || 'harita map',
  nearby:'yakınımda yakinimda nearby around me weather hava şimdi simdi',
  safety:'polis ambulans itfaiye police ambulance fire',
  needs:'eczane hastane tuvalet wifi hospital pharmacy toilet cash',
  explore:'muze müze tarihi gezilecek museum sightseeing',
  saved:'favori favoriler not liste durak favourite favorite list notes',
  embassies:'buyukelcilik büyükelçilik pasaport embassy consulate passport',
  money:'kur dolar euro lira bahşiş bahsis döviz doviz currency exchange rate tip',
  guide:'ülke rehberi ulke bilgileri gitmeden önce bil para priz elektrik acil trafik internet sim saat farkı musluk suyu tax free kanun kültür kultur country guide before you go currency plug electricity emergency driving time difference tap water laws culture udhëzues shteti',
  translate:'çeviri ceviri tercüme tercume dil language translation',
  transit:'metro tren otobüs otobus toplu taşıma tasima bus subway rail',
  photo:'kamera fotoğraf fotograf camera picture',
  offline:'internetsiz çevrimdışı cevrimdisi indir download offline',
};
export function TravelAssistant({initialCountry='',initialTool,toolRequestId=0,onToolChange,onPhrases,onLocalTips,onNotice,accessToken,onSignIn,ownerId,onNavigate,nearbyIdeas,nearbySearch,onNearbySearchHandled}:{initialCountry?:string;initialTool?:TravelAssistantTool;toolRequestId?:number;onToolChange?:(tool:TravelAssistantTool|null)=>void;onPhrases:(country:string)=>void;onLocalTips?:(country:string)=>void;onNotice:(message:string)=>void;accessToken:string;onSignIn:()=>void;ownerId?:string|null;onNavigate?:(view:ViewId)=>void;nearbyIdeas?:ReactNode;nearbySearch?:{id:number;query:string;center:Coordinates;category?:PointCategory};onNearbySearchHandled?:(id:number)=>void}) {
  const { copy,locale,countryName } = useI18n();
  const [country,setCountry] = useState(() => initialCountry || readTravelCountry());
  const [tool,setTool] = useState<Tool|null>(initialTool === 'transit' ? null : initialTool || null);
  useEffect(()=>{setTool(initialTool === 'transit' ? null : initialTool || null);},[initialTool,toolRequestId]);
  useEffect(()=>{onToolChange?.(tool);},[tool,onToolChange]);
  const [moneyInitialCurrency,setMoneyInitialCurrency] = useState<string|null>(null);
  const [query,setQuery] = useState('');
  const [locating,setLocating] = useState(false);
  const [locationState,setLocationState] = useState<'idle'|'found'|'failed'>('idle');
  const [locationRetry,setLocationRetry] = useState(0);
  // The shared session value is also an explicit choice. Opening the guide
  // again must not replace it with the device's country.
  const manualCountry = useRef(Boolean(country));
  useEffect(() => {
    if (!initialCountry) return;
    manualCountry.current = true;
    setCountry(initialCountry);
  }, [initialCountry]);
  useEffect(() => {
    if (!tool || !['safety','guide'].includes(tool) || manualCountry.current) return;
    let active = true;
    setLocating(true);
    void locateDeviceArea().then(area => {
      if (!active || manualCountry.current) return;
      if (!area.country) { setLocationState('failed'); return; }
      setCountry(area.country); setLocationState('found');
    }).catch(() => { if (active && !manualCountry.current) setLocationState('failed'); })
      .finally(() => { if (active) setLocating(false); });
    return () => { active = false; };
  }, [tool,locationRetry]);
  const heading = useRef<HTMLHeadingElement>(null);
  const toolHeader = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!toolRequestId||!initialTool||tool!==initialTool)return;
    const frame=window.requestAnimationFrame(()=>{
      heading.current?.focus({preventScroll:true});
      toolHeader.current?.scrollIntoView({block:'start',behavior:'auto'});
    });
    return()=>window.cancelAnimationFrame?.(frame);
  },[tool,initialTool,toolRequestId]);
  const options = COUNTRY_LIST.map(c => ({code:alpha2FromAlpha3(c.alpha3),name:countryName(c.alpha3,c.name)})).filter(c => c.code);
  const practicalCurrency = country ? countryPracticalInfo(country).currency : null;
  const destinationCurrency = (practicalCurrency?.codes || (practicalCurrency ? [practicalCurrency.code] : [])).find(code => CURRENCIES.includes(code));
  const destinationLabel = options.find(option => option.code === country)?.name || country;
  const labelFor = (t: Tool) => copy(...labels[travelMapSectionForTool(t) ? 'map' : t]);
  const descriptionFor = (t: Tool) => copy(...descriptions[t]);
  const officialGuide = (advisoryDestinations as Record<string, {fcdo?: string}>)[country]?.fcdo;
  const [guideNotice, setGuideNotice] = useState('');
  const search = normalizeSearchText(query);
  const searchResults = directoryTools.filter(t => normalizeSearchText([...labels[t],...descriptions[t],labelFor(t),descriptionFor(t),keywords[t]].join(' ')).includes(search));
  const appResults = search && onNavigate ? appTools(locale)
    .filter(item => item.view !== 'companion' && !item.tool && normalizeSearchText([...item.title, ...item.caption, item.keywords].join(' ')).includes(search))
    .sort((a, b) => Number(!normalizeSearchText(`${a.label} ${a.text}`).includes(search)) - Number(!normalizeSearchText(`${b.label} ${b.text}`).includes(search))) : [];
  const chooseTool = (next: Tool|null, initialMoneyCurrency: string|null = null) => {
    setMoneyInitialCurrency(next === 'money' ? initialMoneyCurrency : null);
    setTool(next === 'transit' ? null : next);
    window.requestAnimationFrame(() => {
      (toolHeader.current || heading.current)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      heading.current?.focus({ preventScroll: true });
    });
  };
  const chooseCountry = (code: string) => {
    manualCountry.current=true;setLocating(false);setLocationState('idle');setCountry(code);setGuideNotice('');selectTravelCountry(code);
  };
  const toolButton = (t: Tool) => <button type="button" data-guide="travel-tool" data-guide-tool={t} key={t} onClick={() => chooseTool(t)} className="ta-tool-card">
    <span className="ta-tool-icon"><TravelToolArtwork kind={t==='map'||t==='nearby' ? 'explore' : t}/></span><span><strong>{labelFor(t)}</strong><small>{descriptionFor(t)}</small></span><Icon name="chevron" size={16}/>
  </button>;
  return <div className="travel-assistant">
    {tool ? <div ref={toolHeader} className={`ta-tool-header ${tool === 'guide' ? 'ta-guide-tool-header' : ''}`}>
      <button type="button" onClick={() => chooseTool(null)}><Icon name="back" size={18}/>{copy('Tüm araçlar','All tools')}</button>
      <h2 ref={heading} tabIndex={-1}>{labelFor(tool)}</h2>
    </div> : <>
      <h2 className="ta-directory-title" ref={heading} tabIndex={-1}>{copy('Neye ihtiyacın var?','What do you need?')}</h2>
      <p className="ta-intro">{copy('Bir araç seç; yalnız gereken bilgileri soralım.','Choose a tool. We’ll ask only for what it needs.')}</p>
      <div data-guide="travel-country" data-guide-complete={country ? 'true' : undefined}><CountryPicker value={country} options={options} onChange={chooseCountry} label={copy('Yolculuk ülken (isteğe bağlı)','Travel country (optional)','Shteti i udhëtimit (opsional)')} placeholder={copy('Ülke seç','Choose a country','Zgjidh shtetin')}/></div>
      <button type="button" className="ta-emergency-shortcut" onClick={() => chooseTool('safety')}><TravelToolArtwork kind="safety" size={56}/><span><strong>{copy('Acil yardım','Emergency help')}</strong><small>{copy('Acil numaralar ve yakınındaki yardım','Emergency numbers and nearby help')}</small></span><Icon name="chevron" size={16}/></button>
      <label className="ta-tool-search"><Icon name="search" size={19}/><span className="sr-only">{copy('Araç ara','Search tools')}</span><input data-guide="tool-search" ref={searchInput} type="search" aria-label={copy('Araç ara','Search tools')} value={query} onChange={e => setQuery(e.target.value)} placeholder={copy('Örn. eczane, çeviri, harita','e.g. pharmacy, translation, map')}/>{query && <button type="button" aria-label={copy('Aramayı temizle','Clear search')} onClick={() => {setQuery('');searchInput.current?.focus();}}><Icon name="close" size={18}/></button>}</label>
      <nav aria-label={copy('Seyahat Asistanı araçları','Travel assistant tools')}>
        {search ? <><p className="ta-muted" role="status">{searchResults.length + appResults.length} {copy('araç bulundu','tools found')}</p><div className="ta-tool-grid">{appResults.map(item => <button type="button" className="ta-tool-card" key={`view:${item.view}`} data-app-view={item.view} onClick={() => onNavigate?.(item.view)}><span className="ta-tool-icon"><TravelToolArtwork kind={item.icon}/></span><span><strong>{item.label}</strong><small>{item.text}</small></span><Icon name="chevron" size={16}/></button>)}{searchResults.map(toolButton)}</div>{!searchResults.length && !appResults.length && <p className="ta-empty">{copy('Başka bir kelime dene veya aramayı temizleyerek tüm araçları gör.','Try another word or clear the search to see all tools.')}</p>}</> : <>
          <div className="ta-tool-grid">{quickTools.map(toolButton)}</div>
        </>}
      </nav>
    </>}
    {(tool === 'safety' || tool === 'guide') && <div className={`ta-country-context ${tool === 'guide' ? 'ta-guide-country-context' : ''}`}>
      <p className="ta-muted" role="status">{locating ? copy('Konumun belirleniyor… İstersen ülkeyi kendin seçebilirsin.','Finding your location… You can also choose the country.','Po gjendet vendndodhja… Mund ta zgjedhësh vetë shtetin.') : locationState === 'found' ? copy('Ülke yaklaşık konumundan seçildi. Gerekirse değiştirebilirsin.','Country selected from your approximate location. Change it if needed.','Shteti u zgjodh nga vendndodhja e përafërt. Mund ta ndryshosh.') : locationState === 'failed' ? copy('Konum alınamadı. Ülkeni seçerek devam et.','Location unavailable. Choose your country to continue.','Vendndodhja nuk u gjet. Zgjidh shtetin për të vazhduar.') : ''}</p>
      <div data-guide="travel-country" data-guide-complete={country ? 'true' : undefined}><CountryPicker value={country} options={options} onChange={chooseCountry} label={copy('Ülke','Country','Shteti')} placeholder={copy('Ülke seç','Choose a country')}/></div>
      {!locating && <button type="button" className={tool === 'guide' ? 'ta-guide-locate' : 'secondary-wide'} title={copy('Konumumu kullan','Use my location','Përdor vendndodhjen time')} onClick={() => {manualCountry.current=false;setLocationRetry(value=>value+1);}}><Icon name="map" size={19}/><span className={tool === 'guide' ? 'sr-only' : undefined}>{copy('Konumumu kullan','Use my location','Përdor vendndodhjen time')}</span></button>}
    </div>}
    {tool && country && !travelMapSectionForTool(tool) && !['safety','embassies','guide'].includes(tool) && <p className="ta-muted">{copy('Yolculuk ülkesi', 'Travel country', 'Shteti i udhëtimit')}: {destinationLabel}</p>}
    <Suspense fallback={<p role="status">{copy('Araç açılıyor…','Opening tool…')}</p>}>
      {tool==='safety' && country && <TravelSafety country={country} onNotice={onNotice} onOpen={t => t==='phrases' ? onPhrases(country) : chooseTool(t)}/>}
      {travelMapSectionForTool(tool) && <TravelMap key={ownerId || 'guest'} ownerId={ownerId} destinationCountry={country} initialSection={travelMapSectionForTool(tool)!} nearbyIdeas={nearbyIdeas} nearbySearch={nearbySearch} onNearbySearchHandled={onNearbySearchHandled}/>}
      {tool==='money' && <TravelMoney key={country} initialBaseCurrency={moneyInitialCurrency || destinationCurrency} destinationCountry={country}/>}
      {tool==='translate' && <TravelTranslation onPhrases={()=>onPhrases(country)}/>}
      {tool==='photo' && <TravelPhotoGuide key={accessToken ? 'signed-in' : 'guest'} accessToken={accessToken} onSignIn={onSignIn}/>}
      {tool==='guide' && country && <><CountryQuickFacts key={country} country={country} includeLocalAdvice={false} countryLabel={options.find(option => option.code === country)?.name} onOpenMoney={currency => {
        if (CURRENCIES.includes(currency)) chooseTool('money', currency);
      }} onOpenSafety={() => chooseTool('safety')}/><section className="ta-panel"><h3>{copy('İlgili bağlantılar','Related links','Lidhje të dobishme')}</h3><div className="ta-guide-quicklinks">
        {officialGuide && <button type="button" onClick={() => void openExternal(`https://www.gov.uk/foreign-travel-advice/${officialGuide}`).then(ok => {if (!ok) setGuideNotice(copy('Resmî sayfa açılamadı. İnternet bağlantını kontrol et.', 'The official page could not open. Check your connection.', 'Faqja zyrtare nuk u hap. Kontrollo lidhjen.'));})}><TravelToolArtwork kind="guide" size={56}/>{copy('Bu ülke için resmî seyahat rehberi', 'Official travel advice for this country', 'Këshilla zyrtare udhëtimi për këtë shtet')}<Icon name="external" size={16}/></button>}
        <button type="button" onClick={() => chooseTool('safety')}><TravelToolArtwork kind="safety" size={56}/>{copy('Acil numaralar ve yardım', 'Emergency numbers and help', 'Numrat e urgjencës dhe ndihma')}</button>
        <button type="button" onClick={() => onPhrases(country)}><TravelToolArtwork kind="translate" size={56}/>{copy('Hazır ifadeleri aç', 'Open useful phrases', 'Hap shprehjet e dobishme')}</button>
        {onLocalTips && <button type="button" onClick={() => onLocalTips(country)}><TravelToolArtwork kind="guide" size={56}/>{copy('Yerel ipuçları ve kurallar', 'Local tips and rules', 'Këshilla dhe rregulla vendase')}</button>}
      </div>{guideNotice && <p className="ta-warning" role="alert">{guideNotice}</p>}
      </section></>}
    </Suspense>
  </div>;
}
