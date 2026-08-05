"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  Compass,
  Lock,
  Mail,
  Plane,
  ShieldCheck,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase-client";
import { getSiteUrl } from "@/lib/site-url";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const getSafeNextPath = () => {
    const requested = new URLSearchParams(window.location.search).get("next");
    if (!requested?.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) return "/profil";
    try {
      const target = new URL(requested, window.location.origin);
      return target.origin === window.location.origin
        ? `${target.pathname}${target.search}${target.hash}`
        : "/profil";
    } catch {
      return "/profil";
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");

    try {
      const siteUrl = getSiteUrl();
      const nextPath = getSafeNextPath();
      const redirectTo = Capacitor.isNativePlatform()
        ? "tr.com.letsgo2travel.app://auth/callback"
        : `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (authError) throw authError;
    } catch (caughtError: unknown) {
      console.error(caughtError);
      setError("Google ile giriş başlatılamadı. Lütfen tekrar deneyin.");
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || "Giriş başarısız. Lütfen tekrar deneyin.");
        return;
      }

      window.location.assign(getSafeNextPath());
    } catch (caughtError: unknown) {
      console.error(caughtError);
      setError("Giriş sırasında beklenmeyen bir sorun oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const isBusy = loading || isGoogleLoading;

  return (
    <div className="l2t-auth-page">
      <section className="l2t-auth-shell" aria-labelledby="login-title">
        <aside className="l2t-auth-story" aria-label="LetsGo2Travel avantajları">
          <Link href="/" className="l2t-auth-brand" aria-label="LetsGo2Travel ana sayfa">
            <span><Plane size={23} /></span>
            <strong>LetsGo<span>2</span>Travel</strong>
          </Link>

          <div className="l2t-auth-story-copy">
            <p className="l2t-auth-eyebrow">Seyahatin tek hesabı</p>
            <h1>Planlarını, fırsatlarını ve rotalarını yanında taşı.</h1>
            <p>
              Web sitesinde başladığın seyahate telefondan devam et; kayıtların ve
              fiyat alarmların tüm cihazlarında hazır olsun.
            </p>
          </div>

          <div className="l2t-auth-benefits">
            <div>
              <span><BellRing size={19} /></span>
              <p><strong>Fiyat alarmı</strong><small>Uçuş fiyatı düşünce haberdar ol.</small></p>
            </div>
            <div>
              <span><Compass size={19} /></span>
              <p><strong>Kayıtlı rotalar</strong><small>Planlarını tek yerde düzenle.</small></p>
            </div>
            <div>
              <span><ShieldCheck size={19} /></span>
              <p><strong>Güvenli hesap</strong><small>Bilgilerin cihazlar arasında korunur.</small></p>
            </div>
          </div>
        </aside>

        <div className="l2t-auth-panel">
          <div className="l2t-auth-panel-head">
            <span className="l2t-auth-mobile-mark"><Plane size={24} /></span>
            <p>Tekrar hoş geldin</p>
            <h2 id="login-title">Hesabına giriş yap</h2>
            <span>Favori rotalarına ve fiyat alarmlarına kaldığın yerden ulaş.</span>
          </div>

          <form onSubmit={handleLogin} className="l2t-auth-form">
            <label className="l2t-auth-field">
              <span>E-posta adresi</span>
              <span className="l2t-auth-input-wrap">
                <Mail size={18} />
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={254}
                  placeholder="ornek@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>

            <label className="l2t-auth-field">
              <span className="l2t-auth-label-row">
                <span>Şifre</span>
                <Link href="/sifremi-unuttum">Şifremi unuttum</Link>
              </span>
              <span className="l2t-auth-input-wrap">
                <Lock size={18} />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  placeholder="Şifreni gir"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </span>
            </label>

            {error ? (
              <div className="l2t-auth-error" role="alert">
                <AlertCircle size={17} />
                <span>{error}</span>
              </div>
            ) : null}

            <button type="submit" className="l2t-auth-submit" disabled={isBusy}>
              <span>{loading ? "Giriş yapılıyor..." : "Giriş yap"}</span>
              {!loading ? <ArrowRight size={19} /> : null}
            </button>
          </form>

          <div className="l2t-auth-divider"><span>veya</span></div>

          <button
            type="button"
            className="l2t-auth-google"
            onClick={handleGoogleLogin}
            disabled={isBusy}
          >
            {isGoogleLoading ? <span>Google&apos;a yönlendiriliyor...</span> : <><GoogleMark /><span>Google ile devam et</span></>}
          </button>

          <p className="l2t-auth-register">
            Henüz hesabın yok mu? <Link href="/auth/register">Ücretsiz hesap oluştur</Link>
          </p>

          <p className="l2t-auth-legal">
            Devam ederek <Link href="/kullanim-sartlari">Kullanım Koşulları</Link> ve
            <Link href="/gizlilik-politikasi"> Gizlilik Politikası</Link>&apos;nı kabul etmiş olursun.
          </p>
        </div>
      </section>
    </div>
  );
}
