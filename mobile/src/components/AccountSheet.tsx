import { useState } from "react";
import type { ReturnTypeUseAuth } from "../types-auth";
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

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return onNotice("Geçerli bir e-posta adresi yaz.");
    if (mode !== "reset" && password.length < 6) return onNotice("Şifre en az 6 karakter olmalı.");
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
    return <Sheet open={open} title="Hesabım" onClose={onClose}>
      <div className="account-profile">
        <span className="profile-avatar"><Icon name="user" size={30} /></span>
        <small>OTURUM AÇIK</small>
        <h3>{String(auth.user.user_metadata?.full_name || auth.user.email?.split("@")[0] || "Gezgin")}</h3>
        <p>{auth.user.email}</p>
        <div className="detail-list"><div><span>E-posta doğrulaması</span><strong>{auth.user.email_confirmed_at ? "Tamamlandı" : "Bekliyor"}</strong></div><div><span>Üyelik tarihi</span><strong>{new Intl.DateTimeFormat("tr-TR").format(new Date(auth.user.created_at))}</strong></div></div>
        <button className="danger-wide" onClick={() => void auth.signOut().then(() => { onNotice("Çıkış yapıldı."); onClose(); }).catch((error) => onNotice(error instanceof Error ? error.message : "Çıkış yapılamadı."))}><Icon name="logout" size={18} /> Çıkış yap</button>
      </div>
    </Sheet>;
  }

  return <Sheet open={open} title={mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Şifremi unuttum"} onClose={onClose}>
    <div className="auth-form">
      {!auth.configured && <div className="info-box error"><Icon name="alert" size={20} /><p>Mobil pakette Supabase genel anahtarları bulunmuyor. Kök <code>.env.local</code> dosyanı geri koyup yeniden derle.</p></div>}
      {mode !== "reset" && <button className="google-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithGoogle()
          .catch((error) => onNotice(error instanceof Error ? error.message : "Google girişi açılamadı."))
          .finally(() => setBusy(false));
      }}><span>G</span> {busy ? "Açılıyor…" : "Google ile devam et"}</button>}
      {mode !== "reset" && <div className="auth-divider"><span>veya</span></div>}
      <label>E-posta<div className="input-with-icon"><Icon name="mail" size={18} /><input type="email" autoCapitalize="none" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" /></div></label>
      {mode !== "reset" && <label>Şifre<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 6 karakter" /></div></label>}
      <button className="primary-wide" disabled={busy || !auth.configured} onClick={() => void submit()}>{busy ? <span className="button-loader" /> : <Icon name={mode === "reset" ? "mail" : "user"} size={18} />} {mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Bağlantı gönder"}</button>
      {auth.authError && <p className="form-error">{auth.authError}</p>}
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => setMode("register")}>Hesabın yok mu? Kayıt ol</button><button onClick={() => setMode("reset")}>Şifremi unuttum</button></>}
        {mode !== "login" && <button onClick={() => setMode("login")}><Icon name="back" size={15} /> Giriş ekranına dön</button>}
      </div>
    </div>
  </Sheet>;
}
