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

  if (loading) return <div className="l2t-wrap l2t-page text-center"><p className="text-[var(--l2t-soft)] animate-pulse">Yükleniyor...</p></div>;

  return (
    <div className="l2t-wrap l2t-page">
      <div className="l2t-page-head">
        <h1>Gezdiğin ülkeleri doğrula, haritada kilidini aç.</h1>
        <p>
          Bir ülkeye gerçekten gittiğini gösteren basit bir belge veya ikna edici fotoğraf yükle. Ekibimiz manuel olarak kontrol eder. Onaylanınca o ülke haritanda açılır ve o ülke hakkında cevap/öneri paylaşabilirsin.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-8 mt-8">
        {/* Form */}
        <div className="l2t-glass-card p-6 md:p-8">
          <h2 className="text-xl font-bold text-white mb-6">Yeni Doğrulama Talebi</h2>
          
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-6 font-bold">{error}</div>}
          {success && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-lg mb-6 font-bold">{success}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[var(--l2t-soft)] font-bold text-sm mb-2">Ülke Seç</label>
              <select 
                className="l2t-form-control appearance-none" 
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
              <label className="block text-[var(--l2t-soft)] font-bold text-sm mb-2">Kanıt Belgesi / Fotoğraf</label>
              <div className="border-2 border-dashed border-[var(--l2t-border)] rounded-xl p-4 bg-[var(--l2t-card-strong)] hover:border-[var(--l2t-gold)]/50 transition-colors">
                <input 
                  type="file" 
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[var(--l2t-soft)] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--l2t-gold)] file:text-[var(--l2t-night)] hover:file:bg-[var(--l2t-gold-hover)] cursor-pointer"
                />
              </div>
              <p className="text-xs text-[var(--l2t-muted)] mt-2 leading-relaxed">
                Maks 5MB. PNR zorunlu değil, ikna edici fotoğraf yeterli. Sadece inceleme içindir, herkese açık gösterilmez.
              </p>
            </div>

            <div>
              <label className="block text-[var(--l2t-soft)] font-bold text-sm mb-2">Not (Opsiyonel)</label>
              <textarea 
                className="l2t-form-control min-h-[100px] resize-y" 
                rows={3} 
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Eklemek istediğiniz bir şey var mı?"
              />
            </div>

            <button type="submit" disabled={submitting} className="l2t-button l2t-button-gold w-full mt-2">
              {submitting ? 'Gönderiliyor...' : 'Doğrulama Gönder'}
            </button>
          </form>
        </div>

        {/* Geçmiş Başvurular */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Başvurularım</h2>
          {verifications.length === 0 ? (
            <div className="l2t-glass-card p-8 text-center text-[var(--l2t-muted)] border-dashed">
              Henüz bir başvurunuz yok.
            </div>
          ) : (
            <div className="space-y-4">
              {verifications.map(v => (
                <div key={v.id} className="l2t-glass-card p-5 flex flex-col gap-3 transition-transform hover:-translate-y-1">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-white text-lg">{v.country_name}</span>
                    <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                      {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--l2t-muted)] flex justify-between items-center pt-2 border-t border-[var(--l2t-border)]">
                    Tarih: {new Date(v.created_at).toLocaleDateString('tr-TR')}
                  </div>
                  {v.admin_note && (
                    <div className="mt-2 text-sm bg-[var(--l2t-card-strong)] p-3 rounded-lg border border-[var(--l2t-border)]">
                      <strong className="text-[var(--l2t-gold)]">Yönetici Notu:</strong> {v.admin_note}
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
