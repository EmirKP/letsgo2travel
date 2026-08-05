"use client";

import { useState, useEffect } from "react";
import { COUNTRIES } from "@/lib/countries/countryData";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import styles from "./verifications.module.css";

interface Verification {
  id: string;
  country_name: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  admin_note?: string | null;
}

export default function DogrulamalarPage() {
  const router = useRouter();
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [countryCode, setCountryCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function checkAuthAndFetch() {
      const requestedCountry = new URLSearchParams(window.location.search).get("country")?.trim();
      if (requestedCountry) {
        const normalized = requestedCountry.toLocaleLowerCase("tr-TR");
        const matchingCountry = COUNTRIES.find(
          (country) => country.code.toLocaleLowerCase("tr-TR") === normalized || country.slug === normalized,
        );
        if (matchingCountry) setCountryCode(matchingCountry.code);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login?next=/profil/dogrulamalar");
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
    if (!countryCode || !file || !consentGiven) {
      setError("Ülke, belge ve inceleme onayı zorunludur.");
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
        setConsentGiven(false);
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

  if (loading) return <div className={styles.loading} role="status">Yükleniyor...</div>;

  return (
    <div className={`l2t-wrap l2t-page ${styles.page}`}>
      <div className="l2t-page-head">
        <h1>Gezdiğin ülkeleri doğrula, haritada kilidini aç.</h1>
        <p>
          Bir ülkeye gerçekten gittiğini gösteren basit bir belge veya ikna edici fotoğraf yükle. Ekibimiz manuel olarak kontrol eder. Onaylanınca o ülke haritanda açılır ve o ülke hakkında cevap/öneri paylaşabilirsin.
        </p>
      </div>

      <div className={styles.layout}>
        {/* Form */}
        <div className={`l2t-glass-card ${styles.card}`}>
          <h2 className={styles.sectionTitle}>Yeni Doğrulama Talebi</h2>
          
          {error && <div className={`${styles.alert} ${styles.error}`} role="alert">{error}</div>}
          {success && <div className={`${styles.alert} ${styles.success}`} role="status">{success}</div>}
          
          <form onSubmit={handleSubmit} className={styles.form}>
            <div>
              <label className={styles.label}>Ülke Seç</label>
              <select 
                className={`l2t-form-control ${styles.select}`}
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
              <label className={styles.label}>Kanıt Belgesi / Fotoğraf</label>
              <div className={styles.upload}>
                <input 
                  type="file" 
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className={styles.file}
                />
              </div>
              <p className={styles.help}>
                Maks 5MB. PNR, kimlik numarası, telefon ve adres gibi gereksiz kişisel bilgileri kapatın. Belge herkese açık gösterilmez; karar sırasında veya en geç 30 gün içinde silinir.
              </p>
            </div>

            <div>
              <label className={styles.label}>Not (Opsiyonel)</label>
              <textarea 
                className={`l2t-form-control ${styles.textarea}`}
                rows={3} 
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={1000}
                placeholder="Eklemek istediğiniz bir şey var mı?"
              />
              <p className={styles.help}>{note.length}/1000 karakter</p>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", color: "var(--l2t-soft)", lineHeight: 1.5, fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(event) => setConsentGiven(event.target.checked)}
                style={{ marginTop: "3px" }}
              />
              Yüklediğim belgenin yalnızca seyahat doğrulaması için yönetici ekibi tarafından incelenmesini kabul ediyorum.
            </label>

            <button type="submit" disabled={submitting || !consentGiven} className={`l2t-button l2t-button-gold ${styles.submit}`}>
              {submitting ? 'Gönderiliyor...' : 'Doğrulama Gönder'}
            </button>
          </form>
        </div>

        {/* Geçmiş Başvurular */}
        <div>
          <h2 className={styles.sectionTitle}>Başvurularım</h2>
          {verifications.length === 0 ? (
            <div className={`l2t-glass-card ${styles.empty}`}>
              Henüz bir başvurunuz yok.
            </div>
          ) : (
            <div className={styles.list}>
              {verifications.map(v => (
                <div key={v.id} className={`l2t-glass-card ${styles.verification}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.country}>{v.country_name}</span>
                    <span className={`l2t-badge ${v.status === 'pending' ? 'l2t-badge-pending' : v.status === 'approved' ? 'l2t-badge-approved' : 'l2t-badge-rejected'}`}>
                      {v.status === 'pending' ? 'Beklemede' : v.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                    </span>
                  </div>
                  <div className={styles.meta}>
                    Tarih: {new Date(v.created_at).toLocaleDateString('tr-TR')}
                  </div>
                  {v.admin_note && (
                    <div className={styles.adminNote}>
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
