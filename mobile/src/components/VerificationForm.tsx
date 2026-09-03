import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { config } from "../lib/config";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";

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
  const { copy, locale } = useI18n();
  const regionNames = useMemo(() => new Intl.DisplayNames(locale === "tr" ? "tr-TR" : "en-GB", { type: "region" }), [locale]);
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
      setError(copy("Yalnız JPG, PNG, WEBP veya PDF yükleyebilirsin.", "You can upload JPG, PNG, WEBP or PDF files only."));
      return;
    }
    if (selected.size === 0 || selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError(copy("Dosya 5MB'dan küçük olmalı.", "The file must be smaller than 5 MB."));
      return;
    }
    setFile(selected);
  };

  const submit = async () => {
    if (submitting) return;
    if (!countryCode) return setError(copy("Önce ülkeyi seç.", "Choose a country first."));
    if (!file) return setError(copy("Kanıt belgesi veya fotoğraf seç.", "Choose an evidence document or photo."));
    if (!consent) return setError(copy("İnceleme onayını işaretlemelisin.", "You must accept the review consent."));
    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("countryCode", countryCode);
      formData.append("note", note.trim());
      formData.append("file", file);
      const response = await fetch(`${config.apiBaseUrl}/api/travel-verifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Language": locale === "tr" ? "tr" : "en",
        },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const serverError = typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "";
        throw new Error(locale === "tr" && serverError ? serverError : copy("Başvuru gönderilemedi.", "The application could not be submitted."));
      }
      setCountryCode("");
      setFile(null);
      setNote("");
      setConsent(false);
      if (fileInput.current) fileInput.current.value = "";
      onNotice(copy("Başvurun alındı. Sonuç bildirimlerde ve bu listede görünecek.", "Your application was received. The result will appear in notifications and this list."));
      onSubmitted();
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message ? submitError.message : copy("Başvuru gönderilemedi. Tekrar dene.", "The application could not be submitted. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="verification-form">
      <label>{copy("Ülke", "Country")}
        <select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setError(""); }}>
          <option value="" disabled>{countriesError ? copy("Liste yüklenemedi — tekrar aç", "List unavailable — reopen") : copy("Doğrulamak istediğin ülke", "Country to verify")}</option>
          {countries.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.code === "XK" ? (locale === "tr" ? "Kosova" : "Kosovo") : regionNames.of(country.code) || country.name}</option>)}
        </select>
      </label>

      <label className="verification-file">
        {copy("Kanıt belgesi / fotoğraf", "Evidence document / photo")}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => pickFile(event.target.files?.[0] || null)}
        />
        <span className="verification-file-hint">
          {file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : copy("Kamera, Fotoğraflar veya Dosyalar'dan seç (maks 5MB)", "Choose from Camera, Photos or Files (max 5 MB)")}
        </span>
      </label>
      <p className="verification-help">{copy("PNR, kimlik numarası gibi gereksiz kişisel bilgileri kapat. Belge herkese açık gösterilmez; yalnız inceleme ekibi güvenli bağlantıyla görür.", "Hide unnecessary personal details such as your PNR or ID number. The document is not public; only the review team can access it through a secure link.")}</p>

      <label>{copy("Not (isteğe bağlı)", "Note (optional)")}
        <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder={copy("Eklemek istediğin bir şey var mı?", "Anything you want to add?")} />
      </label>

      <label className="verification-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{copy("Belgenin yalnız seyahat doğrulaması için yönetici ekibince incelenmesini kabul ediyorum.", "I agree that the admin team may review this document only for travel verification.")}</span>
      </label>

      {error && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{error}</p></div>}
      {submitting && <div className="verification-progress" role="status" aria-label={copy("Belge yükleniyor", "Uploading document")}><span /></div>}

      <button className="primary-wide" disabled={submitting || !consent} onClick={() => void submit()}>
        {submitting ? <span className="button-loader" /> : <Icon name="shield" size={18} />} {submitting ? copy("Belge yükleniyor", "Uploading document") : copy("Doğrulama gönder", "Submit verification")}
      </button>
    </div>
  );
}
