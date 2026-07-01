"use client";

import { useState, useRef, useEffect } from "react";
import { Plane, MapPin, Calendar, Users, ArrowRightLeft, Globe2, Flag, Search, BellRing } from "lucide-react";
import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { GLOBAL_LOCATIONS, type LocationItem } from "@/lib/airports";
import PriceAlertForm from "./PriceAlertForm";

export default function FlightSearchCard() {
  const [originObj, setOriginObj] = useState<LocationItem>(GLOBAL_LOCATIONS[2]); // IST
  const [destinationObj, setDestinationObj] = useState<LocationItem | null>(null);
  
  const [originSearch, setOriginSearch] = useState("İstanbul");
  const [destSearch, setDestSearch] = useState("");
  
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  
  const [originResults, setOriginResults] = useState<LocationItem[]>(GLOBAL_LOCATIONS.slice(0, 8));
  const [destResults, setDestResults] = useState<LocationItem[]>(GLOBAL_LOCATIONS.slice(0, 8));

  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [cabin, setCabin] = useState("ekonomi");
  const [tripType, setTripType] = useState("gidis_donus");

  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (originRef.current && !originRef.current.contains(event.target as Node)) {
        setIsOriginOpen(false);
        if (originObj) setOriginSearch(originObj.name);
      }
      if (destRef.current && !destRef.current.contains(event.target as Node)) {
        setIsDestOpen(false);
        if (destinationObj) setDestSearch(destinationObj.name);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [originObj, destinationObj]);

  const [minDateStr, setMinDateStr] = useState("");

  useEffect(() => {
    // Determine local date string robustly
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    setMinDateStr(`${year}-${month}-${day}`);
  }, []);

  const fetchLocations = async (query: string, setter: (res: LocationItem[]) => void) => {
    if (query.length < 2) {
      setter(GLOBAL_LOCATIONS.slice(0, 8));
      return;
    }
    try {
      const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setter(data.length > 0 ? data : GLOBAL_LOCATIONS.slice(0, 8));
      }
    } catch (e) {}
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOriginOpen) fetchLocations(originSearch, setOriginResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [originSearch, isOriginOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDestOpen) fetchLocations(destSearch, setDestResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [destSearch, isDestOpen]);

  const rawFlightUrl = aviasalesUrl({
    origin: originObj?.code || "IST",
    destination: destinationObj?.code || undefined,
    departDate,
    returnDate: tripType === "gidis_donus" ? returnDate : undefined,
  });

  const href = affiliateRedirectUrl({
    provider: "aviasales",
    url: rawFlightUrl,
    destination: destinationObj?.code || destinationObj?.name || "anywhere",
    sourcePage: "flight_search_card",
    campaign: "flight_search",
  });

  const isValid = originObj !== null;

  const handleSwap = () => {
    const tempObj = originObj;
    const tempSearch = originSearch;
    
    if (destinationObj) {
      setOriginObj(destinationObj);
      setOriginSearch(destSearch);
      setDestinationObj(tempObj);
      setDestSearch(tempSearch);
    } else {
      setOriginObj(GLOBAL_LOCATIONS[0]);
      setOriginSearch("");
      setDestinationObj(tempObj);
      setDestSearch(tempSearch);
    }
  };

  const renderDropdownItem = (loc: LocationItem, onSelect: (l: LocationItem) => void) => (
    <div 
      key={loc.id} 
      onClick={() => onSelect(loc)}
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", transition: "background 0.2s" }}
      onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"}
      onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ color: "var(--l2t-soft)", display: "flex", alignItems: "center", justifyContent: "center", width: "24px" }}>
        {loc.type === "country" && <Flag size={20} />}
        {loc.type === "city" && <Plane size={20} />}
        {loc.type === "anywhere" && <Globe2 size={20} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: "700", color: "var(--l2t-navy)", fontSize: "0.95rem" }}>
          {loc.name} {loc.code && loc.type === "city" ? `(${loc.code})` : loc.code && loc.type === "country" ? `(${loc.code})` : ""}
        </span>
        {loc.countryName ? <span style={{ fontSize: "0.8rem", color: "var(--l2t-soft)" }}>{loc.countryName}</span> : loc.type === "country" ? <span style={{ fontSize: "0.8rem", color: "var(--l2t-soft)" }}>{loc.name}</span> : null}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "1160px", margin: "0 auto" }}>
      {/* Top Tabs */}
      <div className="l2t-search-tabs" style={{ display: "flex", gap: "12px", marginBottom: "20px", overflowX: "auto", width: "100%", justifyContent: "center" }}>
        <button type="button" className="l2t-tab-active">
          <Plane size={20} style={{ color: "var(--l2t-gold-deep)" }} /> Uçak bileti
        </button>
        <a href="/oteller" className="l2t-tab-inactive">
          <MapPin size={20} /> Otel
        </a>
      </div>

      <section id="bilet-ara" aria-label="Uçak bileti arama" style={{ padding: "28px 32px", width: "100%", background: "#ffffff", borderRadius: "24px", boxShadow: "0 24px 50px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.04)" }}>
        
        {/* Trip Type Segmented Control */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {[
            { id: "gidis_donus", label: "Gidiş-dönüş" },
            { id: "tek", label: "Tek yön" },
            { id: "coklu", label: "Çoklu uçuş" }
          ].map(type => (
            <button
              key={type.id}
              onClick={() => setTripType(type.id)}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border: "none",
                fontWeight: type.id === tripType ? "700" : "600",
                fontSize: "0.95rem",
                cursor: "pointer",
                background: type.id === tripType ? "var(--l2t-gold-soft)" : "transparent",
                color: type.id === tripType ? "var(--l2t-gold-deep)" : "#64748b",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => { if (type.id !== tripType) e.currentTarget.style.background = "#f1f5f9" }}
              onMouseOut={(e) => { if (type.id !== tripType) e.currentTarget.style.background = "transparent" }}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* The Search Row */}
        <div className="l2t-flight-row">
          
          <div ref={originRef} style={{ background: "#f8fafc", border: "1px solid transparent", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", position: "relative", zIndex: isOriginOpen ? 20 : 1, transition: "background 0.2s, border 0.2s" }} onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.border = "1px solid var(--l2t-gold-deep)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(245,184,46,0.14)"; }} onBlur={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.boxShadow = "none"; }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "4px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}><MapPin size={12} /> Nereden</span>
            <input
              value={originSearch}
              onFocus={() => { setIsOriginOpen(true); setOriginSearch(""); }}
              onChange={(e) => { setOriginSearch(e.target.value); setIsOriginOpen(true); }}
              placeholder="Şehir veya havalimanı"
              style={{ fontWeight: 800, fontSize: "1.1rem", border: "none", outline: "none", background: "transparent", color: "var(--l2t-navy)", width: "100%" }}
            />
            {isOriginOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "320px", background: "#fff", borderRadius: "16px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", border: "1px solid #e2e8f0", maxHeight: "320px", overflowY: "auto", zIndex: 100 }}>
                {originResults.map(loc => renderDropdownItem(loc, (selected) => {
                  setOriginObj(selected);
                  setOriginSearch(selected.name);
                  setIsOriginOpen(false);
                }))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="l2t-swap-btn"
            onClick={handleSwap}
            style={{ width: "42px", height: "42px", borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 5, margin: "0 -20px", color: "var(--l2t-gold-deep)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", transition: "all 0.2s ease" }}
            onMouseOver={(e) => { e.currentTarget.style.transform = "rotate(180deg) scale(1.05)"; e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.1)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = "rotate(0) scale(1)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"; }}
          >
            <ArrowRightLeft size={18} strokeWidth={2.5} />
          </button>

          <div ref={destRef} style={{ background: "#f8fafc", border: "1px solid transparent", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", position: "relative", zIndex: isDestOpen ? 19 : 1, transition: "background 0.2s, border 0.2s" }} onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.border = "1px solid var(--l2t-gold-deep)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(245,184,46,0.14)"; }} onBlur={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.boxShadow = "none"; }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "4px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}><MapPin size={12} /> Nereye</span>
            <input
              value={destSearch}
              onFocus={() => { setIsDestOpen(true); setDestSearch(""); }}
              onChange={(e) => { setDestSearch(e.target.value); setIsDestOpen(true); }}
              placeholder="Herhangi bir yer"
              style={{ fontWeight: 800, fontSize: "1.1rem", border: "none", outline: "none", background: "transparent", color: "var(--l2t-navy)", width: "100%" }}
            />
            {isDestOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "320px", background: "#fff", borderRadius: "16px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", border: "1px solid #e2e8f0", maxHeight: "320px", overflowY: "auto", zIndex: 100 }}>
                {destResults.map(loc => renderDropdownItem(loc, (selected) => {
                  setDestinationObj(selected);
                  setDestSearch(selected.name);
                  setIsDestOpen(false);
                }))}
              </div>
            )}
          </div>

          <label style={{ background: "#f8fafc", border: "1px solid transparent", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", transition: "all 0.2s", cursor: "pointer" }} onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.border = "1px solid var(--l2t-gold-deep)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(245,184,46,0.14)"; }} onBlur={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.boxShadow = "none"; }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "4px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}><Calendar size={12} /> Gidiş</span>
            <input
              key={`depart-${minDateStr}`}
              type="date"
              value={departDate}
              min={minDateStr || undefined}
              onChange={(e) => {
                const val = e.target.value;
                if (minDateStr && val < minDateStr) {
                  setDepartDate(minDateStr);
                } else {
                  setDepartDate(val);
                }
              }}
              style={{ fontWeight: 700, fontSize: "1.05rem", border: "none", outline: "none", background: "transparent", color: "var(--l2t-navy)", cursor: "pointer" }}
            />
          </label>

          {tripType === "tek" ? (
            <div 
              onClick={() => setTripType("gidis_donus")}
              style={{ border: "1px dashed #cbd5e1", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", cursor: "pointer", background: "rgba(248,250,252,0.5)", transition: "all 0.2s" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "var(--l2t-gold-soft)"; e.currentTarget.style.borderColor = "var(--l2t-gold-deep)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(248,250,252,0.5)"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
            >
              <span style={{ fontSize: "0.95rem", color: "var(--l2t-gold-deep)", display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}>+ Dönüş Ekle</span>
            </div>
          ) : (
            <label style={{ background: "#f8fafc", border: "1px solid transparent", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", transition: "all 0.2s", cursor: "pointer" }} onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.border = "1px solid var(--l2t-gold-deep)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(245,184,46,0.14)"; }} onBlur={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.boxShadow = "none"; }}>
              <span style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "4px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}><Calendar size={12} /> Dönüş</span>
              <input
                key={`return-${departDate}-${minDateStr}`}
                type="date"
                value={returnDate}
                min={departDate || minDateStr || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  const minReturn = departDate || minDateStr;
                  if (minReturn && val < minReturn) {
                    setReturnDate(minReturn);
                  } else {
                    setReturnDate(val);
                  }
                }}
                style={{ fontWeight: 700, fontSize: "1.05rem", border: "none", outline: "none", background: "transparent", color: "var(--l2t-navy)", cursor: "pointer" }}
              />
            </label>
          )}

          <label style={{ background: "#f8fafc", border: "1px solid transparent", borderRadius: "16px", padding: "12px 16px", display: "flex", flexDirection: "column", transition: "all 0.2s", cursor: "pointer" }} onFocus={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.border = "1px solid var(--l2t-gold-deep)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(245,184,46,0.14)"; }} onBlur={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.boxShadow = "none"; }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "4px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}><Users size={12} /> Yolcular</span>
            <select
              value={`${passengers}-${cabin}`}
              onChange={(e) => {
                const [p, c] = e.target.value.split("-");
                setPassengers(p);
                setCabin(c);
              }}
              style={{ fontWeight: 700, fontSize: "1.05rem", border: "none", outline: "none", background: "transparent", color: "var(--l2t-navy)", appearance: "none", cursor: "pointer", width: "100%" }}
            >
              <option value="1-ekonomi">1 Yetişkin, Ekonomi</option>
              <option value="2-ekonomi">2 Yetişkin, Ekonomi</option>
              <option value="1-business">1 Yetişkin, Business</option>
              <option value="2-business">2 Yetişkin, Business</option>
            </select>
          </label>

          <a
            className={`l2t-btn${!isValid ? " l2t-btn-disabled" : ""}`}
            href={isValid ? href : undefined}
            target="_blank"
            rel="nofollow sponsored noreferrer"
            style={{ 
              height: "100%", 
              minHeight: "68px",
              padding: "0 28px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "10px",
              background: "linear-gradient(135deg, var(--l2t-gold-deep) 0%, var(--l2t-gold) 100%)", 
              color: "#fff", 
              fontWeight: "800", 
              borderRadius: "16px", 
              textDecoration: "none", 
              fontSize: "1.2rem", 
              border: "none", 
              boxShadow: "0 8px 24px rgba(245,184,46,0.26)",
              transition: "all 0.2s ease"
            }}
            onMouseOver={(e) => { if(isValid) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 28px rgba(245,184,46,0.36)"; } }}
            onMouseOut={(e) => { if(isValid) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(245,184,46,0.26)"; } }}
          >
             Ara <Search size={20} />
          </a>
        </div>
      </section>

      {isValid && destinationObj && departDate && (
        <div style={{ width: "100%", marginTop: "16px", display: "flex", justifyContent: "center" }}>
          {!isAlertOpen ? (
            <button 
              onClick={() => setIsAlertOpen(true)}
              style={{ background: "transparent", border: "1px solid var(--l2t-border)", borderRadius: "100px", padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--l2t-navy)", fontWeight: "600", fontSize: "0.95rem", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
              className="hover-tilt"
            >
              <BellRing size={18} color="var(--l2t-gold-deep)" /> Bu rota için fiyat alarmı kur
            </button>
          ) : (
            <div style={{ width: "100%", maxWidth: "500px", animation: "fadeIn 0.3s ease" }}>
              <PriceAlertForm 
                originCode={originObj.code || ""}
                originLabel={originObj.name}
                destinationCode={destinationObj.code || ""}
                destinationLabel={destinationObj.name}
                departureDate={departDate}
                onClose={() => setIsAlertOpen(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
