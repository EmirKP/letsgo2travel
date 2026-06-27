"use client";

import { useState } from "react";
import { Calculator, Wallet, Utensils, Bus, Ticket, MapPin, CalendarDays, Coins, BedDouble, Plane, Info, CheckCircle2, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// Mock Data for Cities (Daily costs in Euro/USD)
const cityData: Record<string, { currency: string, rateToTRY: number, budget: { hotel: number, food: number, transport: number, tickets: number, flight: number }, mid: { hotel: number, food: number, transport: number, tickets: number, flight: number }, luxury: { hotel: number, food: number, transport: number, tickets: number, flight: number } }> = {
  "Roma, İtalya": { currency: "€", rateToTRY: 37.5, budget: { hotel: 40, food: 25, transport: 5, tickets: 10, flight: 150 }, mid: { hotel: 90, food: 55, transport: 15, tickets: 25, flight: 200 }, luxury: { hotel: 250, food: 120, transport: 40, tickets: 60, flight: 350 } },
  "Paris, Fransa": { currency: "€", rateToTRY: 37.5, budget: { hotel: 50, food: 30, transport: 8, tickets: 15, flight: 150 }, mid: { hotel: 120, food: 70, transport: 20, tickets: 35, flight: 200 }, luxury: { hotel: 300, food: 150, transport: 50, tickets: 80, flight: 350 } },
  "Belgrad, Sırbistan": { currency: "€", rateToTRY: 37.5, budget: { hotel: 25, food: 15, transport: 3, tickets: 5, flight: 100 }, mid: { hotel: 50, food: 35, transport: 10, tickets: 15, flight: 130 }, luxury: { hotel: 120, food: 80, transport: 25, tickets: 40, flight: 200 } },
  "Dubai, BAE": { currency: "$", rateToTRY: 34.2, budget: { hotel: 40, food: 20, transport: 10, tickets: 15, flight: 200 }, mid: { hotel: 100, food: 60, transport: 25, tickets: 50, flight: 250 }, luxury: { hotel: 350, food: 150, transport: 80, tickets: 120, flight: 400 } },
  "Tiflis, Gürcistan": { currency: "$", rateToTRY: 34.2, budget: { hotel: 20, food: 12, transport: 2, tickets: 5, flight: 100 }, mid: { hotel: 45, food: 25, transport: 8, tickets: 12, flight: 150 }, luxury: { hotel: 100, food: 60, transport: 20, tickets: 30, flight: 250 } },
};

export default function BudgetCalculatorPage() {
  const [city, setCity] = useState("Roma, İtalya");
  const [days, setDays] = useState(3);
  const [people, setPeople] = useState(1);
  const [style, setStyle] = useState<"budget" | "mid" | "luxury">("mid");
  const [includeFlight, setIncludeFlight] = useState(true);
  const [includeHotel, setIncludeHotel] = useState(true);
  const [isCalculated, setIsCalculated] = useState(false);

  const calculateBudget = () => {
    setIsCalculated(true);
  };

  const data = cityData[city];
  const costs = data[style];
  
  // calculations
  const dailyPerPerson = costs.food + costs.transport + costs.tickets + (includeHotel ? costs.hotel : 0);
  const flightPerPerson = includeFlight ? costs.flight : 0;
  
  const totalPerPerson = (dailyPerPerson * days) + flightPerPerson;
  const totalTrip = totalPerPerson * people;
  const totalTRY = totalTrip * data.rateToTRY;

  const getStyleText = () => {
    if (style === "budget") return "Bu rota düşük bütçeli seyahat veya sırt çantalı gezginler için hesaplanmıştır.";
    if (style === "mid") return "Bu seyahat orta seviye konforlu ve dengeli bir bütçeye uygundur.";
    return "Bu hesaplama premium ve lüks bir deneyim beklentisine göre yapılmıştır.";
  };

  return (
    <div className="l2t-page l2t-wrap" style={{ padding: "40px 20px" }}>
      <div className="planner-header" style={{ textAlign: "center", marginBottom: "40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(245, 158, 11, 0.1)", padding: "8px 16px", borderRadius: "20px", color: "#F59E0B", fontWeight: "600", marginBottom: "16px" }}>
          <Calculator size={20} />
          <span>Profesyonel Seyahat Bütçe Planlayıcı</span>
        </div>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>Seyahatin Ne Kadara Mal Olur?</h1>
        <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
          Gideceğin ülkeyi, gün ve kişi sayısını seç; uçaktan otele, yemekten şehir içi ulaşıma kadar tüm detayları anında hesaplayalım.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "32px", alignItems: "start", maxWidth: "1000px", margin: "0 auto", paddingBottom: "60px" }}>
        
        {/* Form Paneli */}
        <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff" }}>
          <h2 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Wallet color="var(--l2t-blue)" /> Seyahat Parametreleri
          </h2>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "var(--l2t-navy)" }}>
              <MapPin size={16} style={{ display: "inline", marginRight: "4px" }} /> Hedef Şehir
            </label>
            <select 
              className="l2t-input" 
              value={city} 
              onChange={(e) => { setCity(e.target.value); setIsCalculated(false); }}
              style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid #ddd", fontSize: "1rem", outline: "none", background: "#f8fafc" }}
            >
              {Object.keys(cityData).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "var(--l2t-navy)" }}>
                <CalendarDays size={16} style={{ display: "inline", marginRight: "4px" }} /> Gün
              </label>
              <input type="number" min="1" value={days} onChange={(e) => { setDays(parseInt(e.target.value) || 1); setIsCalculated(false); }} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid #ddd", fontSize: "1rem", outline: "none", background: "#f8fafc" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "var(--l2t-navy)" }}>
                <Coins size={16} style={{ display: "inline", marginRight: "4px" }} /> Kişi
              </label>
              <input type="number" min="1" value={people} onChange={(e) => { setPeople(parseInt(e.target.value) || 1); setIsCalculated(false); }} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "1px solid #ddd", fontSize: "1rem", outline: "none", background: "#f8fafc" }} />
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "var(--l2t-navy)" }}>Seyahat Tarzı</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <button onClick={() => { setStyle("budget"); setIsCalculated(false); }} className={`l2t-btn ${style === "budget" ? "" : "l2t-btn-outline"}`} style={{ padding: "10px", fontSize: "0.9rem" }}>Ekonomik</button>
              <button onClick={() => { setStyle("mid"); setIsCalculated(false); }} className={`l2t-btn ${style === "mid" ? "" : "l2t-btn-outline"}`} style={{ padding: "10px", fontSize: "0.9rem" }}>Dengeli</button>
              <button onClick={() => { setStyle("luxury"); setIsCalculated(false); }} className={`l2t-btn ${style === "luxury" ? "" : "l2t-btn-outline"}`} style={{ padding: "10px", fontSize: "0.9rem" }}>Lüks</button>
            </div>
          </div>

          <div style={{ marginBottom: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--l2t-navy)", fontWeight: "600" }}>
              <input type="checkbox" checked={includeFlight} onChange={(e) => { setIncludeFlight(e.target.checked); setIsCalculated(false); }} style={{ width: "18px", height: "18px", accentColor: "#1476f2" }} />
              Uçak bileti hesaba dahil edilsin
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--l2t-navy)", fontWeight: "600" }}>
              <input type="checkbox" checked={includeHotel} onChange={(e) => { setIncludeHotel(e.target.checked); setIsCalculated(false); }} style={{ width: "18px", height: "18px", accentColor: "#1476f2" }} />
              Konaklama hesaba dahil edilsin
            </label>
          </div>

          <button onClick={calculateBudget} className="l2t-btn" style={{ width: "100%", padding: "16px", fontSize: "1.1rem", background: "linear-gradient(135deg, #1476f2, #0A1F4A)" }}>
            Bütçemi Hesapla 🚀
          </button>
        </div>

        {/* Sonuç Paneli */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <AnimatePresence>
            {isCalculated ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel glow-card" style={{ padding: "32px", borderRadius: "24px", background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}>
                <h3 style={{ fontSize: "1.2rem", opacity: 0.9, marginBottom: "8px" }}>Toplam Tahmini Bütçe</h3>
                <div style={{ fontSize: "3.5rem", fontWeight: "800", marginBottom: "4px", lineHeight: "1" }}>
                  {data.currency}{totalTrip.toLocaleString()}
                </div>
                <div style={{ fontSize: "1.2rem", opacity: 0.9, marginBottom: "24px" }}>
                  ≈ {totalTRY.toLocaleString("tr-TR")} TL <span style={{ fontSize: "0.9rem", opacity: 0.8 }}>({people} kişi, {days} gün)</span>
                </div>
                
                <div style={{ background: "rgba(255,255,255,0.15)", padding: "16px", borderRadius: "16px", fontSize: "0.95rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span>Günlük Ortalama (Toplam):</span>
                    <strong>{data.currency}{Math.round(totalTrip / days)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Kişi Başı Günlük (Uçuş Hariç):</span>
                    <strong>{data.currency}{dailyPerPerson}</strong>
                  </div>
                </div>

                <div style={{ marginTop: "24px", display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.85rem", opacity: 0.9 }}>
                  <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ margin: 0 }}>Bu hesaplama tahmini bilgilendirme amaçlıdır. Uçak bileti, otel ve ülke içi fiyatlar tarihe, sezona ve erken rezervasyon durumuna göre değişiklik gösterebilir.</p>
                </div>
              </motion.div>
            ) : (
              <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#f8fafc", color: "var(--l2t-soft)", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: "250px", textAlign: "center", border: "2px dashed #cbd5e1" }}>
                Sonuçları görmek için bilgileri girip "Hesapla" butonuna bas.
              </div>
            )}
          </AnimatePresence>

          {isCalculated && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff" }}>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", marginBottom: "4px", fontWeight: "800" }}>Detaylı Harcama Kırılımı</h3>
                <p style={{ color: "var(--l2t-soft)", fontSize: "0.9rem", margin: 0 }}>Kişi başı yaklaşık maliyetler ({data.currency})</p>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {includeFlight && (
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#1476f2" }}><Plane size={24}/></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "700", color: "var(--l2t-navy)" }}>Uçak Bileti</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Gidiş-dönüş tahmini ortalama bilet</div>
                    </div>
                    <div style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.1rem" }}>{data.currency}{flightPerPerson}</div>
                  </div>
                )}
                
                {includeHotel && (
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b5cf6" }}><BedDouble size={24}/></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "700", color: "var(--l2t-navy)" }}>Konaklama (Günlük)</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Otelin kişi başına düşen gecelik payı</div>
                    </div>
                    <div style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.1rem" }}>{data.currency}{costs.hotel}</div>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b" }}><Utensils size={24}/></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "700", color: "var(--l2t-navy)" }}>Yeme & İçme (Günlük)</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Kahvaltı, kahve molası ve akşam yemeği</div>
                  </div>
                  <div style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.1rem" }}>{data.currency}{costs.food}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}><Bus size={24}/></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "700", color: "var(--l2t-navy)" }}>Şehir İçi Ulaşım (Günlük)</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Metro, otobüs veya kısa mesafe taksi</div>
                  </div>
                  <div style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.1rem" }}>{data.currency}{costs.transport}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#fdf2f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ec4899" }}><Ticket size={24}/></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "700", color: "var(--l2t-navy)" }}>Müze & Aktivite (Günlük)</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>Müze girişleri, turlar veya etkinlikler</div>
                  </div>
                  <div style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.1rem" }}>{data.currency}{costs.tickets}</div>
                </div>
              </div>

              <div style={{ marginTop: "24px", padding: "16px", background: "#f8fafc", borderRadius: "12px", fontSize: "0.9rem", color: "var(--l2t-navy)", display: "flex", gap: "12px" }}>
                 <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0 }} />
                 {getStyleText()}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "32px" }}>
                 <Link href="/ucak-bileti-ara" className="l2t-btn" style={{ padding: "14px", textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <Plane size={18} /> Uçuş Ara
                 </Link>
                 <Link href="/akilli-plan" className="l2t-btn l2t-btn-outline" style={{ padding: "14px", textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", borderColor: "var(--l2t-navy)", color: "var(--l2t-navy)" }}>
                    <Navigation size={18} /> Bu Bütçeyle Rota Çiz
                 </Link>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
