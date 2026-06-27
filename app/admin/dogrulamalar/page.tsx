"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

export default function AdminDogrulamalarPage() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);

  useEffect(() => {
    fetchVerifications();
  }, []);

  async function fetchVerifications() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/travel-verifications", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.data) setVerifications(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview(id: string) {
    setPreviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/travel-verifications/${id}/signed-url`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      const json = await res.json();
      if (json.signedUrl) {
        setPreviewUrl(json.signedUrl);
        setSelectedId(id);
      } else {
        setToast({ msg: "Önizleme alınamadı.", type: "error" });
      }
    } catch (err) {
      setToast({ msg: "Sunucu hatası.", type: "error" });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleAction(action: 'approve' | 'reject') {
    if (!selectedId) return;
    if (action === 'reject' && !adminNote.trim()) {
      setToast({ msg: "Red sebebi yazmalısınız.", type: "error" });
      return;
    }

    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/travel-verifications/${selectedId}/${action}`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ adminNote })
      });
      
      const json = await res.json();
      if (json.success) {
        setToast({ msg: `İşlem başarılı (${action})`, type: "success" });
        setPreviewUrl(null);
        setSelectedId(null);
        setAdminNote("");
        fetchVerifications();
      } else {
        setToast({ msg: json.error || "Bir hata oluştu", type: "error" });
      }
    } catch (err) {
      setToast({ msg: "Sunucu hatası.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  }

  const filteredData = verifications.filter(v => filter === "all" || v.status === filter);

  const stats = {
    total: verifications.length,
    pending: verifications.filter(v => v.status === "pending").length,
    approved: verifications.filter(v => v.status === "approved").length,
    rejected: verifications.filter(v => v.status === "rejected").length,
  };

  function shortenId(id: string) {
    if (!id) return "";
    return id.substring(0, 8) + "..." + id.substring(id.length - 4);
  }

  if (loading) {
    return (
      <div className="l2t-admin-shell l2t-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: "1.25rem", color: "var(--l2t-soft)", animation: "l2t-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="l2t-admin-shell l2t-wrap">
      <div className="l2t-page-head">
        <h1>Gezgin Doğrulamaları</h1>
        <p>Belgeli Gezgin başvurularını incele, onayla veya reddet.</p>
      </div>
      
      {toast && (
        <div className={`l2t-alert ${toast.type === 'error' ? 'l2t-alert-danger' : 'l2t-alert-success'}`}>
          {toast.msg}
        </div>
      )}

      {/* İstatistik Kartları */}
      <div className="l2t-admin-stats-grid">
        <div className="l2t-glass-card l2t-admin-stat-card">
          <span className="l2t-admin-stat-label">Bekleyen</span>
          <strong className="l2t-admin-stat-val" style={{ color: "var(--l2t-gold)" }}>{stats.pending}</strong>
        </div>
        <div className="l2t-glass-card l2t-admin-stat-card">
          <span className="l2t-admin-stat-label">Onaylanan</span>
          <strong className="l2t-admin-stat-val" style={{ color: "var(--l2t-success)" }}>{stats.approved}</strong>
        </div>
        <div className="l2t-glass-card l2t-admin-stat-card">
          <span className="l2t-admin-stat-label">Reddedilen</span>
          <strong className="l2t-admin-stat-val" style={{ color: "var(--l2t-danger)" }}>{stats.rejected}</strong>
        </div>
        <div className="l2t-glass-card l2t-admin-stat-card">
          <span className="l2t-admin-stat-label">Toplam</span>
          <strong className="l2t-admin-stat-val" style={{ color: "var(--l2t-text)" }}>{stats.total}</strong>
        </div>
      </div>

      <div className="l2t-filter-bar">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`l2t-filter-btn ${filter === f ? 'l2t-filter-btn-active' : 'l2t-filter-btn-inactive'}`}
          >
            {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekleyenler' : f === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
          </button>
        ))}
      </div>

      <div className="l2t-admin-main-grid">
        {/* Başvurular Listesi */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredData.map(v => (
            <div key={v.id} className="l2t-glass-card l2t-card" style={{ padding: "20px" }}>
              <div className="l2t-card-header">
                <div>
                  <h3 className="l2t-admin-item-title">{v.country_name || v.country_code}</h3>
                  <p className="l2t-admin-item-id">ID: {shortenId(v.user_id)}</p>
                </div>
                <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                  {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                </span>
              </div>
              
              <div className="l2t-admin-item-footer">
                <span>Başvuru: {new Date(v.created_at).toLocaleString('tr-TR')}</span>
                
                {v.status === 'pending' && (
                  <button 
                    onClick={() => handlePreview(v.id)}
                    disabled={previewLoading}
                    className="l2t-button l2t-button-gold l2t-btn-small"
                  >
                    Belgeyi İncele
                  </button>
                )}
              </div>
              
              {v.user_note && (
                <div className="l2t-card-note mt-1">
                  <strong style={{ color: "var(--l2t-gold)" }}>Not:</strong> {v.user_note}
                </div>
              )}
            </div>
          ))}
          {filteredData.length === 0 && (
            <div className="l2t-glass-card" style={{ padding: "40px", textAlign: "center", color: "var(--l2t-muted)" }}>
              Bu kategoride başvuru bulunmuyor.
            </div>
          )}
        </div>

        {/* Detay & İşlem Paneli */}
        {previewUrl && (
          <div className="l2t-admin-card" style={{ position: "sticky", top: "96px", boxShadow: "var(--l2t-shadow-lg)" }}>
            <h2 className="l2t-admin-panel-title">Belge İnceleme Paneli</h2>
            
            <div className="l2t-preview-box">
              <img src={previewUrl} alt="Kanıt" className="l2t-preview-img" />
              <div className="l2t-preview-tag">Signed URL (5 Dk)</div>
            </div>
            
            <div className="l2t-form-group">
              <label className="l2t-form-label">Admin Notu (Zorunlu veya İsteğe Bağlı)</label>
              <textarea 
                className="l2t-form-control"
                style={{ minHeight: "100px", resize: "vertical" }}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Reddediyorsanız sebebi zorunludur..."
              />
            </div>

            <div className="l2t-admin-actions">
              <button 
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className="l2t-button l2t-button-success"
              >
                Onayla & Yetki Ver
              </button>
              <button 
                onClick={() => handleAction('reject')}
                disabled={actionLoading}
                className="l2t-button l2t-button-danger"
              >
                Reddet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
