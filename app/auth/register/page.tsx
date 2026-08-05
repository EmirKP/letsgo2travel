"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  CheckCircle,
  Compass,
  Lock,
  Mail,
  Plane,
  ShieldCheck,
  User,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase-client";
import { getSiteUrl } from "@/lib/site-url";

import styles from "./Auth.module.css";

type RegisterFieldErrors = Partial<Record<"name" | "username" | "email" | "password", string>>;

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09A6.4 6.4 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.9 10.9 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AuthStory() {
  return (
    <aside className="l2t-auth-story" aria-label="LetsGo2Travel üyelik avantajları">
      <Link href="/" className="l2t-auth-brand" aria-label="LetsGo2Travel ana sayfa">
        <span><Plane size={23} /></span>
        <strong>LetsGo<span>2</span>Travel</strong>
      </Link>

      <div className="l2t-auth-story-copy">
        <p className="l2t-auth-eyebrow">Ücretsiz üyelik</p>
        <h1>Seyahat planlarını tek hesapta biriktir.</h1>
        <p>
          Rotalarını kaydet, ilgilendiğin uçuşlara alarm kur ve topluluk
          deneyimlerine tüm cihazlarından ulaş.
        </p>
      </div>

      <div className="l2t-auth-benefits">
        <div>
          <span><BellRing size={19} /></span>
          <p><strong>Fiyat alarmı</strong><small>Fırsatları kaçırmadan takip et.</small></p>
        </div>
        <div>
          <span><Compass size={19} /></span>
          <p><strong>Akıllı rota</strong><small>Planlarını kaydet ve geliştir.</small></p>
        </div>
        <div>
          <span><ShieldCheck size={19} /></span>
          <p><strong>Tek hesap</strong><small>Web ve uygulamada devam et.</small></p>
        </div>
      </div>
    </aside>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");

    try {
      const siteUrl = getSiteUrl();
      const redirectTo = Capacitor.isNativePlatform()
        ? "tr.com.letsgo2travel.app://auth/callback"
        : `${siteUrl}/auth/callback`;

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (authError) throw authError;
    } catch (caughtError: unknown) {
      console.error(caughtError);
      setError("Google ile kayıt başlatılamadı. Lütfen tekrar deneyin.");
      setIsGoogleLoading(false);
    }
  };

  const validateFields = () => {
    const nextErrors: RegisterFieldErrors = {};

    if (name.trim().length < 2 || name.trim().length > 100) {
      nextErrors.name = "Ad soyad 2–100 karakter arasında olmalıdır.";
    }

    if (!/^[\p{L}\p{N}._-]{3,30}$/u.test(username.trim())) {
      nextErrors.username = "Kullanıcı adı 3–30 karakter olmalı; yalnızca harf, rakam, nokta, tire ve alt çizgi içermelidir.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Geçerli bir e-posta adresi yazın.";
    }

    if (password.length < 8 || password.length > 128) {
      nextErrors.password = "Şifre 8–128 karakter arasında olmalıdır.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!validateFields()) {
      return;
    }

    setLoading(true);

    try {

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: name.trim(), username: username.trim() },
          emailRedirectTo: `${getSiteUrl()}/auth/callback`,
        },
      });

      if (authError) {
        console.error("Registration failed", authError.message);
        setError("Kayıt tamamlanamadı. Bilgileri kontrol edin veya mevcut hesabınız için giriş/şifre sıfırlama seçeneklerini deneyin.");
        return;
      }

      if (authData.session) {
        router.push("/profil");
        return;
      }

      setSuccess(true);
    } catch (caughtError: unknown) {
      console.error(caughtError);
      setError("Kayıt sırasında beklenmeyen bir sorun oluştu.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="l2t-auth-page">
        <section className="l2t-auth-success" aria-live="polite">
          <span className="l2t-auth-success-icon"><CheckCircle size={38} /></span>
          <p className="l2t-auth-eyebrow">Kayıt tamamlandı</p>
          <h1>Hesabın oluşturuldu</h1>
          <p>
            Kaydını onaylamak için <strong>{email}</strong> adresine doğrulama
            bağlantısı gönderdik. Gelen kutunu ve gereksiz klasörünü kontrol et.
          </p>
          <Link href="/auth/login" className="l2t-auth-success-link">
            <span>Giriş ekranına dön</span><ArrowRight size={18} />
          </Link>
        </section>
      </div>
    );
  }

  const isBusy = loading || isGoogleLoading;

  return (
    <div className="l2t-auth-page">
      <section className="l2t-auth-shell l2t-auth-shell-register" aria-labelledby="register-title">
        <AuthStory />

        <div className="l2t-auth-panel">
          <div className="l2t-auth-panel-head">
            <span className="l2t-auth-mobile-mark"><Plane size={24} /></span>
            <p>LetsGo2Travel&apos;a katıl</p>
            <h2 id="register-title">Ücretsiz hesap oluştur</h2>
            <span>Bir dakikadan kısa sürede seyahat profilini oluşturmaya başla.</span>
          </div>

          <form onSubmit={handleRegister} className={`l2t-auth-form ${styles.registerForm}`}>
            <div className={styles.formRow}>
              <label className={`${styles.inputGroup} l2t-auth-field`}>
                <span>Ad soyad</span>
                <span className={`l2t-auth-input-wrap ${fieldErrors.name ? styles.inputWrapError : ""}`}>
                  <User size={18} />
                  <input
                    type="text"
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
                    required
                    maxLength={100}
                    placeholder="Adın ve soyadın"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setFieldErrors((current) => ({ ...current, name: undefined }));
                    }}
                  />
                </span>
                {fieldErrors.name ? <span id="register-name-error" className={styles.errorMessage}>{fieldErrors.name}</span> : null}
              </label>

              <label className={`${styles.inputGroup} l2t-auth-field`}>
                <span>Kullanıcı adı</span>
                <span className={`l2t-auth-input-wrap ${fieldErrors.username ? styles.inputWrapError : ""}`}>
                  <User size={18} />
                  <input
                    type="text"
                    autoComplete="username"
                    aria-invalid={Boolean(fieldErrors.username)}
                    aria-describedby={fieldErrors.username ? "register-username-error" : undefined}
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="Toplulukta görünecek ad"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setFieldErrors((current) => ({ ...current, username: undefined }));
                    }}
                  />
                </span>
                {fieldErrors.username ? <span id="register-username-error" className={styles.errorMessage}>{fieldErrors.username}</span> : null}
              </label>
            </div>

            <label className={`${styles.inputGroup} l2t-auth-field`}>
              <span>E-posta adresi</span>
              <span className={`l2t-auth-input-wrap ${fieldErrors.email ? styles.inputWrapError : ""}`}>
                <Mail size={18} />
                <input
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                  inputMode="email"
                  required
                  maxLength={254}
                  placeholder="ornek@email.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                />
              </span>
              {fieldErrors.email ? <span id="register-email-error" className={styles.errorMessage}>{fieldErrors.email}</span> : null}
            </label>

            <label className={`${styles.inputGroup} l2t-auth-field`}>
              <span>Şifre</span>
              <span className={`l2t-auth-input-wrap ${fieldErrors.password ? styles.inputWrapError : ""}`}>
                <Lock size={18} />
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="En az 8 karakter"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                />
              </span>
              {fieldErrors.password ? <span id="register-password-error" className={styles.errorMessage}>{fieldErrors.password}</span> : null}
            </label>

            {error ? (
              <div className={styles.formError} role="alert">
                <AlertCircle size={17} />
                <span>{error}</span>
              </div>
            ) : null}

            <button type="submit" className="l2t-auth-submit" disabled={isBusy}>
              <span>{loading ? "Hesabın oluşturuluyor..." : "Hesap oluştur"}</span>
              {!loading ? <ArrowRight size={19} /> : null}
            </button>
          </form>

          <div className="l2t-auth-divider"><span>veya</span></div>

          <button type="button" className="l2t-auth-google" onClick={handleGoogleLogin} disabled={isBusy}>
            {isGoogleLoading ? <span>Google&apos;a yönlendiriliyor...</span> : <><GoogleMark /><span>Google ile devam et</span></>}
          </button>

          <p className="l2t-auth-register">
            Zaten hesabın var mı? <Link href="/auth/login">Giriş yap</Link>
          </p>

          <p className="l2t-auth-legal">
            Kayıt olarak <Link href="/kullanim-sartlari">Kullanım Şartları</Link> ve
            <Link href="/gizlilik-politikasi"> Gizlilik Politikası</Link>&apos;nı kabul etmiş olursun.
          </p>
        </div>
      </section>
    </div>
  );
}
