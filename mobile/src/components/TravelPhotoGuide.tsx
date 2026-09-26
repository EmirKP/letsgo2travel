import { useEffect, useRef, useState } from "react";
import { ApiError, requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { validatePhotoGuide } from "../../../lib/travel-assistant/photo";
import type { PhotoGuide } from "../../../lib/travel-assistant/photo";

async function prepareImage(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12_000_000
  )
    throw new Error("image");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 24_000_000)
      throw new Error("image");
    const ratio = Math.min(
      1,
      1280 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length > 1_350_000) throw new Error("image");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function TravelPhotoGuide({
  accessToken,
  onSignIn,
}: {
  accessToken: string;
  onSignIn: () => void;
}) {
  const { copy, locale } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [photo, setPhoto] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<PhotoGuide | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    void requestJson<{ available: boolean }>("/api/travel-assistant/photo")
      .then((r) => {
        if (active) setAvailable(r.available === true);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  async function select(file?: File) {
    if (!file) return;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    setPhoto("");
    setConsent(false);
    try {
      const data = await prepareImage(file);
      if (id === generation.current) setPhoto(data);
    } catch {
      if (id === generation.current)
        setError(
          copy(
            "12 MB altında JPEG, PNG veya WebP fotoğraf seç.",
            "Choose a JPEG, PNG or WebP photo under 12 MB.",
          ),
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function analyze() {
    if (!photo || !consent || !accessToken || busy) return;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      // Always the main API origin; never forward an account token to public-data staging.
      const raw = await requestJson<unknown>("/api/travel-assistant/photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { image: photo.split(",")[1], consent: true, locale },
        timeoutMs: 40000,
      });
      const value = validatePhotoGuide(raw);
      if (!value) throw new Error("invalid");
      if (id === generation.current) setResult(value);
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof ApiError && e.status === 429
            ? copy(
                "Bugünkü analiz sınırına ulaşıldı. Yarın yeniden deneyebilirsin.",
                "Today’s analysis limit has been reached. Try again tomorrow.",
              )
            : e instanceof ApiError && e.status === 401
              ? copy(
                  "Oturumun süresi doldu. Yeniden giriş yap.",
                  "Your session expired. Sign in again.",
                )
              : copy(
                  "Fotoğraf yorumlanamadı. Bağlantını kontrol edip tekrar dene.",
                  "Could not analyze the photo. Check your connection and try again.",
                ),
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  return (
    <section className="ta-panel ta-form">
      <h2>{copy("Fotoğraftan rehber", "Photo guide")}</h2>
      <p>
        {copy(
          "Bir yapı, eser veya gezi noktasını seç; yapay zekâ gördüklerini açıklasın.",
          "Choose a building, artwork or travel scene for an AI description.",
        )}
      </p>
      {available === null ? (
        <p role="status">
          {copy("Hizmet kontrol ediliyor…", "Checking service…")}
        </p>
      ) : available === false ? (
        <p className="ta-warning">
          {copy(
            "Fotoğraf analizi bu sürümün sunucusunda henüz etkin değil.",
            "Photo analysis is not enabled on this version’s server yet.",
          )}
        </p>
      ) : !accessToken ? (
        <button className="primary-wide" onClick={onSignIn}>
          {copy("Analiz için giriş yap", "Sign in to analyze")}
        </button>
      ) : (
        <>
          <label>
            {copy("Fotoğraf çek veya seç", "Take or choose a photo")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                void select(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {photo && (
            <>
              <img
                className="ta-photo-preview"
                src={photo}
                alt={copy(
                  "Analiz için seçtiğin fotoğraf",
                  "Your photo selected for analysis",
                )}
              />
              <label className="ta-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {copy(
                  "Bu fotoğrafın analiz için Google Gemini hizmetine gönderilmesini kabul ediyorum. Fotoğrafı ve yanıtı hesabıma kaydetmeyin.",
                  "I agree to send this photo to Google Gemini for analysis. Do not save the photo or answer to my account.",
                )}
              </label>
              <p className="ta-muted">
                {copy(
                  "Konum bilgileri görselden çıkarılır. Kimlik veya özel belge yükleme. Sağlayıcının veri işleme koşulları geçerlidir.",
                  "Location metadata is removed. Do not upload IDs or private documents. The provider’s data processing terms apply.",
                )}{" "}
                <a
                  href="https://ai.google.dev/gemini-api/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy("Sağlayıcı koşulları", "Provider terms")}
                </a>
              </p>
              <button
                className="primary-wide"
                disabled={!consent || busy}
                onClick={() => void analyze()}
              >
                {busy
                  ? copy("İnceleniyor…", "Analyzing…")
                  : copy("Fotoğrafı yorumla", "Analyze photo")}
              </button>
              <button
                className="secondary-wide"
                disabled={busy}
                onClick={() => {
                  setPhoto("");
                  setResult(null);
                  setConsent(false);
                }}
              >
                {copy("Fotoğrafı temizle", "Clear photo")}
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="ta-warning">
          {error}
        </p>
      )}
      {result && (
        <article className="ta-card" aria-live="polite">
          <small>
            {copy(
              "Yapay zekâ yorumu · doğrulanmış bilgi değildir",
              "AI interpretation · not verified information",
            )}
          </small>
          <h3>{result.title}</h3>
          <p>{result.observation}</p>
          <p>{result.context}</p>
          {result.uncertain && (
            <p className="ta-warning">
              {copy(
                "Yer veya eser kesin olarak belirlenemedi.",
                "The place or artwork could not be identified with certainty.",
              )}
            </p>
          )}
        </article>
      )}
    </section>
  );
}
