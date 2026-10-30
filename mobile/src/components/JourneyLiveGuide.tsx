import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { journeyDayStops, formatJourneyTime, scheduleJourneyDay, type MapJourney } from "../lib/mapJourney";
import { completeJourneyStop, endJourneyProgress, journeyProgressIsActive, persistReconciledJourneyProgress, readJourneyProgress, startJourneyProgress, subscribeJourneyProgress, type JourneyProgress } from "../lib/journeyProgress";
import { journeyLiveActivityAvailability, syncJourneyLiveActivity, syncJourneyLiveActivityOwner, type JourneyActivityResult } from "../lib/journeyLiveActivity";
import { onAccountResume } from "../lib/accountResume";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import "./journey-live-guide.css";

export type JourneyLiveGuideProps={journey:MapJourney;day:number;ownerId?:string|null;tripId?:string;onOpenPlan?:()=>void;beforeStart?:()=>Promise<boolean>};

export function JourneyLiveGuide({journey,day,ownerId,tripId,onOpenPlan,beforeStart}:JourneyLiveGuideProps) {
  const {copy,locale}=useI18n();
  const identity=`${ownerId||"guest"}:${journey.id}:${day}`;
  const live=useRef(identity);
  const liveJourney=useRef(journey);
  useLayoutEffect(()=>{live.current=identity;liveJourney.current=journey;return()=>{if(live.current===identity)live.current="";};},[identity,journey]);
  const starting=useRef(false);
  const [preparing,setPreparing]=useState(false);
  const [snapshot,setSnapshot]=useState<{identity:string;progress:JourneyProgress|null;failed:boolean}>({identity,progress:null,failed:false});
  const [nativeState,setNativeState]=useState<JourneyActivityResult|null>(null);
  const [updating,setUpdating]=useState(false);
  const [error,setError]=useState("");
  const progress=snapshot.identity===identity?snapshot.progress:null;
  const nativeResult=snapshot.identity===identity?nativeState:null;
  const failed=snapshot.identity===identity&&snapshot.failed;
  const active=progress?journeyProgressIsActive(progress):false;
  const stops=journeyDayStops(journey,day);
  const completed=new Set(progress?.completedStopIds||[]);
  const next=stops.find(stop=>!completed.has(stop.id));
  const schedule=scheduleJourneyDay(journey,day).stops.find(stop=>stop.stopId===next?.id);
  const progressSignature=progress?JSON.stringify(progress):"";

  useEffect(()=>{
    let mounted=true;live.current=identity;
    const reload=()=>{if(!mounted)return;try{setSnapshot({identity,progress:readJourneyProgress(ownerId,journey,day),failed:false});}catch{setSnapshot({identity,progress:null,failed:true});}};
    setError("");setNativeState(null);
    try{persistReconciledJourneyProgress(ownerId,journey,day);}catch{/* Leave unreadable progress intact and offer retry. */}
    reload();
    const unsubscribe=subscribeJourneyProgress(ownerId,reload),resume=onAccountResume(reload);
    void syncJourneyLiveActivityOwner(ownerId).then(()=>journeyLiveActivityAvailability()).then(result=>{if(mounted&&live.current===identity)setNativeState(result);});
    return()=>{mounted=false;unsubscribe();resume();};
  },[identity,ownerId,journey,day]);
  useEffect(()=>{
    if(!progress?.startedAt)return;
    let mounted=true;
    setUpdating(true);
    void syncJourneyLiveActivity(ownerId,journey,day,progress,locale,tripId).then(result=>{if(mounted&&live.current===identity)setNativeState(result);}).finally(()=>{if(mounted)setUpdating(false);});
    return()=>{mounted=false;};
  },[identity,ownerId,journey,day,progressSignature,locale,tripId]);
  useEffect(()=>{
    if(!active||!progress?.expiresAt)return;
    const timer=setTimeout(()=>{try{setSnapshot({identity,progress:persistReconciledJourneyProgress(ownerId,journey,day),failed:false});}catch{setSnapshot({identity,progress:null,failed:true});}},Math.max(0,Date.parse(progress.expiresAt)-Date.now()));
    return()=>clearTimeout(timer);
  },[identity,ownerId,journey,day,active,progress?.expiresAt]);

  const change=(operation:()=>JourneyProgress)=>{
    if(live.current!==identity)return;
    try{const nextProgress=operation();setSnapshot({identity,progress:nextProgress,failed:false});setError("");}
    catch{setError(copy("İlerleme kaydedilemedi. Mevcut kaydın korundu; yeniden dene.","Progress could not be saved. Your existing record is kept; retry.","Progresi nuk u ruajt. Regjistrimi ekzistues ruhet; provo sërish."));}
  };
  const start=async()=>{
    if(starting.current||live.current!==identity)return;
    starting.current=true;setPreparing(true);setError('');
    try{
      const saved=beforeStart?await beforeStart():true;
      if(live.current!==identity||liveJourney.current!==journey)return;
      if(!saved){setError(copy('Plan saklanamadı veya değişti. Gezi başlamadı; kaydı kontrol edip yeniden dene.','The plan could not be saved or changed. The guide did not start; check the saved plan and retry.','Plani nuk u ruajt ose ndryshoi. Udhëzuesi nuk nisi; kontrollo planin dhe provo sërish.'));return;}
      change(()=>startJourneyProgress(ownerId,journey,day));
    }catch{if(live.current===identity)setError(copy('Plan kaydedilemedi. Gezi rehberi başlamadı.','The plan could not be saved. The itinerary guide did not start.','Plani nuk u ruajt. Udhëzuesi nuk nisi.'));}
    finally{starting.current=false;if(live.current===identity)setPreparing(false);}
  };
  if(!stops.length)return null;
  return <section className="journey-live-guide" aria-label={copy("Canlı gezi rehberi","Live itinerary guide","Udhëzuesi i udhëtimit")}>
    <header><Icon name="route" size={22}/><div><h3>{copy("Gezi rehberin","Your itinerary guide","Udhëzuesi yt")}</h3><p>{copy(`${day}. gün · ${completed.size}/${stops.length} durak tamamlandı`,`Day ${day} · ${completed.size}/${stops.length} stops completed`,`Dita ${day} · ${completed.size}/${stops.length} ndalesa të përfunduara`)}</p></div></header>
    {error&&<p className="journey-live-error" role="alert">{error}</p>}
    {failed?<div role="alert"><p>{copy("Kayıtlı ilerlemen okunamadı. Veriler değiştirilmedi.","Saved progress could not be read. Your data was not changed.","Progresi i ruajtur nuk u lexua. Të dhënat nuk ndryshuan.")}</p><button type="button" onClick={()=>change(()=>readJourneyProgress(ownerId,journey,day))}>{copy("Yeniden oku","Read again","Lexo përsëri")}</button></div>
      :active?<>
        {next&&<div className="journey-live-next"><small>{copy("SIRADAKİ DURAK","NEXT STOP","NDALESA TJETËR")}</small><strong>{next.place.name}</strong>{schedule&&schedule.startMinutes>=0&&schedule.startMinutes<1440&&<span>{copy("Planlanan saat","Planned time","Ora e planifikuar")} · {formatJourneyTime(schedule.startMinutes)}{schedule.timing==="provisional"?copy(" · tahmini"," · estimate"," · vlerësim"):""}</span>}</div>}
        <progress value={completed.size} max={stops.length} aria-label={copy("Tamamlanan duraklar","Completed stops","Ndalesat e përfunduara")}/>
        <ol>{stops.map(stop=><li key={stop.id}><button type="button" aria-pressed={completed.has(stop.id)} onClick={()=>change(()=>completeJourneyStop(ownerId,journey,day,stop.id,!completed.has(stop.id)))}><Icon name={completed.has(stop.id)?"check":"compass"} size={18}/><span>{stop.place.name}</span><small>{completed.has(stop.id)?copy("Tamamlandı","Completed","Përfunduar"):copy("Tamamla","Complete","Përfundo")}</small></button></li>)}</ol>
        <button className="journey-live-end" type="button" onClick={()=>change(()=>endJourneyProgress(ownerId,journey,day))}>{copy("Gezi rehberini bitir","End itinerary guide","Mbyll udhëzuesin")}</button>
      </>:<><p>{progress?.startedAt?completed.size===stops.length?copy("Bugünün duraklarını tamamladın.","You completed today's stops.","Përfundove ndalesat e sotme."):copy("Gezi rehberi sona erdi. Kaydedilen durakların duruyor.","The itinerary guide ended. Your completed stops are kept.","Udhëzuesi përfundoi. Ndalesat e kryera ruhen."):copy("Duraklarını tamamladıkça işaretle; sıradaki durak burada hazır olsun.","Mark stops as you complete them and keep the next stop ready here.","Shëno ndalesat kur i përfundon dhe shiko ndalesën tjetër këtu.")}</p><button className="journey-live-start" type="button" disabled={!progress||preparing} onClick={()=>void start()}><Icon name="route" size={18}/>{preparing?copy("Plan kaydediliyor…","Saving the plan…","Po ruhet plani…"):copy("Bugünkü geziyi başlat","Start today's itinerary","Nis udhëtimin e sotëm")}</button>{beforeStart&&<p className="journey-live-limit">{copy("Başlatınca plan kaydedilir.","Starting saves the plan first.","Nisja e ruan planin së pari.")}</p>}</>}
    <p className="journey-live-device" role="status">{updating&&nativeResult?.available?copy("iPhone görünümü güncelleniyor…","Updating the iPhone view…","Po përditësohet pamja në iPhone…"):nativeResult?.active?copy("iPhone kilit ekranında ve desteklenen Dynamic Island’da açık.","Open on the iPhone Lock Screen and supported Dynamic Island.","Hapur në ekranin e kyçur të iPhone dhe Dynamic Island të mbështetur."):nativeResult?.reason==="failed"?copy("iPhone görünümü açılamadı; ilerlemen burada kayıtlı.","The iPhone view could not open; your progress is saved here.","Pamja në iPhone nuk u hap; progresi ruhet këtu."):nativeResult?.available?active?copy("iPhone görünümü kapalı; ilerlemen burada kayıtlı.","The iPhone view is closed; your progress is saved here.","Pamja në iPhone është mbyllur; progresi ruhet këtu."):copy("Başlatınca iPhone kilit ekranında görünür.","Starting opens it on the iPhone Lock Screen.","Nisja e hap në ekranin e kyçur të iPhone."):copy("İlerleme burada saklanır. Kilit ekranı ve Dynamic Island, Live Activities açık olan uyumlu iPhone’larda kullanılabilir.","Progress stays here. Lock Screen and Dynamic Island need a compatible iPhone with Live Activities enabled.","Progresi ruhet këtu. Ekrani i kyçur dhe Dynamic Island kërkojnë iPhone të përshtatshëm me Live Activities aktive.")}</p>
    <p className="journey-live-limit">{copy("En fazla 8 saat. İlerleme sen işaretledikçe değişir; konumun izlenmez.","Up to 8 hours. Progress changes when you mark a stop; your location is not tracked.","Deri në 8 orë. Progresi ndryshon kur shënon një ndalesë; vendndodhja nuk gjurmohet.")}</p>
    {onOpenPlan&&<button className="journey-live-plan" type="button" onClick={onOpenPlan}>{copy("Planı aç","Open plan","Hap planin")}<Icon name="chevron" size={16}/></button>}
  </section>;
}
