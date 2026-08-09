import { useCallback, useEffect, useState } from "react";
import type { ReturnTypeUseAuth } from "../types-auth";
import { requestAccountDeletion } from "../lib/api";
import { isIOSNative } from "../lib/capacitor";
import { config } from "../lib/config";
import { openExternal } from "../lib/native";
import { getSupabaseDataErrorMessage, updateUserProfile } from "../lib/supabaseData";
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
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletionMode, setDeletionMode] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const iosNative = isIOSNative();
  const showApple = iosNative && config.appleAuthEnabled;
  const showGoogle = true;
  const authFullName = String(auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || "");
  const authUsername = String(auth.user?.user_metadata?.username || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

  const clearSensitiveState = useCallback(() => {
    setEmail("");
    setPassword("");
    setFullName("");
    setUsername("");
    setNewPassword("");
    setConfirmPassword("");
    setMode("login");
    setDeletionMode(false);
    setDeletionConfirmation("");
    setProfileEditMode(false);
    setProfileFullName("");
    setProfileUsername("");
  }, []);

  const handleClose = useCallback(() => {
    clearSensitiveState();
    onClose();
  }, [clearSensitiveState, onClose]);

  useEffect(() => {
    if (!open) return;
    setEmail(auth.user?.email || "");
    setPassword("");
    setFullName("");
    setUsername("");
    setNewPassword("");
    setConfirmPassword("");
    setMode("login");
    setDeletionMode(false);
    setDeletionConfirmation("");
    setProfileEditMode(false);
    setProfileFullName(authFullName);
    setProfileUsername(authUsername);
  }, [auth.user?.email, auth.user?.id, authFullName, authUsername, open]);

  useEffect(() => {
    if (!open) clearSensitiveState();
  }, [clearSensitiveState, open]);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return onNotice("Geçerli bir e-posta adresi yaz.");
    if (mode === "login" && !password) return onNotice("Şifreni yazmalısın.");
    if (mode === "register") {
      if (fullName.replace(/\s+/g, " ").trim().length < 2) return onNotice("Ad soyad en az 2 karakter olmalı.");
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return onNotice("Kullanıcı adı 3–20 karakter olmalı; yalnızca küçük harf, rakam ve alt çizgi içermeli.");
      if (password.length < 8) return onNotice("Şifre en az 8 karakter olmalı.");
    }
    auth.clearAuthError();
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.signInWithEmail(email, password);
        setPassword("");
        onNotice("Giriş yapıldı.");
        handleClose();
      } else if (mode === "register") {
        const message = await auth.signUpWithEmail(email, password, { fullName, username });
        setEmail("");
        setPassword("");
        setFullName("");
        setUsername("");
        onNotice(message);
        setMode("login");
      } else {
        await auth.sendPasswordReset(email);
        setEmail("");
        setPassword("");
        onNotice("Şifre yenileme bağlantısı e-posta adresine gönderildi.");
        setMode("login");
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    if (newPassword.length < 8 || newPassword.length > 128) return onNotice("Yeni şifre 8–128 karakter arasında olmalı.");
    if (newPassword !== confirmPassword) return onNotice("Şifreler eşleşmiyor.");
    auth.clearAuthError();
    setBusy(true);
    try {
      await auth.updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      onNotice("Şifren güncellendi.");
      handleClose();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Şifre güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const cancelRecovery = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void auth.signOut()
      .finally(() => {
        setBusy(false);
        handleClose();
      });
  }, [auth, busy, handleClose]);

  if (auth.recoveryPending) {
    return <Sheet open={open || auth.recoveryPending} title="Yeni şifre oluştur" onClose={cancelRecovery}>
      <div className="auth-form">
        <div className="info-box"><Icon name="lock" size={20} /><p>Hesabın doğrulandı. Devam etmek için yeni şifreni belirle.</p></div>
        <label>Yeni şifre<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={8} maxLength={128} autoComplete="new-password" enterKeyHint="next" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="En az 8 karakter" /></div></label>
        <label>Yeni şifreyi doğrula<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={8} maxLength={128} autoComplete="new-password" enterKeyHint="done" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void submitNewPassword(); }} placeholder="Şifreyi tekrar yaz" /></div></label>
        <button className="primary-wide" disabled={busy || auth.loading} onClick={() => void submitNewPassword()}>{busy ? <span className="button-loader" /> : <Icon name="lock" size={18} />} Şifreyi güncelle</button>
        <button className="secondary-wide" disabled={busy} onClick={cancelRecovery}>Vazgeç ve çıkış yap</button>
        {auth.authError && <p className="form-error">{auth.authError}</p>}
      </div>
    </Sheet>;
  }

  if (auth.user) {
    const user = auth.user;
    const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Gezgin");
    const needsProfileCompletion = !String(user.user_metadata?.full_name || "").trim() || !String(user.user_metadata?.username || "").trim();

    const submitProfile = async () => {
      if (!auth.accessToken) return onNotice("Profil oturumu bulunamadı. Yeniden giriş yapıp tekrar dene.");
      if (profileFullName.replace(/\s+/g, " ").trim().length < 2) return onNotice("Ad soyad en az 2 karakter olmalı.");
      if (!/^[a-z0-9_]{3,20}$/.test(profileUsername)) return onNotice("Kullanıcı adı 3–20 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi içermeli.");
      setBusy(true);
      try {
        await updateUserProfile(user.id, { username: profileUsername }, auth.accessToken);
        await auth.updateProfile(profileFullName, profileUsername);
        setProfileEditMode(false);
        onNotice("Profil bilgilerin web ve mobil hesabında güncellendi.");
      } catch (error) {
        onNotice(getSupabaseDataErrorMessage(error, error instanceof Error ? error.message : "Profil güncellenemedi."));
      } finally {
        setBusy(false);
      }
    };

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
        handleClose();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Hesap silme talebi gönderilemedi.");
      } finally {
        setBusy(false);
      }
    };

    const submitSignOut = async () => {
      if (busy) return;
      setBusy(true);
      try {
        await auth.signOut();
        onNotice("Çıkış yapıldı.");
        handleClose();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Çıkış yapılamadı.");
      } finally {
        setBusy(false);
      }
    };

    return <Sheet open={open} title="Hesabım" onClose={handleClose}>
      <div className="account-profile">
        <span className="profile-avatar"><Icon name="user" size={30} /></span>
        <small>OTURUM AÇIK</small>
        <h3>{displayName}</h3>
        <p>{user.email}</p>
        <div className="detail-list"><div><span>E-posta doğrulaması</span><strong>{user.email_confirmed_at ? "Tamamlandı" : "Bekliyor"}</strong></div><div><span>Üyelik tarihi</span><strong>{new Intl.DateTimeFormat("tr-TR").format(new Date(user.created_at))}</strong></div></div>
        {(needsProfileCompletion || profileEditMode) && <div className="account-profile-edit">
          <div className="info-box"><Icon name="info" size={19} /><p>Apple isim bilgisini yalnız ilk yetkilendirmede paylaşabilir. Adını ve kullanıcı adını burada tamamlayarak iki platformda aynı profili kullan.</p></div>
          <label>Ad soyad<input value={profileFullName} maxLength={100} autoComplete="name" onChange={(event) => setProfileFullName(event.target.value)} placeholder="Adın ve soyadın" /></label>
          <label>Kullanıcı adı<input value={profileUsername} minLength={3} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(event) => setProfileUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="ornek_gezgin" /></label>
          <button className="primary-wide" disabled={busy} onClick={() => void submitProfile()}>{busy ? <span className="button-loader" /> : <Icon name="check" size={18} />} Profili tamamla</button>
          {!needsProfileCompletion && <button className="secondary-wide" disabled={busy} onClick={() => setProfileEditMode(false)}>Vazgeç</button>}
        </div>}
        {!needsProfileCompletion && !profileEditMode && <button className="secondary-wide" onClick={() => setProfileEditMode(true)}><Icon name="settings" size={18} /> Profil bilgilerini düzenle</button>}
        {deletionMode ? <div className="account-deletion-box">
          <strong>Hesap silme talebi</strong>
          <p>Talep yönetici incelemesine gider. Onaylandığında hesabın, profil verilerin ve sana bağlı özel kayıtlar silinir; topluluk konuşmalarındaki diğer kullanıcı cevapları korunurken senin içeriklerin anonimleştirilir.</p>
          <label>Onaylamak için <b>SİL</b> yaz<input value={deletionConfirmation} autoCapitalize="characters" onChange={(event) => setDeletionConfirmation(event.target.value)} placeholder="SİL" /></label>
          <div className="account-deletion-actions">
            <button className="secondary-wide" disabled={busy} onClick={() => { setDeletionMode(false); setDeletionConfirmation(""); }}>Vazgeç</button>
            <button className="danger-wide" disabled={busy || deletionConfirmation.trim().toLocaleUpperCase("tr-TR") !== "SİL"} onClick={() => void submitDeletionRequest()}>{busy ? <span className="button-loader" /> : <Icon name="trash" size={18} />} Talebi gönder</button>
          </div>
        </div> : <button className="secondary-wide" onClick={() => setDeletionMode(true)}><Icon name="trash" size={18} /> Hesabımı silme talebi oluştur</button>}
        <button className="danger-wide" disabled={busy} onClick={() => void submitSignOut()}>{busy ? <span className="button-loader dark" /> : <Icon name="logout" size={18} />} Çıkış yap</button>
      </div>
    </Sheet>;
  }

  return <Sheet open={open} title={mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Şifremi unuttum"} onClose={handleClose}>
    <div className="auth-form">
      {!auth.configured && <div className="info-box error"><Icon name="alert" size={20} /><p>Mobil pakette Supabase genel anahtarları bulunmuyor. Kök <code>.env.local</code> dosyanı geri koyup yeniden derle.</p></div>}
      {mode !== "reset" && showApple && <button className="apple-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithApple()
          .catch((error) => onNotice(error instanceof Error ? error.message : "Apple girişi açılamadı."))
          .finally(() => setBusy(false));
      }}><span aria-hidden="true"></span> {busy || auth.loading ? "Açılıyor…" : "Apple ile devam et"}</button>}
      {mode !== "reset" && showGoogle && <button className="google-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithGoogle()
          .catch((error) => onNotice(error instanceof Error ? error.message : "Google girişi açılamadı."))
          .finally(() => setBusy(false));
      }}><span>G</span> {busy || auth.loading ? "Açılıyor…" : "Google ile devam et"}</button>}
      {mode !== "reset" && (showApple || showGoogle) && <div className="auth-divider"><span>veya</span></div>}
      {mode === "register" && <label>Ad soyad<div className="input-with-icon"><Icon name="user" size={18} /><input type="text" autoComplete="name" maxLength={100} enterKeyHint="next" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Adın ve soyadın" /></div></label>}
      {mode === "register" && <label>Kullanıcı adı<div className="input-with-icon"><Icon name="user" size={18} /><input type="text" inputMode="text" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={20} enterKeyHint="next" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="ornek_gezgin" /></div></label>}
      <label>E-posta<div className="input-with-icon"><Icon name="mail" size={18} /><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" /></div></label>
      {mode !== "reset" && <label>Şifre<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={mode === "register" ? 8 : undefined} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} enterKeyHint="done" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void submit(); }} placeholder={mode === "login" ? "Şifren" : "En az 8 karakter"} /></div></label>}
      <button className="primary-wide" disabled={busy || !auth.configured} onClick={() => void submit()}>{busy ? <span className="button-loader" /> : <Icon name={mode === "reset" ? "mail" : "user"} size={18} />} {mode === "login" ? "Giriş yap" : mode === "register" ? "Hesap oluştur" : "Bağlantı gönder"}</button>
      {auth.authError && <p className="form-error">{auth.authError}</p>}
      {mode === "register" && <p className="auth-legal">Hesap oluşturarak <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/kullanim-sartlari")}>Kullanım Şartları</button> ve <button onClick={() => void openExternal("https://www.letsgo2travel.com.tr/gizlilik-politikasi")}>Gizlilik Politikası</button>'nı kabul etmiş olursun.</p>}
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => { auth.clearAuthError(); setMode("register"); }}>Hesabın yok mu? Kayıt ol</button><button onClick={() => { auth.clearAuthError(); setMode("reset"); }}>Şifremi unuttum</button></>}
        {mode !== "login" && <button onClick={() => { auth.clearAuthError(); setMode("login"); }}><Icon name="back" size={15} /> Giriş ekranına dön</button>}
      </div>
    </div>
  </Sheet>;
}
