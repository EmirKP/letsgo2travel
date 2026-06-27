"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { Save, Check, Share2, Calendar, Luggage, Lightbulb, Sparkles, Plane } from "lucide-react";

type AiTripDay = { day: string; title: string; text: string };
type AiTripPlan = {
  summary: string;
  destination: string;
  score: number;
  budgetText: string;
  travelStyle: string;
  bestFor: string;
  tags: string[];
  itinerary: AiTripDay[];
  essentials: string[];
  smartTips: string[];
  affiliateLinks: { flights: string; hotels: string; esim: string; tours: string };
};

type ApiResponse = { data: AiTripPlan; mode: "openai" | "smart-fallback" };

const quickQueries = [
  "İstanbul çıkışlı 3 günlük vizesiz Balkan rotası",
  "10 bin TL altı kimlikle gidilecek ekonomik rota",
  "Yaz için deniz tatili, vizesiz ve uygun uçuş",
  "Schengen varsa kültür odaklı hafta sonu planı",
];

export default function AITripPlanner() {
  const [query, setQuery] = useState(quickQueries[0]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AiTripPlan | null>(null);
  const [mode, setMode] = useState<string>("");
  const [isSaved, setIsSaved] = useState(false);
  const [packingList, setPackingList] = useState<Record<string, boolean>>({});
  const router = useRouter();

  const ctaLinks = useMemo(() => {
    if (!plan) return [];
    return [
      { label: "Uçuşu canlı ara", href: plan.affiliateLinks.flights },
      { label: "Otel bak", href: plan.affiliateLinks.hotels },
      { label: "eSIM hazırla", href: plan.affiliateLinks.esim },
      { label: "Aktivite bul", href: plan.affiliateLinks.tours },
    ];
  }, [plan]);

  async function generatePlan(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setIsSaved(false);
    try {
      const response = await fetch("/api/ai-trip-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as ApiResponse;
      setPlan(data.data);
      setMode(data.mode === "openai" ? "OpenAI aktif" : "Akıllı fallback aktif");
      
      // Initialize packing list state based on essentials
      const initialPacking: Record<string, boolean> = {};
      data.data.essentials.forEach(item => initialPacking[item] = false);
      setPackingList(initialPacking);
    } catch {
      setMode("Plan üretilemedi");
    } finally {
      setLoading(false);
    }
  }

  const handleSaveTrip = async () => {
    if (!plan) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/auth/login");
      return;
    }
    
    await supabase.from("user_trips").insert([
      {
        user_id: session.user.id,
        title: `${plan.destination} Rotası`,
        destination: plan.destination,
        trip_data: plan
      }
    ]);
    setIsSaved(true);
  };

  const togglePackingItem = (item: string) => {
    setPackingList(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const handleShareWhatsApp = () => {
    if (!plan) return;
    const text = `Let's Go 2 Travel AI ile harika bir rota çizdim! İstikamet: ${plan.destination}. Sen de göz at: https://letsgo2travel.vercel.app`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleShareTwitter = () => {
    if (!plan) return;
    const text = `Let's Go 2 Travel AI ile ${plan.destination} için harika bir seyahat rotası oluşturdum! Sen de dene: https://letsgo2travel.vercel.app #Seyahat #LetsGo2Travel`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="l2t-ai-planner-card">
      <div className="l2t-ai-planner-head">
        <div>
          <span className="l2t-ai-mini-label">AI trip builder</span>
          <h3>Seyahati tek cümleden plana çevir</h3>
        </div>
        <strong>{mode || "Hazır"}</strong>
      </div>

      <form onSubmit={generatePlan} className="l2t-ai-planner-form">
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} placeholder="Örn: 3 günlük vizesiz, ucuz, hafta sonu rotası" />
        <button className="l2t-btn" disabled={loading}>{loading ? "Planlanıyor..." : "AI plan oluştur"}</button>
      </form>

      <div className="l2t-ai-chip-row" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
        {quickQueries.map((item) => (
          <button 
            key={item} 
            type="button" 
            onClick={() => setQuery(item)}
            style={{ padding: "10px 16px", borderRadius: "100px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "var(--l2t-navy)", fontSize: "0.95rem", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {item}
          </button>
        ))}
      </div>

      {!plan && !loading && (
        <div style={{ marginTop: "40px", padding: "24px", borderRadius: "16px", border: "1px dashed #cbd5e1", background: "rgba(248,250,252,0.6)", position: "relative" }}>
          <div style={{ position: "absolute", top: "-12px", left: "24px", background: "var(--l2t-navy)", color: "#fff", fontSize: "0.75rem", fontWeight: "700", padding: "4px 10px", borderRadius: "100px", letterSpacing: "1px", textTransform: "uppercase" }}>Örnek Sonuç</div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: "1.3rem", color: "var(--l2t-navy)" }}>3 Günlük Saraybosna Rotası</h4>
              <p style={{ margin: 0, color: "var(--l2t-soft)", fontSize: "0.95rem" }}>Tahmini Bütçe: 8.500 TL • Vizesiz • İlk kez çıkanlar için</p>
            </div>
            <span style={{ background: "#dcfce3", color: "#065f46", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "600" }}>%98 Eşleşme</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ background: "var(--l2t-blue)", color: "#fff", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>1</div>
              <div>
                <strong style={{ display: "block", color: "var(--l2t-navy)", marginBottom: "4px" }}>Başçarşı ve şehir merkezi</strong>
                <span style={{ color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Tarihi sokaklarda yürüyüş, Boşnak böreği ve kahve molası.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ background: "var(--l2t-blue)", color: "#fff", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>2</div>
              <div>
                <strong style={{ display: "block", color: "var(--l2t-navy)", marginBottom: "4px" }}>Mostar veya Trebević gezisi</strong>
                <span style={{ color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Teleferikle Trebević dağına çıkış veya günübirlik Mostar turu.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ background: "var(--l2t-blue)", color: "#fff", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>3</div>
              <div>
                <strong style={{ display: "block", color: "var(--l2t-navy)", marginBottom: "4px" }}>Yerel pazarlar ve dönüş</strong>
                <span style={{ color: "var(--l2t-soft)", fontSize: "0.9rem" }}>Hediyelik eşya alışverişi ve havalimanına geçiş.</span>
              </div>
            </div>
          </div>
          
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "80px", background: "linear-gradient(to bottom, transparent, #f8fafc)", borderRadius: "0 0 16px 16px" }}></div>
        </div>
      )}

      {plan ? (
        <div className="l2t-ai-plan-result">
          <div className="l2t-ai-score-card">
            <div>
              <span>AI rota skoru</span>
              <strong>%{plan.score}</strong>
            </div>
            <div>
              <span>Önerilen şehir</span>
              <strong>{plan.destination}</strong>
            </div>
            <div>
              <span>Tarz</span>
              <strong>{plan.travelStyle}</strong>
            </div>
          </div>

          <p className="l2t-ai-summary">{plan.summary}</p>

          <div className="l2t-ai-tags">
            {plan.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>

          <div className="l2t-ai-plan-columns">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h4 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}><Calendar size={20} color="#1476f2" /> Günlük Mini Plan</h4>
              {plan.itinerary.map((item, idx) => (
                <article key={`${item.day}-${item.title}`} style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", borderLeft: "4px solid var(--l2t-blue)", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                  <small style={{ color: "var(--l2t-blue)", fontWeight: "800", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>{item.day}</small>
                  <h5 style={{ fontSize: "1.1rem", margin: "4px 0 8px", color: "var(--l2t-navy)" }}>{item.title}</h5>
                  <p style={{ fontSize: "0.95rem", color: "var(--l2t-soft)", lineHeight: "1.5" }}>{item.text}</p>
                </article>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div>
                <h4 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}><Luggage size={20} color="#8b5cf6" /> Dinamik Bavul Listesi</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {plan.essentials.map((item) => (
                    <label key={item} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", background: packingList[item] ? "#dcfce3" : "#f1f5f9", borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}>
                      <input 
                        type="checkbox" 
                        checked={packingList[item] || false} 
                        onChange={() => togglePackingItem(item)}
                        style={{ accentColor: "#10b981", width: "18px", height: "18px" }}
                      />
                      <span style={{ fontSize: "0.95rem", color: packingList[item] ? "#065f46" : "var(--l2t-navy)", textDecoration: packingList[item] ? "line-through" : "none" }}>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", borderBottom: "2px solid #e2e8f0", paddingBottom: "8px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}><Lightbulb size={20} color="#f59e0b" /> Öne Çıkanlar & İpuçları</h4>
                <ul style={{ paddingLeft: "20px", color: "var(--l2t-soft)", fontSize: "0.95rem", lineHeight: "1.6" }}>
                  {plan.smartTips.map((item) => <li key={item} style={{ marginBottom: "6px" }}>{item}</li>)}
                </ul>
              </div>
            </div>
          </div>

          <div className="l2t-ai-cta-grid" style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
            {ctaLinks.map((item) => (
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "var(--l2t-navy)", textAlign: "center", padding: "12px", borderRadius: "8px", fontWeight: "600", textDecoration: "none", transition: "all 0.2s" }}
                onMouseOver={(e) => { e.currentTarget.style.background = "var(--l2t-navy)"; e.currentTarget.style.color = "#fff"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "var(--l2t-navy)"; }}
              >{item.label} →</a>
            ))}
          </div>

          <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "16px", borderRadius: "12px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={handleShareTwitter} className="l2t-btn" style={{ background: "#000", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}>
                X'te Paylaş
              </button>
              <button onClick={handleShareWhatsApp} className="l2t-btn" style={{ background: "#25D366", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}>
                <Share2 size={16} /> WhatsApp
              </button>
            </div>
            
            <div style={{ textAlign: "right" }}>
              <button 
                onClick={handleSaveTrip} 
                disabled={isSaved}
                className="l2t-btn" 
                style={{ background: isSaved ? "#10b981" : "var(--l2t-blue)", border: "none", display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 24px" }}
              >
                {isSaved ? <><Check size={18} /> Kaydedildi</> : <><Save size={18} /> Profilime Kaydet</>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="l2t-ai-empty-preview">
          <Sparkles size={32} color="var(--l2t-blue)" />
          <p>Örneklerden birini seç veya kendi cümleni yaz. AI; rota, bütçe, vize, mini plan ve affiliate yönlendirmelerini tek kartta çıkarır.</p>
        </div>
      )}
    </div>
  );
}
