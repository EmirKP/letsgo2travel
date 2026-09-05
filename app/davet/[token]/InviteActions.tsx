"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import styles from "./invite.module.css";

export function InviteActions({ token }: {token:string}) {
  const [ready,setReady] = useState(false);
  const [signedIn,setSignedIn] = useState(false);
  const [busy,setBusy] = useState(false);
  const [joined,setJoined] = useState(false);
  const [error,setError] = useState("");
  const next = `/davet/${encodeURIComponent(token)}`;
  const appUrl = `tr.com.letsgo2travel.app://open?tripInvite=${encodeURIComponent(token)}`;
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({data,error}) => {
      if (live) { setSignedIn(Boolean(data.session)); setReady(true); if(error) setError("Oturum okunamadı. Yeniden giriş yapabilirsin."); }
    }).catch(() => { if(live) { setReady(true); setError("Oturum okunamadı. Yeniden giriş yapabilirsin."); } });
    const {data} = supabase.auth.onAuthStateChange((_event,session) => { if(live) { setSignedIn(Boolean(session)); setReady(true); } });
    return () => { live=false; data.subscription.unsubscribe(); };
  },[]);
  const join = async () => {
    if(busy) return;
    setBusy(true); setError("");
    try {
      const {data} = await supabase.auth.getSession();
      if(!data.session) { setSignedIn(false); throw new Error("Katılmak için yeniden giriş yap."); }
      const response = await fetch("/api/trip-collaboration",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({action:"accept_invite",inviteCode:token})});
      const result = await response.json();
      if(!response.ok) throw new Error(result.error || "Davete katılınamadı. Tekrar dene.");
      setJoined(true);
    } catch(error) { setError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Yeniden dene."); }
    finally { setBusy(false); }
  };
  return <>
    {joined ? <div className={styles.flow} role="status"><strong>Seyahate katıldın ✓</strong><span>Bu hesapla uygulamaya giriş yaptığında Seyahatlerim → Ortak seyahat bölümünde planını göreceksin.</span></div>
      : !ready ? <p role="status">Oturum kontrol ediliyor…</p>
        : signedIn ? <button className={styles.primary} disabled={busy} onClick={() => void join()}>{busy ? "Katılınıyor…" : "Seyahate katıl"}</button>
          : <><Link className={styles.primary} href={`/auth/login?next=${encodeURIComponent(next)}`}>Giriş yap ve davete dön</Link><Link className={styles.secondary} href={`/auth/register?next=${encodeURIComponent(next)}`}>Hesap oluştur</Link></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <a className={styles.secondary} href={appUrl}>Uygulamada aç</a>
    <div className={styles.flow}><strong>Bağlantıdan da katılabilirsin</strong><span>Uygulama açılmıyorsa yukarıdan hesabına giriş yapıp daveti kabul et. Davet hesabına kaydedilir; yeniden kod girmen gerekmez.</span></div>
  </>;
}
