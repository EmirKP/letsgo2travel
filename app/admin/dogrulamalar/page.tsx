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
      <div className="l2t-admin-shell l2t-wrap flex items-center justify-center">
        <p className="text-xl text-[var(--l2t-soft)] animate-pulse">Yükleniyor...</p>
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
        <div className={`p-4 mb-6 rounded-lg font-bold border ${toast.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
          {toast.msg}
        </div>
      )}

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="l2t-glass-card p-5 text-center">
          <span className="block text-[var(--l2t-soft)] text-sm font-bold uppercase tracking-wider mb-2">Bekleyen</span>
          <strong className="text-3xl text-[var(--l2t-gold)]">{stats.pending}</strong>
        </div>
        <div className="l2t-glass-card p-5 text-center">
          <span className="block text-[var(--l2t-soft)] text-sm font-bold uppercase tracking-wider mb-2">Onaylanan</span>
          <strong className="text-3xl text-[var(--l2t-success)]">{stats.approved}</strong>
        </div>
        <div className="l2t-glass-card p-5 text-center">
          <span className="block text-[var(--l2t-soft)] text-sm font-bold uppercase tracking-wider mb-2">Reddedilen</span>
          <strong className="text-3xl text-[var(--l2t-danger)]">{stats.rejected}</strong>
        </div>
        <div className="l2t-glass-card p-5 text-center">
          <span className="block text-[var(--l2t-soft)] text-sm font-bold uppercase tracking-wider mb-2">Toplam</span>
          <strong className="text-3xl text-[var(--l2t-text)]">{stats.total}</strong>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 bg-[var(--l2t-card-strong)] p-2 rounded-xl border border-[var(--l2t-border)] w-max">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${filter === f ? 'bg-[var(--l2t-gold)] text-[var(--l2t-night)] shadow-md' : 'text-[var(--l2t-soft)] hover:text-white hover:bg-white/5'}`}
          >
            {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekleyenler' : f === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
        {/* Başvurular Listesi */}
        <div className="space-y-4">
          {filteredData.map(v => (
            <div key={v.id} className="l2t-glass-card p-5 flex flex-col gap-4 transition-transform hover:-translate-y-1 hover:border-[var(--l2t-gold)]/30">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-[var(--l2t-text)] m-0">{v.country_name || v.country_code}</h3>
                  <p className="text-[var(--l2t-soft)] text-sm mt-1 mb-0">ID: {shortenId(v.user_id)}</p>
                </div>
                <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                  {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                </span>
              </div>
              
              <div className="text-sm text-[var(--l2t-muted)] flex justify-between items-center border-t border-[var(--l2t-border)] pt-3">
                <span>Başvuru: {new Date(v.created_at).toLocaleString('tr-TR')}</span>
                
                {v.status === 'pending' && (
                  <button 
                    onClick={() => handlePreview(v.id)}
                    disabled={previewLoading}
                    className="l2t-button l2t-button-gold !py-2 !px-4 !text-sm"
                  >
                    Belgeyi İncele
                  </button>
                )}
              </div>
              
              {v.user_note && (
                <div className="text-sm bg-[var(--l2t-card-strong)] p-3 rounded-lg border border-[var(--l2t-border)] mt-1">
                  <strong className="text-[var(--l2t-gold)]">Not:</strong> {v.user_note}
                </div>
              )}
            </div>
          ))}
          {filteredData.length === 0 && (
            <div className="l2t-glass-card p-10 text-center text-[var(--l2t-muted)]">
              Bu kategoride başvuru bulunmuyor.
            </div>
          )}
        </div>

        {/* Detay & İşlem Paneli */}
        {previewUrl && (
          <div className="l2t-admin-card sticky top-24 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white border-b border-[var(--l2t-border)] pb-3">Belge İnceleme Paneli</h2>
            
            <div className="bg-[var(--l2t-night)] border border-[var(--l2t-border)] rounded-xl flex items-center justify-center mb-6 overflow-hidden relative" style={{ minHeight: "250px" }}>
              <img src={previewUrl} alt="Kanıt" className="max-w-full max-h-full object-contain" />
              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">Signed URL (5 Dk)</div>
            </div>
            
            <div className="mb-5">
              <label className="block text-sm font-bold text-[var(--l2t-soft)] mb-2">Admin Notu (Zorunlu veya İsteğe Bağlı)</label>
              <textarea 
                className="l2t-form-control min-h-[100px] resize-y"
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Reddediyorsanız sebebi zorunludur..."
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className="l2t-button flex-1 bg-emerald-600 text-white hover:bg-emerald-500 hover:-translate-y-1 shadow-lg shadow-emerald-500/20"
              >
                Onayla & Yetki Ver
              </button>
              <button 
                onClick={() => handleAction('reject')}
                disabled={actionLoading}
                className="l2t-button l2t-button-danger flex-1"
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
