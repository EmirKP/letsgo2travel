"use client";

import { useState, useEffect } from "react";
import { PenTool, Plus, Trash2, Edit, Search, AlertCircle, Image as ImageIcon } from "lucide-react";

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    setIsLoading(true);
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/blog", { headers: { "x-admin-password": legacyPass } });
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
      } else {
        setPosts(data.data || []);
      }
    } catch (e) {
      setMessage("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setTitle("");
    setSlug("");
    setCategory("");
    setImageUrl("");
    setSummary("");
    setContent("");
    setStatus("draft");
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (imageUrl && !/\.(jpg|jpeg|png|webp)$/i.test(imageUrl)) {
      alert("Sadece .jpg, .jpeg, .png ve .webp formatında görsel URL'leri kabul edilir.");
      return;
    }

    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    const method = editingId ? "PUT" : "POST";
    const body = { id: editingId, title, slug, category, image_url: imageUrl, summary, content, status };

    try {
      const res = await fetch("/api/admin/blog", {
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
        loadPosts();
      }
    } catch (e) {
      alert("Kayıt işlemi başarısız (bağlantı hatası).");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu yazıyı kalıcı olarak silmek istediğinize emin misiniz?")) return;
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/blog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        loadPosts();
      }
    } catch (e) {
      alert("Silme işlemi başarısız.");
    }
  }

  function handleEdit(post: any) {
    setTitle(post.title || "");
    setSlug(post.slug || "");
    setCategory(post.category || "");
    setImageUrl(post.image_url || "");
    setSummary(post.summary || "");
    setContent(post.content || "");
    setStatus(post.status || "draft");
    setEditingId(post.id);
    setIsFormOpen(true);
  }

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600" }}>
          ← Admin Paneline Dön
        </a>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
          <PenTool size={36} color="var(--l2t-blue)" /> Blog Yönetimi
        </h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>İçeriklerinizi ekleyin, düzenleyin ve yayımlayın.</p>
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
            <h2 style={{ margin: 0, color: "var(--l2t-navy)", fontSize: "1.3rem" }}>Yazılar ({posts.length})</h2>
            <button 
              onClick={() => { resetForm(); setIsFormOpen(true); }}
              className="l2t-btn"
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px" }}
            >
              <Plus size={18} /> Yeni Yazı Ekle
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Görsel</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Başlık</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Kategori</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Durum</th>
                  <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600", textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center" }}>Yükleniyor...</td></tr>
                ) : posts.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>Kayıtlı yazı bulunamadı.</td></tr>
                ) : (
                  posts.map(post => (
                    <tr key={post.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "16px" }}>
                        <img 
                          src={post.image_url || "https://placehold.co/100x70?text=Gorsel+Yok"} 
                          alt="Kapak" 
                          style={{ width: "80px", height: "56px", objectFit: "cover", borderRadius: "8px", background: "#e2e8f0" }} 
                          onError={(e) => (e.currentTarget.src = "https://placehold.co/100x70?text=Hata")}
                        />
                      </td>
                      <td style={{ padding: "16px", fontWeight: "600", color: "var(--l2t-navy)" }}>{post.title}</td>
                      <td style={{ padding: "16px", color: "var(--l2t-soft)" }}>{post.category}</td>
                      <td style={{ padding: "16px" }}>
                        <span style={{ padding: "4px 10px", background: post.status === 'published' ? '#dcfce3' : '#fef3c7', color: post.status === 'published' ? '#065f46' : '#92400e', borderRadius: "12px", fontSize: "0.8rem", fontWeight: "700" }}>
                          {post.status === 'published' ? 'Yayında' : 'Taslak'}
                        </span>
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <button onClick={() => handleEdit(post)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--l2t-blue)", padding: "8px" }}><Edit size={18} /></button>
                        <button onClick={() => handleDelete(post.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: "8px" }}><Trash2 size={18} /></button>
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
          <h2 style={{ marginTop: 0, marginBottom: "24px", color: "var(--l2t-navy)" }}>{editingId ? "Yazıyı Düzenle" : "Yeni Yazı Ekle"}</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Başlık *</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>URL (Slug) *</label>
                <input required value={slug} onChange={(e) => setSlug(e.target.value)} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Kategori</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Durum</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff" }}>
                  <option value="draft">Taslak</option>
                  <option value="published">Yayında</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: "600", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "6px" }}><ImageIcon size={16} /> Kapak Görseli URL</label>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                <div style={{ width: "120px", height: "80px", borderRadius: "12px", background: "#f8fafc", overflow: "hidden", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="Önizleme" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => (e.currentTarget.src = "https://placehold.co/120x80?text=Hata")} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.8rem" }}>Önizleme</div>
                  )}
                </div>
              </div>
              <small style={{ color: "var(--l2t-soft)" }}>Desteklenen uzantılar: .jpg, .jpeg, .png, .webp</small>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>Kısa Özet</label>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: "600", color: "var(--l2t-navy)" }}>İçerik (Markdown veya HTML)</label>
              <textarea required value={content} onChange={(e) => setContent(e.target.value)} rows={10} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0", resize: "vertical", fontFamily: "monospace" }} />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button type="button" onClick={() => setIsFormOpen(false)} style={{ padding: "12px 24px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: "600", color: "var(--l2t-navy)" }}>İptal</button>
              <button type="submit" className="l2t-btn" style={{ padding: "12px 24px", borderRadius: "12px", cursor: "pointer" }}>Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
