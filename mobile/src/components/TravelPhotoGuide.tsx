import { useEffect, useRef, useState } from "react";
import { ApiError, requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { validatePhotoGuide } from "../../../lib/travel-assistant/photo";
import type { PhotoGuide } from "../../../lib/travel-assistant/photo";

async function prepareImage(file: File): Promise<string> {
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name))
    throw new Error("heic");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12_000_000
  )
    throw new Error("image");
  const url = URL.createObjectURL(file);
  let decodeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const image = new Image();
    image.src = url;
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        decodeTimer = setTimeout(() => reject(new Error("image")), 5000);
      }),
    ]);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24_000_000)
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
    if (decodeTimer) clearTimeout(decodeTimer);
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
  const [availabilityReason, setAvailabilityReason] = useState("disabled");
  const [checkVersion, setCheckVersion] = useState(0);
  const [photo, setPhoto] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<PhotoGuide | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearedDuringAnalysis, setClearedDuringAnalysis] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const recheck = () => setCheckVersion((value) => value + 1);
    window.addEventListener("online", recheck);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener("online", recheck);
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setPhoto("");
    setResult(null);
    setError("");
    setConsent(false);
    setClearedDuringAnalysis(false);
  }, [locale, accessToken]);
  useEffect(() => {
    let active = true;
    setAvailable(null);
    void requestJson<{ available: boolean; reason?: string }>("/api/travel-assistant/photo", { timeoutMs: 7000 })
      .then((r) => {
        if (active) {
          setAvailable(r.available === true);
          setAvailabilityReason(r.reason === "disabled" ? "disabled" : "service");
        }
      })
      .catch(() => {
        if (active) {
          setAvailable(false);
          setAvailabilityReason("network");
        }
      });
    return () => {
      active = false;
    };
  }, [checkVersion]);
  async function select(file?: File) {
    if (!file || pending.current) return;
    pending.current = true;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    setPhoto("");
    setConsent(false);
    setClearedDuringAnalysis(false);
    try {
      const data = await prepareImage(file);
      if (id === generation.current) setPhoto(data);
    } catch (cause) {
      if (id === generation.current)
        setError(
          cause instanceof Error && cause.message === "heic" ? copy(
            "HEIC/HEIF fotoğraflar burada açılamıyor. Fotoğrafı JPEG olarak dışa aktar veya bir ekran görüntüsü seç.",
            "HEIC/HEIF photos cannot be opened here. Export the photo as JPEG or choose a screenshot.",
          ) : copy(
            "12 MB altında JPEG, PNG veya WebP fotoğraf seç.",
            "Choose a JPEG, PNG or WebP photo under 12 MB.",
          ),
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function analyze() {
    if (!photo || !consent || !accessToken || pending.current || available !== true) return;
    pending.current = true;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    setClearedDuringAnalysis(false);
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
      if (id === generation.current) {
        if (e instanceof ApiError && e.status === 503) {
          setAvailable(false);
          setAvailabilityReason("service");
        }
        setError(
          e instanceof ApiError && e.status === 429
            ? copy(
                "Günlük analiz sınırına ulaşıldı. Sınır Türkiye saatiyle 03.00’te yenilenir.",
                "The daily analysis limit has been reached. It resets at 00:00 UTC.",
              )
            : e instanceof ApiError && e.status === 401
              ? copy(
                  "Oturumun süresi doldu. Yeniden giriş yap.",
                  "Your session expired. Sign in again.",
                )
              : e instanceof ApiError && e.status === 503 ? copy(
                  "Fotoğraf hizmeti şu anda hazır değil. Biraz sonra hizmeti yeniden kontrol et.",
                  "The photo service is not ready. Check the service again in a moment.",
                ) : copy(
                  "Fotoğraf yorumlanamadı. Bağlantını kontrol edip tekrar dene.",
                  "Could not analyze the photo. Check your connection and try again.",
                ),
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
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
        <>
        <p className="ta-warning">
          {availabilityReason === "disabled" ? copy(
            "Fotoğraf analizi bu sürümün sunucusunda henüz etkin değil.",
            "Photo analysis is not enabled on this version’s server yet.",
          ) : availabilityReason === "network" ? copy(
            "Hizmete ulaşılamadı. İnternet bağlantını kontrol edip yeniden dene.",
            "Could not reach the service. Check your internet connection and try again.",
          ) : copy(
            "Fotoğraf hizmeti şu anda hazır değil. Biraz sonra yeniden kontrol et.",
            "The photo service is not ready. Check again in a moment.",
          )}
        </p>
        <button className="secondary-wide" onClick={() => setCheckVersion((value) => value + 1)}>
          {copy("Hizmeti yeniden kontrol et", "Check service again")}
        </button>
        </>
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
                onClick={() => {
                  generation.current++;
                  setPhoto("");
                  setResult(null);
                  setConsent(false);
                  setError("");
                  setClearedDuringAnalysis(busy);
                }}
              >
                {copy("Fotoğrafı temizle", "Clear photo")}
              </button>
            </>
          )}
        </>
      )}
      {busy && <p role="status">{copy("Fotoğraf işlemi sürüyor…", "Photo processing is in progress…")}</p>}
      {clearedDuringAnalysis && <p className="ta-muted">{copy(
        "Fotoğraf ve yanıt bu ekrandan temizlendi. Başlamış analiz sunucuda tamamlanabilir ve günlük haktan sayılabilir.",
        "The photo and answer were cleared from this screen. An analysis already started may finish on the server and count toward the daily limit.",
      )}</p>}
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
