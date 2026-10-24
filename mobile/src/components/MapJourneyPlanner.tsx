import { formatAppDate } from '../lib/localeFormatting';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import { JourneyMap, type JourneyMapRoute } from './JourneyMap';
import { CATEGORY_LABELS } from '../../../lib/travel-assistant/places';
import type { Coordinates } from '../../../lib/travel-assistant/types';
import { TRAVEL_CENTRES } from '../lib/travelAreas';
import { JourneySetupSurvey, type JourneySurveyValues } from './JourneySetupSurvey';
import { generateJourneyPlan, journeyFromAiPlan, loadJourneyPlanQuota, hasPendingJourneyPlan, hasJourneyPlanRecovery, type JourneyPlanQuota } from '../lib/journeyPlanClient';
import { locateForTravel, directionsUrl } from '../lib/travelAssistant';
import { openExternal } from '../lib/native';
import { readSavedPlaces, saveTravelPlace, subscribeSavedPlaces } from '../lib/savedPlaces';
import { syncSavedRoutes } from '../lib/routeSync';
import { prepareJourneySurveySignIn, takeJourneySurveySignIn, clearJourneySignInClaim, rememberJourneyRecoveryScope, readJourneyRecoveryDraft, type JourneySurveyDraft } from '../lib/journeySurveyDraft';
import { createId } from '../lib/id';
import { readMapJourneys, saveMapJourney } from '../lib/mapJourneyStorage';
import { addJourneyStop, moveJourneyStop, reorderJourneyStop, removeJourneyStop, updateJourneyStop, optimizeJourney, journeyDayStops, journeyStopNoteLocale, scheduleJourneyDay, formatJourneyTime, validateMapJourney, decodeStoredMapJourney, type MapJourney, type JourneyPlace, type JourneyLeg, type JourneyStop, type ScheduleIssue } from '../lib/mapJourney';
import { discoverJourneyPlaces, discoveryCentersForRoute, knownJourneyArea, loadWalkingRoute, type DiscoveryGroup, type WalkingRoute, type DiscoveryResponse } from '../lib/mapJourneyClient';
import './map-journey-planner.css';
import { RouteTranslation } from './RouteTranslation';
import { JourneyPlacePhoto } from './JourneyPlacePhoto';
import { journeyPhotoKey, loadJourneyPhotos } from '../lib/journeyPhotoClient';
import type { JourneyPhoto } from '../../../lib/travel-assistant/journey-types';

type Props = { ownerId?: string | null; accessToken: string; initialCity?: string; initialJourney?: MapJourney; onNotice:(message:string)=>void; onClose?:()=>void; onOpenAccount?:()=>void; onUpdateTrip?:(journey:MapJourney)=>Promise<void> };
const groups: DiscoveryGroup[] = ['culture','food','shopping','nature','essentials'];
const groupNames = { culture:['Kültür','Culture','Kulturë'], food:['Yeme & içme','Food & drink','Ushqim & pije'], shopping:['Alışveriş','Shopping','Blerje'], nature:['Doğa','Nature','Natyrë'], essentials:['İhtiyaçlar','Essentials','Nevoja'] };
const groupIcons = {culture:'◈',food:'☕',shopping:'◇',nature:'❧',essentials:'＋'};
const dayColors = ['#175fe6','#b6419b','#008271','#b86100','#744ac2','#b73d42','#1276a1'];

// Drafts survive closing this panel in the same session and are isolated by owner.
// Durable storage and account sync use the existing saved-route system only.
const drafts = new Map<string,MapJourney>();
type DayRoute = WalkingRoute & { stopSignature:string };
const stopSignature = (stops:JourneyStop[]) => JSON.stringify(stops.map(stop=>[stop.id,stop.place.latitude,stop.place.longitude]));
const surveyDraft=(values:JourneySurveyValues):JourneySurveyDraft=>({step:3,query:values.area.name,area:values.area,dayText:String(values.dayCount),dateMode:values.startDate?'specific':'flexible',startDate:values.startDate||'',firstDayStartTime:values.firstDayStartTime||'',party:values.party,budget:values.budget,pace:values.pace,walking:values.walking,interests:values.interests,notes:values.notes});
function uniquePlaces(places:JourneyPlace[]) { return [...new Map(places.map(place => [place.id,place])).values()]; }

export function MapJourneyPlanner(props:Props) {
  // An account switch remounts the complete editor, including all async fences.
  return <JourneyEditor key={`${props.ownerId || 'guest'}:${props.initialJourney?.id || 'draft'}`} {...props}/>;
}

