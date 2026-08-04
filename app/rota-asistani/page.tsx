"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Wallet, Plane, CheckCircle2, ChevronRight, Users, MapPin,
  MessageSquare, BookOpen, Clock, Info, Compass
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import PlaneLoader from "../components/PlaneLoader";
import AiDestinationCard from "../components/AiDestinationCard";

// Types
export interface AiRouteResult {
  name: string;
  country: string;
  cityOrRegion: string;
  why: string;
  visaStatus: string;
  visaNote?: string;
  visaSourceUrl?: string;
  visaVerifiedAt?: string | null;
  verifiedEntryStatus?: string;
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
  const [isFallback, setIsFallback] = useState(false);
  const [lastPromptStr, setLastPromptStr] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<AiRouteResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const preset = searchParams.get("preset");
    let initialAnswers: typeof answers | null = null;

    if (preset === "ucuz-vizesiz") {
      initialAnswers = { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Ucuz rota", "Vizesiz rota"], visa: "Sadece vizesiz" };
    } else if (preset === "kimlikle-haftasonu") {
      initialAnswers = { origin: "Sabiha Gökçen", days: "2 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Kimlikle gidilebilen rota"], visa: "Kimlikle gidilenler" };
    } else if (preset === "ilk-kez-yurtdisi") {
      initialAnswers = { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Rahat gezi", vibe: ["İlk kez yurt dışı", "Güvenli aile rotası"], visa: "Sadece vizesiz" };
    } else if (searchParams.get("budget")) {
      initialAnswers = {
        origin: "İstanbul",
        days: searchParams.get("days") || "3 gün",
        month: "Fark etmez",
        budget: searchParams.get("budget") || "15.000 TL altı",
        accommodation: "Orta seviye",
        who: "Belirtilmedi",
        tempo: "Orta tempo",
        vibe: [],
        visa: searchParams.get("visa") || "Fark etmez",
      };
    }

    if (initialAnswers) {
      setAnswers(initialAnswers);
      setStep("loading");
      void generatePlan(initialAnswers);
    }
    // Query parameters are read once when the planner opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function generatePlan(finalAnswers: typeof answers) {
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

    const controller = new AbortController();
    // Sunucu kendi yapay zekâ isteğini 18 saniyede güvenli yedeğe düşürür.
    // Tarayıcı süresi daha uzun tutulur; soğuk başlangıçta çalışan yanıtı erken kesmez.
    const timeoutId = window.setTimeout(() => controller.abort(), 40_000);

    try {
      const startTime = Date.now();
      const response = await fetch("/api/ai-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: promptStr,
        signal: controller.signal,
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Plan servisi HTTP ${response.status} döndürdü.`);
      }
      
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
      window.clearTimeout(timeoutId);
      setSelectedRoute(null);
      setStep("result");
      setIsRefreshing(false);
    }
  }

  const getFallbackData = (fallbackAnswers: typeof answers): AiPlanResponse => {
    const identityOnly = fallbackAnswers.visa.toLocaleLowerCase("tr-TR").includes("kimlikle");
    const sourceUrl = "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa";
    const baseRoute = {
      estimatedBudget: fallbackAnswers.budget
        ? `Hedef bütçe: ${fallbackAnswers.budget}`
        : "Seçilen tarihler için ayrıca hesaplanmalı",
      idealDuration: fallbackAnswers.days || "3 gün",
      difficulty: "Kolay",
      firstTimeFriendly: true,
      transportEase: "Kolay",
      scores: { budget: 8, visaEase: 9, firstTime: 9, transport: 8, overall: 88 },
      warnings: [
        "Fiyatlar canlı değildir; uçuş ve konaklama tutarlarını tarihler için yeniden kontrol et.",
        "Giriş kurallarını bilet almadan önce resmî kaynaktan yeniden doğrula.",
      ],
      cta: {
        flightSearchText: "Bu rota için bilet ara",
        guideText: "Rehberi gör",
        forumText: "Forumda soru sor",
      },
      visaSourceUrl: sourceUrl,
      visaVerifiedAt: "2026-08-05",
    };
    const identityRoutes: AiRouteResult[] = [
      {
        ...baseRoute,
        name: "Bakü",
        country: "Azerbaycan",
        cityOrRegion: "Bakü",
        why: "Türkiye'den doğrudan seyahatte kimlik kartı kolaylığı ve kısa uçuş süresiyle pratik bir rota.",
        visaStatus: "Kimlikle giriş",
        visaNote: "Turistik amaçla Türkiye'den doğrudan girişte yeni tip T.C. kimlik kartı kullanılabilir.",
        bestFor: "Kimlikle seyahat ve şehir gezisi",
        safetyNote: "Resmî taksileri veya uygulama üzerinden çağrılan araçları tercih et.",
        dailyPlan: ["1. Gün: İçerişehir ve sahil", "2. Gün: Haydar Aliyev Merkezi", "3. Gün: Nizami Caddesi ve dönüş"],
      },
      {
        ...baseRoute,
        name: "Tiflis",
        country: "Gürcistan",
        cityOrRegion: "Tiflis",
        why: "Kimlik kartıyla giriş ve güçlü gastronomi rotasıyla kolay planlanabilir bir şehir kaçamağı.",
        visaStatus: "Kimlikle giriş",
        visaNote: "Yeni tip T.C. kimlik kartıyla giriş mümkündür; 1 Ocak 2026'dan beri seyahat sigortası zorunludur.",
        bestFor: "Ekonomik keşif ve gastronomi",
        safetyNote: "Seyahat tarihlerini kapsayan zorunlu sağlık ve kaza sigortasını hazır tut.",
        dailyPlan: ["1. Gün: Eski Tiflis", "2. Gün: Narikala ve Rustaveli", "3. Gün: Yerel pazar ve dönüş"],
      },
      {
        ...baseRoute,
        name: "Kişinev",
        country: "Moldova",
        cityOrRegion: "Kişinev",
        why: "Kimlik kartıyla seyahat seçeneği ve sakin şehir temposuyla kısa bir rota sunar.",
        visaStatus: "Kimlikle giriş",
        visaNote: "Yeni tip T.C. kimlik kartıyla seyahat mümkündür; taşıyıcının belge koşullarını da kontrol et.",
        bestFor: "Sakin hafta sonu ve ilk yurt dışı",
        safetyNote: "Güncel bölgesel seyahat uyarılarını ayrıca kontrol et.",
        dailyPlan: ["1. Gün: Şehir merkezi", "2. Gün: Müze ve gastronomi", "3. Gün: Parklar ve dönüş"],
      },
    ];
    const visaFreeRoutes: AiRouteResult[] = [
      {
        ...baseRoute,
        name: "Saraybosna",
        country: "Bosna-Hersek",
        cityOrRegion: "Saraybosna",
        why: "Vizesiz giriş, yürüyerek keşfedilebilen merkez ve kültürel zenginliğiyle güçlü bir başlangıç rotası.",
        visaStatus: "Vizesiz",
        visaNote: "T.C. umuma mahsus pasaport hamilleri 180 gün içinde 90 güne kadar vizeden muaftır; pasaport gerekir.",
        bestFor: "İlk yurt dışı ve kültür gezisi",
        safetyNote: "Kalabalık turistik alanlarda standart kişisel güvenlik önlemlerini al.",
        dailyPlan: ["1. Gün: Başçarşı ve Latin Köprüsü", "2. Gün: Umut Tüneli", "3. Gün: Vrelo Bosne ve dönüş"],
      },
      {
        ...baseRoute,
        name: "Üsküp",
        country: "Kuzey Makedonya",
        cityOrRegion: "Üsküp",
        why: "Vizesiz giriş ve kısa uçuş süresi sayesinde hafta sonu için uygulanabilir bir Balkan rotası.",
        visaStatus: "Vizesiz",
        visaNote: "T.C. umuma mahsus pasaport hamilleri 90 güne kadar vizeden muaftır; pasaport gerekir.",
        bestFor: "Kısa kaçamak ve Balkan kültürü",
        safetyNote: "Gece geç saatlerde merkezi ulaşım noktalarını tercih et.",
        dailyPlan: ["1. Gün: Taş Köprü ve Eski Çarşı", "2. Gün: Matka Kanyonu", "3. Gün: Vodno ve dönüş"],
      },
      {
        ...baseRoute,
        name: "Belgrad",
        country: "Sırbistan",
        cityOrRegion: "Belgrad",
        why: "Vizesiz giriş ve güçlü toplu taşıma ağıyla arkadaş grupları için dengeli bir seçenek.",
        visaStatus: "Vizesiz",
        visaNote: "T.C. umuma mahsus pasaport hamilleri kısa turistik seyahatlerde vizeden muaftır; pasaport gerekir.",
        bestFor: "Şehir hayatı ve arkadaşlarla gezi",
        safetyNote: "Kalabalık ulaşım araçlarında çanta ve telefon güvenliğine dikkat et.",
        dailyPlan: ["1. Gün: Knez Mihailova", "2. Gün: Zemun", "3. Gün: Aziz Sava ve dönüş"],
      },
    ];

    return {
      summary: "Bağlantı geciktiği için doğrulanmış giriş kuralları kullanılan güvenli yedek rotaları gösteriyoruz.",
      routes: identityOnly ? identityRoutes : visaFreeRoutes,
    };
  };

  const quickStarts = [
    { label: "İlk kez yurt dışına çıkacağım", detail: "Kolay ve güvenli başlangıç", data: { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Rahat gezi", vibe: ["İlk kez yurt dışı", "Güvenli aile rotası"], visa: "Sadece vizesiz" } },
    { label: "10.000 TL altı vizesiz rota", detail: "Bütçe dostu seçenekler", data: { origin: "İstanbul", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Ucuz rota", "Vizesiz rota"], visa: "Sadece vizesiz" } },
    { label: "Sevgilimle romantik rota", detail: "4 günlük şehir kaçamağı", data: { origin: "İstanbul", days: "4 gün", month: "Gelecek ay", budget: "25.000 TL altı", accommodation: "Konforlu", who: "Sevgilimle", tempo: "Rahat gezi", vibe: ["Romantik rota"], visa: "Vize olabilir" } },
    { label: "Arkadaşlarla Balkan rotası", detail: "Vizesiz ve hareketli", data: { origin: "İstanbul", days: "4 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "En uygun", who: "Arkadaşlarla", tempo: "Dolu dolu gezi", vibe: ["Ucuz rota", "Gece hayatı"], visa: "Sadece vizesiz" } },
    { label: "Ailemle güvenli rota", detail: "Rahat tempo ve konfor", data: { origin: "İstanbul", days: "5 gün", month: "Yaz", budget: "Bütçe önemli değil", accommodation: "Konforlu", who: "Ailemle", tempo: "Rahat gezi", vibe: ["Güvenli aile rotası"], visa: "Fark etmez" } },
    { label: "Kimlikle hafta sonu", detail: "Pasaportsuz kısa kaçamak", data: { origin: "Sabiha Gökçen", days: "3 gün", month: "Fark etmez", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Arkadaşlarla", tempo: "Orta tempo", vibe: ["Kimlikle gidilebilen rota"], visa: "Kimlikle gidilenler" } },
    { label: "Deniz tatili istiyorum", detail: "Vizesiz yaz rotaları", data: { origin: "İstanbul", days: "1 hafta", month: "Yaz", budget: "15.000 TL altı", accommodation: "Orta seviye", who: "Sevgilimle", tempo: "Rahat gezi", vibe: ["Deniz tatili"], visa: "Sadece vizesiz" } },
    { label: "Hafta sonu kaçamağı", detail: "2 günde keşfedilecek şehir", data: { origin: "İstanbul", days: "2 gün", month: "Bu ay", budget: "10.000 TL altı", accommodation: "Orta seviye", who: "Tek başıma", tempo: "Orta tempo", vibe: ["Kültür gezisi"], visa: "Sadece vizesiz" } },
  ];

  const renderWelcome = () => (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="l2t-route-v27-welcome"
    >
      <div className="l2t-route-v27-welcome-copy">
        <p className="l2t-route-v27-eyebrow"><Sparkles size={16} /> Kişisel rota asistanı</p>
        <h1>Sana uygun rotayı birlikte oluşturalım.</h1>
        <p>
          Çıkış noktanı, bütçeni, süreni ve seyahat tarzını seç. Sana gerçekten uygulanabilir rotalar hazırlayalım.
        </p>

        <button type="button" className="l2t-route-v27-primary" onClick={() => nextStep("origin")}>
          Rotamı oluşturmaya başla <ChevronRight size={19} />
        </button>

        <div className="l2t-route-v27-benefits">
          <span><CheckCircle2 size={17} /> Vize tercihine göre</span>
          <span><Wallet size={17} /> Bütçene göre</span>
          <span><Clock size={17} /> Gün sayına göre</span>
        </div>
      </div>

      <div className="l2t-route-v27-visual">
        <Image
          src="/destinations/bosnia/sarajevo.jpg"
          alt="Saraybosna şehir manzarası"
          fill
          priority
          sizes="(max-width: 900px) 100vw, 46vw"
        />
        <div className="l2t-route-v27-visual-shade" />
        <span className="l2t-route-v27-photo-label">Örnek kişisel sonuç</span>
        <div className="l2t-route-v27-preview-card">
          <small>İstanbul çıkışlı · 4 gün</small>
          <h2>3 vizesiz rota bulundu</h2>
          <div>
            <span>Saraybosna</span>
            <span>Tiflis</span>
            <span>Bakü</span>
          </div>
          <strong>10.000–15.000 TL aralığı</strong>
        </div>
      </div>

      <section className="l2t-route-v27-presets">
        <header>
          <div>
            <p className="l2t-route-v27-eyebrow">Hızlı başlangıç</p>
            <h2>Hazır senaryolardan biriyle başla</h2>
          </div>
          <span>Seçimini daha sonra değiştirebilirsin.</span>
        </header>
        <div className="l2t-route-v27-preset-grid">
          {quickStarts.map((preset) => (
            <button
              type="button"
              key={preset.label}
              onClick={() => {
                setAnswers(preset.data);
                setStep("loading");
                void generatePlan(preset.data);
              }}
            >
              <Compass size={19} />
              <span>
                <strong>{preset.label}</strong>
                <small>{preset.detail}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </section>
    </motion.div>
  );

  const StepHeader = ({ title, stepNum }: { title: string; stepNum: number }) => (
    <>
      <div className="l2t-route-v27-step-head">
        <div>
          <p>Rota Asistanı</p>
          <h2>{title}</h2>
        </div>
        <span>Adım {stepNum}/5</span>
      </div>
      <div className="l2t-route-v27-progress" aria-label={`Planlama ilerlemesi yüzde ${stepNum * 20}`}>
        <span style={{ width: `${stepNum * 20}%` }} />
      </div>
    </>
  );

  const optionClass = (isSelected: boolean, isWide = false) =>
    `planner-opt-btn${isSelected ? " selected" : ""}${isWide ? " is-wide" : ""}`;

  const renderOrigin = () => (
    <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -35 }} className="planner-card l2t-route-v27-step-card">
      <StepHeader title="Nereden çıkıyorsun?" stepNum={1} />
      <p className="l2t-route-v27-step-desc">Sana uygun uçuş seçeneklerini ve yakın rotaları buna göre sıralayacağız.</p>
      <div className="planner-options l2t-route-v27-options is-two">
        {["İstanbul", "Sabiha Gökçen", "Ankara", "İzmir", "Antalya", "Diğer Türkiye"].map((option, index, options) => (
          <button
            type="button"
            key={option}
            className={optionClass(answers.origin === option, index === options.length - 1 && options.length % 2 !== 0)}
            onClick={() => nextStep("time", "origin", option)}
          >
            <Plane size={23} />
            <span>{option}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );

  const renderTime = () => (
    <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -35 }} className="planner-card l2t-route-v27-step-card">
      <StepHeader title="Süre ve dönem" stepNum={2} />
      <div className="l2t-route-v27-field-group">
        <h3>Kaç gün sürecek?</h3>
        <div className="planner-options l2t-route-v27-options is-two">
          {["2 gün", "3 gün", "4 gün", "5 gün", "1 hafta"].map((option, index, options) => (
            <button type="button" key={option} className={optionClass(answers.days === option, index === options.length - 1 && options.length % 2 !== 0)} onClick={() => setAnswers({ ...answers, days: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-field-group">
        <h3>Ne zaman gideceksin?</h3>
        <div className="planner-options l2t-route-v27-options is-two">
          {["Bu ay", "Gelecek ay", "Yaz", "Kış", "Bahar", "Fark etmez"].map((option) => (
            <button type="button" key={option} className={optionClass(answers.month === option)} onClick={() => setAnswers({ ...answers, month: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-step-actions is-single">
        <button type="button" className="is-primary" disabled={!answers.days || !answers.month} onClick={() => nextStep("budget")}>Devam et <ChevronRight size={18} /></button>
      </div>
    </motion.div>
  );

  const renderBudget = () => (
    <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -35 }} className="planner-card l2t-route-v27-step-card">
      <StepHeader title="Bütçe ve konaklama" stepNum={3} />
      <div className="l2t-route-v27-field-group">
        <h3>Kişi başı bütçen?</h3>
        <div className="planner-options l2t-route-v27-options is-two">
          {["7.500 TL altı", "10.000 TL altı", "15.000 TL altı", "25.000 TL altı", "Bütçe önemli değil"].map((option, index, options) => (
            <button type="button" key={option} className={optionClass(answers.budget === option, index === options.length - 1 && options.length % 2 !== 0)} onClick={() => setAnswers({ ...answers, budget: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-field-group">
        <h3>Konaklama tercihin?</h3>
        <div className="planner-options l2t-route-v27-options is-two">
          {["En uygun", "Orta seviye", "Konforlu", "Fark etmez"].map((option) => (
            <button type="button" key={option} className={optionClass(answers.accommodation === option)} onClick={() => setAnswers({ ...answers, accommodation: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-step-actions">
        <button type="button" className="is-secondary" onClick={() => nextStep("time")}>Geri</button>
        <button type="button" className="is-primary" disabled={!answers.budget || !answers.accommodation} onClick={() => nextStep("who")}>Devam et <ChevronRight size={18} /></button>
      </div>
    </motion.div>
  );

  const renderWho = () => (
    <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -35 }} className="planner-card l2t-route-v27-step-card">
      <StepHeader title="Yolculuk şekli" stepNum={4} />
      <div className="l2t-route-v27-field-group">
        <h3>Kiminle gidiyorsun?</h3>
        <div className="planner-options l2t-route-v27-options is-two">
          {["Tek başıma", "Sevgilimle", "Arkadaşlarla", "Ailemle"].map((option) => (
            <button type="button" key={option} className={optionClass(answers.who === option)} onClick={() => setAnswers({ ...answers, who: option })}>
              <Users size={21} /><span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-field-group">
        <h3>Nasıl bir tempo istiyorsun?</h3>
        <div className="planner-options l2t-route-v27-options is-three">
          {["Rahat gezi", "Orta tempo", "Dolu dolu gezi"].map((option) => (
            <button type="button" key={option} className={optionClass(answers.tempo === option)} onClick={() => setAnswers({ ...answers, tempo: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-step-actions">
        <button type="button" className="is-secondary" onClick={() => nextStep("budget")}>Geri</button>
        <button type="button" className="is-primary" disabled={!answers.who || !answers.tempo} onClick={() => nextStep("vibe")}>Devam et <ChevronRight size={18} /></button>
      </div>
    </motion.div>
  );

  const renderVibe = () => (
    <motion.div initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -35 }} className="planner-card l2t-route-v27-step-card">
      <StepHeader title="Seyahat tarzı ve vize" stepNum={5} />
      <div className="l2t-route-v27-field-group">
        <h3>Seyahat tipin</h3>
        <p>Birden fazla tema seçebilirsin.</p>
        <div className="planner-options l2t-route-v27-options is-two is-compact">
          {["İlk kez yurt dışı", "Vizesiz rota", "Kimlikle gidilebilen rota", "Ucuz rota", "Deniz tatili", "Kültür gezisi", "Gece hayatı", "Romantik rota", "Güvenli aile rotası", "Fotoğraf/video çekilecek rota"].map((option) => (
            <button type="button" key={option} className={optionClass(answers.vibe.includes(option))} onClick={() => toggleVibe(option)}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-field-group">
        <h3>Vize tercihin?</h3>
        <div className="planner-options l2t-route-v27-options is-two is-compact">
          {["Sadece vizesiz", "Kimlikle gidilenler", "e-Vize olabilir", "Vize olabilir", "Fark etmez"].map((option, index, options) => (
            <button type="button" key={option} className={optionClass(answers.visa === option, index === options.length - 1 && options.length % 2 !== 0)} onClick={() => setAnswers({ ...answers, visa: option })}>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="l2t-route-v27-step-actions">
        <button type="button" className="is-secondary" onClick={() => nextStep("who")}>Geri</button>
        <button type="button" className="is-primary" disabled={answers.vibe.length === 0 || !answers.visa} onClick={() => nextStep("loading")}>
          <Sparkles size={18} /> Planı oluştur
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
                  <span style={{ background: selectedRoute.visaStatus === "Vizesiz" || selectedRoute.visaStatus.startsWith("Kimlikle") ? "#dcfce7" : "#fef3c7", color: selectedRoute.visaStatus === "Vizesiz" || selectedRoute.visaStatus.startsWith("Kimlikle") ? "#166534" : "#92400e", padding: "8px 16px", borderRadius: "100px", fontSize: "0.95rem", fontWeight: "700" }}>
                    {selectedRoute.visaStatus}
                  </span>
                </div>
              </div>

              {selectedRoute.visaNote && (
                <div style={{ margin: "0 0 22px", padding: "14px 16px", border: "1px solid #bfe4cf", borderRadius: "13px", background: "#effaf4", color: "#285b3d" }}>
                  <strong style={{ display: "block", marginBottom: "4px", fontSize: "0.86rem" }}>Doğrulanmış giriş koşulu</strong>
                  <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.55 }}>{selectedRoute.visaNote}</p>
                  {selectedRoute.visaSourceUrl && (
                    <a href={selectedRoute.visaSourceUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: "7px", color: "#0b6f79", fontSize: "0.75rem", fontWeight: 800, textDecoration: "underline" }}>
                      T.C. Dışişleri Bakanlığı kaynağını aç
                    </a>
                  )}
                  {selectedRoute.visaVerifiedAt && <small style={{ display: "block", marginTop: "5px", color: "#60776a" }}>Son veri kontrolü: 5 Ağustos 2026</small>}
                </div>
              )}
              
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
              <span className="l2t-board-slogan">Pasaport gücü, rota planlama ve gerçek gezgin deneyimleri tek yerde.</span>
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
            style={{ background: "var(--l2t-gold)", color: "var(--l2t-navy)", border: "none", minWidth: "200px" }}
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
    <div className="l2t-page l2t-route-v27">
      <div className="l2t-wrap l2t-route-v27-stage">
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
      </div>
    </div>
  );
}
