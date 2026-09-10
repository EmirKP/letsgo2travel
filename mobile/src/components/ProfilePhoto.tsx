import { useEffect, useRef, useState } from "react";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

async function preparePhoto(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error("size");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("format");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("format");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(512, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("format");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .82); // Re-encoding strips EXIF/location.
  } finally { URL.revokeObjectURL(url); }
}

type ProfilePhotoProps = {
  userId?: string; accessToken: string; name: string; onSignIn: () => void; onNotice: (message: string) => void;
};

export function ProfilePhoto(props: ProfilePhotoProps) {
  // Account changes also discard pending selections and upload state.
  return <AccountProfilePhoto key={props.userId || "guest"} {...props}/>;
}

function AccountProfilePhoto({ userId, accessToken, name, onSignIn, onNotice }: ProfilePhotoProps) {
  const { copy, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const owner = useRef(userId);
  const selection = useRef(0);
  const saving = useRef(false);
  useEffect(() => { owner.current = userId; return () => { owner.current = undefined; }; }, [userId]);
  const [photo, setPhoto] = useState<{ owner: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!userId || !accessToken) return;
    const refresh = () => void requestJson<{ url: string | null }>("/api/profile/avatar", { headers: { Authorization: `Bearer ${accessToken}` } }).then(result => {
      if (active) setPhoto(result.url ? { owner: userId, url: result.url } : null);
    }).catch(() => { /* Initials remain; never reuse another account's photo. */ });
    refresh();
    const timer = window.setInterval(refresh, 45 * 60_000);
    window.addEventListener("l2t:profile-photo", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("l2t:profile-photo", refresh); };
  }, [userId, accessToken, revision]);
  const save = async () => {
    if (!preview || !userId || !accessToken || saving.current) return;
    const accountId = userId;
    saving.current = true;
    setBusy(true);
    try {
      await requestJson("/api/profile/avatar", { method: "POST", body: { photo: preview }, headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 25_000 });
      if (owner.current !== accountId) return;
      setPhoto({ owner: accountId, url: preview });
      setPreview(null);
      window.dispatchEvent(new Event("l2t:profile-photo"));
      setRevision(value => value + 1);
      onNotice(copy("Profil fotoğrafın kaydedildi.", "Your profile photo is saved."));
    } catch {
      if (owner.current === accountId) onNotice(copy("Fotoğraf kaydedilemedi. Bağlantını kontrol edip tekrar dene.", "Photo not saved. Check your connection and retry."));
    } finally { if (owner.current === accountId) { saving.current = false; setBusy(false); } }
  };
  return <div className="profile-photo-control">
    <button type="button" className="profile-photo" onClick={() => userId && accessToken ? input.current?.click() : onSignIn()} aria-label={preparing ? copy("Fotoğraf hazırlanıyor", "Preparing photo") : copy("Profil fotoğrafı seç", "Choose profile photo")} disabled={busy || preparing}>
      {photo && photo.owner === userId ? <img src={photo.url} alt={copy("Profil fotoğrafın", "Your profile photo")} onError={() => setPhoto(null)}/> : <span>{name.slice(0, 1).toLocaleUpperCase(locale)}</span>}
      <i><Icon name="plus" size={16}/></i>
    </button>
    <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" tabIndex={-1} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file || !userId || saving.current) return;
      const accountId = userId;
      const id = ++selection.current;
      const current = () => owner.current === accountId && selection.current === id;
      setPreparing(true);
      void preparePhoto(file).then(value => { if (current()) setPreview(value); }).catch(error => {
        if (current()) onNotice(error.message === "size" ? copy("20 MB'den küçük bir fotoğraf seç.", "Choose a photo smaller than 20 MB.") : copy("Fotoğraf açılamadı. JPEG veya PNG olarak tekrar seç.", "Cannot open this photo. Try a JPEG or PNG."));
      }).finally(() => { if (current()) setPreparing(false); });
    }}/>
    <Sheet open={!!preview} title={copy("Fotoğrafı onayla", "Confirm photo")} dismissible={!busy} onClose={() => { if (!saving.current) setPreview(null); }}>
    <div className="avatar-confirm" aria-busy={busy}>
      {preview && <img src={preview} alt={copy("Kaydedilecek fotoğraf", "Photo to save")}/>}
      <small>{copy("Yalnız profil fotoğrafın kaydedilir; konum bilgisi kaldırılır.", "Only your profile photo is saved; location metadata is removed.")}</small>
      <button type="button" className="primary-wide" disabled={busy} onClick={() => void save()}>{busy ? copy("Kaydediliyor…", "Saving…") : copy("Fotoğrafı kaydet", "Save photo")}</button>
      <button type="button" disabled={busy} onClick={() => setPreview(null)}>{copy("Vazgeç", "Cancel")}</button>
    </div>
    </Sheet>
  </div>;
}
