import { useState } from "react";
import type { ReturnTypeUseAuth } from "../types-auth";
import { requestAccountDeletion } from "../lib/api";
import { isIOSNative } from "../lib/capacitor";
import { config } from "../lib/config";
import { openExternal } from "../lib/native";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function AccountSheet({ open, onClose, auth, onNotice }: {
  open: boolean;
  onClose: () => void;
  auth: ReturnTypeUseAuth;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState(auth.user?.email || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletionMode, setDeletionMode] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const iosNative = isIOSNative();
  const showApple = iosNative && config.appleAuthEnabled;
  const showGoogle = !iosNative;

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return onNotice("Geçerli bir e-posta adresi yaz.");
    if (mode !== "reset" && password.length < 8) return onNotice("Şifre en az 8 karakter olmalı.");
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.signInWithEmail(email, password);
        onNotice("Giriş yapıldı.");
        onClose();
      } else if (mode === "register") {
        const message = await auth.signUpWithEmail(email, password);
        onNotice(message);
        setMode("login");
      } else {
        await auth.sendPasswordReset(email);
        onNotice("Şifre yenileme bağlantısı e-posta adresine gönderildi.");
        setMode("login");
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (auth.user) {
    const user = auth.user;
    const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Gezgin");

    const submitDeletionRequest = async () => {
      if (deletionConfirmation.trim().toLocaleUpperCase("tr-TR") !== "SİL") {
        onNotice("Devam etmek için SİL yazmalısın.");
        return;
      }
      if (!auth.accessToken || !user.email) {
        onNotice("Hesap oturumu doğrulanamadı. Yeniden giriş yapıp tekrar dene.");
        return;
      }
      setBusy(true);
      try {
        const result = await requestAccountDeletion({
          accessToken: auth.accessToken,
          name: displayName,
          email: user.email,
          username: String(user.user_metadata?.username || ""),
        });
        onNotice(result.message || "Hesap silme talebin alındı.");
        setDeletionMode(false);
        setDeletionConfirmation("");
        onClose();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Hesap silme talebi gönderilemedi.");
      } finally {
        setBusy(false);
      }
    };

    return <Sheet open={open} title="Hesabım" onClose={onClose}>
      <div className="account-profile">
        <span className="profile-avatar"><Icon name="user" size={30} /></span>
        <small>OTURUM AÇIK</small>
        <h3>{displayName}</h3>
        <p>{user.email}</p>
        <div className="detail-list"><div><span>E-posta doğrulaması</span><strong>{user.email_confirmed_at ? "Tamamlandı" : "Bekliyor"}</strong></div><div><span>Üyelik tarihi</span><strong>{new Intl.DateTimeFormat("tr-TR").format(new Date(user.created_at))}</strong></div></div>
        {deletionMode ? <div className="account-deletion-box">
          <strong>Hesap silme talebi</strong>
          <p>Talep yönetici incelemesine gider. Onaylandığında hesabın, profil verilerin ve sana bağlı özel kayıtlar silinir; topluluk konuşmalarındaki diğer kullanıcı cevapları korunurken senin içeriklerin anonimleştirilir.</p>
          <label>Onaylamak için <b>SİL</b> yaz<input value={deletionConfirmation} autoCapitalize="characters" onChange={(event) => setDeletionConfirmation(event.target.value)} placeholder="SİL" /></label>
          <div className="account-deletion-actions">
            <button className="secondary-wide" disabled={busy} onClick={() => { setDeletionMode(false); setDeletionConfirmation(""); }}>Vazgeç</button>
            <button className="danger-wide" disabled={busy || deletionConfirmation.trim().toLocaleUpperCase("tr-TR") !== "SİL"} onClick={() => void submitDeletionRequest()}>{busy ? <span className="button-loader" /> : <Icon name="trash" size={18} />} Talebi gönder</button>
          </div>
        </div> : <button className="secondary-wide" onClick={() => setDeletionMode(true)}><Icon name="trash" size={18} /> Hesabımı silme talebi oluştur</button>}
        <button className="danger-wide" onClick={() => void auth.signOut().then(() => { onNotice("Çıkış yapıldı."); onClose(); }).catch((error) => onNotice(error instanceof Error ? error.message : "Çıkış yapılamadı."))}><Icon name="logout" size={18} /> Çıkış yap</button>
      </div>
    </Sheet>;
  }

  return <Sheet open={open} title={mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Şifremi unuttum"} onClose={onClose}>
    <div className="auth-form">
      {!auth.configured && <div className="info-box error"><Icon name="alert" size={20} /><p>Mobil pakette Supabase genel anahtarları bulunmuyor. Kök <code>.env.local</code> dosyanı geri koyup yeniden derle.</p></div>}
      {mode !== "reset" && showApple && <button className="apple-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithApple()
          .catch((error) => onNotice(error instanceof Error ? error.message : "Apple girişi açılamadı."))
          .finally(() => setBusy(false));
      }}><span aria-hidden="true"></span> {busy ? "Açılıyor…" : "Apple ile devam et"}</button>}
      {mode !== "reset" && showGoogle && <button className="google-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithGoogle()
          .catch((error) => onNotice(error instanceof Error ? error.message : "Google girişi açılamadı."))
          .finally(() => setBusy(false));
      }}><span>G</span> {busy ? "Açılıyor…" : "Google ile devam et"}</button>}
      {mode !== "reset" && (showApple || showGoogle) && <div className="auth-divider"><span>veya</span></div>}
      <label>E-posta<div className="input-with-icon"><Icon name="mail" size={18} /><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" /></div></label>
      {mode !== "reset" && <label>Şifre<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} enterKeyHint="done" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void submit(); }} placeholder="En az 8 karakter" /></div></label>}
      <button className="primary-wide" disabled={busy || !auth.configured} onClick={() => void submit()}>{busy ? <span className="button-loader" /> : <Icon name={mode === "reset" ? "mail" : "user"} size={18} />} {mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Bağlantı gönder"}</button>
      {auth.authError && <p className="form-error">{auth.authError}</p>}
      {mode === "register" && <p className="auth-legal">Hesap oluşturarak <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/kullanim-sartlari")}>Kullanım Şartları</button> ve <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/gizlilik-politikasi")}>Gizlilik Politikası</button>'nı kabul etmiş olursun.</p>}
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => setMode("register")}>Hesabın yok mu? Kayıt ol</button><button onClick={() => setMode("reset")}>Şifremi unuttum</button></>}
        {mode !== "login" && <button onClick={() => setMode("login")}><Icon name="back" size={15} /> Giriş ekranına dön</button>}
      </div>
    </div>
  </Sheet>;
}
