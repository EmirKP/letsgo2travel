"use client";

import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, Edit, AlertCircle, Image as ImageIcon } from "lucide-react";

export default function AdminGuidePage() {
  const [guides, setGuides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "", slug: "", flag: "", region: "", visa_status: "vize_gerekli", stay_duration: "",
    with_id_card: false, passport_required: true, currency: "", language: "", capital: "",
    best_time: "", avg_flight: "", avg_hotel: "", hero_image_url: "",
    places_to_visit: "", security_notes: "", airport_transfer: "",
    affiliate_links: "", seo_title: "", seo_description: ""
  });

  useEffect(() => {
    loadGuides();
  }, []);

  async function loadGuides() {
    setIsLoading(true);
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/rehber", { headers: { "x-admin-password": legacyPass } });
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
      } else {
        setGuides(data.data || []);
      }
    } catch (e) {
      setMessage("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      title: "", slug: "", flag: "", region: "", visa_status: "vize_gerekli", stay_duration: "",
      with_id_card: false, passport_required: true, currency: "", language: "", capital: "",
      best_time: "", avg_flight: "", avg_hotel: "", hero_image_url: "",
      places_to_visit: "", security_notes: "", airport_transfer: "",
      affiliate_links: "", seo_title: "", seo_description: ""
    });
    setEditingId(null);
  }

  function validateRules() {
    const titleLower = formData.title.toLowerCase();
    
    // Rule 1: BAE vizesiz olamaz
    if ((titleLower.includes("bae") || titleLower.includes("dubai") || titleLower.includes("birleşik arap emirlikleri")) && formData.visa_status === "vizesiz") {
      alert("Hata: BAE / Dubai vizesiz bir ülke olarak işaretlenemez. Lütfen e-Vize veya Vize Gerekli seçin.");
      return false;
    }
    
    // Rule 2 & 3: Bosna Hersek ve Sırbistan kimlikle gidilemez
    if ((titleLower.includes("bosna") || titleLower.includes("sırbistan")) && formData.with_id_card) {
      alert("Hata: Bosna Hersek ve Sırbistan'a kimlikle seyahat edilemez. Yeni düzenlemelere göre pasaport zorunludur.");
      return false;
    }

    if (formData.hero_image_url && !/\.(jpg|jpeg|png|webp)$/i.test(formData.hero_image_url)) {
      alert("Hata: Sadece .jpg, .jpeg, .png ve .webp formatında görsel URL'leri kabul edilir.");
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateRules()) return;

    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    const method = editingId ? "PUT" : "POST";
    const body = { id: editingId, ...formData };

    try {
      const res = await fetch("/api/admin/rehber", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(data.message || "Başarıyla kaydedildi.");
        setIsFormOpen(false);
        resetForm();
        loadGuides();
      }
    } catch (e) {
      alert("Kayıt işlemi başarısız (bağlantı hatası).");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu rehberi kalıcı olarak silmek istediğinize emin misiniz?")) return;
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/rehber", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        loadGuides();
      }
    } catch (e) {
      alert("Silme işlemi başarısız.");
    }
  }

  function handleEdit(guide: any) {
    setFormData({
      title: guide.title || "", slug: guide.slug || "", flag: guide.flag || "", 
      region: guide.region || "", visa_status: guide.visa_status || "vize_gerekli", 
      stay_duration: guide.stay_duration || "", with_id_card: guide.with_id_card || false, 
      passport_required: guide.passport_required !== false, currency: guide.currency || "", 
      language: guide.language || "", capital: guide.capital || "", best_time: guide.best_time || "", 
      avg_flight: guide.avg_flight || "", avg_hotel: guide.avg_hotel || "", 
      hero_image_url: guide.hero_image_url || "", places_to_visit: guide.places_to_visit || "", 
      security_notes: guide.security_notes || "", airport_transfer: guide.airport_transfer || "",
      affiliate_links: guide.affiliate_links || "", seo_title: guide.seo_title || "", 
      seo_description: guide.seo_description || ""
    });
    setEditingId(guide.id);
    setIsFormOpen(true);
  }

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600" }}>
          ← Admin Paneline Dön
        </a>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
          <BookOpen size={36} color="var(--l2t-blue)" /> Ülke Rehberi Yönetimi
        </h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Gidilecek ülkeler için detaylı rehberler oluşturun ve yönetin.</p>
      </div>

      {message && (
        <div style={{ background: "#fee2e2", padding: "16px", borderRadius: "12px", color: "#991b1b", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", border: "1px solid #fecaca" }}>
          <AlertCircle size={20} />
          <strong>Hata:</strong> {message}
        </div>
      )}

      {!isFormOpen ? (
        <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px", alignItems: "center" }}>
            <h2 style={{ margin: 0, color: "var(--l2t-navy)", fontSize: "1.3rem" }}>Kayıtlı Rehberler ({guides.length})</h2>
            <button 
              onClick={() => { resetForm(); setIsFormOpen(true); }}
              className="l2t-btn"
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px" }}
            >
              <Plus size={18} /> Yeni Ülke Rehberi
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600", width: "80px" }}>Bayrak</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Ülke Adı</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Vize Durumu</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Bölge</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600", textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center" }}>Yükleniyor...</td></tr>
                ) : guides.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Kayıtlı rehber bulunamadı.</td></tr>
                ) : (
                  guides.map(guide => (
                    <tr key={guide.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "16px", fontSize: "1.5rem" }}>{guide.flag || "🌍"}</td>
                      <td style={{ padding: "16px", fontWeight: "600", color: "var(--l2t-navy)" }}>{guide.title}</td>
                      <td style={{ padding: "16px", color: "var(--l2t-soft)" }}>
                        <span style={{ padding: "4px 10px", background: guide.visa_status === 'vizesiz' ? '#dcfce3' : '#fef3c7', color: guide.visa_status === 'vizesiz' ? '#065f46' : '#92400e', borderRadius: "12px", fontSize: "0.8rem", fontWeight: "700" }}>
                          {guide.visa_status}
                        </span>
                      </td>
                      <td style={{ padding: "16px", color: "var(--l2t-soft)" }}>{guide.region}</td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <button onClick={() => handleEdit(guide)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--l2t-blue)", padding: "8px" }}><Edit size={18} /></button>
                        <button onClick={() => handleDelete(guide.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: "8px" }}><Trash2 size={18} /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "24px", color: "var(--l2t-navy)" }}>{editingId ? "Rehberi Düzenle" : "Yeni Ülke Rehberi"}</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Row 1 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Ülke Adı *</label>
                <input required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>URL (Slug) *</label>
                <input required value={formData.slug} onChange={(e) => setFormData({...formData, slug: e.target.value})} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Bayrak</label>
                <input value={formData.flag} onChange={(e) => setFormData({...formData, flag: e.target.value})} placeholder="🇯🇵" style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", textAlign: "center" }} />
              </div>
            </div>

            {/* Row 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Vize Durumu</label>
                <select value={formData.visa_status} onChange={(e) => setFormData({...formData, visa_status: e.target.value})} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff" }}>
                  <option value="vizesiz">Vizesiz</option>
                  <option value="e_vize">e-Vize / Kapıda Vize</option>
                  <option value="vize_gerekli">Vize Gerekli</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Bölge (Kıta)</label>
                <input value={formData.region} onChange={(e) => setFormData({...formData, region: e.target.value})} placeholder="Örn: Avrupa" style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Kalış Süresi</label>
                <input value={formData.stay_duration} onChange={(e) => setFormData({...formData, stay_duration: e.target.value})} placeholder="Örn: 90 Gün" style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
            </div>

            {/* Checkboxes */}
            <div style={{ display: "flex", gap: "32px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "600", color: "var(--l2t-navy)" }}>
                <input type="checkbox" checked={formData.with_id_card} onChange={(e) => setFormData({...formData, with_id_card: e.target.checked})} style={{ width: "18px", height: "18px" }} />
                Kimlikle Gidilebilir mi?
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "600", color: "var(--l2t-navy)" }}>
                <input type="checkbox" checked={formData.passport_required} onChange={(e) => setFormData({...formData, passport_required: e.target.checked})} style={{ width: "18px", height: "18px" }} />
                Pasaport Gerekli mi?
              </label>
            </div>

            {/* Row 3 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)", fontSize: "0.9rem" }}>Para Birimi</label>
                <input value={formData.currency} onChange={(e) => setFormData({...formData, currency: e.target.value})} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)", fontSize: "0.9rem" }}>Dil</label>
                <input value={formData.language} onChange={(e) => setFormData({...formData, language: e.target.value})} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)", fontSize: "0.9rem" }}>Başkent</label>
                <input value={formData.capital} onChange={(e) => setFormData({...formData, capital: e.target.value})} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)", fontSize: "0.9rem" }}>En İyi Dönem</label>
                <input value={formData.best_time} onChange={(e) => setFormData({...formData, best_time: e.target.value})} placeholder="Örn: İlkbahar" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: "600", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "6px" }}><ImageIcon size={16} /> Hero Görseli URL</label>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <input value={formData.hero_image_url} onChange={(e) => setFormData({...formData, hero_image_url: e.target.value})} placeholder="https://example.com/image.jpg" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                <div style={{ width: "120px", height: "80px", borderRadius: "12px", background: "#f8fafc", overflow: "hidden", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                  {formData.hero_image_url ? (
                    <img src={formData.hero_image_url} alt="Önizleme" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => (e.currentTarget.src = "https://placehold.co/120x80?text=Hata")} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.8rem" }}>Önizleme</div>
                  )}
                </div>
              </div>
              <small style={{ color: "var(--l2t-soft)" }}>Desteklenen uzantılar: .jpg, .jpeg, .png, .webp</small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Gezilecek Yerler</label>
                <textarea value={formData.places_to_visit} onChange={(e) => setFormData({...formData, places_to_visit: e.target.value})} rows={4} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Güvenlik Notları</label>
                <textarea value={formData.security_notes} onChange={(e) => setFormData({...formData, security_notes: e.target.value})} rows={4} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setIsFormOpen(false)} style={{ padding: "12px 24px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: "600", color: "var(--l2t-navy)" }}>İptal</button>
              <button type="submit" className="l2t-btn" style={{ padding: "12px 24px", borderRadius: "12px", cursor: "pointer" }}>Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