function JourneyEditor({ownerId,accessToken,initialCity,initialJourney,onNotice,onClose,onOpenAccount,onUpdateTrip}:Props) {
  const {copy,locale} = useI18n();
  const owner = ownerId || 'guest';
  const [journey,setJourney] = useState<MapJourney|null>(() => decodeStoredMapJourney(initialJourney) || drafts.get(owner) || null);
  const [undo,setUndo] = useState<MapJourney|null>(null);
  const [step,setStep] = useState<'setup'|'map'>(initialJourney && validateMapJourney(initialJourney) ? 'map':'setup');
  const [surveyValues,setSurveyValues]=useState<JourneySurveyValues|undefined>(()=>journey?.planning?{area:{...journey.center,name:journey.city},dayCount:journey.dayCount,startDate:journey.startDate,firstDayStartTime:journey.firstDayStartTime,...journey.planning.preferences}:undefined);
  const [signInSurvey,setSignInSurvey]=useState<ReturnType<typeof takeJourneySurveySignIn>>(null);
  const signInHandled=useRef<string|null>(null);
  const [recoverySurvey,setRecoverySurvey]=useState(()=>hasPendingJourneyPlan(ownerId)?readJourneyRecoveryDraft(ownerId):null);
  const [surveyScope,setSurveyScope]=useState(signInSurvey?.scope || initialJourney?.id || recoverySurvey?.scope || 'new');
  useEffect(()=>{
    if(!ownerId||initialJourney||signInHandled.current===ownerId)return;
    signInHandled.current=ownerId;
    const pending=takeJourneySurveySignIn(ownerId);
    if(pending){setSignInSurvey(pending);setSurveyScope(pending.scope);setSurveyValues(undefined);}
  },[ownerId,initialJourney]);
  const [generating,setGenerating]=useState(false);
  const [generationError,setGenerationError]=useState('');
  const generation=useRef(0);
  const generationController=useRef<AbortController|null>(null);
  const quotaIdentity=ownerId&&accessToken?`${ownerId}:${accessToken}`:'';
  const [quotaRefresh,setQuotaRefresh]=useState(0);
  const [quotaState,setQuotaState]=useState<{identity:string;state:'loading'|'ready'|'error'|'sign-in';data?:JourneyPlanQuota}>({identity:quotaIdentity,state:'loading'});
  const quota=quotaState.identity===quotaIdentity&&quotaState.state==='ready'&&quotaState.data?quotaState.data:null;
  const needsSignIn=!quotaIdentity||quotaState.identity===quotaIdentity&&quotaState.state==='sign-in';
  const recoveryAvailable=hasPendingJourneyPlan(ownerId);
  const [bookmarks,setBookmarks] = useState(()=>readSavedPlaces(ownerId));
  const [savedJourneys,setSavedJourneys] = useState(()=>readMapJourneys(ownerId));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [activeDay,setActiveDay] = useState<number|null>(1);
  const [tab,setTab] = useState<'plan'|'discover'>('plan');
  const [category,setCategory] = useState<DiscoveryGroup>('shopping');
  const [kind,setKind] = useState('');
  const [found,setFound] = useState<JourneyPlace[]>([]);
  const [searchMeta,setSearchMeta] = useState('');
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [photos,setPhotos] = useState<Record<string,JourneyPhoto>>({});
  const [mapCenter,setMapCenter] = useState<Coordinates>(journey?.center || knownJourneyArea(initialCity || '') || TRAVEL_CENTRES[0]);
  const [panelHeight,setPanelHeight] = useState(16);
  const [mapInsets,setMapInsets] = useState({top:130,right:12,bottom:120,left:12});
  const [routes,setRoutes] = useState<Record<number,DayRoute>>({});
  const [routeStatus,setRouteStatus] = useState<'idle'|'loading'|'ready'|'unavailable'>('idle');
  const [routeRetry,setRouteRetry] = useState(0);
  const [saveStatus,setSaveStatus] = useState('');
  const [saveBusy,setSaveBusy] = useState(false);
  const [confirmClose,setConfirmClose] = useState(false);
  const [closeError,setCloseError] = useState('');
  const [baseline,setBaseline] = useState<MapJourney|null>(()=>decodeStoredMapJourney(initialJourney));
  const baselineRef = useRef(baseline);
  const dirty = useMemo(()=>!!journey && JSON.stringify(journey) !== JSON.stringify(baseline),[journey,baseline]);
  const editorRoot = useRef<HTMLDivElement>(null);
  const pendingAction = useRef<(()=>void)|null>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const viewport = useRef<Coordinates>(mapCenter);
  const alive = useRef(true);
  const operation = useRef(0);
  const request = useRef<AbortController|null>(null);
  const routeCache = useRef(new Map<string,WalkingRoute>());
  const saving = useRef(false);
  const drag = useRef<{y:number;height:number;boxHeight:number}|null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const selectedCard = useRef<HTMLElement>(null);
  const savedCurrent = useRef(journey);

  useEffect(()=>{
    const root=workspace.current;if(step!=='map'||!root)return;
    const measure=()=>{
      const box=root.getBoundingClientRect();if(!box.width||!box.height)return;
      const toolbar=root.querySelector('.mj-topbar')?.getBoundingClientRect();
      if(toolbar)root.style?.setProperty('--mj-toolbar-bottom',`${toolbar.bottom-box.top+10}px`);
      const tabs=root.querySelector('.mj-day-tabs')?.getBoundingClientRect();
      const panel=root.querySelector('.mj-panel')?.getBoundingClientRect();
      if(panel)root.style?.setProperty('--mj-panel-size',`${panel.height}px`);
      const widePanel=Boolean(panel&&panel.width>box.width*.7);
      const next={top:Math.max(12,Math.round((tabs?.bottom??box.top)-box.top+12)),right:12,
        bottom:widePanel&&panel?Math.max(12,Math.round(box.bottom-panel.top+12)):24,
        left:panel&&!widePanel?Math.max(12,Math.round(panel.right-box.left+12)):12};
      setMapInsets(previous=>Object.keys(next).every(key=>previous[key as keyof typeof next]===next[key as keyof typeof next])?previous:next);
    };
    measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(root);root.querySelectorAll('.mj-topbar,.mj-day-tabs,.mj-panel').forEach(element=>observer?.observe(element));
    window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[step,panelHeight]);

  useEffect(()=>{alive.current=true;return()=>{alive.current=false;operation.current++;request.current?.abort();};},[]);
  useEffect(()=>{
    const sheet=(step==='map'?workspace.current:editorRoot.current)?.closest('.sheet');
    const beforeClose=(event:Event)=>{
      if(event.target!==sheet||!dirty)return;
      event.preventDefault();pendingAction.current=onClose || null;setCloseError('');setConfirmClose(true);
    };
    sheet?.addEventListener('sheet:before-close',beforeClose);
    return()=>sheet?.removeEventListener('sheet:before-close',beforeClose);
  },[dirty,onClose,step]);
  useEffect(()=>{if(confirmClose)stayButton.current?.focus({preventScroll:true});},[confirmClose]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(()=>{if(journey&&!onUpdateTrip) drafts.set(owner,journey);savedCurrent.current=journey;},[journey,owner,onUpdateTrip]);
  useEffect(()=>subscribeSavedPlaces(()=>setBookmarks(readSavedPlaces(ownerId)),ownerId),[ownerId]);
  useEffect(()=>{if(step!=='map'){operation.current++;request.current?.abort();setBusy(false);}},[step]);
  useEffect(()=>{generation.current++;generationController.current?.abort();generationController.current=null;setGenerating(false);setGenerationError('');return()=>{generation.current++;generationController.current?.abort();};},[locale,accessToken]);
  useEffect(()=>{
    if(step!=='setup'||!quotaIdentity)return;
    let current=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    setQuotaState({identity:quotaIdentity,state:'loading'});
    void loadJourneyPlanQuota(accessToken,controller.signal).then(data=>{
      if(!current)return;
      setQuotaState({identity:quotaIdentity,state:'ready',data});
      timer=setTimeout(()=>{if(current)setQuotaRefresh(value=>value+1);},Math.max(1,Date.parse(data.resetAt)-Date.now()+500));
    }).catch(failure=>{
      if(!current)return;
      const code=failure&&typeof failure==='object'&&'code' in failure?String(failure.code):'';
      setQuotaState({identity:quotaIdentity,state:['unauthorized','plan_sign_in'].includes(code)?'sign-in':'error'});
    });
    return()=>{current=false;controller.abort();if(timer)clearTimeout(timer);};
  },[quotaIdentity,accessToken,quotaRefresh,step]);
  const names = (group:DiscoveryGroup) => groupNames[group][locale==='tr'?0:locale==='sq'?2:1];
  const dayName = (day:number) => copy(`${day}. gün`,`Day ${day}`,`Dita ${day}`);
  const label = (place:JourneyPlace) => CATEGORY_LABELS[place.category]?.[locale==='tr'?0:locale==='sq'?2:1] || place.category;
  const withPhoto = (place:JourneyPlace):JourneyPlace => place.imageUrl ? place : {...place,...photos[journeyPhotoKey(place)]};
  const selectedStop = journey?.stops.find(stop=>stop.place.id===selectedId);
  const selectedRaw = selectedStop?.place || found.find(place=>place.id===selectedId);
  const selectedPlace = selectedRaw ? withPhoto(selectedRaw) : undefined;
  const displayed = found.filter(place=>!kind || place.category===kind).map(withPhoto);
  // Optional imagery is fetched after the map is ready. It never changes the
  // itinerary, dirty state or save baseline, and never gates the AI response.
  const photoCandidates = uniquePlaces([...(selectedRaw ? [selectedRaw] : []),
    ...(journey?.stops.filter(stop=>stop.day===(activeDay || 1)).map(stop=>stop.place) || [])]).filter(place=>!place.imageUrl);
  const photoRequestKey = JSON.stringify(photoCandidates.map(place=>({id:place.id,name:place.name,latitude:place.latitude,longitude:place.longitude,sourceUrl:place.sourceUrl})));
  useEffect(()=>{
    if(step!=='map'||photoRequestKey==='[]')return;
    let current=true;const controller=new AbortController();
    void loadJourneyPhotos(JSON.parse(photoRequestKey),locale,controller.signal).then(result=>{
      if(current&&result.size)setPhotos(previous=>({...previous,...Object.fromEntries(result)}));
    }).catch(()=>{/* Photos cannot block the editor. */});
    return()=>{current=false;controller.abort();};
  },[step,photoRequestKey,locale]);
  const daysArray = Array.from({length:journey?.dayCount || 1},(_,i)=>i+1);
  const routeKey = journey ? JSON.stringify(daysArray.map(day=>journeyDayStops(journey,day).map(stop=>[stop.id,stop.place.latitude,stop.place.longitude]))) : '';
  const routeSnapshot = useRef(journey);
  const routePriority = useRef(activeDay);
  useEffect(()=>{routeSnapshot.current=journey;},[journey]);
  useEffect(()=>{routePriority.current=activeDay;},[activeDay]);
  useEffect(()=>{
    const current=routeSnapshot.current;if(step!=='map'||!current)return;
    const controller=new AbortController();let active=true;
    const result:Record<number,DayRoute>={};let failed=false;
    const pending:{day:number;stops:JourneyStop[];key:string}[]=[];
    for(let day=1;day<=current.dayCount;day++) {
      const stops=journeyDayStops(current,day);if(stops.length<2)continue;
      if(stops.length>20){failed=true;continue;}
      const key=JSON.stringify(stops.map(s=>[s.place.latitude,s.place.longitude]));
      const cached=routeCache.current.get(key);
      const age=cached?Date.now()-Date.parse(cached.fetchedAt):Infinity;
      if(cached&&age>=0&&age<15*60_000)result[day]={...cached,stopSignature:stopSignature(stops)};
      else pending.push({day,stops,key});
    }
    // Restore every unchanged day before starting requests, including cached days
    // behind a slow day. Switching tabs only reprioritizes the remaining queue.
    setRoutes({...result});setRouteStatus(pending.length?'loading':failed?'unavailable':'ready');
    const work=async()=>{
      while(active&&pending.length) {
        const priority=pending.findIndex(item=>item.day===routePriority.current);
        const {day,stops,key}=pending.splice(priority<0?0:priority,1)[0];
        try {
          const route=await loadWalkingRoute(stops.map(s=>s.place),controller.signal);
          if(!active)return;
          if(route.profile!=='foot-walking'||route.legs.length!==stops.length-1)throw new Error('invalid');
          if(routeCache.current.size>=30)routeCache.current.delete(routeCache.current.keys().next().value!);
          routeCache.current.set(key,route);result[day]={...route,stopSignature:stopSignature(stops)};
          setRoutes({...result});
        }catch{if(!active)return;failed=true;}
      }
    };
    void Promise.all(Array.from({length:Math.min(2,pending.length)},()=>work())).then(()=>{
      if(active)setRouteStatus(failed?'unavailable':'ready');
    });
    return()=>{active=false;controller.abort();};
  },[routeKey,routeRetry,step]);
  const legs:JourneyLeg[]=useMemo(()=>journey?Object.entries(routes).flatMap(([day,route])=>{
    const stops=journeyDayStops(journey,Number(day));
    if(route.stopSignature!==stopSignature(stops))return [];
    return route.legs.flatMap((leg,index)=>stops[index+1]?[{fromId:stops[index].id,toId:stops[index+1].id,mode:'walking' as const,durationMinutes:leg.durationSeconds/60,sourceUrl:route.sourceUrl,fetchedAt:route.fetchedAt}]:[]);
  }):[],[journey,routes]);
  const matchingRoutes=Object.entries(routes).filter(([day,route])=>journey&&route.stopSignature===stopSignature(journeyDayStops(journey,Number(day))));
  const mapRoutes:JourneyMapRoute[]=matchingRoutes.flatMap(([day,route])=>{
    const paths=route.geometry.type==='MultiLineString'?route.geometry.coordinates:[route.geometry.coordinates];
    return paths.map((path,index)=>({id:`${day}:${index}`,day:Number(day),coordinates:path.map(([lon,lat]):[number,number]=>[lat,lon])}));
  });
  const visibleRoutes=matchingRoutes.filter(([day])=>activeDay===null||Number(day)===activeDay);
  const visibleDays=activeDay?[activeDay]:daysArray;
  const eligibleDays=journey?visibleDays.filter(day=>journeyDayStops(journey,day).length>=2):[];
  const walkingMeters=visibleRoutes.reduce((sum,[,route])=>sum+route.distanceMeters,0);
  const walkingSeconds=visibleRoutes.reduce((sum,[,route])=>sum+route.durationSeconds,0);
  const walkingDistance=(walkingMeters/1000).toLocaleString(locale==='sq'?'sq-AL':locale==='tr'?'tr-TR':'en-GB',{maximumFractionDigits:1,minimumFractionDigits:1});
  const walkingSource=[...new Set(visibleRoutes.map(([,route])=>route.attribution))].join(' · ');

  function openJourney(next:MapJourney,saved=false) {
    operation.current++;request.current?.abort();setBusy(false);
    viewport.current=next.center;
    setJourney(next);setUndo(null);setStep('map');setMapCenter(next.center);setActiveDay(1);
    setSelectedId(null);setFound([]);setSearchMeta('');setKind('');setTab('plan');
    setNotice('');setError('');setSaveStatus('');setPanelHeight(16);
    if(saved){baselineRef.current=next;setBaseline(next);}
  }

  function guard(action:()=>void) {
    if(!dirty){action();return;}
    pendingAction.current=action;setCloseError('');setConfirmClose(true);
  }
  function finishClose(discard=false) {
    if(discard){
      if(!onUpdateTrip){if(baselineRef.current)drafts.set(owner,baselineRef.current);else drafts.delete(owner);}
      setJourney(baselineRef.current);setUndo(null);
    }
    const action=pendingAction.current;pendingAction.current=null;setConfirmClose(false);action?.();
  }

  function begin() {request.current?.abort();const controller=new AbortController();request.current=controller;const id=++operation.current;setBusy(true);setError('');return {controller,id};}
  function current(id:number) {return alive.current&&operation.current===id;}
  function change(next:MapJourney) {
    if(next===journey)return;
    setUndo(journey);setJourney(next);setSaveStatus('');setNotice('');
  }
  function safeChange(action:()=>MapJourney) {try{change(action());}catch{setError(copy('Değişiklik uygulanamadı. Gün, süre ve saat alanlarını kontrol et.','Change could not be applied. Check the day, duration and time.','Ndryshimi nuk u zbatua. Kontrollo ditën, kohëzgjatjen dhe orën.'));}}
  function cancelGeneration() {
    generation.current++;generationController.current?.abort();generationController.current=null;setGenerating(false);
  }
  async function generate(values:JourneySurveyValues,requestLocale=locale) {
    if(generationController.current)return;
    setSurveyValues(values);setGenerationError('');setGenerating(true);
    const controller=new AbortController();generationController.current=controller;const id=++generation.current;
    try {
      if(!ownerId||!accessToken)throw Object.assign(Error('plan_sign_in'),{code:'plan_sign_in'});
      const input={destination:values.area,dayCount:values.dayCount,startDate:values.startDate,firstDayStartTime:values.firstDayStartTime,
        party:values.party,budget:values.budget,pace:values.pace,walking:values.walking,interests:values.interests,notes:values.notes,locale:requestLocale};
      if((!quota||quota.remaining===0)&&!await hasJourneyPlanRecovery(input,ownerId))throw Object.assign(Error('allowance'),{code:quota?'plan_limit':'plan_quota_unavailable'});
      if(!alive.current||generation.current!==id||controller.signal.aborted)return;
      rememberJourneyRecoveryScope(ownerId,surveyScope,surveyDraft(values),requestLocale);
      clearJourneySignInClaim(ownerId);
      const result=await generateJourneyPlan(input,accessToken,controller.signal,ownerId);
      if(!alive.current||generation.current!==id)return;
      let prepared=journeyFromAiPlan(result);
      if(onUpdateTrip && initialJourney && surveyScope===initialJourney.id) prepared={...prepared,id:initialJourney.id,createdAt:initialJourney.createdAt};
      openJourney(prepared);setPanelHeight(49);
      setNotice(copy('Rotan hazır. Günleri incele, istediğin durakları değiştir ve planını kaydet.','Your itinerary is ready. Review each day, edit any stop, then save your plan.','Itinerari është gati. Shiko ditët, ndrysho ndalesat dhe ruaje planin.'));
    } catch(failure) {
      if(!alive.current||generation.current!==id)return;
      const code=failure&&typeof failure==='object'&&'code' in failure?String(failure.code):'';
      if(['unauthorized','plan_sign_in'].includes(code))setQuotaState({identity:quotaIdentity,state:'sign-in'});
      setGenerationError(code==='plan_limit'?copy('Bugünkü yeni AI rota hakkın şu anda kullanılamıyor. Yukarıdan yenilenme zamanını görebilirsin. Kayıtlı planlarını ücretsiz düzenleyebilir ve kaydedebilirsin.','Today’s new AI itinerary allowance is currently unavailable. See the reset time above. You can edit and save existing plans for free.','E drejta e sotme për një itinerar të ri me AI nuk është e disponueshme tani. Shiko më sipër kohën e rinovimit. Planet ekzistuese mund t’i ndryshosh dhe ruash falas.')
        :code==='plan_quota_unavailable'?copy('Günlük hakkın doğrulanamadı. Yanıtların korundu; hakkını kontrol edip tekrar dene.','Your daily allowance could not be checked. Your answers are kept; refresh the allowance and retry.','E drejta ditore nuk u verifikua. Përgjigjet ruhen; rifresko të drejtën dhe provo sërish.')
        :code==='plan_pending'?copy('Önceki isteğin hâlâ işleniyor. Aynı seçimlerle tekrar kontrol edebilirsin; ek hak kullanılmaz.','Your previous request is still processing. Check again with the same choices; no additional allowance is used.','Kërkesa e mëparshme po përpunohet. Kontrollo sërish me të njëjtat zgjedhje; nuk përdoret e drejtë shtesë.')
        :code==='plan_request_too_large'?copy('Bu plan mevcut ücretsiz işlem kapasitesini aşıyor. Gün sayısını veya notlarını kısaltıp tekrar dene. Tercihlerin ve önceki planın korundu; günlük hakkın kullanılmadı.','This plan exceeds the current free processing capacity. Shorten the trip or your notes and retry. Your preferences and previous plan are kept; your daily allowance was not used.','Ky plan tejkalon kapacitetin aktual falas. Shkurto udhëtimin ose shënimet dhe provo sërish. Preferencat dhe plani i mëparshëm ruhen; e drejta ditore nuk u përdor.')
        :['plan_places_unavailable','plan_insufficient_places','plan_destination_unavailable'].includes(code)?copy('Bu yer ve süre için yeterli mekân doğrulanamadı. Şehri veya gün sayısını değiştir ya da tekrar dene. Seçimlerin korundu.','Not enough places could be verified for this destination and duration. Change the city or number of days, or try again. Your choices are kept.','Nuk u verifikuan mjaft vende për këtë destinacion dhe kohëzgjatje. Ndrysho qytetin ose ditët, ose provo sërish. Zgjedhjet ruhen.')
        :code==='plan_daily_capacity'?copy('AI rota servisi günlük kapasite sınırı nedeniyle şu anda yeni plan oluşturamıyor. Tercihlerin ve önceki planın korundu.','The AI planning service cannot create new plans because its daily capacity limit has been reached. Your preferences and previous plan are kept.','Shërbimi AI nuk mund të krijojë plane të reja për shkak të kufirit të kapacitetit ditor. Preferencat dhe plani i mëparshëm ruhen.')
        :code==='plan_busy'?copy('AI planlama servisi şu anda yeni istek kabul edemiyor. Tercihlerin korundu; biraz sonra tekrar dene.','The AI planning service cannot accept another request right now. Your preferences are kept; please retry later.','Shërbimi AI nuk mund të pranojë një kërkesë tjetër tani. Preferencat ruhen; provo më vonë.')
        :code==='plan_unavailable'?copy('AI planlama servisine şu anda ulaşılamıyor. Tercihlerin korundu; biraz sonra tekrar dene.','The AI planning service is currently unavailable. Your preferences are kept; please retry later.','Shërbimi AI nuk është i disponueshëm tani. Preferencat ruhen; provo më vonë.')
        :code==='plan_timeout'?copy('Rotanın hazırlanması beklenenden uzun sürdü. Tercihlerin korundu; tekrar deneyebilirsin.','Your itinerary took longer than expected. Your preferences are kept; you can retry.','Përgatitja zgjati më shumë se pritej. Preferencat ruhen; mund të provosh sërish.')
        :['unauthorized','plan_sign_in'].includes(code)?copy('Hesabına giriş yapıp tekrar dene. Tercihlerin korundu.','Sign in and retry. Your preferences are kept.','Hyr në llogari dhe provo sërish. Preferencat ruhen.')
        :copy('Rotan şu anda hazırlanamadı. Tercihlerin ve önceki planın korundu; tekrar deneyebilirsin.','Your itinerary could not be prepared right now. Your preferences and previous plan are kept; you can retry.','Itinerari nuk u përgatit tani. Preferencat dhe plani i mëparshëm ruhen; mund të provosh sërish.'));
    } finally {
      if(generation.current===id){generationController.current=null;setGenerating(false);setQuotaRefresh(value=>value+1);}
    }
  }
  async function discover(mode:'area'|'nearby'|'route',newCategory=category) {
    if(!journey)return;const {controller,id}=begin();setTab('discover');setSelectedId(null);setKind('');setCategory(newCategory);setFound([]);setSearchMeta('');setNotice('');
    try {
      let center=viewport.current;
      if(mode==='nearby'){center=await locateForTravel();if(!current(id))return;viewport.current=center;setMapCenter(center);}
      const coverage=mode==='route'?discoveryCentersForRoute(journey.stops.filter(stop=>activeDay===null||stop.day===activeDay).map(stop=>stop.place),journey.center):null;
      const centers=coverage?.centers||[center];const results:DiscoveryResponse[]=[];let partial=false,lastFailure:unknown;
      for(const point of centers){
        try{const result=await discoverJourneyPlaces(point,newCategory,controller.signal);if(!current(id))return;results.push(result);}
        catch(error){if(!current(id))return;partial=true;lastFailure=error;}
      }
      if(!results.length)throw lastFailure;
      const places=uniquePlaces(results.flatMap(result=>result.places));const stale=results.some(result=>result.stale),limited=results.some(result=>result.limited);
      const scope=coverage&&coverage.totalStopCount?copy(`${results.length} bölgede durak çevresi · 3 km`,`${results.length} stop areas · 3 km each`,`${results.length} zona ndalesash · 3 km secila`):'3 km';
      setFound(places);setSearchMeta(`${scope} · ${[...new Set(results.map(result=>result.attribution))].join(' · ')}${stale?copy(' · Eski kayıt',' · Saved snapshot',' · Të dhëna të ruajtura'):''}${limited?copy(' · Sonuç sınırı',' · Limited results',' · Rezultate të kufizuara'):''}`);setPanelHeight(49);
      if(partial||coverage&&!coverage.complete)setNotice(copy('Durakların çevresindeki bazı bölgeler tarandı. Uzak bölgeler için haritayı taşıyıp Bu bölgede ara seçeneğini kullan.','Only some stop areas were searched. Move the map and use Search this area for other areas.','U kërkuan vetëm disa zona ndalesash. Lëviz hartën dhe përdor Kërko në këtë zonë për zonat e tjera.'));
      else if(!places.length)setNotice(copy('Bu bölgede sonuç yok. Haritayı taşıyıp başka bir bölgede ara.','No results in this area. Move the map and search elsewhere.','Nuk ka rezultate në këtë zonë. Lëviz hartën dhe kërko tjetërkund.'));
    }catch{if(current(id))setError(mode==='nearby'?copy('Konum alınamadı veya mekân servisine ulaşılamadı. Haritayı taşıyıp Bu bölgede ara ile devam edebilirsin.','Location or places are unavailable. Move the map and use Search this area.','Vendndodhja ose vendet nuk janë të disponueshme. Lëviz hartën dhe kërko në këtë zonë.'):copy('Mekân servisine ulaşılamadı. Planın korundu; tekrar deneyebilirsin.','Places service unavailable. Your plan is safe; try again.','Shërbimi i vendeve nuk është i disponueshëm. Plani u ruajt; provo përsëri.'));}
    finally{if(current(id))setBusy(false);}
  }
  async function save(asCopy=false):Promise<boolean> {
    if(!journey||saving.current)return false;saving.current=true;setSaveBusy(true);setError('');setSaveStatus('');setCloseError('');
    const original=journey;
    const snapshot=asCopy?{...journey,id:`journey-${createId()}`,createdAt:new Date().toISOString()}:journey;
    try {
      if(onUpdateTrip && initialJourney?.id===journey.id && !asCopy){
        await onUpdateTrip(snapshot);
        if(!asCopy){baselineRef.current=snapshot;setBaseline(snapshot);}
        if(alive.current && savedCurrent.current===original){const message=copy('Seyahatin güncellendi.','Your trip was updated.','Udhëtimi u përditësua.');setSaveStatus(message);onNotice(message);}
        return true;
      }
      const result=saveMapJourney(snapshot,ownerId,locale);setSavedJourneys(readMapJourneys(ownerId));
      if(!asCopy){baselineRef.current=result.journey;setBaseline(result.journey);}
      if(!asCopy&&result.journey.id!==snapshot.id){setJourney(result.journey);savedCurrent.current=result.journey;setUndo(previous=>previous?{...previous,id:result.journey.id}:null);}
      let message=ownerId?copy('Cihazda kayıtlı; hesaba eşitleme bekliyor.','Saved on this device; waiting to sync.','Ruajtur në pajisje; në pritje të sinkronizimit.'):copy('Kaydedildi. Planlar → Rotalar bölümünden yeniden açabilirsin.','Saved. Reopen under Plans → Routes.','U ruajt. Hape sërish te Planet → Itineraret.');
      if(ownerId&&accessToken){try{await syncSavedRoutes(ownerId,accessToken,()=>alive.current);message=copy('Plan hesabına kaydedildi.','Plan saved to your account.','Plani u ruajt në llogarinë tënde.');}catch{/* The durable existing outbox retries. */}}
      if(alive.current&&(savedCurrent.current===original||savedCurrent.current===result.journey)){setSaveStatus(message);onNotice(message);}
      return true;
    }catch(failure){if(alive.current){const message=onUpdateTrip&&!asCopy&&failure instanceof Error?failure.message:copy('Plan kaydedilemedi. Mevcut planın açık; cihaz depolamasını kontrol et ve tekrar dene.','Plan could not save. It remains open; check device storage and retry.','Plani nuk u ruajt. Mbetet i hapur; kontrollo hapësirën dhe provo përsëri.');setError(message);setCloseError(message);}return false;}
    finally{saving.current=false;if(alive.current)setSaveBusy(false);}
  }
  const selectPlace=(id:string,day?:number)=>{setSelectedId(id);if(day)setActiveDay(day);setPanelHeight(58);requestAnimationFrame(()=>selectedCard.current?.scrollIntoView({block:'nearest'}));};
  const issueLabel=(issue:ScheduleIssue)=>({
    'travel-unknown':copy('Yol süresi bilinmiyor; saat yaklaşık.','Travel time unknown; time is provisional.','Koha e udhëtimit nuk dihet; ora është e përafërt.'),
    'hours-unknown':copy('Ziyaret saatini işletmeden kontrol et.','Check visiting hours with the venue.','Kontrollo orarin me vendin.'),
    closed:copy('Bu saatte kapalı olabilir.','May be closed at this time.','Mund të jetë i mbyllur në këtë orë.'),
    'reservation-conflict':copy('Sabit saat önceki durakla çakışıyor.','The fixed time conflicts with the previous stop.','Ora fikse përplaset me ndalesën e mëparshme.'),
    'outside-day':copy('Bu durak günün süresini aşıyor.','This stop exceeds the day’s time budget.','Kjo ndalesë tejkalon kohën e ditës.'),
  }[issue]);

  const closePrompt=confirmClose&&<div className="mj-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="mj-close-title" aria-describedby="mj-close-description" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setConfirmClose(false);pendingAction.current=null;}if(event.key==='Tab'){const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}><section>
    <h3 id="mj-close-title">{copy('Değişikliklerini kaydedelim mi?','Save your changes?','T’i ruajmë ndryshimet?')}</h3>
    <p id="mj-close-description">{copy('Rotandaki son değişiklikler henüz kaydedilmedi.','Your latest itinerary changes have not been saved.','Ndryshimet e fundit të itinerarit nuk janë ruajtur.')}</p>
    {closeError&&<p className="mj-error" role="alert">{closeError}</p>}
    <button className="mj-primary" disabled={saveBusy} onClick={()=>{void save().then(saved=>{if(saved&&alive.current&&savedCurrent.current&&JSON.stringify(savedCurrent.current)===JSON.stringify(baselineRef.current))finishClose();});}}>{saveBusy?copy('Kaydediliyor…','Saving…','Duke ruajtur…'):copy('Kaydet ve devam et','Save and continue','Ruaj dhe vazhdo')}</button>
    <button ref={stayButton} disabled={saveBusy} onClick={()=>{setConfirmClose(false);pendingAction.current=null;}}>{copy('Düzenlemeye devam et','Keep editing','Vazhdo ndryshimin')}</button>
    <button disabled={saveBusy} className="mj-discard" onClick={()=>finishClose(true)}>{copy('Değişiklikleri kaydetmeden devam et','Continue without saving','Vazhdo pa ruajtur')}</button>
  </section></div>;

  const resetLabel=quota?formatAppDate(new Date(quota.resetAt),locale==='tr'?'tr-TR':locale==='sq'?'sq-AL':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):'';
  const quotaLoading=quotaState.identity!==quotaIdentity||quotaState.state==='loading';
  const quotaPanel=<aside className="jsv-allowance" aria-live="polite">
    <strong>{needsSignIn?copy('Her hesap için günde 3 yeni AI rota','3 new AI itineraries per account each day','3 itinerare të reja me AI në ditë për çdo llogari')
      :quota?quota.pending?copy('Önceki rota isteğin kontrol ediliyor','Your previous itinerary request is pending','Kërkesa e mëparshme është në pritje')
      :quota.remaining?copy(`Bugün ${quota.remaining} yeni AI rota hakkın var`,`${quota.remaining} new AI ${quota.remaining===1?'itinerary':'itineraries'} available today`,quota.remaining===1?'Sot ke 1 itinerar të ri me AI':`Sot ke ${quota.remaining} itinerare të reja me AI`)
      :copy('Bugünkü AI rota haklarını kullandın (0 kaldı)','Today’s AI itinerary allowance is used (0 remaining)','E drejta e sotme për itinerar me AI është përdorur (0 të mbetura)')
      :quotaLoading?copy('Günlük hakkın kontrol ediliyor…','Checking your daily allowance…','Po kontrollohet e drejta ditore…')
      :copy('Günlük hakkın doğrulanamadı','Could not check your daily allowance','E drejta ditore nuk u verifikua')}</strong>
    {quota&&<p>{copy('Yeni hak: ','Next allowance: ','E drejta e radhës: ')}<time dateTime={quota.resetAt}>{resetLabel}</time></p>}
    <p>{needsSignIn?copy('Rotanı oluşturmak için giriş yap. Yanıtların korunur.','Sign in to create your itinerary. Your answers are kept.','Hyr për të krijuar itinerarin. Përgjigjet ruhen.')
      :copy('Yalnızca başarıyla hazırlanan yeni rota günlük hakkını kullanır. Plan açma, elle düzenleme ve kaydetme ücretsizdir.','Only a successfully created new itinerary uses your daily allowance. Opening, manually editing and saving plans is free.','Vetëm një itinerar i ri i krijuar me sukses përdor të drejtën ditore. Hapja, ndryshimi manual dhe ruajtja e planeve janë falas.')}</p>
    {!needsSignIn&&recoveryAvailable&&<p>{copy('Önceki denemenin sonucunu aynı yanıtlarla kontrol edebilirsin; ikinci bir hak kullanılmaz.','Check your previous attempt using the same answers; no second allowance is used.','Kontrollo provën e mëparshme me të njëjtat përgjigje; nuk përdoret një e drejtë e dytë.')}</p>}
    {!needsSignIn&&recoveryAvailable&&readJourneyRecoveryDraft(ownerId)&&<button type="button" className="jsv-text-button" disabled={generating} onClick={()=>{const previous=readJourneyRecoveryDraft(ownerId);if(previous){setRecoverySurvey(previous);setSurveyScope(previous.scope);setSurveyValues(undefined);setGenerationError('');}}}>{copy('Önceki seçimlerimi geri getir','Restore previous choices','Rikthe zgjedhjet e mëparshme')}</button>}
    {!needsSignIn&&!quotaLoading&&<button type="button" className="jsv-text-button" disabled={generating} onClick={()=>setQuotaRefresh(value=>value+1)}>{copy('Hakkımı kontrol et','Refresh allowance','Rifresko të drejtën')}</button>}
  </aside>;
  function signInForPlan(values:JourneySurveyValues) {
    setSurveyValues(values);
    if(!ownerId)prepareJourneySurveySignIn(surveyDraft(values));
    onOpenAccount?.();
  }
  if(step!=='map')return <div ref={editorRoot} className="mj-survey-shell">
    {savedJourneys.error&&<p className="mj-error" role="alert">{copy('Kayıtlı planlar okunamadı. Mevcut kayıtların değiştirilmedi.','Saved plans could not be read. Existing records were preserved.','Planet e ruajtura nuk u lexuan. Të dhënat ekzistuese u ruajtën.')}</p>}
    {journey&&<button className="mj-resume" disabled={generating} onClick={()=>{setStep('map');setGenerationError('');}}>{copy('Açık planıma dön','Return to my open plan','Kthehu te plani i hapur')} · {journey.city}</button>}
    <JourneySetupSurvey ownerId={ownerId || null} draftScope={surveyScope} initialCity={initialCity} initialValues={surveyValues} busy={generating} error={generationError}
      initialDraft={signInSurvey?.scope===surveyScope?signInSurvey.draft:recoverySurvey?.scope===surveyScope?recoverySurvey.draft:undefined} allowance={quotaPanel}
      generationDisabled={!needsSignIn&&!recoveryAvailable&&(!quota||quota.remaining===0)}
      generationLabel={needsSignIn?copy('Giriş yap ve devam et','Sign in to continue','Hyr dhe vazhdo'):recoveryAvailable&&(!quota||quota.remaining===0)?copy('Önceki rotayı / sonucu aç','Open previous itinerary / result','Hap itinerarin / rezultatin e mëparshëm'):undefined}
      onSignIn={needsSignIn?signInForPlan:undefined}
      savedPlans={savedJourneys.items.map(item=>({id:item.id,city:item.city,dayCount:item.dayCount}))}
      onOpenSaved={id=>{const saved=savedJourneys.items.find(item=>item.id===id);if(saved)guard(()=>{cancelGeneration();openJourney(saved,true);});}}
      onGenerate={values=>void generate(values,recoverySurvey?.scope===surveyScope?recoverySurvey.locale:locale)} onCancel={cancelGeneration}/>
    {closePrompt}
  </div>;

  if(!journey)return null;
  return <div className="mj-workspace" ref={workspace} style={{'--mj-panel-height':panelHeight<=20?'88px':`${panelHeight}%`} as CSSProperties}>
    <div className="mj-topbar" inert={confirmClose || undefined}>{onClose&&<button className="mj-exit" data-autofocus aria-label={copy('Haritayı kapat','Close map','Mbyll hartën')} onClick={()=>guard(onClose)}><Icon name="back" size={21}/></button>}<div className="mj-title"><small>{journey.dayCount} {copy('gün','days','ditë')} · {journey.stops.length} {copy('durak','stops','ndalesa')}</small><strong title={journey.city}>{journey.city}</strong>{dirty&&<span className="mj-unsaved">{copy('Kaydedilmemiş değişiklikler','Unsaved changes','Ndryshime të paruajtura')}</span>}</div><button className="mj-undo" disabled={!undo} title={copy('Son değişikliği geri al','Undo last change','Zhbëj ndryshimin e fundit')} aria-label={copy('Son değişikliği geri al','Undo last change','Zhbëj ndryshimin e fundit')} onClick={()=>{if(undo){setJourney(undo);setUndo(null);setSaveStatus('');setSelectedId(null);}}}><Icon name="back" size={18}/></button><button data-guide="journey-save" className="mj-save" disabled={saveBusy} onClick={()=>void save()}>{saveBusy?copy('Kaydediliyor…','Saving…','Duke ruajtur…'):onUpdateTrip&&initialJourney?.id===journey.id?copy('Bu seyahati güncelle','Update this trip','Përditëso këtë udhëtim'):copy('Kaydet','Save','Ruaj')}</button></div>
    <div className="mj-day-tabs" inert={confirmClose || undefined} data-guide="journey-days" aria-label={copy('Plan günleri','Plan days','Ditët e planit')}><div className="mj-day-scroll"><button aria-pressed={activeDay===null} onClick={()=>{setActiveDay(null);setSelectedId(null);}}>{copy('Genel','Overview','Përmbledhje')}</button>{daysArray.map(day=><button key={day} aria-pressed={activeDay===day} onClick={()=>{setActiveDay(day);setSelectedId(null);}}><i style={{background:dayColors[(day-1)%dayColors.length]}}/>{dayName(day)}</button>)}</div><label className="mj-day-picker"><span>{copy('Gün seç','Choose day','Zgjidh ditën')}</span><select aria-label={copy('Gün seç','Choose day','Zgjidh ditën')} value={activeDay??'all'} onChange={event=>{setActiveDay(event.target.value==='all'?null:Number(event.target.value));setSelectedId(null);}}><option value="all">{copy('Tüm günler','All days','Të gjitha ditët')}</option>{daysArray.map(day=><option key={day} value={day}>{dayName(day)} / {journey.dayCount}</option>)}</select></label></div>
    <div className="mj-map-stage" inert={confirmClose || undefined}><JourneyMap ownerId={ownerId} contentInsets={mapInsets} onSearchArea={()=>void discover('area')} searchEnabled={!busy} searchAreaLabel={copy('Bu bölgede ara','Search this area','Kërko në këtë zonë')} center={mapCenter} stops={journey.stops.map(stop=>({...withPhoto(stop.place),id:stop.place.id,day:stop.day,order:stop.order+1}))} discoveredPlaces={displayed} routes={mapRoutes} activeDay={activeDay} selectedPlaceId={selectedId} onViewportChange={value=>{viewport.current=value.center;}} onSelectPlace={point=>selectPlace(point.id,journey.stops.find(stop=>stop.place.id===point.id)?.day)} labels={{map:copy('Program ve çevredeki mekânlar haritası','Itinerary and nearby places map','Harta e programit dhe vendeve përreth'),zoomIn:copy('Yakınlaş','Zoom in','Zmadho'),zoomOut:copy('Uzaklaş','Zoom out','Zvogëlo'),tilesUnavailable:copy('Harita yüklenemedi. Aşağıdaki listeyi kullanabilirsin.','Map unavailable. Use the list below.','Harta nuk u ngarkua. Përdor listën më poshtë.'),retryTiles:copy('Haritayı tekrar yükle','Retry map','Provo hartën sërish'),stop:(order,day,name)=>`${dayName(day)}, ${order}: ${name}`,place:name=>name,cluster:count=>copy(`${count} mekânı göster`,`Show ${count} places`,`Shfaq ${count} vende`)}}/>
      <button className="mj-area-search" disabled={busy} onClick={()=>void discover('area')}>{busy?copy('Aranıyor…','Searching…','Duke kërkuar…'):copy('Bu bölgede ara','Search this area','Kërko në këtë zonë')}</button>
      <section className={`mj-panel ${panelHeight<=20?'is-collapsed':''}`} style={{height:panelHeight<=20?'88px':`${panelHeight}%`}} aria-label={copy('Günlük program paneli','Daily itinerary panel','Paneli i programit ditor')}>
        <div className="mj-drag" onPointerDown={e=>{drag.current={y:e.clientY,height:panelHeight,boxHeight:workspace.current?.clientHeight||600};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setPanelHeight(Math.max(16,Math.min(86,drag.current.height+(drag.current.y-e.clientY)/drag.current.boxHeight*100)));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><span/><button onPointerDown={event=>event.stopPropagation()} aria-expanded={panelHeight>20} aria-label={copy('Program panelini büyüt veya küçült','Expand or collapse itinerary panel','Zgjero ose zvogëlo panelin')} onClick={()=>setPanelHeight(value=>value>20?16:62)}><Icon name="chevron" size={16}/></button></div>
        <div className="mj-panel-tabs"><button aria-pressed={tab==='plan'} onClick={()=>{setTab('plan');setPanelHeight(49);}}>{copy('Programım','My itinerary','Programi im')}</button><button data-guide="journey-discover" aria-pressed={tab==='discover'} onClick={()=>{setTab('discover');setPanelHeight(49);}}>{copy('Mekânları keşfet','Discover places','Zbulo vende')}</button></div>
        <div className="mj-panel-scroll">
          {error&&<p className="mj-error" role="alert">{error}</p>}{notice&&<p className="mj-notice" role="status">{notice}</p>}{saveStatus&&<p data-guide="journey-saved" className="mj-saved-status" role="status">{saveStatus}</p>}
          {selectedPlace&&<article ref={selectedCard} className="mj-place-detail"><button className="mj-detail-close" aria-label={copy('Mekân ayrıntısını kapat','Close place details','Mbyll hollësitë')} onClick={()=>setSelectedId(null)}>×</button><small>{label(selectedPlace)}</small><h3>{selectedPlace.name||label(selectedPlace)}</h3><JourneyPlacePhoto key={journeyPhotoKey(selectedPlace)} place={selectedPlace}/>{selectedPlace.address&&<p>{selectedPlace.address}</p>}{selectedPlace.hours?<p>{copy('Kayıtlı çalışma saatleri','Listed opening hours','Orari i regjistruar')}: {selectedPlace.hours}</p>:<p>{copy('Çalışma saatleri paylaşılmamış.','Opening hours not provided.','Orari nuk është dhënë.')}</p>}<small>{`${selectedPlace.id.startsWith('apple/')?'Apple Maps':'OpenStreetMap'} · ${copy('Canlı açık/kapalı bilgisi değildir.','Not live open/closed status.','Jo gjendje hapur/mbyllur drejtpërdrejt.')}`}</small><div className="mj-action-row"><button onClick={()=>{try{saveTravelPlace(selectedRaw!,ownerId);setBookmarks(readSavedPlaces(ownerId));setNotice(copy('Mekân Kaydedilenler’e eklendi.','Place added to Saved.','Vendi u shtua te Të ruajturat.'));}catch{setError(copy('Mekân kaydedilemedi.','Place could not be saved.','Vendi nuk u ruajt.'));}}}>{bookmarks.items.some(item=>item.place.id===selectedPlace.id)?copy('Kaydedildi','Saved','Ruajtur'):copy('Kaydet','Save','Ruaj')}</button><button onClick={()=>void openExternal(directionsUrl(`${selectedPlace.latitude},${selectedPlace.longitude}`))}>{copy('Yol tarifi','Directions','Udhëzime')}</button><button onClick={()=>void openExternal(selectedPlace.sourceUrl)}>{copy('Kaynak','Source','Burimi')}</button></div>
            {selectedStop?<StopEditor key={`${selectedStop.id}:${selectedStop.durationMinutes}:${selectedStop.fixedTime}:${selectedStop.note}:${selectedStop.priority}`} stop={selectedStop} dayCount={journey.dayCount} onChange={(patch)=>safeChange(()=>updateJourneyStop(journey,selectedStop.id,patch))} onMove={day=>{safeChange(()=>moveJourneyStop(journey,selectedStop.id,day));setActiveDay(day);}} onRemove={()=>{safeChange(()=>removeJourneyStop(journey,selectedStop.id));setSelectedId(null);}}/>:<AddPlace key={selectedPlace.id} dayCount={journey.dayCount} initialDay={activeDay||1} onAdd={(day,duration,note)=>{safeChange(()=>addJourneyStop(journey,selectedRaw!,day,{durationMinutes:duration,note}));setActiveDay(day);setTab('plan');}}/>}
          </article>}
          {tab==='discover'?<>
            <div className="mj-filters">{groups.map(group=><button key={group} aria-pressed={category===group} disabled={busy} onClick={()=>void discover('area',group)}>{groupIcons[group]} {names(group)}</button>)}</div>
            <div className="mj-action-row"><button disabled={busy} onClick={()=>void discover('nearby')}>{copy('Yakınımda','Near me','Pranë meje')}</button><button disabled={busy} onClick={()=>void discover('route')}>{copy('Rotamın çevresinde','Around my route','Rreth itinerarit')}</button></div>
            {found.length>0&&<label className="mj-subfilter">{copy('Tür','Type','Lloji')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">{copy('Tümü','All','Të gjitha')}</option>{[...new Set(found.map(p=>p.category))].map(key=><option key={key} value={key}>{CATEGORY_LABELS[key]?.[locale==='tr'?0:locale==='sq'?2:1]||key}</option>)}</select></label>}
            {searchMeta&&<p className="mj-meta">{searchMeta}</p>}{!busy&&!found.length&&<p className="mj-empty">{copy('Mağazalar, kafeler ve daha fazlası. Bir kategori seç veya haritayı taşıyıp bu bölgede ara.','Shops, cafés and more. Choose a category or move the map and search this area.','Dyqane, kafene dhe më shumë. Zgjidh kategori ose lëviz hartën dhe kërko.')}</p>}
            {displayed.map(place=><button className={`mj-place-row ${selectedId===place.id?'selected':''}`} key={place.id} onClick={()=>selectPlace(place.id)}><span className="mj-discovery-dot">{groupIcons[category]}</span><span><strong>{place.name||label(place)}</strong><small>{label(place)}{journey.stops.some(s=>s.place.id===place.id)?` · ${copy('Planında','In your plan','Në planin tënd')}`:''}</small></span><Icon name="chevron" size={16}/></button>)}
          </>:<>
            {journey.planning&&<section className="mj-ai-summary" aria-label={copy('Sana özel plan','Your personal itinerary','Itinerari yt personal')}>
              <span>{copy('SANA ÖZEL ROTA','PLANNED FOR YOU','PLANIFIKUAR PËR TY')}</span>
              <strong>{activeDay&&!journey.planning.edited?<RouteTranslation text={journey.planning.days.find(day=>day.day===activeDay)?.theme||''} sourceLocale={journey.planning?.locale} accessToken={accessToken}/>:copy('Seyahatinin fikri','The idea behind your trip','Ideja e udhëtimit tënd')}</strong>
              <p><RouteTranslation text={(activeDay&&!journey.planning.edited?journey.planning.days.find(day=>day.day===activeDay)?.explanation:journey.planning.summary)||''} sourceLocale={journey.planning?.locale} accessToken={accessToken}/></p>
              {journey.planning.edited&&<small>{copy('Planı düzenledin. Bu açıklama ilk AI önerisine aittir.','You edited this plan. This explanation describes the original AI suggestion.','E ndryshove planin. Ky shpjegim i përket sugjerimit fillestar të AI.')}</small>}
              {journey.planning.limitations.length>0&&<details><summary>{copy('Gitmeden önce','Before you go','Para nisjes')}</summary>{journey.planning.limitations.map((item,index)=><p key={index}><RouteTranslation text={item} sourceLocale={journey.planning?.locale} accessToken={accessToken}/></p>)}</details>}
              <button onClick={()=>{setSurveyScope(journey.id);setSurveyValues({area:{...journey.center,name:journey.city},dayCount:journey.dayCount,startDate:journey.startDate,firstDayStartTime:journey.firstDayStartTime,...journey.planning!.preferences});setStep('setup');setGenerationError('');}}>{copy('Tercihlerimi değiştir','Change my preferences','Ndrysho preferencat')}</button>
            </section>}
            <div className="mj-plan-actions"><strong>{activeDay?dayName(activeDay):copy('Tüm günler','All days','Të gjitha ditët')}</strong><button onClick={()=>{safeChange(()=>optimizeJourney(journey,activeDay||undefined,legs));setNotice(copy('Yakınlık ve mevcut yol sürelerine göre düzenlendi. Sabit saatler ve öncelikler korundu.','Arranged using proximity and available travel times. Fixed times and priorities are preserved.','U rregullua sipas afërsisë dhe kohëve të disponueshme. Orët fikse dhe përparësitë ruhen.'));}}>{copy('Rotayı iyileştir','Improve route','Përmirëso itinerarin')}</button></div>
            {visibleRoutes.length>0&&<div className="mj-walking-summary" role="status"><strong>{walkingDistance} km · {Math.ceil(walkingSeconds/60)} {copy('dk yürüme','min walk','min ecje')}</strong><small>{visibleRoutes.length<eligibleDays.length?copy('Hesaplanan günler · ','Calculated days · ','Ditët e llogaritura · '):''}{walkingSource}</small></div>}
            <p className="mj-route-status" role="status">{!eligibleDays.length?copy('Yürüyüş rotasını görmek için aynı güne en az iki mekân ekle.','Add at least two places to the same day to see a walking route.','Shto të paktën dy vende në të njëjtën ditë për të parë rrugën në këmbë.'):routeStatus==='loading'?copy('Yürüme yolları kontrol ediliyor…','Checking walking routes…','Duke kontrolluar rrugët në këmbë…'):routeStatus==='unavailable'&&visibleRoutes.length<eligibleDays.length?copy('Bazı yürüme güzergâhları hesaplanamadı. Eksik yollar ve süreleri gösterilmiyor; ilgili program saatleri yaklaşık.','Some walking routes are unavailable. Missing paths and travel times are omitted; affected itinerary times are provisional.','Disa rrugë në këmbë nuk u llogaritën. Rrugët dhe kohët që mungojnë nuk shfaqen; oraret përkatëse janë të përafërta.'):copy('Yürüme süresine ziyaretler ve molalar dahil değil.','Walking time excludes visits and breaks.','Koha e ecjes nuk përfshin vizitat dhe pushimet.')}</p>
            {routeStatus==='unavailable'&&visibleRoutes.length<eligibleDays.length&&<button className="mj-text-button" onClick={()=>setRouteRetry(value=>value+1)}>{copy('Yolu tekrar hesapla','Retry walking route','Provo rrugën sërish')}</button>}
            {(activeDay?[activeDay]:daysArray).map(day=>{const stops=journeyDayStops(journey,day);const schedule=scheduleJourneyDay(journey,day,legs);return <div key={day} className="mj-day-list">{activeDay===null&&<h4 style={{color:dayColors[(day-1)%dayColors.length]}}>{dayName(day)}</h4>}{!stops.length&&<p className="mj-empty">{copy('Bu gün boş. Keşfettiğin bir mekânı ekle.','This day is empty. Add a place you discover.','Kjo ditë është bosh. Shto një vend të zbuluar.')}</p>}{stops.map((stop,index)=>{const timing=schedule.stops.find(s=>s.stopId===stop.id);return <article key={stop.id} className={`mj-stop ${selectedId===stop.place.id?'selected':''}`}><JourneyPlacePhoto place={withPhoto(stop.place)} compact/><button className="mj-stop-main" data-guide="journey-edit" onClick={()=>selectPlace(stop.place.id,day)}><span className="mj-stop-number" style={{background:dayColors[(day-1)%dayColors.length]}}>{index+1}</span><span><small>{timing?`${timing.timing==='provisional'?'≈ ':''}${formatJourneyTime(timing.startMinutes)}`:''} · {stop.durationMinutes} {copy('dk','min','min')}{stop.fixedTime?` · ${copy('Sabit saat','Fixed time','Orë fikse')}`:''}</small><strong>{stop.place.name||label(stop.place)}</strong><small>{label(stop.place)}</small>{stop.note&&<small className="mj-stop-reason"><RouteTranslation text={stop.note} sourceLocale={journeyStopNoteLocale(journey, stop)} accessToken={accessToken}/></small>}</span><Icon name="chevron" size={16}/></button>{timing&&timing.travelMinutes!==null&&index>0&&<p className="mj-travel-time">↗ {Math.ceil(timing.travelMinutes)} {copy('dk yürüme','min walk','min ecje')} · {routes[day]?.sourceUrl==='https://maps.apple.com/'?'Apple Maps':'OpenRouteService'}</p>}{timing?.issues.filter(issue=>issue!=='hours-unknown'&&issue!=='travel-unknown').map(issue=><p className="mj-warning" key={issue}>{issueLabel(issue)}</p>)}<div className="mj-stop-actions"><button aria-label={`${stop.place.name}: ${copy('Yukarı taşı','Move up','Lëviz lart')}`} disabled={index===0} onClick={()=>safeChange(()=>reorderJourneyStop(journey,stop.id,-1))}>↑</button><button aria-label={`${stop.place.name}: ${copy('Aşağı taşı','Move down','Lëviz poshtë')}`} disabled={index===stops.length-1} onClick={()=>safeChange(()=>reorderJourneyStop(journey,stop.id,1))}>↓</button><button data-guide="journey-edit" onClick={()=>selectPlace(stop.place.id,day)}>{copy('Düzenle / başka güne taşı','Edit / move to another day','Ndrysho / lëviz në ditë tjetër')}</button></div>{schedule.breaks.filter(rest=>rest.afterStopId===stop.id).map((rest,i)=><p key={i} className="mj-break">☕ {rest.durationMinutes} {copy('dk','min','min')} · {rest.kind==='meal'?copy('Yemek molası','Meal break','Pushim për ushqim'):copy('Dinlenme','Rest','Pushim')}</p>)}</article>;})}</div>;})}
            <button className="mj-add-stop" onClick={()=>void discover('route')}>＋ {copy('Yeni mekân ekle','Add a place','Shto një vend')}</button>{onUpdateTrip&&initialJourney?.id===journey.id&&<button className="mj-text-button" disabled={saveBusy} onClick={()=>void save(true)}>{copy('Planlarıma kopya kaydet','Save a copy to my plans','Ruaj një kopje te planet')}</button>}<button className="mj-text-button" onClick={()=>{setStep('setup');setSurveyScope('new');setSurveyValues(undefined);setGenerationError('');setSavedJourneys(readMapJourneys(ownerId));}}>{copy('Başka bir plan oluştur veya aç','Create or open another plan','Krijo ose hap një plan tjetër')}</button>
          </>}
        </div>
      </section>
    </div>
    {closePrompt}
  </div>;
}

function AddPlace({dayCount,initialDay,onAdd}:{dayCount:number;initialDay:number;onAdd:(day:number,duration:number,note:string)=>void}) {
  const {copy}=useI18n();const [day,setDay]=useState(initialDay);const[duration,setDuration]=useState(45);const[note,setNote]=useState('');
  return <div className="mj-stop-editor"><div className="mj-fields"><label>{copy('Hangi gün?','Which day?','Cila ditë?')}<select value={day} onChange={e=>setDay(Number(e.target.value))}>{Array.from({length:dayCount},(_,i)=><option key={i} value={i+1}>{copy(`${i+1}. gün`,`Day ${i+1}`,`Dita ${i+1}`)}</option>)}</select></label><label>{copy('Ziyaret (dk)','Visit (min)','Vizita (min)')}<input type="number" min={5} max={480} step={5} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label></div><label>{copy('Not (isteğe bağlı)','Note (optional)','Shënim (opsional)')}<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></label><button className="mj-primary" disabled={duration<5||duration>480} onClick={()=>onAdd(day,duration,note)}>{copy('Planıma ekle','Add to my plan','Shto në planin tim')}</button></div>;
}
function StopEditor({stop,dayCount,onChange,onMove,onRemove}:{stop:JourneyStop;dayCount:number;onChange:(patch:Partial<Pick<JourneyStop,'durationMinutes'|'note'|'fixedTime'|'priority'>>)=>void;onMove:(day:number)=>void;onRemove:()=>void}) {
  const {copy}=useI18n();const[duration,setDuration]=useState(stop.durationMinutes);const[note,setNote]=useState(stop.note);const[time,setTime]=useState(stop.fixedTime||'');const[priority,setPriority]=useState(stop.priority);
  return <div className="mj-stop-editor"><label>{copy('Başka güne taşı','Move to another day','Lëviz në ditë tjetër')}<select value={stop.day} onChange={e=>onMove(Number(e.target.value))}>{Array.from({length:dayCount},(_,i)=><option key={i} value={i+1}>{copy(`${i+1}. gün`,`Day ${i+1}`,`Dita ${i+1}`)}</option>)}</select></label><div className="mj-fields"><label>{copy('Ziyaret (dk)','Visit (min)','Vizita (min)')}<input type="number" min={5} max={480} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><label>{copy('Sabit rezervasyon saati','Fixed booking time','Ora fikse e rezervimit')}<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><label>{copy('Not','Note','Shënim')}<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></label><label className="mj-check"><input type="checkbox" checked={priority==='high'} onChange={e=>setPriority(e.target.checked?'high':'normal')}/>{copy('Öncelikli durak; sırasını koru','Priority stop; keep its position','Ndalesë me përparësi; ruaj pozicionin')}</label><div className="mj-action-row"><button className="mj-primary" disabled={duration<5||duration>480} onClick={()=>onChange({durationMinutes:duration,note,fixedTime:time||null,priority})}>{copy('Değişiklikleri uygula','Apply changes','Zbato ndryshimet')}</button><button className="mj-remove" onClick={onRemove}>{copy('Plandan çıkar','Remove','Hiq nga plani')}</button></div></div>;
}
