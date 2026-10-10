import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { SocialNotificationPreferences } from "../../../lib/community/social-contract";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";

type Preferences = SocialNotificationPreferences;
const endpoint = "/api/country-community/social/preferences";
export function NotificationPreferences({ accessToken }: { accessToken: string }) {
  return <NotificationPreferencesSession key={accessToken} accessToken={accessToken} />;
}

function checkedPreferences(value: unknown): Preferences {
  const keys = ["comments", "replies", "follows", "price_alert_email", "price_alert_push"] as const;
  if (!value || typeof value !== "object" || !keys.every(key => typeof (value as Record<string, unknown>)[key] === "boolean")) {
    throw new Error("Invalid notification preferences response");
  }
  return Object.fromEntries(keys.map(key => [key, (value as Preferences)[key]])) as Preferences;
}

function NotificationPreferencesSession({ accessToken }: { accessToken: string }) {
  const { copy } = useI18n();
  const [preferences,setPreferences] = useState<Preferences|null>(null);
  const [error,setError] = useState(false);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(Boolean(accessToken));
  const [retry,setRetry] = useState(0);
  const request = useRef<AbortController|null>(null);
  const locked = useRef(Boolean(accessToken));
  useEffect(() => {
    if (!accessToken) return;
    const controller=new AbortController();request.current=controller;locked.current=true;setLoading(true);setError(false);
    void requestJson<{data:Preferences}>(endpoint,{headers:{Authorization:`Bearer ${accessToken}`},signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setPreferences(checkedPreferences(result.data));})
      .catch(()=>{if(!controller.signal.aborted)setError(true);})
      .finally(()=>{if(!controller.signal.aborted){locked.current=false;setLoading(false);}});
    return ()=>{controller.abort();request.current?.abort();};
  },[accessToken,retry]);
  async function handlePreferenceChange(event: ChangeEvent<HTMLInputElement>) {
    if(locked.current||!preferences)return;
    const key = event.target.name as keyof Preferences;
    const value = event.target.checked;
    if (!Object.hasOwn(preferences, key)) return;
    const controller=new AbortController();request.current=controller;locked.current=true;setBusy(true);setError(false);
    try {
      const result=await requestJson<{data:Preferences}>(endpoint,{method:"PATCH",headers:{Authorization:`Bearer ${accessToken}`},body:{[key]:value},signal:controller.signal});
      if(!controller.signal.aborted)setPreferences(checkedPreferences(result.data));
    } catch {if(!controller.signal.aborted)setError(true);}
    finally{if(!controller.signal.aborted){locked.current=false;setBusy(false);}}
  }
  const labels:Record<keyof Preferences,string>={comments:copy("Gönderilerime yorumlar","Comments on my posts","Komente në postimet e mia"),replies:copy("Yorumlarıma yanıtlar","Replies to my comments","Përgjigje ndaj komenteve të mia"),follows:copy("Yeni takipçiler","New followers","Ndjekës të rinj"),price_alert_email:copy("Fiyat alarmı e-postaları","Price alert emails","Email për njoftimet e çmimeve"),price_alert_push:copy("Fiyat alarmı telefon bildirimleri","Price alert push notifications","Njoftime çmimesh në telefon")};
  return <div className="settings-card notification-preferences" aria-busy={busy||loading}>
    <p>{copy("Yorum, yanıt ve takipçi haberleri bildirim merkezine gelir. Fiyat alarmlarının e-posta ve telefon kanallarını ayrıca seçebilirsin.","Comments, replies and followers appear in your notification center. Choose email and push channels for price alerts separately.","Komentet, përgjigjet dhe ndjekësit shfaqen në qendrën e njoftimeve. Zgjidh veçmas email dhe telefon për çmimet.")}</p>
    {preferences && (Object.keys(labels) as (keyof Preferences)[]).map(key=><label key={key}><span>{labels[key]}</span><input type="checkbox" name={key} checked={preferences[key]} disabled={busy||loading} onChange={handlePreferenceChange}/></label>)}
    {loading&&<p role="status">{copy("Tercihler yükleniyor…","Loading preferences…","Po ngarkohen preferencat…")}</p>}
    {!accessToken&&<p>{copy("Bildirim tercihlerini düzenlemek için giriş yap.","Sign in to manage notification preferences.","Hyr për të ndryshuar preferencat e njoftimeve.")}</p>}
    {error&&<div role="alert"><p>{copy("Tercihler alınamadı veya kaydedilemedi. Yeniden dene.","Preferences could not be loaded or saved. Try again.","Preferencat nuk u ngarkuan ose ruajtën. Provo sërish.")}</p><button type="button" disabled={busy||loading} onClick={()=>{if(locked.current)return;locked.current=true;setLoading(true);setRetry(value=>value+1);}}>{copy("Tekrar dene","Retry","Provo sërish")}</button></div>}
  </div>;
}
