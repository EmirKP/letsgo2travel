"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Wallet, Plane, CheckCircle2, ChevronRight, Users, MapPin,
  MessageSquare, BookOpen, Clock, Info, Compass
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import PlaneLoader from "../components/PlaneLoader";
import AiDestinationCard from "../components/AiDestinationCard";
import { supabase } from "@/lib/supabase-client";

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
    guideText: string;
    forumText: string;
  };
}

export interface AiPlanResponse {
  summary: string;
  routes: AiRouteResult[];
}

type Step = "welcome" | "origin" | "time" | "budget" | "who" | "vibe" | "loading" | "result" | "error";
type PlannerAnswers = { origin: string; days: string; month: string; budget: string; accommodation: string; who: string; tempo: string; vibe: string[]; visa: string };
type WebPlanRecovery = { owner: string; id: string; fingerprint: string; createdAt: number; answers: PlannerAnswers };
const operationStorageKey = (owner: string) => "l2t.web.ai-route-operation.v1." + encodeURIComponent(owner);
function readWebPlanRecovery(owner: string): WebPlanRecovery | null {
  for (const suffix of [".completed", ""]) {
    try {
      const text = sessionStorage.getItem(operationStorageKey(owner) + suffix);
      if (!text || text.length > 12000) continue;
      const saved = JSON.parse(text), value = saved?.answers;
      if (!saved || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved.id)
        || !/^[a-f0-9]{64}$/.test(saved.fingerprint) || !Number.isFinite(saved.createdAt)
        || Date.now() - saved.createdAt < 0 || Date.now() - saved.createdAt >= 86400000 || !value || typeof value !== "object"
        || ["origin", "days", "month", "budget", "accommodation", "who", "tempo", "visa"].some(key => typeof value[key] !== "string" || value[key].length > 300)
        || !Array.isArray(value.vibe) || value.vibe.length > 20 || value.vibe.some((item: unknown) => typeof item !== "string" || item.length > 100)) continue;
      const answers: PlannerAnswers = { origin: value.origin, days: value.days, month: value.month, budget: value.budget,
        accommodation: value.accommodation, who: value.who, tempo: value.tempo, vibe: value.vibe, visa: value.visa };
      return { owner, id: saved.id, fingerprint: saved.fingerprint, createdAt: saved.createdAt, answers };
    } catch { /* Corrupt, expired and unavailable local receipts are optional. */ }
  }
  return null;
}

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
  const [selectedRoute, setSelectedRoute] = useState<AiRouteResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [planError, setPlanError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [recovery, setRecovery] = useState<WebPlanRecovery | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const ownerRef = useRef<string | null>(null);
  const authRevisionRef = useRef(0);
  const resultOwnerRef = useRef<string | null>(null);
  const operationRef = useRef<{ owner: string; id: string; fingerprint: string; createdAt: number } | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const owner = session?.user.id || null;
      // Initial session delivery can race the first getSession call. Establish
      // that baseline without cancelling a matching preset request; its result
      // still has to match this owner before any provider request begins.
      if (event === "INITIAL_SESSION" && ownerRef.current === null && owner !== null) { ownerRef.current = owner; setRecovery(readWebPlanRecovery(owner)); return; }
      if (ownerRef.current !== owner || event === "SIGNED_OUT" || event === "INITIAL_SESSION" && owner === null) {
        authRevisionRef.current++;
        requestRef.current?.abort();
        requestRef.current = null;
        resultOwnerRef.current = null; operationRef.current = null;
        setResult(null); setSelectedRoute(null); setLastPromptStr("");
        setPlanError(""); setIsRefreshing(false); setStep("welcome");
        setRecovery(owner ? readWebPlanRecovery(owner) : null);
      }
      ownerRef.current = owner;
    });
    return () => { requestRef.current?.abort(); requestRef.current = null; data.subscription.unsubscribe(); };
  }, []);

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

  async function generatePlan(finalAnswers: typeof answers, recovering?: WebPlanRecovery) {
    if (requestRef.current) return;
    const controller = new AbortController(); requestRef.current = controller;
    const authRevision = authRevisionRef.current;
    let requestOwner: string | null = null;
    const current = () => requestRef.current === controller && authRevisionRef.current === authRevision
      && (requestOwner === null || ownerRef.current === requestOwner);
    const active = () => {
      if (!current()) return false;
      if (controller.signal.aborted) throw Object.assign(new Error("request_timeout"), { name: "AbortError" });
      return true;
    };
    const timeoutId = window.setTimeout(() => controller.abort(), 55_000);
    let destinationStep: Step = "error";
    let operationKey = "";
    setPlanError(""); setNeedsSignIn(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active()) return;
      if (!session) { setNeedsSignIn(true); throw new Error("Günde 1 ücretsiz AI rotası oluşturmak için hesabına giriş yap. Seçimlerin bu ekranda korunuyor."); }
      if (ownerRef.current !== null && ownerRef.current !== session.user.id) { destinationStep = "welcome"; return; }
      requestOwner = session.user.id; ownerRef.current = session.user.id;
      setRecovery(readWebPlanRecovery(session.user.id));
      const promptStr = JSON.stringify(finalAnswers);
      if (result && resultOwnerRef.current === session.user.id && !isFallback && promptStr === lastPromptStr) { destinationStep = "result"; return; }
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(promptStr));
      if (!active()) return;
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      operationKey = operationStorageKey(session.user.id);
      let operation = { id: crypto.randomUUID() as string, fingerprint, createdAt: Date.now() };
      if (operationRef.current?.owner === session.user.id && operationRef.current.fingerprint === fingerprint
        && Date.now() - operationRef.current.createdAt < 86400000) operation = operationRef.current;
      try {
        const saved = JSON.parse(sessionStorage.getItem(operationKey) || "null");
        if (saved && saved.fingerprint === fingerprint && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved.id)
          && Number.isFinite(saved.createdAt) && Date.now() - saved.createdAt >= 0 && Date.now() - saved.createdAt < 86400000) operation = saved;
      } catch { /* A single request remains possible when storage is unavailable. */ }
      if (recovering?.owner === session.user.id && recovering.fingerprint === fingerprint && Date.now() - recovering.createdAt >= 0
        && Date.now() - recovering.createdAt < 86400000) operation = recovering;
      const submitted = { id: operation.id, fingerprint, createdAt: operation.createdAt, answers: finalAnswers };
      const serializedSubmission = JSON.stringify(submitted);
      try { if (serializedSubmission.length <= 12000) sessionStorage.setItem(operationKey, serializedSubmission); } catch { /* The in-memory request remains usable. */ }
      operationRef.current = { ...operation, owner: session.user.id };
      const response = await fetch("/api/ai-plan", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, "Idempotency-Key": operation.id },
        body: promptStr, signal: controller.signal,
      });
      if (!active()) return;
      const data = await response.json();
      if (!active()) return;
      if (!response.ok) {
        if (response.status === 401) setNeedsSignIn(true);
        if (data.code === "plan_expired" || data.code === "plan_conflict") { operationRef.current = null; try { sessionStorage.removeItem(operationKey); } catch { /* No storage reset. */ } }
        const reset = typeof data.quota?.resetAt === "string" ? new Date(data.quota.resetAt) : null;
        const resetText = reset && Number.isFinite(reset.getTime()) ? reset.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "bir sonraki günlük yenilenmede";
        throw new Error(data.code === "plan_limit" ? "Bugünkü rota hakkını kullandın. Yeni hakkın: " + resetText + ". Mevcut planlarını düzenleyebilirsin."
          : data.code === "plan_pending" ? "Rotan hâlâ hazırlanıyor. Biraz bekleyip aynı seçimlerle tekrar dene."
          : data.code === "plan_request_too_large" ? "Bu rota isteği ücretsiz işlem kapasitesini aşıyor. Gün sayısını veya notlarını azaltıp tekrar dene. Seçimlerin ve önceki planın korundu; günlük hakkın kullanılmadı."
          : response.status === 401 ? "Devam etmek için hesabına giriş yap. Seçimlerin korundu."
          : "Rota şu an oluşturulamadı. Seçimlerin ve önceki planın korundu; aynı seçimlerle tekrar deneyebilirsin.");
      }
      if (!data?.success || !data.data || !Array.isArray(data.data.routes) || !data.data.routes.length) throw new Error("Plan yanıtı doğrulanamadı. Seçimlerin korundu; tekrar deneyebilirsin.");
      setResult(data.data); setIsFallback(data.isFallback === true); setLastPromptStr(promptStr);
      // Keep the receipt identity for its existing 24-hour window. Reloading
      // can recover this server result without spending a second allowance.
      resultOwnerRef.current = session.user.id;
      if (data.isFallback !== true) {
        try { if (serializedSubmission.length <= 12000) sessionStorage.setItem(operationKey + ".completed", serializedSubmission); } catch { /* Keep the visible result even if storage is blocked. */ }
        setRecovery({ ...submitted, owner: session.user.id });
      }
      setSelectedRoute(null); destinationStep = "result";
    } catch (error) {
      if (!current()) return;
      setPlanError(error instanceof Error && error.name !== "AbortError" ? error.message : "İstek zamanında tamamlanamadı. Aynı seçimlerle tekrar dene; varsa hazırlanmış rotan geri alınır.");
      destinationStep = result ? "result" : "error";
    } finally {
      window.clearTimeout(timeoutId);
      if (current()) { requestRef.current = null; setStep(destinationStep); setIsRefreshing(false); }
    }
  }

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
              <Link href="/seyahat-kokpiti" className="l2t-btn" style={{ flex: 1, minWidth: "200px", minHeight: "44px", textAlign: "center", justifyContent: "center" }}>
                <Compass size={18} style={{ marginRight: "8px" }} /> Bu rota için plan oluştur
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
        <p>Hesabınla günde 1 ücretsiz AI rotası oluşturabilirsin. Mevcut rotaları açmak ve elle düzenlemek bu hakkı kullanmaz.</p>
        {recovery && <button className="l2t-btn l2t-btn-outline" disabled={step === "loading"} onClick={() => {
          setAnswers(recovery.answers); setStep("loading"); void generatePlan(recovery.answers, recovery);
        }}>Önceki rotamı geri aç — günlük hakkımı kullanmadan</button>}
        {planError && <div role="alert" className="l2t-route-v27-step-head" style={{ padding: 20, display: "grid", gap: 12 }}>
          <p>{planError}</p>
          {needsSignIn && <Link href="/auth/login?next=%2Frota-asistani" target="_blank" rel="noopener noreferrer">Giriş yap — ardından bu ekrana dön</Link>}
          <button className="l2t-btn" onClick={() => { setStep("loading"); void generatePlan(answers); }}>Aynı seçimlerle tekrar dene</button>
          <button className="l2t-btn l2t-btn-outline" onClick={() => { setPlanError(""); setStep("origin"); }}>Seçimlerimi düzenle</button>
        </div>}
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
