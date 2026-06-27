"use client";

import { useState, useEffect } from "react";
import { COUNTRIES } from "@/lib/countries/countryData";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function DogrulamalarPage() {
  const router = useRouter();
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [countryCode, setCountryCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function checkAuthAndFetch() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?next=/profil/dogrulamalar");
        return;
      }
      fetchVerifications(session.access_token);
    }
    checkAuthAndFetch();
  }, [router]);

  async function fetchVerifications(token: string) {
    try {
      const res = await fetch("/api/travel-verifications", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.data) setVerifications(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countryCode || !file) {
      setError("Ülke ve belge zorunludur.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapmanız gerekiyor.");

      const formData = new FormData();
      formData.append("countryCode", countryCode);
      formData.append("note", note);
      formData.append("file", file);

      const res = await fetch("/api/travel-verifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess("Başvurunuz başarıyla alındı.");
        setCountryCode("");
        setFile(null);
        setNote("");
        fetchVerifications(session.access_token);
      } else {
        setError(data.error || "Bir hata oluştu.");
      }
    } catch (err: any) {
      setError(err.message || "Sunucu hatası.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-white">Yükleniyor...</div>;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-white mb-4">Gezdiğin ülkeleri doğrula, haritada kilidini aç.</h1>
      <p className="text-gray-400 mb-8">
        Bir ülkeye gerçekten gittiğini gösteren basit bir belge veya ikna edici fotoğraf yükle. Ekibimiz manuel olarak kontrol eder. Onaylanınca o ülke haritanda açılır ve o ülke hakkında cevap/öneri paylaşabilirsin.
      </p>

      <div className="l2t-belgeli-gezgin-grid">
        {/* Form */}
        <div className="l2t-belgeli-gezgin-card">
          <h2 className="text-xl font-bold text-white mb-4">Yeni Doğrulama Talebi</h2>
          
          {error && <div className="bg-red-500/10 text-red-400 p-3 rounded mb-4">{error}</div>}
          {success && <div className="bg-green-500/10 text-green-400 p-3 rounded mb-4">{success}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm mb-1">Ülke Seç</label>
              <select 
                className="l2t-belgeli-gezgin-select" 
                value={countryCode} 
                onChange={e => setCountryCode(e.target.value)}
              >
                <option value="">-- Seçiniz --</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flagEmoji} {c.nameTR}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 text-sm mb-1">Kanıt Belgesi / Fotoğraf</label>
              <input 
                type="file" 
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="l2t-belgeli-gezgin-input"
              />
              <p className="text-xs text-gray-500 mt-1">Maks 5MB. PNR zorunlu değil, ikna edici fotoğraf yeterli. Sadece inceleme içindir, herkese açık gösterilmez.</p>
            </div>

            <div>
              <label className="block text-gray-300 text-sm mb-1">Not (Opsiyonel)</label>
              <textarea 
                className="l2t-belgeli-gezgin-textarea" 
                rows={3} 
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Eklemek istediğiniz bir şey var mı?"
              />
            </div>

            <button type="submit" disabled={submitting} className="l2t-belgeli-gezgin-btn w-full">
              {submitting ? 'Gönderiliyor...' : 'Doğrulama Gönder'}
            </button>
          </form>
        </div>

        {/* Geçmiş Başvurular */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Başvurularım</h2>
          {verifications.length === 0 ? (
            <div className="l2t-belgeli-gezgin-card text-center text-gray-400">
              Henüz bir başvurunuz yok.
            </div>
          ) : (
            <div className="space-y-4">
              {verifications.map(v => (
                <div key={v.id} className="l2t-belgeli-gezgin-card p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">{v.country_name}</span>
                    <span className={`l2t-status-${v.status}`}>
                      {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Tarih: {new Date(v.created_at).toLocaleDateString('tr-TR')}
                  </div>
                  {v.admin_note && (
                    <div className="mt-2 text-sm bg-black/30 p-2 rounded border border-gray-700">
                      <strong>Yönetici Notu:</strong> {v.admin_note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
