"use client";

import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/types";
import { Settings, Link as LinkIcon, Mail, Globe, Save, ShieldAlert, CheckCircle2 } from "lucide-react";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/admin/site-ayarlari")
      .then((response) => response.json())
      .then((data: { data: SiteSettings }) => {
        setSettings(data.data);
        setForm(data.data);
      })
      .catch(() => setSettings(null));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    setToast(null);

    try {
      const res = await fetch("/api/admin/site-ayarlari", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      
      if (res.ok) {
        setToast({ message: data.message || "Ayarlar başarıyla kaydedildi!", type: "success" });
        setSettings(form);
      } else {
        setToast({ message: data.error || "Bir hata oluştu", type: "error" });
      }
    } catch (e) {
      setToast({ message: "Bağlantı hatası", type: "error" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600", fontSize: "0.95rem" }} className="hover-tilt">
          ← Admin Paneline Dön
        </a>
        <p className="l2t-kicker">Sistem Tercihleri</p>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
          <Settings size={36} color="var(--l2t-blue)" /> Site & Affiliate Ayarları
        </h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Ortaklık linklerini, entegrasyon anahtarlarını ve iletişim bilgilerini yönet.</p>
      </div>

      <div className="glass-panel" style={{ background: "#fff", borderRadius: "20px", padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
        
        {/* Toast Notification */}
        <div style={{
          position: "absolute", top: "24px", right: "24px", padding: "12px 20px", borderRadius: "12px",
          background: toast?.type === "success" ? "#dcfce3" : "#fee2e2",
          color: toast?.type === "success" ? "#065f46" : "#991b1b",
          display: "flex", alignItems: "center", gap: "8px", fontWeight: "600",
          transform: toast ? "translateY(0)" : "translateY(-100px)",
          opacity: toast ? 1 : 0,
          transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          zIndex: 10
        }}>
          <CheckCircle2 size={18} /> {toast?.message}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "linear-gradient(to right, #f8fafc, #f1f5f9)", padding: "20px", borderRadius: "16px", borderLeft: "4px solid #3b82f6", marginBottom: "32px" }}>
          <div style={{ background: "#dbeafe", padding: "10px", borderRadius: "12px" }}>
            <ShieldAlert size={24} color="#2563eb" />
          </div>
          <p style={{ margin: 0, color: "var(--l2t-navy)", fontSize: "0.95rem", lineHeight: "1.5" }}>
            Sistem güvenliği protokolleri devrede. Bu alanda yaptığınız değişiklikler doğrudan veritabanına ve <strong>.env</strong> değişkenlerine yansıtılır. Girdiğiniz affiliate URL'lerinin geçerliliğinden emin olun.
          </p>
        </div>

        {form ? (
          <div style={{ display: "grid", gap: "28px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
              
              {/* Form Input Group */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <LinkIcon size={16} color="var(--l2t-blue)" /> Booking.com Affiliate URL
                </label>
                <input 
                  value={form.bookingAffiliateUrl} 
                  onChange={(e) => setForm({ ...form, bookingAffiliateUrl: e.target.value })}
                  style={{ padding: "14px 16px", borderRadius: "12px", border: "2px solid transparent", background: "#f8fafc", outline: "none", color: "var(--l2t-navy)", fontWeight: "500", transition: "all 0.2s", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }} 
                  onFocus={(e) => e.target.style.borderColor = "var(--l2t-blue)"}
                  onBlur={(e) => e.target.style.borderColor = "transparent"}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Globe size={16} color="var(--l2t-blue)" /> Airalo (eSIM) URL
                </label>
                <input 
                  value={form.airaloAffiliateUrl} 
                  onChange={(e) => setForm({ ...form, airaloAffiliateUrl: e.target.value })}
                  style={{ padding: "14px 16px", borderRadius: "12px", border: "2px solid transparent", background: "#f8fafc", outline: "none", color: "var(--l2t-navy)", fontWeight: "500", transition: "all 0.2s", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }} 
                  onFocus={(e) => e.target.style.borderColor = "var(--l2t-blue)"}
                  onBlur={(e) => e.target.style.borderColor = "transparent"}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Globe size={16} color="var(--l2t-blue)" /> GetYourGuide URL
                </label>
                <input 
                  value={form.getYourGuideAffiliateUrl} 
                  onChange={(e) => setForm({ ...form, getYourGuideAffiliateUrl: e.target.value })}
                  style={{ padding: "14px 16px", borderRadius: "12px", border: "2px solid transparent", background: "#f8fafc", outline: "none", color: "var(--l2t-navy)", fontWeight: "500", transition: "all 0.2s", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }} 
                  onFocus={(e) => e.target.style.borderColor = "var(--l2t-blue)"}
                  onBlur={(e) => e.target.style.borderColor = "transparent"}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <LinkIcon size={16} color="var(--l2t-blue)" /> Travelpayouts Marker
                </label>
                <input 
                  value={form.travelpayoutsMarker} 
                  onChange={(e) => setForm({ ...form, travelpayoutsMarker: e.target.value })}
                  style={{ padding: "14px 16px", borderRadius: "12px", border: "2px solid transparent", background: "#f8fafc", outline: "none", color: "var(--l2t-navy)", fontWeight: "500", transition: "all 0.2s", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }} 
                  onFocus={(e) => e.target.style.borderColor = "var(--l2t-blue)"}
                  onBlur={(e) => e.target.style.borderColor = "transparent"}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "28px" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Mail size={16} color="var(--l2t-blue)" /> Sistem & Destek Email Adresi
              </label>
              <input 
                value={form.supportEmail} 
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                style={{ padding: "14px 16px", borderRadius: "12px", border: "2px solid transparent", background: "#f8fafc", outline: "none", color: "var(--l2t-navy)", fontWeight: "500", transition: "all 0.2s", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)", width: "100%", maxWidth: "500px" }} 
                onFocus={(e) => e.target.style.borderColor = "var(--l2t-blue)"}
                onBlur={(e) => e.target.style.borderColor = "transparent"}
              />
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "28px" }}>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="l2t-btn" 
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 28px", fontSize: "1.05rem", opacity: isSaving ? 0.7 : 1, transition: "all 0.2s" }}
              >
                {isSaving ? (
                  <div style={{ width: "20px", height: "20px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Save size={20} />
                )}
                {isSaving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}
              </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ padding: "60px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "32px", height: "32px", border: "3px solid var(--l2t-blue)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <span style={{ color: "var(--l2t-soft)", fontWeight: "500" }}>Sistem yapılandırmaları yükleniyor...</span>
          </div>
        )}
      </div>
    </section>
  );
}
