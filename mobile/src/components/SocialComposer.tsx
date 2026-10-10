import { useEffect, useRef, useState } from "react";
import { prepareCommunityPhoto } from "../lib/communityPhoto";
import { createId } from "../lib/id";
import { useI18n } from "../lib/i18n";
import { readSocialDraft, saveSocialDraft, clearSocialDraft, socialWrite, type SocialDraft, type SocialPost } from "../lib/social";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { CountryPicker } from "./CountryPicker";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import "./social.css";

export function SocialComposer({ ownerId, accessToken, onClose, onPublished }: {
  ownerId: string; accessToken: string; onClose: () => void; onPublished: (post: SocialPost) => void;
}) {
  const { copy, countryName } = useI18n();
  const [draft, setDraft] = useState(() => readSocialDraft(ownerId));
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading">("idle");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const current = useRef(draft);
  const alive = useRef(true);
  const completed = useRef(false);
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const countries = COUNTRY_LIST.map(country => ({ code: alpha2FromAlpha3(country.alpha3), flagCode: alpha2FromAlpha3(country.alpha3), name: countryName(country.alpha3, country.name) })).filter(country => /^[A-Z]{2}$/.test(country.code));
  const update = (values: Partial<SocialDraft>) => {
    current.current = { ...current.current, ...values, ...(current.current.attempted ? { requestId: createId(), attempted: false } : {}) };
    setDraft(current.current);
    setError("");
  };
  useEffect(() => {
    alive.current = true;
    const flush = () => { if (!completed.current) saveSocialDraft(ownerId, current.current); };
    window.addEventListener("pagehide", flush);
    return () => { alive.current = false; selection.current++; window.removeEventListener("pagehide", flush); flush(); };
  }, [ownerId]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!completed.current) setStorageError(!saveSocialDraft(ownerId, draft)); }, 500);
    return () => clearTimeout(timer);
  }, [draft, ownerId]);

  const choosePhoto = async (file?: File) => {
    if (!file || busy.current) return;
    const version = ++selection.current;
    setPhase("preparing"); setError("");
    try {
      const photo = await prepareCommunityPhoto(file);
      if (alive.current && selection.current === version) update({ photo });
    } catch {
      if (alive.current && selection.current === version) setError(copy("Fotoğraf açılamadı. 12 MB'den küçük JPEG, PNG veya WebP seç.", "Photo could not be opened. Choose a JPEG, PNG or WebP under 12 MB.", "Fotografia nuk u hap. Zgjidh JPEG, PNG ose WebP nën 12 MB."));
    } finally { if (alive.current && selection.current === version) setPhase("idle"); }
  };
  const publish = async () => {
    if (busy.current || phase !== "idle" || !draft.photo) return;
    busy.current = true; setPhase("uploading"); setError("");
    current.current = { ...current.current, attempted: true };
    setDraft(current.current);
    saveSocialDraft(ownerId, current.current);
    try {
      const post = await socialWrite<SocialPost>("create", {
        requestId: draft.requestId, photo: draft.photo, caption: draft.caption.trim(), visibility: draft.visibility,
        ...(draft.place.trim() ? { place: { name: draft.place.trim(), ...(draft.countryCode ? { countryCode: draft.countryCode } : {}) } } : {}),
      }, accessToken);
      completed.current = true;
      clearSocialDraft(ownerId, draft.requestId);
      if (alive.current) onPublished(post);
    } catch {
      if (alive.current) setError(copy("Gönderilemedi. Taslağın duruyor; bağlantını kontrol edip tekrar dene.", "Could not share. Your draft is safe; check your connection and retry.", "Nuk u nda. Drafti është ruajtur; kontrollo lidhjen dhe provo sërish."));
    } finally { busy.current = false; if (alive.current) setPhase("idle"); }
  };

  return <Sheet open title={copy("Gönderi paylaş", "Share a post", "Ndaj një postim")} size="large" dismissible={phase !== "uploading"} onClose={onClose} className="social-sheet">
    <div className="social-composer">
      <p className="social-muted">{copy("Yolculuğundan bir anı paylaş.", "Share a moment from your journey.", "Ndaj një çast nga udhëtimi yt.")}</p>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={copy("Gönderi fotoğrafı", "Post photo", "Fotografia e postimit")} disabled={phase !== "idle"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void choosePhoto(file); }} />
      {draft.photo ? <div className="social-photo-preview"><img src={draft.photo} alt={copy("Gönderi önizlemesi", "Post preview", "Parapamja e postimit")} /><button type="button" disabled={phase !== "idle"} aria-label={copy("Fotoğrafı kaldır", "Remove photo", "Hiq fotografinë")} onClick={() => update({ photo: "" })}><Icon name="close" size={20}/></button></div> : <button type="button" className="social-photo-picker" disabled={phase !== "idle"} onClick={() => fileInput.current?.click()}><Icon name="camera" size={32}/><strong>{copy("Fotoğraf seç", "Choose a photo", "Zgjidh një fotografi")}</strong><span>{copy("Fotoğrafın yükleme için küçültülür.", "Your photo is optimized for upload.", "Fotografia optimizohet për ngarkim.")}</span></button>}
      {draft.photo && <button className="social-text-button" type="button" disabled={phase !== "idle"} onClick={() => fileInput.current?.click()}>{copy("Fotoğrafı değiştir", "Change photo", "Ndrysho fotografinë")}</button>}
      <label>{copy("Açıklama", "Caption", "Përshkrimi")}<textarea rows={4} value={draft.caption} maxLength={2200} disabled={phase === "uploading"} onChange={event => update({ caption: event.target.value })} placeholder={copy("Bu anın hikâyesi…", "The story behind this moment…", "Historia pas këtij çasti…")}/><small className="social-muted">{draft.caption.length}/2200</small></label>
      <label>{copy("Yer · isteğe bağlı", "Place · optional", "Vendi · opsional")}<input value={draft.place} maxLength={120} disabled={phase === "uploading"} onChange={event => update({ place: event.target.value })} placeholder={copy("Örn. Ksamil, Arnavutluk", "E.g. Ksamil, Albania", "P.sh. Ksamil, Shqipëri")}/></label>
      {draft.place.trim() && <CountryPicker value={draft.countryCode} options={countries} disabled={phase === "uploading"} onChange={countryCode => { if (phase !== "uploading") update({ countryCode }); }} label={copy("Ülke · isteğe bağlı", "Country · optional", "Shteti · opsional")} placeholder={copy("Ülke seç", "Choose country", "Zgjidh shtetin")} />}
      <fieldset className="social-visibility" disabled={phase === "uploading"}><legend>{copy("Kimler görebilir?", "Who can see this?", "Kush mund ta shohë?")}</legend>
        {(["public", "followers"] as const).map(value => <label key={value}><input type="radio" name="social-visibility" checked={draft.visibility === value} onChange={() => update({ visibility: value })}/><Icon name={value === "public" ? "globe" : "users"} size={20}/><span>{value === "public" ? copy("Herkese açık", "Everyone", "Të gjithë") : copy("Yalnızca takipçilerim", "My followers only", "Vetëm ndjekësit e mi")}</span></label>)}
      </fieldset>
      <p className="social-muted">{copy("Fotoğraflı gönderiler incelemeden sonra görünür. Taslağın bu cihazda hesabına özel saklanır.", "Photo posts become visible after review. Your draft is saved privately for your account on this device.", "Postimet me foto shfaqen pas shqyrtimit. Drafti ruhet privatisht për llogarinë tënde në këtë pajisje.")}</p>
      {storageError && <p role="alert" className="social-error">{copy("Cihazda taslak kaydedilemedi. Bu ekranı kapatırsan değişiklikler kaybolabilir.", "Could not save the draft on this device. Closing this screen may lose changes.", "Drafti nuk u ruajt në pajisje. Mbyllja mund të humbasë ndryshimet.")}</p>}
      {phase !== "idle" && <div role="status" className="social-progress"><progress aria-label={phase === "preparing" ? copy("Fotoğraf hazırlanıyor", "Preparing photo", "Duke përgatitur fotografinë") : copy("Gönderi yükleniyor", "Uploading post", "Duke ngarkuar postimin")}/><span>{phase === "preparing" ? copy("Fotoğraf hazırlanıyor…", "Preparing photo…", "Duke përgatitur fotografinë…") : copy("Gönderi yükleniyor…", "Uploading post…", "Duke ngarkuar postimin…")}</span></div>}
      {error && <p role="alert" className="social-error">{error}</p>}
      <button type="button" className="primary-wide" disabled={phase !== "idle" || !draft.photo} onClick={() => void publish()}><Icon name={error ? "refresh" : "plus"} size={20}/>{error ? copy("Tekrar dene", "Try again", "Provo sërish") : copy("Paylaş", "Share", "Ndaj")}</button>
    </div>
  </Sheet>;
}
