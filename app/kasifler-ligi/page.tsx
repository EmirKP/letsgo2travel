"use client";

import { useEffect, useState } from "react";
import { Trophy, Crown, Globe2, AlertTriangle, UserPlus, MapPin, Sparkles, ShieldCheck, Gift } from "lucide-react";
import Link from "next/link";

export default function KasiflerLigiPage() {
  const [activeTab, setActiveTab] = useState<"beyan" | "verified" | "month">("beyan");
  
  const [beyanLeaderboard, setBeyanLeaderboard] = useState<any[]>([]);
  const [verifiedLeaderboard, setVerifiedLeaderboard] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(false);
      try {
        const resBeyan = await fetch("/api/kasifler-ligi");
        const jsonBeyan = await resBeyan.json();
        if (jsonBeyan.data) setBeyanLeaderboard(jsonBeyan.data);
        
        const resVerified = await fetch("/api/dogrulanmis-kasifler");
        const jsonVerified = await resVerified.json();
        if (jsonVerified.data) setVerifiedLeaderboard(jsonVerified.data);
      } catch (err) {
        console.error("Veriler çekilemedi", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const renderBeyanTab = () => (
    <div className="glass-panel" style={{ padding: "40px", borderRadius: "32px", background: "#fff", boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
      <div style={{ marginBottom: "24px", padding: "16px", background: "rgba(20, 118, 242, 0.05)", borderRadius: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <Globe2 size={24} color="var(--l2t-blue)" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--l2t-soft)", lineHeight: "1.5" }}>
          Kaşifler Ligi, kullanıcıların kendi beyanlarına dayalı oyunlaştırılmış keşif sıralamasıdır. Resmî seyahat doğrulaması değildir. Doğrulanmış sıralama için "Doğrulanmış Kaşifler" sekmesini inceleyebilirsiniz.
        </p>
      </div>

      {error || beyanLeaderboard.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", background: "#f8fafc", borderRadius: "24px", border: "2px dashed #e2e8f0" }}>
          <Globe2 size={64} color="#cbd5e1" style={{ margin: "0 auto 24px" }} />
          <h3 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", marginBottom: "12px" }}>Henüz Lider Yok</h3>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", fontSize: "1.05rem", maxWidth: "450px", margin: "0 auto 32px", lineHeight: "1.6" }}>
            Henüz Kaşifler Ligi'nde görünmeyi seçen kullanıcı yok. Profilinden katılımı açarak ilk kaşiflerden biri olabilirsin.
          </p>
          <Link href="/profil/harita" className="l2t-btn" style={{ padding: "14px 32px", fontSize: "1.05rem", display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <MapPin size={18} /> Profilime Git
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {beyanLeaderboard.map((l, index) => {
            const rank = index + 1;
            const isFirst = rank === 1;
            
            let bgStyle = "#f8fafc";
            let rankColor = "#94A3B8";
            let borderStyle = "1px solid #f1f5f9";

            if (isFirst) {
              bgStyle = "linear-gradient(to right, rgba(245, 158, 11, 0.05), transparent)";
              rankColor = "#F59E0B";
              borderStyle = "1px solid rgba(245, 158, 11, 0.2)";
            } else if (rank === 2) { rankColor = "#94A3B8"; } 
            else if (rank === 3) { rankColor = "#b45309"; }

            return (
              <div key={l.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: bgStyle, padding: "20px 24px", borderRadius: "20px", border: borderStyle, transition: "transform 0.2s" }} className="hover-tilt">
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ fontWeight: "900", color: rankColor, fontSize: "1.4rem" }}>#{rank}</span>
                    {isFirst && <Crown size={18} color="#F59E0B" style={{ position: "absolute", top: "-16px", left: "50%", transform: "translateX(-50%)" }} />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.2rem", textTransform: "capitalize" }}>
                      {l.username}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--l2t-blue)", fontWeight: "700", background: "rgba(20, 118, 242, 0.1)", padding: "2px 10px", borderRadius: "10px" }}>{l.level}</span>
                      <span style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>{l.points} Puan</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <span style={{ fontSize: "1.2rem", color: isFirst ? "#F59E0B" : "var(--l2t-navy)", fontWeight: "900" }}>
                    {l.visitedCount}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--l2t-soft)", fontWeight: "700", textTransform: "uppercase" }}>Ülke</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderVerifiedTab = () => (
    <div className="glass-panel" style={{ padding: "40px", borderRadius: "32px", background: "#fff", boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
      <div style={{ marginBottom: "24px", padding: "16px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <ShieldCheck size={24} color="#10b981" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--l2t-soft)", lineHeight: "1.5" }}>
          Doğrulanmış Kaşifler sıralamasında yalnızca konum kontrolü veya admin onaylı seyahat kanıtı ile doğrulanmış ülkeler sayılır. Fiziksel ödüller bu sıralamadaki puana göre hesaplanır.
        </p>
      </div>

      {verifiedLeaderboard.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", background: "#f8fafc", borderRadius: "24px", border: "2px dashed #e2e8f0" }}>
          <ShieldCheck size={64} color="#cbd5e1" style={{ margin: "0 auto 24px" }} />
          <h3 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", marginBottom: "12px" }}>Henüz Doğrulanmış Kaşif Yok</h3>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", fontSize: "1.05rem", maxWidth: "450px", margin: "0 auto 32px", lineHeight: "1.6" }}>
            Henüz doğrulanmış kaşif bulunmuyor. Seyahat Haritam’dan ülke doğrulama talebi oluşturabilirsin.
          </p>
          <Link href="/profil/harita" className="l2t-btn" style={{ padding: "14px 32px", fontSize: "1.05rem", display: "inline-flex", alignItems: "center", gap: "10px", background: "#10b981" }}>
            <ShieldCheck size={18} /> Kanıt Yükle
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {verifiedLeaderboard.map((l, index) => {
            const rank = index + 1;
            const isFirst = rank === 1;
            
            let bgStyle = "#f8fafc";
            let rankColor = "#94A3B8";
            let borderStyle = "1px solid #f1f5f9";

            if (isFirst) {
              bgStyle = "linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)";
              rankColor = "#10b981";
              borderStyle = "1px solid rgba(16, 185, 129, 0.2)";
            } else if (rank === 2) { rankColor = "#94A3B8"; } 
            else if (rank === 3) { rankColor = "#b45309"; }

            return (
              <div key={l.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: bgStyle, padding: "20px 24px", borderRadius: "20px", border: borderStyle, transition: "transform 0.2s" }} className="hover-tilt">
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ fontWeight: "900", color: rankColor, fontSize: "1.4rem" }}>#{rank}</span>
                    {isFirst && <Crown size={18} color="#10b981" style={{ position: "absolute", top: "-16px", left: "50%", transform: "translateX(-50%)" }} />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontWeight: "800", color: "var(--l2t-navy)", fontSize: "1.2rem", textTransform: "capitalize", display: "flex", alignItems: "center", gap: "6px" }}>
                      {l.username} <ShieldCheck size={16} color="#10b981" />
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", color: "#10b981", fontWeight: "700", background: "rgba(16, 185, 129, 0.1)", padding: "2px 10px", borderRadius: "10px" }}>{l.level}</span>
                      <span style={{ fontSize: "0.85rem", color: "var(--l2t-soft)", fontWeight: "600" }}>{l.verifiedPoints} Onaylı Puan</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <span style={{ fontSize: "1.2rem", color: isFirst ? "#10b981" : "var(--l2t-navy)", fontWeight: "900" }}>
                    {l.verifiedCount}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--l2t-soft)", fontWeight: "700", textTransform: "uppercase" }}>Doğrulanmış Ülke</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderMonthTab = () => {
    const currentWinner = verifiedLeaderboard.length > 0 ? verifiedLeaderboard[0] : null;

    return (
      <div className="glass-panel" style={{ padding: "40px", borderRadius: "32px", background: "#fff", boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
        
        {currentWinner ? (
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ display: "inline-flex", width: "100px", height: "100px", borderRadius: "50%", background: "linear-gradient(135deg, #F59E0B, #fbbf24)", color: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 15px 30px rgba(245, 158, 11, 0.3)", marginBottom: "20px", position: "relative" }}>
              <Crown size={48} />
              <div style={{ position: "absolute", bottom: "-10px", background: "#fff", color: "#b45309", padding: "4px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: "800", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}>BU AY</div>
            </div>
            <h2 style={{ fontSize: "2rem", color: "var(--l2t-navy)", marginBottom: "8px", textTransform: "capitalize" }}>{currentWinner.username}</h2>
            <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", margin: "0 auto", maxWidth: "400px" }}>
              Şu ana kadar {currentWinner.verifiedPoints} doğrulanmış keşif puanı ile ayın liderliğini elinde tutuyor!
            </p>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ display: "inline-flex", width: "100px", height: "100px", borderRadius: "50%", background: "#f1f5f9", color: "#cbd5e1", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
              <Crown size={48} />
            </div>
            <h2 style={{ fontSize: "1.6rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Henüz Lider Belli Değil</h2>
            <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem", margin: "0 auto", maxWidth: "400px" }}>
              Doğrulanmış keşif puanı toplayarak Ayın Kaşifi olma fırsatı senin!
            </p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "center" }}>
          {/* Ödül Kartı */}
          <div style={{ background: "#f8fafc", borderRadius: "24px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
            <div style={{ width: "100%", height: "200px", background: "#e2e8f0", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Gift size={64} color="#94a3b8" />
              <img src="/rewards/letsgo2travel-reward-set.jpg" alt="LetsGo2Travel Ödül Seti" style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", opacity: 0 }} onLoad={(e) => (e.target as HTMLImageElement).style.opacity = '1'} onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
            </div>
            <div style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}><Sparkles size={20} color="#F59E0B" /> LetsGo2Travel Ödül Seti</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", lineHeight: "1.5", margin: 0 }}>
                Ayın Kaşifi özel tişört, şapka, bileklik ve profilinde sergilenecek "Ayın Kaşifi" dijital rozetinin sahibi olur.
              </p>
            </div>
          </div>

          {/* Kurallar */}
          <div style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", marginBottom: "16px" }}>Kurallar & Detaylar</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", color: "var(--l2t-soft)", fontSize: "0.95rem", lineHeight: "1.5" }}>
              <li style={{ display: "flex", gap: "10px" }}><div style={{ color: "#10b981", fontWeight: "900" }}>✓</div> Yarışma her ayın ilk günü başlar ve son günü biter.</li>
              <li style={{ display: "flex", gap: "10px" }}><div style={{ color: "#10b981", fontWeight: "900" }}>✓</div> Kazanan, ay sonunda en yüksek doğrulanmış keşif puanına sahip kullanıcıdır. (Çekiliş yapılmaz)</li>
              <li style={{ display: "flex", gap: "10px" }}><div style={{ color: "#10b981", fontWeight: "900" }}>✓</div> Aynı ülke yalnızca bir kez puan kazandırır.</li>
              <li style={{ display: "flex", gap: "10px" }}><div style={{ color: "#10b981", fontWeight: "900" }}>✓</div> Ödül nakde çevrilemez ve stok durumuna göre değişiklik gösterebilir.</li>
              <li style={{ display: "flex", gap: "10px" }}><div style={{ color: "#10b981", fontWeight: "900" }}>✓</div> Ödül gönderimi için paylaştığın iletişim/kargo bilgisi yalnızca teslimat süreci için kullanılır, public olarak paylaşılmaz.</li>
            </ul>
          </div>
        </div>

      </div>
    );
  };

  if (loading) {
    return (
      <div className="l2t-page l2t-wrap" style={{ minHeight: "100vh", padding: "100px 20px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", color: "var(--l2t-navy)" }}>
          <div className="spinner" style={{ border: "4px solid rgba(20, 118, 242, 0.1)", borderTop: "4px solid var(--l2t-blue)", borderRadius: "50%", width: "40px", height: "40px", animation: "spin 1s linear infinite", margin: "0 auto 16px" }}></div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Kaşifler Ligi yükleniyor...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "100vh", padding: "60px 20px", background: "#f8fafc" }}>
      
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", borderRadius: "24px", background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#fff", marginBottom: "24px", boxShadow: "0 15px 30px rgba(15, 23, 42, 0.2)" }}>
            <Globe2 size={40} />
          </div>
          <h1 style={{ fontSize: "3rem", fontWeight: "900", color: "var(--l2t-navy)", margin: "0 0 16px", letterSpacing: "-1px" }}>Kaşifler Ligi</h1>
          <p style={{ fontSize: "1.1rem", color: "var(--l2t-soft)", maxWidth: "650px", margin: "0 auto", lineHeight: "1.6" }}>
            LetsGo2Travel topluluğunun keşif yolculuğu. Doğrulanmış rotalarını haritana ekle, puanları topla ve Ayın Kaşifi sen ol!
          </p>
        </div>

        {/* Sekmeler */}
        <div style={{ display: "flex", background: "#fff", padding: "8px", borderRadius: "20px", boxShadow: "0 10px 20px rgba(0,0,0,0.02)", marginBottom: "32px", gap: "8px", overflowX: "auto" }}>
          <button 
            onClick={() => setActiveTab("beyan")}
            style={{ flex: 1, padding: "16px 20px", background: activeTab === "beyan" ? "rgba(20, 118, 242, 0.05)" : "transparent", color: activeTab === "beyan" ? "var(--l2t-blue)" : "var(--l2t-soft)", fontWeight: activeTab === "beyan" ? "800" : "600", border: "none", borderRadius: "16px", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <MapPin size={20} /> Kaşifler Ligi (Beyan)
          </button>
          <button 
            onClick={() => setActiveTab("verified")}
            style={{ flex: 1, padding: "16px 20px", background: activeTab === "verified" ? "rgba(16, 185, 129, 0.05)" : "transparent", color: activeTab === "verified" ? "#10b981" : "var(--l2t-soft)", fontWeight: activeTab === "verified" ? "800" : "600", border: "none", borderRadius: "16px", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <ShieldCheck size={20} /> Doğrulanmış Kaşifler
          </button>
          <button 
            onClick={() => setActiveTab("month")}
            style={{ flex: 1, padding: "16px 20px", background: activeTab === "month" ? "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))" : "transparent", color: activeTab === "month" ? "#F59E0B" : "var(--l2t-soft)", fontWeight: activeTab === "month" ? "800" : "600", border: "none", borderRadius: "16px", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" }}>
            <Trophy size={20} /> Ayın Kaşifi (Ödül)
          </button>
        </div>

        {/* İçerik */}
        {activeTab === "beyan" && renderBeyanTab()}
        {activeTab === "verified" && renderVerifiedTab()}
        {activeTab === "month" && renderMonthTab()}

      </div>
    </div>
  );
}
