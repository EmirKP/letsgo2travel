"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { readSavedPlanDetail, type SavedPlanDetailData } from "@/lib/saved-plan-detail";
import styles from "../plans.module.css";

export default function SavedPlanDetail() {
  const id = useSearchParams().get("id") || "";
  const [plan, setPlan] = useState<SavedPlanDetailData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true, generation = 0;
    const load = async (ownerId: string | null) => {
      const request = ++generation;
      setPlan(null); setMessage(""); setLoading(true);
      if (!ownerId) { setMessage("Bu planı açmak için hesabına giriş yapmalısın."); setLoading(false); return; }
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) { setMessage("Geçerli bir kayıt seçilmedi."); setLoading(false); return; }
      try {
        const result = await supabase.from("user_trips").select("id,title,destination,trip_data,created_at").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (!active || request !== generation) return;
        if (result.error) throw result.error;
        const saved = readSavedPlanDetail(result.data);
        if (!saved) setMessage("Bu kayıt bulunamadı veya saklanmış rota ayrıntısı içermiyor.");
        else setPlan(saved);
      } catch { if (active && request === generation) setMessage("Plan yüklenemedi. Bağlantını kontrol edip tekrar dene."); }
      finally { if (active && request === generation) setLoading(false); }
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { if (active) void load(session?.user.id || null); });
    const initialGeneration = generation;
    void supabase.auth.getSession().then(({ data }) => { if (active && generation === initialGeneration) void load(data.session?.user.id || null); }).catch(() => {
      if (active && generation === initialGeneration) { setMessage("Hesap bağlantısı kurulamadı."); setLoading(false); }
    });
    return () => { active = false; generation++; subscription.subscription.unsubscribe(); };
  }, [id, revision]);
  return <div className={styles.page}>
    <section className={styles.hero}><div className={styles.heroInner}>
      <Link href="/planlarim" className={styles.kicker}><ArrowLeft size={18}/> Planlarıma dön</Link>
      <h1>{plan?.title || "Kayıtlı rota"}</h1>
      <p>Kaydettiğin planın ayrıntıları. Tarihler, fiyatlar ve giriş koşulları rezervasyon veya güncel bilgi garantisi değildir.</p>
    </div></section>
    <main className={styles.content}>
      {loading && <p role="status">Plan yükleniyor…</p>}
      {message && <div className={styles.detailPanel} role="alert"><p>{message}</p><button className={styles.secondary} onClick={() => setRevision(value => value + 1)}>Tekrar dene</button></div>}
      {plan && <>
        <section className={styles.detailPanel}><p>{plan.summary}</p><small><CalendarDays size={15}/> Kayıt tarihi: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(plan.createdAt))}</small>{plan.preferences && <p>{plan.preferences}</p>}</section>
        {plan.routes.map((route, index) => <article key={index} className={styles.detailPanel}>
          <span className={styles.kicker}><MapPin size={17}/>{route.country}</span><h2>{route.name}</h2><p>{route.why}</p>
          <dl className={styles.detailFacts}><div><dt>Tahmini bütçe</dt><dd>{route.estimatedBudget || "Belirtilmemiş"}</dd></div><div><dt>Süre</dt><dd>{route.idealDuration || "Belirtilmemiş"}</dd></div></dl>
          {route.dailyPlan.length > 0 && <><h3>Kaydedilen gezi planı</h3><ol className={styles.detailDays}>{route.dailyPlan.map((day, i) => <li key={i}>{day}</li>)}</ol></>}
          {route.visaNote && <p>{route.visaNote}</p>}{route.visaVerifiedAt && <small>Kaynak kontrol tarihi: {route.visaVerifiedAt}</small>}
          {route.visaSourceUrl && <p><a href={route.visaSourceUrl} target="_blank" rel="noopener noreferrer">Kaydedilen resmî giriş kaynağı</a></p>}
          {route.warnings.length > 0 && <ul>{route.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
        </article>)}
      </>}
    </main>
  </div>;
}
