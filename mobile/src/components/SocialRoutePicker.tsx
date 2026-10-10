import { useState } from "react";
import { Sheet } from "./Sheet";
import { useI18n } from "../lib/i18n";
import { getSavedRoutePlans, saveRoutePlan } from "../lib/storage";
import { appendSocialPlace, findSocialRoute } from "../lib/socialRoute";
import type { SocialPlace } from "../lib/social";

export function SocialRoutePicker({place,ownerId,onClose,onNotice,onCreate}:{place:SocialPlace;ownerId?:string|null;onClose:()=>void;onNotice:(message:string)=>void;onCreate:(place:SocialPlace)=>void}) {
 const {copy}=useI18n();
 const [plans]=useState(()=>getSavedRoutePlans(ownerId));
 const options=plans.flatMap(saved=>saved.plan.routes.map((route,index)=>({saved,route,index,key:JSON.stringify([saved.id,index])})));
 const [selected,setSelected]=useState(options[0]?.key||'');
 const [day,setDay]=useState(0);
 const [error,setError]=useState('');
 const chosen=options.find(item=>item.key===selected);
 function add(){
  if(!chosen)return;
  try{
   const current=getSavedRoutePlans(ownerId).find(item=>item.id===chosen.saved.id);
   if(!current)throw Error('missing');
   const currentIndex=findSocialRoute(current,chosen.route);
   if(currentIndex<0)throw Error('changed');
   saveRoutePlan(appendSocialPlace(current,currentIndex,day,place.name),ownerId);
   onNotice(copy('Yer rotana eklendi. Planlar bölümünden açabilirsin.','Place added to your route. Open it in Plans.','Vendi u shtua në itinerar. Hape te Planet.'));onClose();
  }catch{setError(copy('Yer eklenemedi. Rota silinmiş veya günün notları dolmuş olabilir; başka bir gün seçip tekrar dene.','Could not add the place. The route may have been removed or the day is full; select another day and retry.','Vendi nuk u shtua. Itinerari mund të jetë fshirë ose dita është plot; zgjidh një ditë tjetër dhe provo sërish.'));}
 }
 return <Sheet open title={copy('Rotama ekle','Add to my route','Shto në itinerarin tim')} onClose={onClose}><div className="ta-panel ta-form">
  <h3>{place.name}</h3>
  {options.length>0?<><label>{copy('Kayıtlı rota','Saved route','Itinerari i ruajtur')}<select value={selected} onChange={event=>{setSelected(event.target.value);setDay(0);setError('');}}>{options.map(item=><option key={item.key} value={item.key}>{item.route.name}</option>)}</select></label><label>{copy('Gün','Day','Dita')}<select value={day} onChange={event=>setDay(Number(event.target.value))}>{chosen?.route.dailyPlan.map((_,index)=><option key={index} value={index}>{copy(`${index+1}. gün`,`Day ${index+1}`,`Dita ${index+1}`)}</option>)}</select></label><button type="button" className="primary-wide" disabled={!chosen || !chosen.route.dailyPlan.length} onClick={add}>{copy('Bu güne ekle','Add to this day','Shto në këtë ditë')}</button></>:<p>{copy('Henüz kayıtlı rotan yok. Bu yer için bir plan oluşturabilirsin.','No saved routes yet. Create a plan for this place.','Nuk ke itinerare të ruajtura. Krijo një plan për këtë vend.')}</p>}
  <button type="button" className="secondary-wide" onClick={()=>{onClose();onCreate(place);}}>{copy('Yeni rota oluştur','Create a new route','Krijo itinerar të ri')}</button>
  {error&&<p role="alert">{error}</p>}
 </div></Sheet>;
}
