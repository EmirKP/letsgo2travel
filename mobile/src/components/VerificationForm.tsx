import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { config } from "../lib/config";
import { requestJson } from "../lib/api";

// Belgeli Gezgin NATIVE başvuru formu: web'e yönlendirme olmadan, mevcut
// Supabase oturumuyla /api/travel-verifications ucuna gönderir.
// - Belge; Kamera, Fotoğraflar veya Dosyalar'dan seçilir (iOS'ta dosya
//   alanı native seçim sayfasını açar; ek eklenti gerekmez).
// - Tür/boyut istemcide de doğrulanır (sunucu ayrıca imza kontrolü yapar).
// - Belgeler private storage'a gider; hiçbir public URL kullanılmaz ve
//   yanıt/istek loglarında dosya içeriği yer almaz.

type VerificationCountry = { code: string; name: string; flag: string };

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type VerificationFormProps = {
  accessToken: string;
  onSubmitted: () => void;
  onNotice: (message: string) => void;
};

export function VerificationForm({ accessToken, onSubmitted, onNotice }: VerificationFormProps) {
  const [countries, setCountries] = useState<VerificationCountry[]>([]);
  const [countriesError, setCountriesError] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    requestJson<{ data?: VerificationCountry[] }>("/api/travel-verifications/countries", { timeoutMs: 12_000 })
      .then((result) => { if (active) setCountries(Array.isArray(result.data) ? result.data : []); })
      .catch(() => { if (active) setCountriesError(true); });
    return () => { active = false; };
  }, []);

  const pickFile = (selected: File | null) => {
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.has(selected.type)) {
      setFile(null);
      setError("Yalnız JPG, PNG, WEBP veya PDF yükleyebilirsin.");
      return;
    }
    if (selected.size === 0 || selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Dosya 5MB'dan küçük olmalı.");
      return;
    }
    setFile(selected);
  };

  const submit = async () => {
    if (submitting) return;
    if (!countryCode) return setError("Önce ülkeyi seç.");
    if (!file) return setError("Kanıt belgesi veya fotoğraf seç.");
    if (!consent) return setError("İnceleme onayını işaretlemelisin.");
    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("countryCode", countryCode);
      formData.append("note", note.trim());
      formData.append("file", file);
      const response = await fetch(`${config.apiBaseUrl}/api/travel-verifications`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Başvuru gönderilemedi.");
      }
      setCountryCode("");
      setFile(null);
      setNote("");
      setConsent(false);
      if (fileInput.current) fileInput.current.value = "";
      onNotice("Başvurun alındı. Sonuç bildirimlerde ve bu listede görünecek.");
      onSubmitted();
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message ? submitError.message : "Başvuru gönderilemedi. Tekrar dene.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="verification-form">
      <label>Ülke
        <select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setError(""); }}>
          <option value="" disabled>{countriesError ? "Liste yüklenemedi — tekrar aç" : "Doğrulamak istediğin ülke"}</option>
          {countries.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
        </select>
      </label>

      <label className="verification-file">
        Kanıt belgesi / fotoğraf
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => pickFile(event.target.files?.[0] || null)}
        />
        <span className="verification-file-hint">
          {file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : "Kamera, Fotoğraflar veya Dosyalar'dan seç (maks 5MB)"}
        </span>
      </label>
      <p className="verification-help">PNR, kimlik numarası gibi gereksiz kişisel bilgileri kapat. Belge herkese açık gösterilmez; yalnız inceleme ekibi güvenli bağlantıyla görür.</p>

      <label>Not (isteğe bağlı)
        <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Eklemek istediğin bir şey var mı?" />
      </label>

      <label className="verification-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Belgenin yalnız seyahat doğrulaması için yönetici ekibince incelenmesini kabul ediyorum.</span>
      </label>

      {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p></div>}
      {submitting && <div className="verification-progress" role="status" aria-label="Belge yükleniyor"><span /></div>}

      <button className="primary-wide" disabled={submitting || !consent} onClick={() => void submit()}>
        {submitting ? <span className="button-loader" /> : <Icon name="shield" size={18} />} {submitting ? "Belge yükleniyor" : "Doğrulama gönder"}
      </button>
    </div>
  );
}
