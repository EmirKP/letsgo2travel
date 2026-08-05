"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import styles from "./admin-verifications.module.css";

interface Verification {
  id: string;
  user_id: string;
  country_name?: string | null;
  country_code: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user_note?: string | null;
}

export default function AdminDogrulamalarPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
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
        setPreviewType(json.evidenceType || null);
        setSelectedId(id);
      } else {
        setToast({ msg: "Önizleme alınamadı.", type: "error" });
      }
    } catch {
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
        setPreviewType(null);
        setSelectedId(null);
        setAdminNote("");
        fetchVerifications();
      } else {
        setToast({ msg: json.error || "Bir hata oluştu", type: "error" });
      }
    } catch {
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
      <div className={`l2t-admin-shell l2t-wrap ${styles.loading}`} role="status">
        <p>Yükleniyor...</p>
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
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.error : styles.success}`} role="status">
          {toast.msg}
        </div>
      )}

      {/* İstatistik Kartları */}
      <div className={styles.stats}>
        <div className={`l2t-glass-card ${styles.stat} ${styles.statPending}`}>
          <span>Bekleyen</span>
          <strong>{stats.pending}</strong>
        </div>
        <div className={`l2t-glass-card ${styles.stat} ${styles.statApproved}`}>
          <span>Onaylanan</span>
          <strong>{stats.approved}</strong>
        </div>
        <div className={`l2t-glass-card ${styles.stat} ${styles.statRejected}`}>
          <span>Reddedilen</span>
          <strong>{stats.rejected}</strong>
        </div>
        <div className={`l2t-glass-card ${styles.stat}`}>
          <span>Toplam</span>
          <strong>{stats.total}</strong>
        </div>
      </div>

      <div className={styles.filters}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`${styles.filter} ${filter === f ? styles.filterActive : ''}`}
          >
            {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekleyenler' : f === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
          </button>
        ))}
      </div>

      <div className={styles.layout}>
        {/* Başvurular Listesi */}
        <div className={styles.list}>
          {filteredData.map(v => (
            <div key={v.id} className={`l2t-glass-card ${styles.item}`}>
              <div className={styles.itemHead}>
                <div>
                  <h3>{v.country_name || v.country_code}</h3>
                  <p className={styles.userId}>ID: {shortenId(v.user_id)}</p>
                </div>
                <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                  {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                </span>
              </div>
              
              <div className={styles.itemMeta}>
                <span>Başvuru: {new Date(v.created_at).toLocaleString('tr-TR')}</span>
                
                {v.status === 'pending' && (
                  <button 
                    onClick={() => handlePreview(v.id)}
                    disabled={previewLoading}
                    className={`l2t-button l2t-button-gold ${styles.smallButton}`}
                  >
                    Belgeyi İncele
                  </button>
                )}
              </div>
              
              {v.user_note && (
                <div className={styles.note}>
                  <strong>Not:</strong> {v.user_note}
                </div>
              )}
            </div>
          ))}
          {filteredData.length === 0 && (
            <div className={`l2t-glass-card ${styles.empty}`}>
              Bu kategoride başvuru bulunmuyor.
            </div>
          )}
        </div>

        {/* Detay & İşlem Paneli */}
        {previewUrl && (
          <div className={`l2t-admin-card ${styles.panel}`}>
            <h2>Belge İnceleme Paneli</h2>
            
            <div className={styles.preview}>
              {previewType === "application/pdf" ? (
                <iframe src={previewUrl} title="Doğrulama belgesi" style={{ width: "100%", minHeight: "480px", border: 0 }} />
              ) : (
                <img src={previewUrl} alt="Doğrulama belgesi" />
              )}
              <div className={styles.signed}>Geçici bağlantı (5 dk.)</div>
            </div>
            
            <div className={styles.field}>
              <label className={styles.label}>Admin Notu (Zorunlu veya İsteğe Bağlı)</label>
              <textarea 
                className={`l2t-form-control ${styles.textarea}`}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                maxLength={1000}
                placeholder="Reddediyorsanız sebebi zorunludur..."
              />
            </div>

            <div className={styles.actions}>
              <button 
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className={`l2t-button ${styles.approve}`}
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
