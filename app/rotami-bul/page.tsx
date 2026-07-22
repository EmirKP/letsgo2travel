"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CalendarDays, Compass, ShieldCheck, Sparkles, Wallet } from "lucide-react";

export default function RouteWizardPage() {
  const router = useRouter();
  const [budget, setBudget] = useState("15.000 TL altı");
  const [visa, setVisa] = useState("Sadece vizesiz");
  const [days, setDays] = useState("3 gün");

  const startPlanning = () => {
    const query = new URLSearchParams({ budget, visa, days });
    router.push(`/rota-asistani?${query.toString()}`);
  };

  return (
    <div className="l2t-route-wizard-v25">
      <div className="l2t-wrap l2t-route-wizard-shell">
        <div className="l2t-route-wizard-photo">
          <Image src="/travel-images/route-saraybosna.jpg" alt="Saraybosna seyahat rotası" fill priority sizes="(max-width: 850px) 92vw, 48vw" />
          <div><span><Compass size={17} /> Hızlı rota bul</span><strong>Üç seçimle seyahat fikrini netleştir.</strong></div>
        </div>

        <div className="l2t-route-wizard-form">
          <span className="l2t-v25-kicker"><Sparkles size={15} /> Hızlı başlangıç</span>
          <h1>Sana uygun rotayı birlikte bulalım.</h1>
          <p>Bütçeni, giriş tercihini ve gün sayısını seç. Rota Asistanı ayrıntılı önerileri hazırlasın.</p>

          <label><span><Wallet size={17} /> Bütçe</span><select value={budget} onChange={(event) => setBudget(event.target.value)}><option>10.000 TL altı</option><option>15.000 TL altı</option><option>25.000 TL altı</option><option>Bütçe önemli değil</option></select></label>
          <label><span><ShieldCheck size={17} /> Giriş tercihi</span><select value={visa} onChange={(event) => setVisa(event.target.value)}><option>Kimlikle gidilenler</option><option>Sadece vizesiz</option><option>e-Vize olabilir</option><option>Fark etmez</option></select></label>
          <label><span><CalendarDays size={17} /> Süre</span><select value={days} onChange={(event) => setDays(event.target.value)}><option>2 gün</option><option>3 gün</option><option>5 gün</option><option>1 hafta</option></select></label>

          <button type="button" onClick={startPlanning}>Rota önerilerini hazırla <ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}
