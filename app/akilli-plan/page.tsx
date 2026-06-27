"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, Map, Building, Wallet, Plane, CheckCircle2, 
  ChevronRight, Globe2, CalendarDays, Coins, Heart, Users, MapPin, 
  AlertTriangle, ArrowRight, ExternalLink, MessageSquare, BookOpen, Clock,
  Calendar, Info, AlertCircle, Compass
} from "lucide-react";
import SaveTripButton from "../components/SaveTripButton";
import Link from "next/link";
import PlaneLoader from "../components/PlaneLoader";
import AiDestinationCard from "../components/AiDestinationCard";

// Types
export interface AiRouteResult {
  name: string;
  country: string;
  cityOrRegion: string;
  why: string;
  visaStatus: string;
  estimatedBudget: string;
  idealDuration: string;
  bestFor: string;
  difficulty: string;
  firstTimeFriendly: boolean;
  transportEase: string;
  safetyNote: string;
  scores: {
    budget: number;
    visaEase: number;
    firstTime: number;
    transport: number;
    overall: number;
  };
  dailyPlan: string[];
  warnings: string[];
  cta: {
    flightSearchText: string;
    guideText: string;
    forumText: string;
  };
}

export interface AiPlanResponse {
  summary: string;
  routes: AiRouteResult[];
}

type Step = "welcome" | "origin" | "time" | "budget" | "who" | "vibe" | "loading" | "result" | "error";

const PremiumLoading = () => {
  const [tipIndex, setTipIndex] = useState(0);
  const [progressStep, setProgressStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  const tips = [
    "Pasaport geçerliliğini seyahatten önce kontrol etmek iyi bir fikirdir.",
    "El bagajındaki sıvılar için havayolu kurallarını kontrol etmeyi unutma.",
    "Hafta içi uçuşlarda zaman zaman daha uygun fiyatlar bulunabilir.",
    "eSIM, yurt dışında internet kullanımı için pratik bir alternatif olabilir.",
    "Vizesiz ülkelerde bile giriş kuralları dönemsel olarak değişebilir.",
    "Erken planlama, konaklama ve uçuş seçeneklerini artırabilir.",
    "Balkan rotalarında şehirler arası otobüs sık tercih edilen bir seçenektir.",
    "Seyahat sigortası bazı ülkelerde girişte istenebilir."
  ];

  const steps = [
    "Tercihlerin analiz ediliyor...",
    "Vize kolaylığına göre rotalar süzülüyor...",
    "Bütçene uygun destinasyonlar karşılaştırılıyor...",
    "Seyahat tarzına uygun şehirler seçiliyor...",
    "Rota önerileri hazırlanıyor..."
  ];

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % tips.length);
    }, 3000);
    
    const stepInterval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, steps.length - 1));
    }, 2000);

    const progressInterval = setInterval(() => {
      setProgressPercent(prev => {
        if (prev >= 98) return prev;
        const increment = Math.random() * 5 + 1;
        return Math.min(prev + increment, 98);
      });
    }, 300);

    return () => {
      clearInterval(tipInterval);
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="planner-card glass-panel" style={{ padding: "60px 20px", background: "linear-gradient(135deg, rgba(6,20,51,0.95), rgba(4,19,45,0.98))", color: "#fff", position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px" }}>
      {/* Background Glow */}
      <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "radial-gradient(circle at center, rgba(6,182,212,0.1) 0%, transparent 60%)", pointerEvents: "none", animation: "spin 20s linear infinite" }} />
      
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        
        {/* Orbital Airplane Animation */}
        <div style={{ position: "relative", width: "120px", height: "120px", marginBottom: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: "2px dashed rgba(6,182,212,0.3)", animation: "spin 8s linear infinite" }} />
          <div style={{ position: "absolute", width: "100%", height: "100%", animation: "spin 3s linear infinite" }}>
            <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", color: "#F59E0B", filter: "drop-shadow(0 0 8px rgba(245,158,11,0.6))" }}>
              <Plane size={28} />
            </div>
            {/* Light trail */}
            <div style={{ position: "absolute", top: "4px", left: "50%", width: "40px", height: "4px", background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.4))", transform: "translateX(-50%) rotate(90deg)", transformOrigin: "left" }} />
          </div>
          <Sparkles size={32} color="#06B6D4" style={{ opacity: 0.8 }} />
        </div>

        <h2 style={{ color: "#fff", fontSize: "1.8rem", fontWeight: "800", marginBottom: "12px", textAlign: "center" }}>
          {steps[progressStep]}
        </h2>
        
        {/* Progress Bar */}
        <div style={{ width: "100%", maxWidth: "400px", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "10px", overflow: "hidden", marginBottom: "32px" }}>
          <div style={{ height: "100%", width: `${progressPercent}%`, background: "linear-gradient(90deg, #06B6D4, #F59E0B)", transition: "width 0.3s ease-out", borderRadius: "10px" }} />
        </div>

        {/* Travel Tips with Fade */}
        <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: "1.5", maxWidth: "480px", textAlign: "center", margin: 0 }}
            >
              <Info size={16} style={{ display: "inline", marginRight: "6px", verticalAlign: "text-bottom" }} />
              {tips[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </motion.div>
  );
};

