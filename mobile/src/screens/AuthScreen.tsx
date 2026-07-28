import { useState, type FormEvent } from "react";
import Icon from "../components/Icon";
import { SITE_URL } from "../config";
import { createGoogleOAuthUrl, requestPasswordReset, signInWithPassword, signUp } from "../lib/supabase";
import { openExternal } from "../lib/native";
import type { Session } from "../types";

export default function AuthScreen({
  onSession,
  notify,
}: {
  onSession: (session: Session) => void;
  notify: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Geçerli bir e-posta adresi yaz.");
    if (password.length < 6) return setError("Şifre en az 6 karakter olmalı.");
    setBusy(true);
    try {
      if (mode === "login") {
        onSession(await signInWithPassword(email, password));
        notify("Giriş başarılı.");
      } else {
        if (name.trim().length < 2 || username.trim().length < 3) throw new Error("Ad soyad ve en az 3 karakterli kullanıcı adı gerekli.");
        const result = await signUp({ name, username, email, password });
        if (result?.access_token) onSession(result as Session);
        notify("Hesabın oluşturuldu. E-posta doğrulaması istenirse gelen kutunu kontrol et.");
        setMode("login");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "İşlem başarısız.";
      setError(message.includes("Invalid login") ? "E-posta veya şifre hatalı." : message);
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true);
    setError("");
    try {
      await openExternal(await createGoogleOAuthUrl());
      notify("Google girişinden sonra uygulamaya geri yönlendirileceksin.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google girişi başlatılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email.includes("@")) return setError("Önce e-posta adresini yaz.");
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email, `${SITE_URL}/sifre-yenile`);
      notify("Şifre yenileme bağlantısı e-posta adresine gönderildi.");
      setShowReset(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "E-posta gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="content auth-content">
      <section className="auth-card">
        <div className="auth-mark"><Icon name="plane" size={25}/></div>
        <p className="auth-eyebrow">{mode === "login" ? "TEKRAR HOŞ GELDİN" : "LETSGO2TRAVEL'A KATIL"}</p>
        <h1>{mode === "login" ? "Hesabına giriş yap" : "Ücretsiz hesap oluştur"}</h1>
        <p>{mode === "login" ? "Favori rotalarına, fiyat alarmlarına ve planlarına kaldığın yerden ulaş." : "Rotalarını kaydet, alarm kur ve seyahat profilini bütün cihazlarında kullan."}</p>

        <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Giriş</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Kayıt</button></div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? <><label className="form-field"><span>Ad soyad</span><div className="input-shell"><Icon name="user" size={18}/><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Adın ve soyadın"/></div></label><label className="form-field"><span>Kullanıcı adı</span><div className="input-shell"><Icon name="user" size={18}/><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Toplulukta görünecek ad"/></div></label></> : null}
          <label className="form-field"><span>E-posta adresi</span><div className="input-shell"><Icon name="mail" size={18}/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@email.com" autoComplete="email"/></div></label>
          <label className="form-field"><span>Şifre</span><div className="input-shell"><Icon name="lock" size={18}/><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 6 karakter" autoComplete={mode === "login" ? "current-password" : "new-password"}/></div></label>
          {error ? <div className="form-error"><Icon name="alert" size={17}/><span>{error}</span></div> : null}
          <button className="wide-primary" type="submit" disabled={busy}><Icon name={mode === "login" ? "logout" : "plus"} size={18}/>{busy ? "İşlem yapılıyor..." : mode === "login" ? "Giriş yap" : "Hesap oluştur"}</button>
        </form>

        {mode === "login" ? <button className="forgot-button" onClick={() => setShowReset((value) => !value)}>Şifremi unuttum</button> : null}
        {showReset ? <div className="reset-box"><p><strong>{email || "E-posta adresin"}</strong> için yenileme bağlantısı gönderilecek.</p><button onClick={reset} disabled={busy}>Bağlantı gönder</button></div> : null}

        <div className="auth-divider"><span>veya</span></div>
        <button className="google-button" onClick={googleLogin} disabled={busy}><Icon name="google" size={20}/>Google ile devam et</button>

        <div className="auth-safety"><Icon name="shield" size={18}/><span>Oturumun cihazda saklanır ve süresi dolmadan otomatik yenilenir.</span></div>
      </section>
    </main>
  );
}
