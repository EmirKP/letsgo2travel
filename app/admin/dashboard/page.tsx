"use client";

import { useEffect, useState } from "react";
import type { FlightDeal } from "@/lib/types";
import { Plane, TrendingUp, Users, Eye, Plus, X, Pencil, Trash2, BellRing } from "lucide-react";

type ApiResponse = { data?: FlightDeal[]; error?: string; message?: string };

export default function AdminDashboardPage() {
  const [deals, setDeals] = useState<FlightDeal[]>([]);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "İstanbul → Yeni rota",
    slug: "yeni-rota",
    origin: "İstanbul",
    destination: "Roma",
    origin_code: "IST",
    destination_code: "FCO",
    price: "4990",
    currency: "TRY",
    visa_type: "schengen",
    region: "Avrupa",
    affiliate_url: "https://www.aviasales.com/",
    image_url: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=400&auto=format&fit=crop",
  });

  async function loadDeals() {
    const response = await fetch("/api/admin/biletler");
    const data = (await response.json()) as ApiResponse;
    setDeals(data.data || []);
  }

  async function loadStats(pass: string) {
    try {
      const res = await fetch("/api/admin/fiyat-alarmlari", {
        headers: { "x-admin-password": pass }
      });
      const data = await res.json();
      if (data.data) {
        setAlarms(data.data);
      }
      
      const resUsers = await fetch("/api/admin/users", {
        headers: { "x-admin-password": pass }
      });
      const usersData = await resUsers.json();
      if (usersData.data) {
        setUsers(usersData.data);
      }
    } catch (e) {}
  }

  useEffect(() => {
    const saved = localStorage.getItem("l2t-admin-password") || "";
    setPassword(saved);
    void loadDeals();
    if (saved) {
      void loadStats(saved);
    }
  }, []);

  const [isSaving, setIsSaving] = useState(false);

  async function addDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.image_url.match(/\.(jpeg|jpg|png|webp)$/i) && form.image_url.trim() !== "") {
      setMessage("Görsel URL sadece .jpg, .jpeg, .png veya .webp ile bitmelidir.");
      return;
    }
    
    setIsSaving(true);
    localStorage.setItem("l2t-admin-password", password);
    const response = await fetch("/api/admin/biletler", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ ...form, price: Number(form.price), active: true }),
    });
    const data = (await response.json()) as { error?: string; message?: string };
    setIsSaving(false);
    setMessage(data.error || data.message || "Fırsat eklendi.");
    await loadDeals();
    if (!data.error) {
      setTimeout(() => setIsModalOpen(false), 1500);
    }
    void loadStats(password);
  }

  const totalClicks = deals.reduce((acc, deal) => acc + (deal.clicks || 0), 0);

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
        <div>
          <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600", fontSize: "0.95rem" }} className="hover-tilt">
            ← Admin Paneline Dön
          </a>
          <p className="l2t-kicker">Admin Dashboard</p>
          <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Genel Bakış</h1>
          <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Sistemdeki bilet ve kullanıcı istatistikleri.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => {
              setPassword(e.target.value);
              if (e.target.value) {
                loadStats(e.target.value);
              }
            }} 
            placeholder="Admin Şifresi" 
            style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none" }}
          />
          <button onClick={() => setIsModalOpen(true)} className="l2t-btn" style={{ padding: "10px 20px" }}>
            <Plus size={18} /> Yeni Ekle
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "40px" }}>
        {[
          { title: "Kayıtlı Kullanıcı", value: users.length.toString(), icon: <Users size={24} color="#10B981" />, bg: "#d1fae5" },
          { title: "Aktif Fırsatlar", value: deals.length.toString(), icon: <Plane size={24} color="#1476F2" />, bg: "#eef2ff" },
          { title: "Bilet Tıklamaları", value: totalClicks.toString(), icon: <TrendingUp size={24} color="#F59E0B" />, bg: "#fffbeb" },
          { title: "Abone / Alarm", value: alarms.length.toString(), icon: <BellRing size={24} color="#8B5CF6" />, bg: "#f5f3ff" },
        ].map((card, i) => (
          <div key={i} className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {card.icon}
            </div>
            <div>
              <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>{card.title}</p>
              <strong style={{ fontSize: "1.8rem", color: "var(--l2t-navy)", lineHeight: "1" }}>{card.value}</strong>
            </div>
          </div>
        ))}
      </div>
      {/* MODÜLLER LİNKLERİ (FORUM & REHBER) */}
      <div style={{ marginBottom: "40px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", marginBottom: "20px" }}>Modül Yönetimi</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          
          <a href="/admin/forum" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-blue)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Topluluk</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Forum Yönetimi</strong>
              </div>
            </div>
          </a>

          <a href="/admin/rehber" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Bilgi Bankası</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Rehber Merkezi</strong>
              </div>
            </div>
          </a>

          <a href="/admin/raporlar" style={{ textDecoration: "none" }}>
            <div className="glass-panel hover-tilt" style={{ padding: "24px", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", gap: "20px", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
              </div>
              <div>
                <p style={{ color: "var(--l2t-muted)", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px" }}>Moderasyon</p>
                <strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", lineHeight: "1" }}>Raporlanan İçerikler</strong>
              </div>
            </div>
          </a>

        </div>
      </div>
      {/* DATA TABLE */}
      <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", overflow: "hidden" }}>
        <div style={{ padding: "24px 32px", borderBottom: "1px solid var(--l2t-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", color: "var(--l2t-navy)" }}>Tüm Bilet Fırsatları</h2>
        </div>
        <div className="l2t-table-wrap" style={{ border: "none", boxShadow: "none", borderRadius: 0, margin: 0 }}>
          <table className="l2t-table" style={{ minWidth: "900px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "16px 32px" }}>Rota & Havalimanı</th>
                <th>Bölge / Vize</th>
                <th>Fiyat</th>
                <th>Durum</th>
                <th style={{ textAlign: "right", paddingRight: "32px" }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "16px 32px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundImage: `url(${deal.image_url || '/placeholder.jpg'})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                      <div>
                        <strong style={{ color: "var(--l2t-navy)", display: "block", marginBottom: "2px" }}>{deal.title}</strong>
                        <small style={{ color: "var(--l2t-soft)", fontWeight: "600" }}>{deal.origin_code} → {deal.destination_code}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--l2t-navy)", fontWeight: "600" }}>{deal.region}</span>
                      <span style={{ fontSize: "0.75rem", padding: "2px 8px", background: "#f1f5f9", borderRadius: "4px", width: "fit-content", color: "var(--l2t-soft)" }}>{deal.visa_type}</span>
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: "var(--l2t-navy)" }}>{deal.price.toLocaleString("tr-TR")} {deal.currency}</strong>
                  </td>
                  <td>
                    <span style={{ padding: "6px 12px", background: "#dcfce3", color: "#065f46", fontSize: "0.8rem", fontWeight: "700", borderRadius: "12px" }}>Aktif</span>
                  </td>
                  <td style={{ textAlign: "right", paddingRight: "32px" }}>
                    <button style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--l2t-soft)", padding: "8px" }}><Pencil size={18} /></button>
                    <button onClick={async () => {
                      if (window.confirm("Bu fırsatı silmek istediğinize emin misiniz?")) {
                        // Burada delete API çağrısı yapılabilir
                        alert("Silme işlemi için API entegrasyonu gerekiyor.");
                      }
                    }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: "8px" }}><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deals.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Henüz kayıtlı bilet fırsatı yok.</div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(6, 24, 58, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setIsModalOpen(false)} />
          <div className="glass-panel" style={{ position: "relative", zIndex: 101, background: "#fff", width: "100%", maxWidth: "600px", borderRadius: "24px", padding: "32px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, color: "var(--l2t-navy)" }}>Yeni Fırsat Ekle</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "#f1f5f9", border: "none", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={20} color="var(--l2t-navy)" />
              </button>
            </div>

            {message && <div style={{ padding: "12px", background: "#fef2f2", color: "#ef4444", borderRadius: "8px", marginBottom: "20px", fontWeight: "600" }}>{message}</div>}

            <form onSubmit={addDeal} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Başlık</span>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Kalkış Yeri</span>
                  <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Varış Yeri</span>
                  <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Kalkış Kodu (Örn: IST)</span>
                  <input value={form.origin_code} onChange={(e) => setForm({ ...form, origin_code: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Varış Kodu (Örn: FCO)</span>
                  <input value={form.destination_code} onChange={(e) => setForm({ ...form, destination_code: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Fiyat</span>
                  <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Para Birimi</span>
                  <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Vize Durumu</span>
                  <input value={form.visa_type} onChange={(e) => setForm({ ...form, visa_type: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Bölge</span>
                  <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Affiliate Link (URL)</span>
                  <input value={form.affiliate_url} onChange={(e) => setForm({ ...form, affiliate_url: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#f8fafc" }} required />
                </label>
                
                {/* Görsel Yönetimi */}
                <div style={{ gridColumn: "1 / -1", background: "#f8fafc", padding: "16px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase" }}>Görsel URL (.jpg, .png, .webp)</span>
                    <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--l2t-border)", outline: "none", background: "#fff" }} />
                  </label>
                  
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--l2t-soft)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Görsel Önizleme</span>
                    <div style={{ width: "100%", height: "160px", borderRadius: "12px", background: "#e2e8f0", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {form.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={form.image_url} 
                          alt="Önizleme" 
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent) {
                              parent.style.background = 'linear-gradient(135deg, #e2e8f0, #cbd5e1)';
                              parent.innerHTML = '<span style="color: #64748b; font-weight: 600;">Görsel yüklenemedi (Kırık Link)</span>';
                            }
                          }}
                        />
                      ) : (
                        <span style={{ color: "#94a3b8", fontWeight: "600", fontSize: "0.9rem" }}>URL girildiğinde burada görünür</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
                <button type="submit" className="l2t-btn" disabled={isSaving} style={{ width: "100%", padding: "14px", fontSize: "1.05rem", opacity: isSaving ? 0.7 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}>
                  {isSaving ? "Kaydediliyor..." : "Fırsatı Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