export default function AIPlannerPage() {
  const [step, setStep] = useState<Step>("welcome");
  
  const [answers, setAnswers] = useState({ 
    origin: "", 
    days: "", 
    month: "",
    budget: "", 
    accommodation: "",
    who: "",
    tempo: "",
    vibe: [] as string[],
    visa: "" 
  });
  
  const [result, setResult] = useState<AiPlanResponse | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Seçimlerine göre en mantıklı rotalar hazırlanıyor...");
  const [isFallback, setIsFallback] = useState(false);
  const [lastPromptStr, setLastPromptStr] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<AiRouteResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const preset = searchParams.get("preset");
    if (preset === "ucuz-vizesiz") {
      setAnswers({ origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Ucuz rota", "Vizesiz rota"], visa: "Sadece vizesiz" });
      setStep("loading");
    } else if (preset === "kimlikle-haftasonu") {
      setAnswers({ origin: "Sabiha Gökçen", days: "2 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Kimlikle gidilebilen rota"], visa: "Kimlikle gidilenler" });
      setStep("loading");
    } else if (preset === "ilk-kez-yurtdisi") {
      setAnswers({ origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Rahat gezi", vibe: ["İlk kez yurt dışı", "Güvenli aile rotası"], visa: "Sadece vizesiz" });
      setStep("loading");
    } else if (searchParams.get("budget")) {
      const budget = searchParams.get("budget") || "";
      const visa = searchParams.get("visa") || "";
      const days = searchParams.get("days") || "";
      setAnswers({ origin: "İstanbul", days: days, month: "Fark etmez", budget: budget, accommodation: "Orta seviye", who: "Belirtilmedi", tempo: "Orta tempo", vibe: [], visa: visa });
      setStep("loading");
    }
  }, []);

  const nextStep = (next: Step, key?: string, value?: any) => {
    let newAnswers = { ...answers };
    if (key && value !== undefined) {
      newAnswers = { ...answers, [key]: value };
      setAnswers(newAnswers);
    }
    
    setStep(next);

    if (next === "loading") {
      generatePlan(newAnswers);
    }
  };

  const toggleVibe = (vibeStr: string) => {
    setAnswers(prev => {
      const isSelected = prev.vibe.includes(vibeStr);
      const newVibes = isSelected 
        ? prev.vibe.filter(v => v !== vibeStr)
        : [...prev.vibe, vibeStr];
      return { ...prev, vibe: newVibes };
    });
  };

  const generatePlan = async (finalAnswers: typeof answers) => {
    const promptStr = JSON.stringify(finalAnswers);
    
    // Cooldown & cache check
    if (cooldown) {
      setStep("result");
      return;
    }
    if (result && promptStr === lastPromptStr) {
      setStep("result");
      return;
    }

    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000); // 3 sec cooldown to prevent spam
    setLastPromptStr(promptStr);
    setIsFallback(false);

    try {
      const startTime = Date.now();
      const response = await fetch("/api/ai-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: promptStr,
      });
      
      const data = await response.json();
      
      // Zorunlu 2 saniye loading beklemesi (Premium hissiyat)
      const elapsed = Date.now() - startTime;
      if (elapsed < 2500) {
        await new Promise(resolve => setTimeout(resolve, 2500 - elapsed));
      }

      if (data && data.success && data.data) {
        setResult(data.data);
        setIsFallback(data.isFallback || false);
      } else {
        throw new Error(data.error || "Bilinmeyen API hatası");
      }
    } catch (error) {
      console.error("Plan generation error:", error);
      // Generate client-side fallback just in case the server fails to return its own fallback
      setResult(getFallbackData(finalAnswers));
      setIsFallback(true);
    } finally {
      setSelectedRoute(null);
      setStep("result");
      setIsRefreshing(false);
    }
  };

  const getFallbackData = (ans: typeof answers): AiPlanResponse => {
    return {
      summary: "Seçimlerine göre en uygun rotaları hazırladık.",
      routes: [
        {
          name: "Saraybosna",
          country: "Bosna Hersek",
          cityOrRegion: "Saraybosna",
          why: "Vizesiz olması, düşük bütçe gerektirmesi ve tarihi dokusuyla mükemmel bir başlangıç noktası.",
          visaStatus: "Vizesiz",
          estimatedBudget: "8.000 - 12.000 TL",
          idealDuration: "3 gün",
          bestFor: "İlk kez yurt dışı, kültür gezisi",
          difficulty: "Çok Kolay",
          firstTimeFriendly: true,
          transportEase: "Kolay",
          safetyNote: "Oldukça güvenli bir şehir. Sadece kalabalık turistik alanlarda yankesiciliğe karşı standart önlemler alın.",
          scores: {
            budget: 9,
            visaEase: 10,
            firstTime: 9,
            transport: 8,
            overall: 90
          },
          dailyPlan: [
            "1. Gün: Başçarşı turu, Sebil ve Latin Köprüsü",
            "2. Gün: Umut Tüneli ve Trebeviç Teleferiği",
            "3. Gün: Vrelo Bosne Milli Parkı ve dönüş hazırlığı"
          ],
          warnings: [
            "Fiyatlar tahminidir, tarih ve doluluk durumuna göre değişebilir.",
            "Vize ve giriş kuralları seyahat öncesi resmi kaynaklardan kontrol edilmelidir."
          ],
          cta: {
            flightSearchText: "Bu rota için bilet ara",
            guideText: "Saraybosna rehberini gör",
            forumText: "Forumda soru sor"
          }
        }
      ]
    };
  };

  const renderWelcome = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="planner-card text-center glass-panel" style={{ background: "rgba(10, 31, 74, 0.95)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", padding: "50px 20px" }}>
      <Sparkles size={56} color="#F59E0B" style={{ margin: "0 auto 24px" }} />
      <h1 style={{ fontSize: "2.8rem", color: "#fff", marginBottom: "16px", fontWeight: "800", textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>Akıllı Seyahat Planlayıcı</h1>
      <p style={{ color: "#cbd5e1", fontSize: "1.15rem", marginBottom: "40px", lineHeight: 1.6, maxWidth: "600px", margin: "0 auto 40px" }}>
        Metin yazmakla uğraşma. Seçimlerini yap, AI senin için en iyi rotaları ve gün gün planı hazırlasın.
      </p>
      
      <button 
        className="l2t-btn" 
        onClick={() => nextStep("origin")} 
        style={{ fontSize: "1.2rem", padding: "18px 40px", width: "100%", maxWidth: "320px", background: "#F59E0B", color: "var(--l2t-navy)", border: "none", boxShadow: "0 4px 15px rgba(245, 158, 11, 0.4)", borderRadius: "100px", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", margin: "0 auto" }}>
        Adım Adım Planla <ChevronRight size={20} />
      </button>

      <div style={{ marginTop: "48px" }}>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Veya Hazır Seçeneklerden Başla</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px" }}>
          {[
            { label: "İlk kez yurt dışına çıkacağım", data: { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Rahat gezi", vibe: ["İlk kez yurt dışı", "Güvenli aile rotası"], visa: "Sadece vizesiz" } },
            { label: "10.000 TL altı vizesiz rota", data: { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Ucuz rota", "Vizesiz rota"], visa: "Sadece vizesiz" } },
            { label: "Sevgilimle romantik rota", data: { origin: "İstanbul", days: "4 gün", month: "Gelecek ay", budget: "25.000 TL altı", accommodation: "Konforlu", who: "Sevgilimle", tempo: "Rahat gezi", vibe: ["Romantik rota"], visa: "Vize olabilir" } },
            { label: "Arkadaşlarla ucuz Balkan rotası", data: { origin: "İstanbul", days: "4 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Dolu dolu gezi", vibe: ["Ucuz rota", "Gece hayatı"], visa: "Sadece vizesiz" } },
            { label: "Ailemle güvenli rota", data: { origin: "İstanbul", days: "5 gün", month: "Yaz", budget: "Bütçe önemli değil", accommodation: "Konforlu", who: "Ailemle", tempo: "Rahat gezi", vibe: ["Güvenli aile rotası"], visa: "Fark etmez" } },
            { label: "Kimlikle gidilebilen rota", data: { origin: "Sabiha Gökçen", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Kimlikle gidilebilen rota"], visa: "Kimlikle gidilenler" } },
            { label: "Deniz tatili istiyorum", data: { origin: "İstanbul", days: "1 hafta", month: "Yaz", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Sevgilimle", tempo: "Rahat gezi", vibe: ["Deniz tatili"], visa: "Sadece vizesiz" } },
            { label: "Hafta sonu kaçamağı", data: { origin: "İstanbul", days: "2 gün", month: "Bu ay", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Tek başıma", tempo: "Orta tempo", vibe: ["Kültür gezisi"], visa: "Sadece vizesiz" } }
          ].map((chip, idx) => (
            <button 
              key={idx} 
              onClick={() => {
                setAnswers(chip.data);
                nextStep("loading");
                generatePlan(chip.data);
              }}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "10px 16px", borderRadius: "100px", fontSize: "0.9rem", transition: "all 0.2s", cursor: "pointer", minHeight: "44px" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );

  const StepHeader = ({ title, stepNum }: { title: string, stepNum: number }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
      <h2 style={{ fontSize: "1.8rem", color: "#fff", margin: 0, fontWeight: "800" }}>{title}</h2>
      <span style={{ background: "rgba(255,255,255,0.1)", color: "#fff", padding: "4px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600" }}>Adım {stepNum}/5</span>
    </div>
  );

  const getBtnStyle = (isSelected: boolean, isLastOdd: boolean) => ({
    border: isSelected ? "2px solid #F59E0B" : "2px solid rgba(255,255,255,0.1)",
    background: isSelected ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
    color: "#fff",
    transition: "all 0.2s ease",
    gridColumn: isLastOdd ? "span 2" : "auto"
  });

  const renderOrigin = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="planner-card glass-panel" style={{ padding: "40px" }}>
      <StepHeader title="Nereden çıkıyorsun?" stepNum={1} />
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {["İstanbul", "Sabiha Gökçen", "Ankara", "İzmir", "Antalya", "Diğer Türkiye"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.origin === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.origin === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "20px", minHeight: "44px" }} onClick={() => nextStep("time", "origin", opt)}>
            <Plane size={28} color={answers.origin === opt ? "#F59E0B" : "rgba(255,255,255,0.5)"} />
            <span style={{ fontWeight: 700, marginTop: "12px", fontSize: "1.05rem" }}>{opt}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );

  const renderTime = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="planner-card glass-panel" style={{ padding: "40px" }}>
      <StepHeader title="Seyahat Süresi ve Dönemi" stepNum={2} />
      
      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Kaç gün sürecek?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {["2 gün", "3 gün", "4 gün", "5 gün", "1 hafta"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.days === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.days === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, days: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Ne zaman gideceksin?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {["Bu ay", "Gelecek ay", "Yaz", "Kış", "Bahar", "Fark etmez"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.month === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.month === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, month: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <button className="l2t-btn" disabled={!answers.days || !answers.month} style={{ width: "100%", padding: "16px", minHeight: "44px", background: "#F59E0B", color: "var(--l2t-navy)", border: "none", opacity: (!answers.days || !answers.month) ? 0.5 : 1 }} onClick={() => nextStep("budget")}>Devam Et</button>
    </motion.div>
  );

  const renderBudget = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="planner-card glass-panel" style={{ padding: "40px" }}>
      <StepHeader title="Bütçe ve Konaklama" stepNum={3} />
      
      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Kişi başı bütçen?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {["7.500 TL altı", "10.000 TL altı", "15.000 TL altı", "25.000 TL altı", "Bütçe önemli değil"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.budget === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.budget === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, budget: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Konaklama tercihin?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {["En uygun", "Orta seviye", "Konforlu", "Fark etmez"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.accommodation === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.accommodation === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, accommodation: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <button className="l2t-btn l2t-btn-ghost" style={{ padding: "16px", flex: 1, minHeight: "44px", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", background: "transparent" }} onClick={() => nextStep("time")}>Geri</button>
        <button className="l2t-btn" disabled={!answers.budget || !answers.accommodation} style={{ padding: "16px", flex: 2, minHeight: "44px", background: "#F59E0B", color: "var(--l2t-navy)", border: "none", opacity: (!answers.budget || !answers.accommodation) ? 0.5 : 1 }} onClick={() => nextStep("who")}>Devam Et</button>
      </div>
    </motion.div>
  );

  const renderWho = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="planner-card glass-panel" style={{ padding: "40px" }}>
      <StepHeader title="Kiminle ve Tempo" stepNum={4} />
      
      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Kiminle gidiyorsun?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
        {["Tek başıma", "Sevgilimle", "Arkadaşlarla", "Ailemle"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.who === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.who === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, who: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Nasıl bir tempo istiyorsun?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginBottom: "32px" }}>
        {["Rahat gezi", "Orta tempo", "Dolu dolu gezi"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.tempo === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.tempo === opt, false), padding: "16px", minHeight: "44px" }} onClick={() => setAnswers({...answers, tempo: opt})}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <button className="l2t-btn l2t-btn-ghost" style={{ padding: "16px", flex: 1, minHeight: "44px", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", background: "transparent" }} onClick={() => nextStep("budget")}>Geri</button>
        <button className="l2t-btn" disabled={!answers.who || !answers.tempo} style={{ padding: "16px", flex: 2, minHeight: "44px", background: "#F59E0B", color: "var(--l2t-navy)", border: "none", opacity: (!answers.who || !answers.tempo) ? 0.5 : 1 }} onClick={() => nextStep("vibe")}>Devam Et</button>
      </div>
    </motion.div>
  );

  const renderVibe = () => (
    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="planner-card glass-panel" style={{ padding: "40px" }}>
      <StepHeader title="Seyahat Tipi ve Vize" stepNum={5} />
      
      <h3 style={{ fontSize: "1.2rem", marginBottom: "8px", color: "rgba(255,255,255,0.9)" }}>Seyahat tipi (Birden fazla seçebilirsin)</h3>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", marginBottom: "16px" }}>Sana en uygun temaları işaretle.</p>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "32px" }}>
        {[
          "İlk kez yurt dışı", "Vizesiz rota", "Kimlikle gidilebilen rota", 
          "Ucuz rota", "Deniz tatili", "Kültür gezisi", 
          "Gece hayatı", "Romantik rota", "Güvenli aile rotası", "Fotoğraf/video çekilecek rota"
        ].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.vibe.includes(opt) ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.vibe.includes(opt), idx === arr.length - 1 && arr.length % 2 !== 0), padding: "12px 8px", minHeight: "44px" }} onClick={() => toggleVibe(opt)}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "rgba(255,255,255,0.9)" }}>Vize tercihin?</h3>
      <div className="planner-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "32px" }}>
        {["Sadece vizesiz", "Kimlikle gidilenler", "e-Vize olabilir", "Vize olabilir", "Fark etmez"].map((opt, idx, arr) => (
          <button key={opt} className={`planner-opt-btn ${answers.visa === opt ? 'selected' : ''}`} style={{ ...getBtnStyle(answers.visa === opt, idx === arr.length - 1 && arr.length % 2 !== 0), padding: "12px 8px", minHeight: "44px" }} onClick={() => setAnswers({...answers, visa: opt})}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{opt}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <button className="l2t-btn l2t-btn-ghost" style={{ padding: "16px", flex: 1, minHeight: "44px", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", background: "transparent" }} onClick={() => nextStep("who")}>Geri</button>
        <button className="l2t-btn" disabled={answers.vibe.length === 0 || !answers.visa} style={{ padding: "16px", flex: 2, background: "#10b981", color: "#fff", border: "none", minHeight: "44px", opacity: (answers.vibe.length === 0 || !answers.visa) ? 0.5 : 1 }} onClick={() => nextStep("loading")}>
          <Sparkles size={20} style={{ marginRight: "8px" }} /> Plan Oluştur
        </button>
      </div>
    </motion.div>
  );

  const renderLoading = () => (
    <PlaneLoader isLoading={true} />
  );

  const renderResult = () => {
    if (!result) return null;

    if (selectedRoute) {
      return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="planner-result" style={{ width: "100%" }}>
          <button 
            onClick={() => setSelectedRoute(null)}
            className="l2t-btn l2t-btn-ghost"
            style={{ marginBottom: "24px", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "none", padding: "0" }}
          >
            <Plane size={20} style={{ transform: "rotate(-45deg)" }} /> Rotalara Dön
          </button>

          <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
            <div style={{ padding: "32px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <span style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase", letterSpacing: "1px" }}>{selectedRoute.country}</span>
                  <h2 style={{ fontSize: "2.2rem", color: "var(--l2t-navy)", margin: "4px 0 0", fontWeight: "800" }}>{selectedRoute.name}</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ background: selectedRoute.visaStatus === "Vizesiz" || selectedRoute.visaStatus === "Kimlikle" ? "#dcfce7" : "#fef3c7", color: selectedRoute.visaStatus === "Vizesiz" || selectedRoute.visaStatus === "Kimlikle" ? "#166534" : "#92400e", padding: "8px 16px", borderRadius: "100px", fontSize: "0.95rem", fontWeight: "700" }}>
                    {selectedRoute.visaStatus}
                  </span>
                </div>
              </div>
              
              <p style={{ fontSize: "1.1rem", color: "var(--l2t-soft)", lineHeight: "1.6", margin: "0 0 24px" }}>{selectedRoute.why}</p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px" }}>
                  <Wallet size={20} color="var(--l2t-blue)" style={{ marginBottom: "8px" }} />
                  <span style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>Tahmini Bütçe</span>
                  <strong style={{ display: "block", fontSize: "1.1rem", color: "var(--l2t-navy)" }}>{selectedRoute.estimatedBudget}</strong>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px" }}>
                  <Clock size={20} color="var(--l2t-blue)" style={{ marginBottom: "8px" }} />
                  <span style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>İdeal Süre</span>
                  <strong style={{ display: "block", fontSize: "1.1rem", color: "var(--l2t-navy)" }}>{selectedRoute.idealDuration}</strong>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px" }}>
                  <Users size={20} color="var(--l2t-blue)" style={{ marginBottom: "8px" }} />
                  <span style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>Kimin İçin?</span>
                  <strong style={{ display: "block", fontSize: "1.1rem", color: "var(--l2t-navy)" }}>{selectedRoute.bestFor}</strong>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px" }}>
                  <CheckCircle2 size={20} color="var(--l2t-blue)" style={{ marginBottom: "8px" }} />
                  <span style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>Zorluk</span>
                  <strong style={{ display: "block", fontSize: "1.1rem", color: "var(--l2t-navy)" }}>{selectedRoute.difficulty}</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: "32px", display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
              <div>
                <h3 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><MapPin size={20} /> Örnek Günlük Plan</h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                  {selectedRoute.dailyPlan?.map((planStr, pIdx) => (
                    <li key={pIdx} style={{ fontSize: "1.05rem", color: "var(--l2t-soft)", paddingLeft: "24px", position: "relative", lineHeight: "1.5" }}>
                      <span style={{ position: "absolute", left: 0, top: "8px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--l2t-blue)" }}></span>
                      {planStr}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "16px", borderRadius: "12px" }}>
                <h4 style={{ fontSize: "1rem", color: "#92400e", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}><Info size={16} /> Önemli Notlar</h4>
                {selectedRoute.warnings?.map((w, i) => (
                  <p key={i} style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#b45309" }}>- {w}</p>
                ))}
                <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#92400e", fontWeight: "600", fontStyle: "italic" }}>* Fiyatlar tahmini değerlerdir. Güncel giriş kurallarını resmi sitelerden kontrol ediniz.</p>
              </div>
            </div>

            <div style={{ background: "#f8fafc", padding: "24px 32px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <Link href={`/ucak-bileti-ara?to=${encodeURIComponent(selectedRoute.cityOrRegion || selectedRoute.name)}`} className="l2t-btn" style={{ flex: 1, minWidth: "200px", minHeight: "44px", textAlign: "center", justifyContent: "center" }}>
                <Plane size={18} style={{ marginRight: "8px" }} /> {selectedRoute.cta?.flightSearchText || "Bilet Ara"}
              </Link>
              <Link href={`/rehber-merkezi/ulke/${selectedRoute.country.toLowerCase().replace(/ /g, '-')}`} className="l2t-btn l2t-btn-outline" style={{ flex: 1, minWidth: "150px", minHeight: "44px", textAlign: "center", justifyContent: "center" }}>
                <BookOpen size={18} style={{ marginRight: "8px" }} /> {selectedRoute.cta?.guideText || "Rehberi Gör"}
              </Link>
              <Link href="/forum" className="l2t-btn l2t-btn-outline" style={{ flex: 1, minWidth: "150px", minHeight: "44px", textAlign: "center", justifyContent: "center" }}>
                <MessageSquare size={18} style={{ marginRight: "8px" }} /> {selectedRoute.cta?.forumText || "Forumda Sor"}
              </Link>
            </div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="planner-result" style={{ width: "100%", position: "relative" }}>
        
        {/* Full background to match PlaneLoader overlay */}
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "radial-gradient(circle at 20% 18%, rgba(217, 164, 65, 0.14), transparent 28%), radial-gradient(circle at 82% 22%, rgba(11, 29, 53, 0.06), transparent 30%), linear-gradient(180deg, #F7F3EA 0%, #EAF3FA 100%)"
        }} />
        
        {isFallback && (
          <div style={{ background: "#EEF2FF", color: "#3730A3", padding: "16px", borderRadius: "12px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", fontWeight: "600" }}>
            <Sparkles size={24} />
            <span>Seçimlerine göre en uygun rotaları hazırladık. Fiyatlar ve giriş kuralları seyahat öncesi yetkili kaynaklardan kontrol edilmelidir.</span>
          </div>
        )}

        <div className="l2t-ai-loading-board" style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 0" }}>
          
          {/* Header Area that matches PlaneLoader */}
          <div className="l2t-board-header">
            <div className="l2t-board-brand">
              <div className="l2t-board-brand-row">
                <Compass size={22} color="#D9A441" strokeWidth={2} />
                <span className="l2t-board-brand-text">LetsGo2Travel</span>
                <Plane size={16} color="#0B1D35" style={{ marginLeft: 4, transform: 'rotate(45deg)' }} />
              </div>
              <span className="l2t-board-slogan">Istanbul to ✈ World</span>
            </div>

            <h1 className="l2t-board-title" style={{ fontSize: "2.8rem" }}>Seyahat planın hazır!</h1>
            <p className="l2t-board-desc">
              Seçimlerine göre harika rotalar oluşturduk. İncelemek istediğin rotayı seçebilirsin.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px", width: "100%", marginBottom: "40px" }}>
            {result.routes.map((route, idx) => (
              <AiDestinationCard key={idx} route={route} onClick={() => setSelectedRoute(route)} />
            ))}
          </div>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "32px" }}>
          <button 
            className="l2t-btn" 
            onClick={() => {
              setIsRefreshing(true);
              // Force cooldown bypass and reset for refresh
              setCooldown(false);
              setLastPromptStr("");
              generatePlan(answers);
            }} 
            style={{ background: "#F59E0B", color: "var(--l2t-navy)", border: "none", minWidth: "200px" }}
          >
            <Sparkles size={18} style={{ marginRight: "8px" }} /> Aramayı Yenile
          </button>
          <button 
            className="l2t-btn l2t-btn-outline" 
            onClick={() => {
              setAnswers({ origin: "", days: "", month: "", budget: "", accommodation: "", who: "", tempo: "", vibe: [], visa: "" });
              setStep("origin");
            }} 
            style={{ background: "transparent", color: "var(--l2t-navy)", border: "2px solid var(--l2t-navy)", minWidth: "200px" }}
          >
            Baştan Başla
          </button>
        </div>
        <PlaneLoader isLoading={isRefreshing} />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "90vh", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <AnimatePresence mode="wait">
        {step === "welcome" && renderWelcome()}
        {step === "origin" && renderOrigin()}
        {step === "time" && renderTime()}
        {step === "budget" && renderBudget()}
        {step === "who" && renderWho()}
        {step === "vibe" && renderVibe()}
        {step === "loading" && renderLoading()}
        {step === "result" && renderResult()}
      </AnimatePresence>
      <style dangerouslySetInnerHTML={{__html: `
        .planner-opt-btn:hover { border-color: #F59E0B !important; background: rgba(255,255,255,0.1) !important; transform: translateY(-4px); }
      `}} />
    </div>
  );
}
