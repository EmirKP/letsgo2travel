"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, User, Briefcase, PlaneTakeoff, RefreshCcw } from "lucide-react";
import Link from "next/link";

export default function VisaPredictorPage() {
  const [step, setStep] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<null | number>(null);

  const [formData, setFormData] = useState({
    country: "Almanya",
    income: "",
    job: "Özel Sektör Çalışanı",
    pastVisa: "Yok"
  });

  const handleNext = () => setStep(step + 1);
  const handlePrev = () => setStep(step - 1);

  const calculateVisa = () => {
    setIsCalculating(true);
    setStep(4);
    
    // Fake AI Delay
    setTimeout(() => {
      let baseScore = 40; // Default chance
      
      // Income factor
      const incomeVal = parseInt(formData.income || "0");
      if (incomeVal > 80000) baseScore += 25;
      else if (incomeVal > 40000) baseScore += 15;
      else baseScore += 5;

      // Job factor
      if (formData.job === "Devlet Memuru") baseScore += 20;
      if (formData.job === "Özel Sektör Çalışanı") baseScore += 10;
      if (formData.job === "Öğrenci") baseScore += 5;

      // Past Visa factor
      if (formData.pastVisa === "Çoklu Schengen") baseScore += 30;
      if (formData.pastVisa === "Tek Girişli Schengen") baseScore += 15;
      if (formData.pastVisa === "Amerika / İngiltere") baseScore += 25;

      // Country strictness
      if (formData.country === "Almanya") baseScore -= 10; // Strict
      if (formData.country === "Yunanistan") baseScore += 5; // Easier

      // Cap at 98%
      const finalScore = Math.min(Math.max(baseScore, 10), 98);
      
      setResult(finalScore);
      setIsCalculating(false);
    }, 2500);
  };

  const getAdvice = (score: number) => {
    if (score > 80) return "Harika! Vize alma ihtimalin çok yüksek. Evraklarını eksiksiz hazırlayıp hemen başvuru yapabilirsin.";
    if (score > 50) return "Şansın ortalama seviyede. Banka hesabında daha fazla bakiye göstermek ve seyahat sağlık sigortanı uzun süreli yaptırmak şansını artıracaktır.";
    return "Maalesef şu anki profille vize alman biraz zor görünüyor. Daha kolay vize veren Yunanistan veya İtalya gibi ülkeleri hedefleyebilirsin.";
  };

  return (
    <div className="l2t-page l2t-wrap">
      <div className="planner-header" style={{ textAlign: "center", marginBottom: "40px", marginTop: "40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(20, 118, 242, 0.1)", padding: "8px 16px", borderRadius: "20px", color: "var(--l2t-blue)", fontWeight: "600", marginBottom: "16px" }}>
          <ShieldCheck size={20} />
          <span>AI Vize Tahmincisi</span>
        </div>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>Schengen Vizesi Alabilir Miyim?</h1>
        <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
          Yapay zeka asistanımız; gelir durumun, çalışma statün ve seyahat geçmişine göre vize alma ihtimalini hesaplasın.
        </p>
      </div>

      <div className="glass-panel" style={{ maxWidth: "600px", margin: "0 auto", padding: "40px", borderRadius: "24px", minHeight: "400px", position: "relative", overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          
          {/* STEP 1: Hedef Ülke */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="visa-step">
              <h2 style={{ fontSize: "1.5rem", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}><PlaneTakeoff color="var(--l2t-blue)"/> Hangi Ülkeye Başvuracaksın?</h2>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "32px" }}>
                {["Almanya", "Yunanistan", "İtalya", "Hollanda", "Fransa", "İspanya"].map(c => (
                  <button 
                    key={c} 
                    onClick={() => setFormData({...formData, country: c})}
                    className={`l2t-btn ${formData.country === c ? '' : 'l2t-btn-outline'}`}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={handleNext} className="l2t-btn">İleri →</button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Gelir ve Çalışma Statüsü */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="visa-step">
              <h2 style={{ fontSize: "1.5rem", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}><Briefcase color="var(--l2t-blue)"/> Çalışma Durumun ve Gelirin</h2>
              
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>Çalışma Statüsü</label>
                <select 
                  className="l2t-input" 
                  value={formData.job} 
                  onChange={(e) => setFormData({...formData, job: e.target.value})}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #ddd" }}
                >
                  <option>Özel Sektör Çalışanı</option>
                  <option>Devlet Memuru</option>
                  <option>İşveren / Şirket Sahibi</option>
                  <option>Öğrenci</option>
                  <option>Çalışmıyor</option>
                </select>
              </div>

              <div style={{ marginBottom: "32px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>Aylık Net Gelir (TL)</label>
                <input 
                  type="number" 
                  placeholder="Örn: 45000"
                  className="l2t-input"
                  value={formData.income}
                  onChange={(e) => setFormData({...formData, income: e.target.value})}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #ddd" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={handlePrev} className="l2t-btn l2t-btn-outline">← Geri</button>
                <button onClick={handleNext} className="l2t-btn" disabled={!formData.income}>İleri →</button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Seyahat Geçmişi */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="visa-step">
              <h2 style={{ fontSize: "1.5rem", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}><User color="var(--l2t-blue)"/> Seyahat Geçmişi (Son 3 Yıl)</h2>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginBottom: "32px" }}>
                {["Yok (İlk kez çıkacağım)", "Sadece Vizesiz Ülkeler", "Tek Girişli Schengen", "Çoklu Schengen", "Amerika / İngiltere"].map(v => (
                  <button 
                    key={v} 
                    onClick={() => setFormData({...formData, pastVisa: v})}
                    className={`l2t-btn ${formData.pastVisa === v ? '' : 'l2t-btn-outline'}`}
                    style={{ width: "100%", justifyContent: "flex-start", padding: "16px" }}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={handlePrev} className="l2t-btn l2t-btn-outline">← Geri</button>
                <button onClick={calculateVisa} className="l2t-btn" style={{ background: "linear-gradient(135deg, #10B981, #059669)", border: "none" }}>Sonucu Hesapla ✨</button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Yükleniyor / Sonuç */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="visa-step" style={{ textAlign: "center", padding: "20px 0" }}>
              
              {isCalculating ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                    <RefreshCcw size={48} color="var(--l2t-blue)" />
                  </motion.div>
                  <h3 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)" }}>Yapay Zeka Analiz Ediyor...</h3>
                  <p style={{ color: "var(--l2t-soft)" }}>Konsolosluk ret algoritmalarıyla karşılaştırılıyor.</p>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-soft)", marginBottom: "16px" }}>{formData.country} Vizesi Alma İhtimalin</h3>
                  
                  <div style={{ width: "160px", height: "160px", borderRadius: "50%", background: `conic-gradient(${result! > 60 ? '#10B981' : result! > 40 ? '#F59E0B' : '#EF4444'} ${result}%, #eef2f6 0)` , margin: "0 auto 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: "130px", height: "130px", background: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", fontWeight: "800", color: "var(--l2t-navy)" }}>
                      %{result}
                    </div>
                  </div>

                  <div style={{ background: "rgba(20, 118, 242, 0.05)", padding: "20px", borderRadius: "16px", marginBottom: "32px" }}>
                    <p style={{ fontSize: "1.1rem", lineHeight: "1.6", color: "var(--l2t-navy)" }}>
                      {getAdvice(result!)}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
                    <button onClick={() => setStep(1)} className="l2t-btn l2t-btn-outline">Yeniden Hesapla</button>
                    <Link href="/vizesiz-ulkeler" className="l2t-btn">Vizesiz Alternatifleri Gör</Link>
                  </div>
                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
