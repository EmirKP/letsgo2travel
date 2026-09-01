"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, MapPin, Globe2, Heart, Sparkles, LogOut, User, Trophy, ShieldCheck, CheckCircle, X, ArrowRight } from "lucide-react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { supabase } from "@/lib/supabase-client";
import styles from "./ProfilHarita.module.css";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const GEO_ID_TO_COUNTRY_CODE: Record<string, string> = {
  "008": "AL", "031": "AZ", "250": "FR", "268": "GE", "276": "DE", "300": "GR",
  "380": "IT", "383": "XK", "498": "MD", "528": "NL", "784": "AE", "818": "EG",
  "826": "GB", "840": "US",
};

export default function ProfilPage() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"map" | "favorites" | "ai-trips">("map");
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [profileError, setProfileError] = useState("");

  const [tooltipContent, setTooltipContent] = useState("");
  
  // Modal states
  const [selectedCountry, setSelectedCountry] = useState<{ id: string, name: string } | null>(null);
  useEffect(() => {
    setIsClient(true);
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      setUser(session.user);
      fetchProfileAndVerifications(session.user);
    };
    checkUser();
  }, [router]);

  const fetchProfileAndVerifications = async (currentUser: any) => {
    try {
      const { data: profile, error } = await supabase.from('profiles').select('id, username, visited_countries, wishlist_countries, opt_in_leaderboard').eq('id', currentUser.id).single();
      
      if (profile && !error) {
        setUser((current: any) => ({ ...current, profileUsername: profile.username || null }));
        setVisited(profile.visited_countries || []);
        setWishlist(profile.wishlist_countries || []);
        setOptIn(profile.opt_in_leaderboard || false);
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch('/api/travel-verifications', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const json = await res.json();
          if (json.data) setVerifications(json.data);
        }
      } catch {}

      try {
        const res = await fetch('/api/kasifler-ligi');
        const json = await res.json();
        if (json.data) setLeaderboard(json.data);
      } catch {}

    } catch (e) {
      console.error("Veri çekilemedi", e);
    }
  };

  const toggleVisit = async (geoId: string) => {
    if (!user) return;
    const previousVisited = visited;
    let newVisited = [...previousVisited];
    if (newVisited.includes(geoId)) {
      newVisited = newVisited.filter(id => id !== geoId);
    } else {
      newVisited.push(geoId);
    }
    setVisited(newVisited);
    setProfileError("");
    const { error } = await supabase.from('profiles').update({ visited_countries: newVisited }).eq('id', user.id);
    if (error) {
      setVisited(previousVisited);
      setProfileError("Seyahat haritası kaydedilemedi. Lütfen tekrar deneyin.");
    }
  };

  const toggleWishlist = async (geoId: string) => {
    if (!user) return;
    const previousWishlist = wishlist;
    let newWish = [...previousWishlist];
    if (newWish.includes(geoId)) {
      newWish = newWish.filter(id => id !== geoId);
    } else {
      newWish.push(geoId);
    }
    setWishlist(newWish);
    setProfileError("");
    const { error } = await supabase.from('profiles').update({ wishlist_countries: newWish }).eq('id', user.id);
    if (error) {
      setWishlist(previousWishlist);
      setProfileError("İstek listesi kaydedilemedi. Lütfen tekrar deneyin.");
    }
  };

  const toggleOptIn = async () => {
    if (!user) return;
    const newVal = !optIn;
    setOptIn(newVal);
    setProfileError("");
    const { error } = await supabase.from('profiles').update({ opt_in_leaderboard: newVal }).eq('id', user.id);
    if (error) {
      setOptIn(!newVal);
      setProfileError("Kaşifler Ligi tercihi kaydedilemedi. Lütfen tekrar deneyin.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (!isClient || !user) return null;

  const userName = user.profileUsername || (user.email ? user.email.split('@')[0] : "Gezgin");
  const userRankIndex = leaderboard.findIndex(l => l.username === userName);
  const userRank = userRankIndex !== -1 ? userRankIndex + 1 : "-";
  
  const verifiedCount = verifications.filter(v => v.status === 'approved').length;

  return (
    <div className={`l2t-page ${styles.page}`}>
      <div className={styles.layout}>
        
        {/* Sol Panel */}
        <aside className={styles.sidebar}>
          <div className={`glass-panel ${styles.sidebarCard}`} style={{ padding: "24px", borderRadius: "20px", background: "#ffffff", boxShadow: "0 10px 30px rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.05)" }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px", paddingBottom: "24px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #1476f2, #0A1F4A)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 16px rgba(20,118,242,0.2)", flexShrink: 0 }}>
              <User size={28} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ overflow: "hidden" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "800", margin: "0 0 4px", color: "var(--l2t-navy)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", textTransform: "capitalize" }}>{userName}</h2>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.85rem", margin: 0, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{user.email}</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <div style={{ flex: 1, background: "#f8fafc", padding: "16px", borderRadius: "16px", textAlign: "center", border: "1px solid #f1f5f9" }}>
              <h3 style={{ fontSize: "1.8rem", fontWeight: "900", color: "var(--l2t-blue)", margin: "0 0 4px" }}>
                {visited.length}
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--l2t-soft)", fontWeight: "700", margin: 0, textTransform: "uppercase" }}>Keşif</p>
            </div>
            <div style={{ flex: 1, background: "rgba(16, 185, 129, 0.05)", padding: "16px", borderRadius: "16px", textAlign: "center", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
              <h3 style={{ fontSize: "1.8rem", fontWeight: "900", color: "#10b981", margin: "0 0 4px" }}>
                {verifiedCount}
              </h3>
              <p style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "700", margin: 0, textTransform: "uppercase" }}>Onaylı</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", borderRadius: "12px", background: "rgba(245, 158, 11, 0.05)", color: "#F59E0B", fontWeight: "700", fontSize: "0.9rem" }}>
              <Award size={18} />
              {visited.length < 3 ? "Evde Oturan" : visited.length < 10 ? "Gezgin Çırak" : "Evliya Çelebi"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", borderRadius: "12px", background: "rgba(20, 118, 242, 0.05)", color: "var(--l2t-blue)", fontWeight: "700", fontSize: "0.9rem" }}>
              <Trophy size={18} />
              Liderlik Sırası: #{userRank}
            </div>
          </div>

          <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "16px", border: "1px solid #f1f5f9", marginBottom: "24px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
              <input type="checkbox" checked={optIn} onChange={toggleOptIn} style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "var(--l2t-blue)" }} />
              <div>
                <div style={{ fontWeight: "700", color: "var(--l2t-navy)", fontSize: "0.95rem", marginBottom: "4px" }}>Kaşifler Ligi'ne Katıl</div>
                <div style={{ fontSize: "0.8rem", color: "var(--l2t-soft)", lineHeight: "1.4" }}>
                  Profilini herkese açık liderlik tablosunda göster ve Ayın Kaşifi yarışmasına katıl.
                </div>
              </div>
            </label>
          </div>

          <button onClick={handleLogout} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", background: "transparent", color: "var(--l2t-soft)", border: "1px solid #e2e8f0", borderRadius: "12px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fca5a5"; }} onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--l2t-soft)"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
            <LogOut size={16} /> Oturumu Kapat
          </button>
        </div>
      </aside>

        {/* Sağ Panel */}
        <div className={styles.main}>
          {profileError && (
            <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 16px", borderRadius: "12px", marginBottom: "16px" }}>
              {profileError}
            </div>
          )}
          
          <div className={styles.tabs}>
            <button onClick={() => setActiveTab("map")} style={{ flex: 1, padding: "14px", borderRadius: "16px", border: "none", background: activeTab === "map" ? "linear-gradient(135deg, #1476f2, #0A1F4A)" : "transparent", color: activeTab === "map" ? "#fff" : "var(--l2t-soft)", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: activeTab === "map" ? "0 4px 12px rgba(20,118,242,0.3)" : "none" }}>
              <MapPin size={18} /> Dünyam
            </button>
            <button onClick={() => setActiveTab("favorites")} style={{ flex: 1, padding: "14px", borderRadius: "16px", border: "none", background: activeTab === "favorites" ? "linear-gradient(135deg, #1476f2, #0A1F4A)" : "transparent", color: activeTab === "favorites" ? "#fff" : "var(--l2t-soft)", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: activeTab === "favorites" ? "0 4px 12px rgba(20,118,242,0.3)" : "none" }}>
              <Heart size={18} fill={activeTab === "favorites" ? "#fff" : "transparent"} /> Fırsatlar
            </button>
            <button onClick={() => setActiveTab("ai-trips")} style={{ flex: 1, padding: "14px", borderRadius: "16px", border: "none", background: activeTab === "ai-trips" ? "linear-gradient(135deg, #1476f2, #0A1F4A)" : "transparent", color: activeTab === "ai-trips" ? "#fff" : "var(--l2t-soft)", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: activeTab === "ai-trips" ? "0 4px 12px rgba(20,118,242,0.3)" : "none" }}>
              <Sparkles size={18} /> Planlar
            </button>
          </div>

          {activeTab === "map" && (
            <div className={styles.tabContent} style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeUp 0.5s ease" }}>
              <div className={`glass-panel ${styles.mapPanel}`}>
                
                <div className={styles.mapHeader}>
                  <div className={styles.mapHeaderCopy}>
                    <h2 className={styles.mapTitle} style={{ fontSize: "2rem", color: "var(--l2t-navy)", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.5px" }}>
                      <Globe2 color="var(--l2t-blue)" size={28} /> Seyahat Haritam
                    </h2>
                    <p style={{ color: "var(--l2t-soft)", fontSize: "1rem", margin: 0, maxWidth: "500px", lineHeight: "1.5" }}>
                      Gittiğin ülkelerin üzerine tıkla. Gezdiğin ve gitmek istediğin yerleri haritada işaretle, doğrulanmış kaşifler arasına katıl!
                    </p>
                  </div>
                  <div className={styles.mapSummary}>
                    <div style={{ background: "rgba(245, 158, 11, 0.1)", padding: "10px 20px", borderRadius: "24px", color: "#F59E0B", fontWeight: "800", fontSize: "0.95rem" }}>
                      {wishlist.length} İstek Listesi
                    </div>
                  </div>
                </div>

                <div className={styles.mapViewport}>
                  <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(20, 118, 242, 0.1) 1px, transparent 1px)", backgroundSize: "40px 40px", opacity: 0.8, zIndex: 0 }} />

                  {tooltipContent && (
                    <div style={{ position: "absolute", top: 24, right: 24, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)", padding: "10px 20px", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", zIndex: 10, fontWeight: "800", color: "var(--l2t-navy)", pointerEvents: "none", border: "1px solid rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
                      <MapPin size={18} color="#1476f2" /> {tooltipContent}
                    </div>
                  )}
                  
                  <ComposableMap projectionConfig={{ rotate: [-10, 0, 0], scale: 170 }} style={{ width: "100%", height: "100%", zIndex: 1, position: "relative" }}>
                    <ZoomableGroup zoom={1} minZoom={1} maxZoom={15}>
                      <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const isVisited = visited.includes(geo.id);
                            const isWish = wishlist.includes(geo.id);
                            
                            let fillColor = "#cbd5e1";
                            if (isVisited) fillColor = "#1476f2";
                            else if (isWish) fillColor = "#F59E0B";

                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                onMouseEnter={() => setTooltipContent(geo.properties.name)}
                                onMouseLeave={() => setTooltipContent("")}
                                onClick={() => setSelectedCountry({ id: geo.id, name: geo.properties.name })}
                                style={{
                                  default: { fill: fillColor, stroke: "#ffffff", strokeWidth: 0.5, outline: "none", cursor: "pointer", transition: "fill 0.3s ease" },
                                  hover: { fill: isVisited ? "#2563eb" : isWish ? "#fbbf24" : "#94a3b8", outline: "none", cursor: "pointer" },
                                  pressed: { fill: "#1d4ed8", outline: "none" }
                                }}
                              />
                            );
                          })
                        }
                      </Geographies>
                    </ZoomableGroup>
                  </ComposableMap>
                </div>
              </div>
            </div>
          )}

          {activeTab === "favorites" && (
            <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff", minHeight: "400px", boxShadow: "0 20px 40px rgba(0,0,0,0.06)", animation: "fadeUp 0.5s ease" }}>
              <h2 style={{ fontSize: "2rem", color: "var(--l2t-navy)", marginBottom: "32px", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.5px" }}>
                <Heart color="#ef4444" fill="#ef4444" size={28} /> Kaydedilen Rotalar
              </h2>
              <p style={{ color: "var(--l2t-soft)", lineHeight: 1.6, maxWidth: "620px" }}>
                Kaydettiğin rotaları Planlarım sayfasında yönetebilir, yeni destinasyonları ülke rehberlerinden keşfedebilirsin.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
                <Link href="/planlarim" className="l2t-btn" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>Planlarımı gör <ArrowRight size={17} /></Link>
                <Link href="/ulke-rehberi" className="l2t-btn l2t-btn-outline">Destinasyonları keşfet</Link>
              </div>
            </div>
          )}

          {activeTab === "ai-trips" && (
            <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff", minHeight: "400px", boxShadow: "0 20px 40px rgba(0,0,0,0.06)", animation: "fadeUp 0.5s ease" }}>
              <h2 style={{ fontSize: "2rem", color: "var(--l2t-navy)", marginBottom: "32px", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.5px" }}>
                <Sparkles color="#F59E0B" size={28} /> Kaydedilen Planlar
              </h2>
              <p style={{ color: "var(--l2t-soft)", lineHeight: 1.6, maxWidth: "620px" }}>
                Yeni bir rota hazırlamak için Rota Asistanı'nı kullan; tarihli seyahatlerini Seyahat Kokpiti'nden yönet.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
                <Link href="/rota-asistani" className="l2t-btn" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>Rota hazırla <ArrowRight size={17} /></Link>
                <Link href="/seyahat-kokpiti" className="l2t-btn l2t-btn-outline">Seyahat Kokpiti</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ülke Modalı */}
      {selectedCountry && (() => {
        const isVisited = visited.includes(selectedCountry.id);
        const isWish = wishlist.includes(selectedCountry.id);
        const verificationCountryCode = GEO_ID_TO_COUNTRY_CODE[String(selectedCountry.id).padStart(3, "0")];
        const verification = verifications.find(v => v.country_code === verificationCountryCode);

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setSelectedCountry(null)} />
            
            <div className={styles.modalCard} style={{ background: "#fff", borderRadius: "24px", padding: "32px", position: "relative", zIndex: 1, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
              <button onClick={() => setSelectedCountry(null)} style={{ position: "absolute", top: "24px", right: "24px", background: "#f1f5f9", border: "none", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--l2t-soft)" }}>
                <X size={18} />
              </button>

              <h2 style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", margin: "0 0 24px", display: "flex", alignItems: "center", gap: "12px" }}>
                <MapPin color="var(--l2t-blue)" /> {selectedCountry.name}
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: isVisited ? "rgba(20, 118, 242, 0.05)" : "#f8fafc", border: isVisited ? "1px solid var(--l2t-blue)" : "1px solid #e2e8f0", borderRadius: "16px", cursor: "pointer", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", color: isVisited ? "var(--l2t-blue)" : "var(--l2t-navy)" }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: isVisited ? "none" : "2px solid #cbd5e1", background: isVisited ? "var(--l2t-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isVisited && <CheckCircle size={16} color="#fff" />}
                    </div>
                    Gezdim (Kaşifler Ligi Puanı)
                  </div>
                  <input type="checkbox" checked={isVisited} onChange={() => toggleVisit(selectedCountry.id)} style={{ display: "none" }} />
                </label>

                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: isWish ? "rgba(245, 158, 11, 0.05)" : "#f8fafc", border: isWish ? "1px solid #F59E0B" : "1px solid #e2e8f0", borderRadius: "16px", cursor: "pointer", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", color: isWish ? "#F59E0B" : "var(--l2t-navy)" }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: isWish ? "none" : "2px solid #cbd5e1", background: isWish ? "#F59E0B" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isWish && <Heart size={14} fill="#fff" color="#fff" />}
                    </div>
                    Gitmek İstiyorum (İstek Listesi)
                  </div>
                  <input type="checkbox" checked={isWish} onChange={() => toggleWishlist(selectedCountry.id)} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "24px" }}>
                <h3 style={{ fontSize: "1.1rem", color: "var(--l2t-navy)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <ShieldCheck size={20} color="#10b981" /> Doğrulanmış Kaşifler
                </h3>
                
                {verification ? (
                  <div style={{ padding: "16px", borderRadius: "16px", background: verification.status === 'approved' ? "rgba(16, 185, 129, 0.1)" : verification.status === 'rejected' ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)", border: `1px solid ${verification.status === 'approved' ? "#10b981" : verification.status === 'rejected' ? "#ef4444" : "#F59E0B"}` }}>
                    <div style={{ fontWeight: "800", color: verification.status === 'approved' ? "#10b981" : verification.status === 'rejected' ? "#ef4444" : "#b45309", marginBottom: "8px" }}>
                      {verification.status === 'approved' ? "Doğrulandı" : verification.status === 'rejected' ? "Reddedildi" : "İnceleme Bekliyor"}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "var(--l2t-soft)" }}>
                      {verification.status === 'approved' ? "Bu ülke Kaşif profilinde doğrulandı." : verification.status === 'rejected' ? "Kanıt kabul edilmedi. Güncel doğrulama sayfasından yeniden başvurabilirsiniz." : "Yönetici ekibimiz doğrulama talebinizi inceliyor."}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--l2t-soft)", lineHeight: "1.5", textAlign: "center" }}>
                      Bu ülkeye yaptığın seyahati tek ve güvenli doğrulama formundan belgeleyebilirsin.
                    </p>
                    <Link
                      href={verificationCountryCode ? `/profil/dogrulamalar?country=${verificationCountryCode}` : "/profil/dogrulamalar"}
                      className="l2t-btn"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", textDecoration: "none" }}
                    >
                      Doğrulama formunu aç <ArrowRight size={17} />
                    </Link>
                  </div>
                )}
                
                <p style={{ margin: "16px 0 0", fontSize: "0.75rem", color: "var(--l2t-soft)", textAlign: "center", lineHeight: "1.5" }}>
                  Talepleriniz LetsGo2Travel ekibi tarafından manuel olarak incelenmektedir.<br/>
                  Yüklenen kanıtlar herkese açık gösterilmez ve inceleme tamamlanınca silinir.
                </p>
              </div>

            </div>
          </div>
        );
      })()}

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
