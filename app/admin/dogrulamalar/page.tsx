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

  if (loading) return <div className="p-8 text-white">Yükleniyor...</div>;

  return (
    <div className="p-6 bg-[#040C1A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Gezgin Doğrulamaları (Belgeli Gezgin)</h1>
      
      {toast && (
        <div className={`p-4 mb-4 rounded ${toast.type === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-green-500/20 text-green-200'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex gap-4 mb-8">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded font-bold ${filter === f ? 'bg-[#F5B81B] text-black' : 'bg-white/10 text-white'}`}
          >
            {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekleyenler' : f === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          {filteredData.map(v => (
            <div key={v.id} className="bg-white/5 border border-white/10 p-4 rounded-lg flex flex-col gap-2">
              <div className="flex justify-between">
                <strong className="text-lg text-[#F5B81B]">{v.country_name || v.country_code}</strong>
                <span className={`px-2 py-1 rounded text-xs font-bold ${v.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' : v.status === 'approved' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                  {v.status}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                Tarih: {new Date(v.created_at).toLocaleString('tr-TR')} <br/>
                Kullanıcı: {v.user_id}
              </div>
              {v.user_note && (
                <div className="text-sm bg-black/40 p-2 rounded mt-2 border border-white/5">
                  <strong>Not:</strong> {v.user_note}
                </div>
              )}
              {v.status === 'pending' && (
                <button 
                  onClick={() => handlePreview(v.id)}
                  disabled={previewLoading}
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm w-max"
                >
                  Belgeyi İncele & İşlem Yap
                </button>
              )}
            </div>
          ))}
          {filteredData.length === 0 && <div className="text-gray-500">Kayıt bulunamadı.</div>}
        </div>

        {/* Detay & İşlem Paneli */}
        {previewUrl && (
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg sticky top-6 self-start">
            <h2 className="text-xl font-bold mb-4 border-b border-white/10 pb-2">Belge Önizleme</h2>
            
            <div className="bg-black/50 aspect-video rounded flex items-center justify-center mb-6 overflow-hidden">
              <img src={previewUrl} alt="Kanıt" className="max-w-full max-h-full object-contain" />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-1">Admin Notu (Kullanıcı Görecek)</label>
              <textarea 
                className="w-full bg-black/40 border border-white/20 rounded p-2 text-white" 
                rows={3}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Reddediyorsanız sebebi zorunludur..."
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => handleAction('approve')}
                disabled={actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold"
              >
                Onayla
              </button>
              <button 
                onClick={() => handleAction('reject')}
                disabled={actionLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold"
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
