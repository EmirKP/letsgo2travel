"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { APPOINTMENT_STATUS_INFO } from "@/lib/visa/appointmentStatus";

export default function AdminVizeMerkeziPage() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPages();
  }, []);

  async function fetchPages() {
    try {
      const { data, error } = await supabase
        .from('visa_center_pages')
        .select('*')
        .order('country_name', { ascending: true });
      if (data) setPages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelect = (p: any) => {
    setSelectedId(p.id);
    setStatus(p.appointment_status || "");
    setNote(p.appointment_note || "");
    setSourceNote(p.source_note || "");
  };

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`/api/admin/visa-center/${selectedId}`, {
        method: "PATCH",
        headers: { 
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          appointment_status: status,
          appointment_note: note,
          source_note: sourceNote
        })
      });

      if (res.ok) {
        alert("Güncellendi");
        setSelectedId(null);
        fetchPages();
      } else {
        alert("Hata oluştu");
      }
    } catch (err) {
      alert("Sunucu hatası");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-white">Yükleniyor...</div>;

  return (
    <div className="p-6 bg-[#040C1A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Vize Merkezi Yönetimi</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          {pages.map(p => (
            <div key={p.id} className="bg-white/5 p-4 rounded border border-white/10 cursor-pointer hover:bg-white/10" onClick={() => handleSelect(p)}>
              <div className="flex justify-between items-center">
                <strong className="text-[#F5B81B] text-lg">{p.country_name} - {p.visa_title}</strong>
                <span className="text-xs px-2 py-1 bg-black/40 rounded">{p.appointment_status || 'bilgi_yok'}</span>
              </div>
              <div className="text-sm text-gray-400 mt-2">Son Kontrol: {p.last_checked_at ? new Date(p.last_checked_at).toLocaleString('tr-TR') : 'Yok'}</div>
            </div>
          ))}
        </div>

        {selectedId && (
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg sticky top-6 self-start">
            <h2 className="text-xl font-bold mb-4">Randevu Durumu Güncelle</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-300">Durum</label>
                <select className="w-full bg-black/40 border border-white/20 p-2 rounded text-white" value={status} onChange={e => setStatus(e.target.value)}>
                  {Object.entries(APPOINTMENT_STATUS_INFO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-300">Kullanıcıya Gösterilecek Not</label>
                <textarea 
                  className="w-full bg-black/40 border border-white/20 p-2 rounded text-white" rows={2}
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Örn: Haziran ayına nadiren boşluk düşüyor..."
                />
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-300">Kaynak / İç Not (Admin Görür)</label>
                <textarea 
                  className="w-full bg-black/40 border border-white/20 p-2 rounded text-white" rows={2}
                  value={sourceNote} onChange={e => setSourceNote(e.target.value)}
                  placeholder="Telegram grubundan, 12 Haziranda biri randevu aldı."
                />
              </div>

              <div className="text-sm text-yellow-400 bg-yellow-400/10 p-3 rounded">
                Dikkat: Bu bilgi kullanıcılara kesin garanti gibi yansıtılmamalıdır.
              </div>

              <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-[#F5B81B] text-black font-bold py-2 rounded hover:bg-[#FFD15C]"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
