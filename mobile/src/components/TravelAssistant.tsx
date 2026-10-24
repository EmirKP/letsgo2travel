import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { locateDeviceArea } from '../lib/deviceArea';
import { GUIDE_CARDS } from '../../../lib/travel-assistant/guides';
import { CURRENCIES } from '../../../lib/travel-assistant/money';
import { countryPracticalInfo } from '../../../lib/travel-assistant/country-practical';
import { COUNTRY_LIST } from '../data/countries';
import { alpha2FromAlpha3 } from '../data/countryIso';
import { useI18n } from '../lib/i18n';
import { CountryPicker } from './CountryPicker';
import { CountryQuickFacts } from './CountryQuickFacts';
import { readTravelCountry, selectTravelCountry } from '../lib/travelSelection';
import { normalizeSearchText } from '../lib/searchText';
import { EmbassyCards, EvidenceLine, TravelSafety } from './TravelSafety';
import { evidenceStatus } from '../../../lib/travel-assistant/evidence';
import { useCurrentTime } from '../hooks/useCurrentTime';
import advisoryDestinations from '../../../lib/country-intelligence/advisory-destinations.json';
import { openExternal } from '../lib/native';
import './travel-tools-reliability.css';
import { Icon } from './Icon';
import { TravelToolArtwork } from './TravelToolArtwork';
import type { IconName } from './Icon';
import type { TravelAssistantTool } from '../lib/appTools';
import './travel-assistant.css';
import './travel-tool-artwork.css';
import './feature-entry-artwork.css';
const TravelNearby = lazy(() => import('./TravelNearby').then(m => ({default:m.TravelNearby})));
const TravelMoney = lazy(() => import('./TravelMoney').then(m => ({default:m.TravelMoney})));
const TravelTranslation = lazy(() => import('./TravelTranslation').then(m => ({default:m.TravelTranslation})));
const TravelTransit = lazy(() => import('./TravelTransit').then(m => ({default:m.TravelTransit})));
const TravelPhotoGuide = lazy(() => import('./TravelPhotoGuide').then(m => ({default:m.TravelPhotoGuide})));
const TravelOfflineMap = lazy(() => import('./TravelOfflineMap').then(m => ({default:m.TravelOfflineMap})));
const TravelSavedPlaces = lazy(() => import('./TravelSavedPlaces').then(m => ({default:m.TravelSavedPlaces})));
type Tool = TravelAssistantTool;
const labels: Record<Tool,[string,string,string]> = {safety:['Acil Mod','Emergency','Urgjenca'],needs:['İhtiyaç haritası','Essentials map','Harta e nevojave'],explore:['Gezi haritası','Sightseeing map','Harta e vizitave'],saved:['Kayıtlı yerler','Saved places','Vendet e ruajtura'],embassies:['Konsolosluk','Consulate','Konsullata'],money:['Para Merkezi','Money','Qendra e parave'],guide:['Ülke Rehberi','Country Guide','Udhëzues shteti'],translate:['Çeviri','Translate','Përkthimi'],transit:['Ulaşım','Transport','Transporti'],photo:['Fotoğraftan rehber','Photo guide','Udhëzues nga fotoja'],offline:['Çevrimdışı harita','Offline map','Harta pa internet']};
const descriptions: Record<Tool,[string,string,string]> = {
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
const quickTools: Tool[] = ['explore','translate','money','saved'];
const otherTools: Tool[] = ['needs','transit','offline','guide','embassies','photo'];
const keywords: Record<Tool,string> = {
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
export function TravelAssistant({initialCountry='',initialTool,onPhrases,onLocalTips,onNotice,accessToken,onSignIn,ownerId}:{initialCountry?:string;initialTool?:TravelAssistantTool;onPhrases:(country:string)=>void;onLocalTips?:(country:string)=>void;onNotice:(message:string)=>void;accessToken:string;onSignIn:()=>void;ownerId?:string|null}) {
  const { copy,locale,countryName } = useI18n();
  const [country,setCountry] = useState(() => initialCountry || readTravelCountry()); const [citizenship,setCitizenship] = useState('');
  const [tool,setTool] = useState<Tool|null>(initialTool || null);
  const [moneyInitialCurrency,setMoneyInitialCurrency] = useState<string|null>(null);
  const [query,setQuery] = useState('');
  const [showAll,setShowAll] = useState(false);
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
    if (!tool || !['safety','embassies','guide'].includes(tool) || manualCountry.current) return;
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
  const guideDetailsHeading = useRef<HTMLHeadingElement>(null);
  const toolHeader = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const now = useCurrentTime();
  const options = COUNTRY_LIST.map(c => ({code:alpha2FromAlpha3(c.alpha3),name:countryName(c.alpha3,c.name)})).filter(c => c.code);
  // Local laws and cultural advice have one home in the Local tips section.
  const cards = GUIDE_CARDS.filter(c => c.country === country && c.category !== 'law' && c.category !== 'culture');
  const practicalCurrency = country ? countryPracticalInfo(country).currency : null;
  const destinationCurrency = (practicalCurrency?.codes || (practicalCurrency ? [practicalCurrency.code] : [])).find(code => CURRENCIES.includes(code));
  const destinationLabel = options.find(option => option.code === country)?.name || country;
  const labelFor = (t: Tool) => copy(...labels[t]);
  const descriptionFor = (t: Tool) => copy(...descriptions[t]);
  const officialGuide = (advisoryDestinations as Record<string, {fcdo?: string}>)[country]?.fcdo;
  const [guideNotice, setGuideNotice] = useState('');
  const search = normalizeSearchText(query);
  const searchResults = (Object.keys(labels) as Tool[]).filter(t => normalizeSearchText([...labels[t],...descriptions[t],labelFor(t),descriptionFor(t),keywords[t]].join(' ')).includes(search));
  const chooseTool = (next: Tool|null, initialMoneyCurrency: string|null = null) => {
    setMoneyInitialCurrency(next === 'money' ? initialMoneyCurrency : null);
    setTool(next);
    window.requestAnimationFrame(() => {
      (toolHeader.current || heading.current)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      heading.current?.focus({ preventScroll: true });
    });
  };
  const chooseCountry = (code: string) => {
    manualCountry.current=true;setLocating(false);setLocationState('idle');setCountry(code);setGuideNotice('');selectTravelCountry(code);
  };
  const toolButton = (t: Tool) => <button type="button" data-guide="travel-tool" data-guide-tool={t} key={t} onClick={() => chooseTool(t)} className="ta-tool-card">
    <span className="ta-tool-icon"><TravelToolArtwork kind={t}/></span><span><strong>{labelFor(t)}</strong><small>{descriptionFor(t)}</small></span><Icon name="chevron" size={16}/>
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
        {search ? <><p className="ta-muted" role="status">{searchResults.length} {copy('araç bulundu','tools found')}</p><div className="ta-tool-grid">{searchResults.map(toolButton)}</div>{!searchResults.length && <p className="ta-empty">{copy('Başka bir kelime dene veya aramayı temizleyerek tüm araçları gör.','Try another word or clear the search to see all tools.')}</p>}</> : <>
          <div className="ta-tool-grid">{quickTools.map(toolButton)}</div>
          <button type="button" className="ta-more-tools" aria-expanded={showAll} aria-controls="ta-other-tools" onClick={() => setShowAll(value => !value)}><Icon name={showAll ? 'back' : 'plus'} size={18}/>{showAll ? copy('Diğer araçları gizle','Hide more tools') : copy('Diğer araçlar','More tools')}<small>{copy('Ulaşım, ihtiyaçlar, çevrimdışı harita…','Transport, essentials, offline map…')}</small></button>
          <div id="ta-other-tools" hidden={!showAll} className="ta-tool-grid">{otherTools.map(toolButton)}</div>
        </>}
      </nav>
    </>}
    {(tool === 'safety' || tool === 'embassies' || tool === 'guide') && <div className={`ta-country-context ${tool === 'guide' ? 'ta-guide-country-context' : ''}`}>
      <p className="ta-muted" role="status">{locating ? copy('Konumun belirleniyor… İstersen ülkeyi kendin seçebilirsin.','Finding your location… You can also choose the country.','Po gjendet vendndodhja… Mund ta zgjedhësh vetë shtetin.') : locationState === 'found' ? copy('Ülke yaklaşık konumundan seçildi. Gerekirse değiştirebilirsin.','Country selected from your approximate location. Change it if needed.','Shteti u zgjodh nga vendndodhja e përafërt. Mund ta ndryshosh.') : locationState === 'failed' ? copy('Konum alınamadı. Ülkeni seçerek devam et.','Location unavailable. Choose your country to continue.','Vendndodhja nuk u gjet. Zgjidh shtetin për të vazhduar.') : ''}</p>
      <div data-guide="travel-country" data-guide-complete={country ? 'true' : undefined}><CountryPicker value={country} options={options} onChange={chooseCountry} label={copy('Ülke','Country','Shteti')} placeholder={copy('Ülke seç','Choose a country')}/></div>
      {!locating && <button type="button" className={tool === 'guide' ? 'ta-guide-locate' : 'secondary-wide'} title={copy('Konumumu kullan','Use my location','Përdor vendndodhjen time')} onClick={() => {manualCountry.current=false;setLocationRetry(value=>value+1);}}><Icon name="map" size={19}/><span className={tool === 'guide' ? 'sr-only' : undefined}>{copy('Konumumu kullan','Use my location','Përdor vendndodhjen time')}</span></button>}
    </div>}
    {tool && country && !['safety','embassies','guide'].includes(tool) && <p className="ta-muted">{copy('Yolculuk ülkesi', 'Travel country', 'Shteti i udhëtimit')}: {destinationLabel}</p>}
    <Suspense fallback={<p role="status">{copy('Araç açılıyor…','Opening tool…')}</p>}>
      {tool==='safety' && country && <TravelSafety country={country} onNotice={onNotice} onOpen={t => t==='phrases' ? onPhrases(country) : chooseTool(t)}/>}
      {(tool==='needs'||tool==='explore') && <TravelNearby key={`${ownerId || 'guest'}:${tool}:${country}`} ownerId={ownerId} mode={tool} citizenship={citizenship} destinationCountry={country} onEmbassies={() => chooseTool('embassies')}/>}
      {tool==='money' && <TravelMoney key={country} initialBaseCurrency={moneyInitialCurrency || destinationCurrency} destinationCountry={country}/>}
      {tool==='translate' && <TravelTranslation onPhrases={()=>onPhrases(country)}/>}
      {tool==='transit' && <TravelTransit key={country} destinationCountry={country} destinationLabel={destinationLabel}/>}
      {tool==='photo' && <TravelPhotoGuide key={accessToken ? 'signed-in' : 'guest'} accessToken={accessToken} onSignIn={onSignIn}/>}
      {tool==='offline' && <TravelOfflineMap key={country} destinationCountry={country}/>}
      {tool==='saved' && <TravelSavedPlaces key={ownerId || 'guest'} ownerId={ownerId} onExplore={() => chooseTool('explore')}/>}
      {tool==='embassies' && country && <><CountryPicker value={citizenship} options={options} onChange={setCitizenship} label={copy('Vatandaşlığın','Your citizenship')} placeholder={copy('Vatandaşlık seç','Choose citizenship')}/><EmbassyCards country={country} citizenship={citizenship}/></>}
      {tool==='guide' && country && <><CountryQuickFacts key={country} country={country} includeLocalAdvice={false} countryLabel={options.find(option => option.code === country)?.name} onOpenMoney={currency => {
        if (CURRENCIES.includes(currency)) chooseTool('money', currency);
      }} onOpenSafety={() => chooseTool('safety')} onOpenAll={() => {
        guideDetailsHeading.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
        guideDetailsHeading.current?.focus({ preventScroll: true });
      }}/><section className="ta-panel"><h3 className="ta-guide-details-heading" ref={guideDetailsHeading} tabIndex={-1}>{copy('Ülke rehberi ayrıntıları','Country guide details','Hollësi të udhëzuesit të shtetit')}</h3><div className="ta-guide-quicklinks">
        {officialGuide && <button type="button" onClick={() => void openExternal(`https://www.gov.uk/foreign-travel-advice/${officialGuide}`).then(ok => {if (!ok) setGuideNotice(copy('Resmî sayfa açılamadı. İnternet bağlantını kontrol et.', 'The official page could not open. Check your connection.', 'Faqja zyrtare nuk u hap. Kontrollo lidhjen.'));})}><TravelToolArtwork kind="guide" size={56}/>{copy('Bu ülke için resmî seyahat rehberi', 'Official travel advice for this country', 'Këshilla zyrtare udhëtimi për këtë shtet')}<Icon name="external" size={16}/></button>}
        <button type="button" onClick={() => chooseTool('safety')}><TravelToolArtwork kind="safety" size={56}/>{copy('Acil numaralar ve yardım', 'Emergency numbers and help', 'Numrat e urgjencës dhe ndihma')}</button>
        <button type="button" onClick={() => onPhrases(country)}><TravelToolArtwork kind="translate" size={56}/>{copy('Hazır ifadeleri aç', 'Open useful phrases', 'Hap shprehjet e dobishme')}</button>
        {onLocalTips && <button type="button" onClick={() => onLocalTips(country)}><TravelToolArtwork kind="guide" size={56}/>{copy('Yerel ipuçları ve kurallar', 'Local tips and rules', 'Këshilla dhe rregulla vendase')}</button>}
      </div>{guideNotice && <p className="ta-warning" role="alert">{guideNotice}</p>}{locale === 'sq' && cards.some(card => !card.title.sq || !card.text.sq) && <p className="ta-muted" lang="sq">Disa karta ende shfaqen në anglisht. Lidhja zyrtare hap udhëzimin e plotë dhe aktual.</p>}{cards.length > 0 && <p className="ta-muted">{copy('Genel saatler, belirli bir işletmenin açık olduğu anlamına gelmez.','General hours do not mean a particular business is open.','Oraret e përgjithshme nuk nënkuptojnë që një biznes i caktuar është i hapur.')}</p>}
        {(['water','tax-free','hours'] as const).filter(category => cards.some(c => c.category === category)).map(category => <section key={category} className="ta-guide-section"><h3>{{water:copy('Musluk suyu','Tap water'),'tax-free':'Tax Free',hours:copy('Genel çalışma saatleri','Typical hours')}[category]}</h3>
          {cards.filter(c=>c.category===category).map(c => {
            const guideLanguage = locale === 'tr' ? 'tr' : locale === 'sq' && c.title.sq && c.text.sq ? 'sq' : 'en';
            const status = evidenceStatus(c, new Date(now));
            const usable = status !== 'expired' && status !== 'unverified';
            const statusIcon: IconName | null = !usable ? null : c.status === 'drinkable' ? 'check' : c.status === 'regional' ? 'alert' : c.status === 'avoid' ? 'close' : null;
            return <article className="ta-card" lang={guideLanguage} key={`${c.category}:${c.title.en}`}><h4 className="ta-inline-status">{statusIcon && <Icon name={statusIcon} size={18}/>}<span>{c.title[guideLanguage]}</span></h4><EvidenceLine item={c}/>{usable && <p>{c.text[guideLanguage]}</p>}{c.validUntil && <p>{copy('Kapsadığı son tarih:','Applies through:')} {c.validUntil}</p>}</article>;
          })}
        </section>)}
      </section></>}
    </Suspense>
  </div>;
}
