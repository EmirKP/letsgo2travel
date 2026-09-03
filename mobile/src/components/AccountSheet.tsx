import { useCallback, useEffect, useState } from "react";
import type { ReturnTypeUseAuth } from "../types-auth";
import { requestAccountDeletion } from "../lib/api";
import { isIOSNative } from "../lib/capacitor";
import { config } from "../lib/config";
import { LegalSheet, type LegalSlug } from "./LegalSheet";
import { getSupabaseDataErrorMessage, updateUserProfile } from "../lib/supabaseData";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { useI18n } from "../lib/i18n";

export function AccountSheet({ open, onClose, auth, onNotice }: {
  open: boolean;
  onClose: () => void;
  auth: ReturnTypeUseAuth;
  onNotice: (message: string) => void;
}) {
  const { copy, dateLocale, locale } = useI18n();
  const deleteWord = locale === "en" ? "DELETE" : "SİL";
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [legalSlug, setLegalSlug] = useState<LegalSlug | null>(null);
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
    if (!/^\S+@\S+\.\S+$/.test(email)) return onNotice(copy("Geçerli bir e-posta adresi yaz.", "Enter a valid email address."));
    if (mode === "login" && !password) return onNotice(copy("Şifreni yazmalısın.", "Enter your password."));
    if (mode === "register") {
      if (fullName.replace(/\s+/g, " ").trim().length < 2) return onNotice(copy("Ad soyad en az 2 karakter olmalı.", "Full name must be at least 2 characters."));
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return onNotice(copy("Kullanıcı adı 3–20 karakter olmalı; yalnızca küçük harf, rakam ve alt çizgi içermeli.", "Username must be 3–20 characters and use only lowercase letters, numbers or underscores."));
      if (password.length < 8) return onNotice(copy("Şifre en az 8 karakter olmalı.", "Password must be at least 8 characters."));
    }
    auth.clearAuthError();
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.signInWithEmail(email, password);
        setPassword("");
        onNotice(copy("Giriş yapıldı.", "Signed in."));
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
        onNotice(copy("Şifre yenileme bağlantısı e-posta adresine gönderildi.", "A password reset link was sent to your email."));
        setMode("login");
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : copy("İşlem tamamlanamadı.", "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    if (newPassword.length < 8 || newPassword.length > 128) return onNotice(copy("Yeni şifre 8–128 karakter arasında olmalı.", "The new password must be 8–128 characters."));
    if (newPassword !== confirmPassword) return onNotice(copy("Şifreler eşleşmiyor.", "Passwords do not match."));
    auth.clearAuthError();
    setBusy(true);
    try {
      await auth.updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      onNotice(copy("Şifren güncellendi.", "Your password was updated."));
      handleClose();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : copy("Şifre güncellenemedi.", "Password could not be updated."));
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
    return <Sheet open={open || auth.recoveryPending} title={copy("Yeni şifre oluştur", "Create a new password")} onClose={cancelRecovery}>
      <div className="auth-form">
        <div className="info-box"><Icon name="lock" size={20} /><p>{copy("Hesabın doğrulandı. Devam etmek için yeni şifreni belirle.", "Your account is verified. Choose a new password to continue.")}</p></div>
        <label>{copy("Yeni şifre", "New password")}<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={8} maxLength={128} autoComplete="new-password" enterKeyHint="next" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={copy("En az 8 karakter", "At least 8 characters")} /></div></label>
        <label>{copy("Yeni şifreyi doğrula", "Confirm new password")}<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={8} maxLength={128} autoComplete="new-password" enterKeyHint="done" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void submitNewPassword(); }} placeholder={copy("Şifreyi tekrar yaz", "Enter password again")} /></div></label>
        <button className="primary-wide" disabled={busy || auth.loading} onClick={() => void submitNewPassword()}>{busy ? <span className="button-loader" /> : <Icon name="lock" size={18} />} {copy("Şifreyi güncelle", "Update password")}</button>
        <button className="secondary-wide" disabled={busy} onClick={cancelRecovery}>{copy("Vazgeç ve çıkış yap", "Cancel and sign out")}</button>
        {auth.authError && <p className="form-error">{auth.authError}</p>}
      </div>
    </Sheet>;
  }

  if (auth.user) {
    const user = auth.user;
    const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || copy("Gezgin", "Traveller"));
    const needsProfileCompletion = !String(user.user_metadata?.full_name || "").trim() || !String(user.user_metadata?.username || "").trim();

    const submitProfile = async () => {
      if (!auth.accessToken) return onNotice(copy("Profil oturumu bulunamadı. Yeniden giriş yapıp tekrar dene.", "Profile session not found. Sign in again and retry."));
      if (profileFullName.replace(/\s+/g, " ").trim().length < 2) return onNotice(copy("Ad soyad en az 2 karakter olmalı.", "Full name must be at least 2 characters."));
      if (!/^[a-z0-9_]{3,20}$/.test(profileUsername)) return onNotice(copy("Kullanıcı adı 3–20 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi içermeli.", "Username must be 3–20 characters and use only lowercase letters, numbers or underscores."));
      setBusy(true);
      try {
        await updateUserProfile(user.id, { username: profileUsername }, auth.accessToken);
        await auth.updateProfile(profileFullName, profileUsername);
        setProfileEditMode(false);
        onNotice(copy("Profil bilgilerin web ve mobil hesabında güncellendi.", "Your profile was updated on web and mobile."));
      } catch (error) {
        onNotice(getSupabaseDataErrorMessage(error, error instanceof Error ? error.message : copy("Profil güncellenemedi.", "Your profile could not be updated.")));
      } finally {
        setBusy(false);
      }
    };

    const submitDeletionRequest = async () => {
      if (deletionConfirmation.trim().toLocaleUpperCase(locale === "tr" ? "tr-TR" : "en-US") !== deleteWord) {
        onNotice(copy("Devam etmek için SİL yazmalısın.", "Type DELETE to continue."));
        return;
      }
      if (!auth.accessToken || !user.email) {
        onNotice(copy("Hesap oturumu doğrulanamadı. Yeniden giriş yapıp tekrar dene.", "Your account session could not be verified. Sign in again and retry."));
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
        onNotice(locale === "tr" && result.message ? result.message : copy("Hesap silme talebin alındı.", "Your account deletion request was received."));
        handleClose();
      } catch (error) {
        onNotice(locale === "tr" && error instanceof Error && error.message
          ? error.message
          : copy("Hesap silme talebi gönderilemedi.", "The account deletion request could not be sent."));
      } finally {
        setBusy(false);
      }
    };

    const submitSignOut = async () => {
      if (busy) return;
      setBusy(true);
      try {
        await auth.signOut();
        onNotice(copy("Çıkış yapıldı.", "Signed out."));
        handleClose();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : copy("Çıkış yapılamadı.", "Could not sign out."));
      } finally {
        setBusy(false);
      }
    };

    return <Sheet open={open} title={copy("Hesabım", "My account")} onClose={handleClose}>
      <div className="account-profile">
        <span className="profile-avatar"><Icon name="user" size={30} /></span>
        <small>{copy("OTURUM AÇIK", "SIGNED IN")}</small>
        <h3>{displayName}</h3>
        <p>{user.email}</p>
        <div className="detail-list"><div><span>{copy("E-posta doğrulaması", "Email verification")}</span><strong>{user.email_confirmed_at ? copy("Tamamlandı", "Complete") : copy("Bekliyor", "Pending")}</strong></div><div><span>{copy("Üyelik tarihi", "Joined")}</span><strong>{new Intl.DateTimeFormat(dateLocale).format(new Date(user.created_at))}</strong></div></div>
        {(needsProfileCompletion || profileEditMode) && <div className="account-profile-edit">
          <div className="info-box"><Icon name="info" size={19} /><p>{copy("Apple isim bilgisini yalnız ilk yetkilendirmede paylaşabilir. Adını ve kullanıcı adını burada tamamlayarak iki platformda aynı profili kullan.", "Apple may share your name only on first authorisation. Complete your name and username here to use the same profile on both platforms.")}</p></div>
          <label>{copy("Ad soyad", "Full name")}<input value={profileFullName} maxLength={100} autoComplete="name" onChange={(event) => setProfileFullName(event.target.value)} placeholder={copy("Adın ve soyadın", "Your full name")} /></label>
          <label>{copy("Kullanıcı adı", "Username")}<input value={profileUsername} minLength={3} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(event) => setProfileUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="example_traveller" /></label>
          <button className="primary-wide" disabled={busy} onClick={() => void submitProfile()}>{busy ? <span className="button-loader" /> : <Icon name="check" size={18} />} {copy("Profili tamamla", "Complete profile")}</button>
          {!needsProfileCompletion && <button className="secondary-wide" disabled={busy} onClick={() => setProfileEditMode(false)}>{copy("Vazgeç", "Cancel")}</button>}
        </div>}
        {!needsProfileCompletion && !profileEditMode && <button className="secondary-wide" onClick={() => setProfileEditMode(true)}><Icon name="settings" size={18} /> {copy("Profil bilgilerini düzenle", "Edit profile")}</button>}
        {deletionMode ? <div className="account-deletion-box">
          <strong>{copy("Hesap silme talebi", "Account deletion request")}</strong>
          <p>{copy("Talep yönetici incelemesine gider. Onaylandığında hesabın, profil verilerin ve sana bağlı özel kayıtlar silinir; topluluk konuşmalarındaki diğer kullanıcı cevapları korunurken senin içeriklerin anonimleştirilir.", "The request is reviewed by an administrator. Once approved, your account, profile and private records are deleted; other users' replies remain while your community content is anonymised.")}</p>
          <label>{copy("Onaylamak için", "Type")} <b>{deleteWord}</b> {copy("yaz", "to confirm")}<input value={deletionConfirmation} autoCapitalize="characters" onChange={(event) => setDeletionConfirmation(event.target.value)} placeholder={deleteWord} /></label>
          <div className="account-deletion-actions">
            <button className="secondary-wide" disabled={busy} onClick={() => { setDeletionMode(false); setDeletionConfirmation(""); }}>{copy("Vazgeç", "Cancel")}</button>
            <button className="danger-wide" disabled={busy || deletionConfirmation.trim().toLocaleUpperCase(locale === "tr" ? "tr-TR" : "en-US") !== deleteWord} onClick={() => void submitDeletionRequest()}>{busy ? <span className="button-loader" /> : <Icon name="trash" size={18} />} {copy("Talebi gönder", "Send request")}</button>
          </div>
        </div> : <button className="secondary-wide" onClick={() => setDeletionMode(true)}><Icon name="trash" size={18} /> {copy("Hesabımı silme talebi oluştur", "Request account deletion")}</button>}
        <button className="danger-wide" disabled={busy} onClick={() => void submitSignOut()}>{busy ? <span className="button-loader dark" /> : <Icon name="logout" size={18} />} {copy("Çıkış yap", "Sign out")}</button>
      </div>
    </Sheet>;
  }

  return <Sheet open={open} title={mode === "login" ? copy("Giriş yap", "Sign in") : mode === "register" ? copy("Hesap oluştur", "Create account") : copy("Şifremi unuttum", "Forgot password")} onClose={handleClose}>
    <div className="auth-form">
      {!auth.configured && <div className="info-box error"><Icon name="alert" size={20} /><p>{copy("Mobil pakette Supabase genel anahtarları bulunmuyor. Kök .env.local dosyanı geri koyup yeniden derle.", "Supabase public keys are missing from the mobile package. Restore the root .env.local file and rebuild.")}</p></div>}
      {mode !== "reset" && showApple && <button className="apple-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithApple()
          .catch((error) => onNotice(error instanceof Error ? error.message : copy("Apple girişi açılamadı.", "Apple sign-in could not be opened.")))
          .finally(() => setBusy(false));
      }}><span aria-hidden="true"></span> {busy || auth.loading ? copy("Açılıyor…", "Opening…") : copy("Apple ile devam et", "Continue with Apple")}</button>}
      {mode !== "reset" && showGoogle && <button className="google-button" disabled={busy || auth.loading || !auth.configured} onClick={() => {
        setBusy(true);
        void auth.signInWithGoogle()
          .catch((error) => onNotice(error instanceof Error ? error.message : copy("Google girişi açılamadı.", "Google sign-in could not be opened.")))
          .finally(() => setBusy(false));
      }}><span>G</span> {busy || auth.loading ? copy("Açılıyor…", "Opening…") : copy("Google ile devam et", "Continue with Google")}</button>}
      {mode !== "reset" && (showApple || showGoogle) && <div className="auth-divider"><span>{copy("veya", "or")}</span></div>}
      {mode === "register" && <label>{copy("Ad soyad", "Full name")}<div className="input-with-icon"><Icon name="user" size={18} /><input type="text" autoComplete="name" maxLength={100} enterKeyHint="next" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={copy("Adın ve soyadın", "Your full name")} /></div></label>}
      {mode === "register" && <label>{copy("Kullanıcı adı", "Username")}<div className="input-with-icon"><Icon name="user" size={18} /><input type="text" inputMode="text" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={20} enterKeyHint="next" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="example_traveller" /></div></label>}
      <label>{copy("E-posta", "Email")}<div className="input-with-icon"><Icon name="mail" size={18} /><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
      {mode !== "reset" && <label>{copy("Şifre", "Password")}<div className="input-with-icon"><Icon name="lock" size={18} /><input type="password" minLength={mode === "register" ? 8 : undefined} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} enterKeyHint="done" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void submit(); }} placeholder={mode === "login" ? copy("Şifren", "Your password") : copy("En az 8 karakter", "At least 8 characters")} /></div></label>}
      <button className="primary-wide" disabled={busy || !auth.configured} onClick={() => void submit()}>{busy ? <span className="button-loader" /> : <Icon name={mode === "reset" ? "mail" : "user"} size={18} />} {mode === "login" ? copy("Giriş yap", "Sign in") : mode === "register" ? copy("Hesap oluştur", "Create account") : copy("Bağlantı gönder", "Send link")}</button>
      {auth.authError && <p className="form-error">{auth.authError}</p>}
      {mode === "register" && <p className="auth-legal">{copy("Hesap oluşturarak", "By creating an account, you accept the")} <button onClick={() => setLegalSlug("kullanim-sartlari")}>{copy("Kullanım Şartları", "Terms of Use")}</button> {copy("ve", "and")} <button onClick={() => setLegalSlug("gizlilik-politikasi")}>{copy("Gizlilik Politikası", "Privacy Policy")}</button>{copy("'nı kabul etmiş olursun.", ".")}</p>}
      {legalSlug && <LegalSheet open={Boolean(legalSlug)} slug={legalSlug} onClose={() => setLegalSlug(null)} />}
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => { auth.clearAuthError(); setMode("register"); }}>{copy("Hesabın yok mu? Kayıt ol", "No account? Sign up")}</button><button onClick={() => { auth.clearAuthError(); setMode("reset"); }}>{copy("Şifremi unuttum", "Forgot password")}</button></>}
        {mode !== "login" && <button onClick={() => { auth.clearAuthError(); setMode("login"); }}><Icon name="back" size={15} /> {copy("Giriş ekranına dön", "Back to sign in")}</button>}
      </div>
    </div>
  </Sheet>;
}
