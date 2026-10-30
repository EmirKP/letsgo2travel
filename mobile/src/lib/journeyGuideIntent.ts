export type JourneyGuideIntent={journeyId:string;day:number;tripId?:string};
export type JourneyGuideRequest=JourneyGuideIntent&{requestId:number};
const journeyIdPattern=/^[a-zA-Z0-9._:/-]{1,160}$/;
const tripIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJourneyGuideUrl(value:string):boolean {
  try{const url=new URL(value);return url.protocol==='letsgo2travel:'&&url.hostname==='journey';}catch{return false;}
}
/** Dedicated native URI; malformed guide links never fall through to flight navigation. */
export function journeyGuideIntentFromUrl(value:string):JourneyGuideIntent|null {
  if(typeof value!=='string'||value!==value.trim()||value.length>1200)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='letsgo2travel:'||url.hostname!=='journey'||url.username||url.password||url.port||url.hash||!['','/'].includes(url.pathname))return null;
    const allowed=new Set(['journeyId','day','tripId']);
    let invalidParameter=false;url.searchParams.forEach((_,name)=>{if(!allowed.has(name)||url.searchParams.getAll(name).length!==1)invalidParameter=true;});if(invalidParameter)return null;
    const journeyId=url.searchParams.get('journeyId')||'',dayText=url.searchParams.get('day')||'',tripId=url.searchParams.get('tripId');
    if(!journeyIdPattern.test(journeyId)||!/^([1-9]|1[0-4])$/.test(dayText)||tripId!==null&&!tripIdPattern.test(tripId))return null;
    return{journeyId,day:Number(dayText),...(tripId?{tripId:tripId.toLowerCase()}: {})};
  }catch{return null;}
}
