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

  if (loading) return <div className="l2t-wrap l2t-page" style={{ textAlign: "center" }}><p style={{ color: "var(--l2t-soft)", animation: "l2t-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}>Yükleniyor...</p></div>;

  return (
    <div className="l2t-wrap l2t-page">
      <div className="l2t-page-head">
        <h1>Gezdiğin ülkeleri doğrula, haritada kilidini aç.</h1>
        <p>
          Bir ülkeye gerçekten gittiğini gösteren basit bir belge veya ikna edici fotoğraf yükle. Ekibimiz manuel olarak kontrol eder. Onaylanınca o ülke haritanda açılır ve o ülke hakkında cevap/öneri paylaşabilirsin.
        </p>
      </div>

      <div className="l2t-profile-grid">
        {/* Form */}
        <div className="l2t-glass-card" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--l2t-text)", marginBottom: "24px", marginTop: "0" }}>Yeni Doğrulama Talebi</h2>
          
          {error && <div className="l2t-alert l2t-alert-danger">{error}</div>}
          {success && <div className="l2t-alert l2t-alert-success">{success}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="l2t-form-group">
              <label className="l2t-form-label">Ülke Seç</label>
              <select 
                className="l2t-form-control" 
                value={countryCode} 
                onChange={e => setCountryCode(e.target.value)}
                style={{ appearance: "none" }}
              >
                <option value="">-- Seçiniz --</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flagEmoji} {c.nameTR}</option>
                ))}
              </select>
            </div>

            <div className="l2t-form-group">
              <label className="l2t-form-label">Kanıt Belgesi / Fotoğraf</label>
              <div className="l2t-file-drop">
                <input 
                  type="file" 
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="l2t-file-input"
                />
              </div>
              <p className="l2t-hint">
                Maks 5MB. PNR zorunlu değil, ikna edici fotoğraf yeterli. Sadece inceleme içindir, herkese açık gösterilmez.
              </p>
            </div>

            <div className="l2t-form-group">
              <label className="l2t-form-label">Not (Opsiyonel)</label>
              <textarea 
                className="l2t-form-control" 
                style={{ minHeight: "100px", resize: "vertical" }}
                rows={3} 
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Eklemek istediğiniz bir şey var mı?"
              />
            </div>

            <button type="submit" disabled={submitting} className="l2t-button l2t-button-gold" style={{ width: "100%", marginTop: "8px" }}>
              {submitting ? 'Gönderiliyor...' : 'Doğrulama Gönder'}
            </button>
          </form>
        </div>

        {/* Geçmiş Başvurular */}
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--l2t-text)", marginBottom: "24px", marginTop: "0" }}>Başvurularım</h2>
          {verifications.length === 0 ? (
            <div className="l2t-glass-card" style={{ padding: "32px", textAlign: "center", color: "var(--l2t-muted)", borderStyle: "dashed" }}>
              Henüz bir başvurunuz yok.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {verifications.map(v => (
                <div key={v.id} className="l2t-glass-card l2t-card" style={{ padding: "20px" }}>
                  <div className="l2t-card-header">
                    <span style={{ fontWeight: "800", color: "var(--l2t-text)", fontSize: "1.125rem" }}>{v.country_name}</span>
                    <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                      {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                    </span>
                  </div>
                  <div className="l2t-card-footer">
                    Tarih: {new Date(v.created_at).toLocaleDateString('tr-TR')}
                  </div>
                  {v.admin_note && (
                    <div className="l2t-card-note">
                      <strong style={{ color: "var(--l2t-gold)" }}>Yönetici Notu:</strong> {v.admin_note}
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
