import { useCallback, useEffect, useRef, useState } from "react";
import { config, isSupabaseConfigured } from "../lib/config";
import { ApiError, requestJson } from "../lib/api";
import { addPluginListener, isNativePlatform, plugin } from "../lib/capacitor";
import { closeBrowser, openExternal } from "../lib/native";
import { endAllFlightActivities } from "../lib/liveActivity";
import { disableLiveActivityTokensForLogout } from "../lib/liveActivityPush";
import { detachPushForLogout } from "../lib/push";
import { localeFromStorage } from "../lib/i18n";
import type { AuthSession, AuthUser } from "../types";

const NATIVE_REDIRECT = "tr.com.letsgo2travel.app://auth/callback";
const NATIVE_CALLBACK_PROTOCOL = "tr.com.letsgo2travel.app:";
const NATIVE_CALLBACK_HOST = "auth";
const NATIVE_CALLBACK_PATH = "/callback";
const SESSION_KEY = "l2t.mobile.auth-session.v1";
const OAUTH_TRANSACTION_KEY = "l2t.mobile.oauth-transaction.v2";
const EMAIL_TRANSACTION_KEY = "l2t.mobile.email-auth-transaction.v1";
const RECOVERY_PENDING_KEY = "l2t.mobile.password-recovery.v1";
const OAUTH_TRANSACTION_TTL = 12 * 60 * 1000;
const EMAIL_TRANSACTION_TTL = 24 * 60 * 60 * 1000;

type Provider = "apple" | "google";
type EmailFlow = "recovery" | "signup";
type SignUpResponse = Partial<AuthSession> & { user?: AuthUser | null };

type OAuthTransaction = {
  provider: Provider;
  verifier: string;
  createdAt: number;
};

type EmailTransaction = {
  flow: EmailFlow;
  verifier: string;
  createdAt: number;
};

type RefreshInFlight = {
  userId: string;
  refreshToken: string;
  generation: number;
  promise: Promise<AuthSession>;
};

function authCopy(tr: string, en: string) {
  return localeFromStorage() === "en" ? en : tr;
}

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // WebView depolaması kullanılamıyorsa işlem çağrısında anlaşılır hata verilir.
  }
}

function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Temizleme başarısız olsa da oturum kapatma akışı devam eder.
  }
}

function callbackParams(url: string) {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const value = (key: string) => params.get(key) || fragment.get(key);
    const expiresIn = Number(value("expires_in") || 3600);
    return {
      accessToken: value("access_token"),
      code: value("code"),
      error: value("error_description") || value("error"),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      flow: value("flow") || value("type"),
      refreshToken: value("refresh_token"),
      tokenType: value("token_type") || "bearer",
    };
  } catch {
    return {
      accessToken: null,
      code: null,
      error: null,
      expiresIn: 3600,
      flow: null,
      refreshToken: null,
      tokenType: "bearer",
    };
  }
}

function isExpectedAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (isNativePlatform()) {
      return parsed.protocol === NATIVE_CALLBACK_PROTOCOL
        && parsed.hostname === NATIVE_CALLBACK_HOST
        && parsed.pathname === NATIVE_CALLBACK_PATH;
    }
    return parsed.origin === window.location.origin && parsed.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

function saveSession(session: AuthSession | null) {
  if (!session) {
    storageRemove(SESSION_KEY);
    return;
  }
  const withExpiry = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
  };
  storageSet(SESSION_KEY, JSON.stringify(withExpiry));
}

function readSession(): AuthSession | null {
  try {
    const raw = storageGet(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readOAuthTransaction(): OAuthTransaction | null {
  try {
    const parsed = JSON.parse(storageGet(OAUTH_TRANSACTION_KEY) || "null") as Partial<OAuthTransaction> | null;
    if (
      !parsed
      || (parsed.provider !== "apple" && parsed.provider !== "google")
      || typeof parsed.verifier !== "string"
      || parsed.verifier.length < 43
      || typeof parsed.createdAt !== "number"
      || parsed.createdAt <= 0
      || parsed.createdAt > Date.now() + 60_000
      || Date.now() - parsed.createdAt > OAUTH_TRANSACTION_TTL
    ) {
      storageRemove(OAUTH_TRANSACTION_KEY);
      return null;
    }
    return parsed as OAuthTransaction;
  } catch {
    storageRemove(OAUTH_TRANSACTION_KEY);
    return null;
  }
}

function saveOAuthTransaction(transaction: OAuthTransaction) {
  storageSet(OAUTH_TRANSACTION_KEY, JSON.stringify(transaction));
  const saved = readOAuthTransaction();
  if (!saved || saved.verifier !== transaction.verifier) {
    throw new Error(authCopy(
      "Güvenli giriş bilgisi bu cihazda saklanamadı.",
      "Secure sign-in information could not be saved on this device.",
    ));
  }
}

function readEmailTransaction(): EmailTransaction | null {
  try {
    const parsed = JSON.parse(storageGet(EMAIL_TRANSACTION_KEY) || "null") as Partial<EmailTransaction> | null;
    if (
      !parsed
      || (parsed.flow !== "recovery" && parsed.flow !== "signup")
      || typeof parsed.verifier !== "string"
      || parsed.verifier.length < 43
      || typeof parsed.createdAt !== "number"
      || parsed.createdAt <= 0
      || parsed.createdAt > Date.now() + 60_000
      || Date.now() - parsed.createdAt > EMAIL_TRANSACTION_TTL
    ) {
      storageRemove(EMAIL_TRANSACTION_KEY);
      return null;
    }
    return parsed as EmailTransaction;
  } catch {
    storageRemove(EMAIL_TRANSACTION_KEY);
    return null;
  }
}

function saveEmailTransaction(transaction: EmailTransaction) {
  storageSet(EMAIL_TRANSACTION_KEY, JSON.stringify(transaction));
  const saved = readEmailTransaction();
  if (!saved || saved.verifier !== transaction.verifier) {
    throw new Error(authCopy(
      "E-posta doğrulama bilgisi bu cihazda saklanamadı.",
      "Email verification information could not be saved on this device.",
    ));
  }
}

function randomVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(digest);
}

function authUrl(path: string) {
  return `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1${path}`;
}

function authHeaders(accessToken?: string) {
  return {
    apikey: config.supabaseAnonKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function normalizeSession(value: Partial<AuthSession>): AuthSession {
  if (!value.access_token || !value.refresh_token || !value.user) {
    throw new Error(authCopy("Oturum bilgisi eksik döndü.", "The session response is incomplete."));
  }
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_in: value.expires_in || 3600,
    expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600),
    token_type: value.token_type || "bearer",
    user: value.user,
  };
}

function isSameSession(left: AuthSession | null, right: AuthSession) {
  return Boolean(
    left
    && left.user.id === right.user.id
    && left.refresh_token === right.refresh_token,
  );
}

function isDefinitiveRefreshRejection(error: unknown) {
  return error instanceof ApiError && (error.status === 400 || error.status === 401);
}

function localizedAuthError(error: unknown, fallback?: string) {
  const raw = error instanceof Error ? error.message.trim() : "";
  const lower = raw.toLocaleLowerCase("en-US");
  if (error instanceof ApiError && error.status === 429) return authCopy("Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.", "Too many attempts. Please try again in a few minutes.");
  if (lower.includes("invalid login credentials")) return authCopy("E-posta adresi veya şifre hatalı.", "Incorrect email address or password.");
  if (lower.includes("email not confirmed")) return authCopy("Giriş yapmadan önce e-posta adresini doğrulamalısın.", "Verify your email address before signing in.");
  if (lower.includes("user already registered") || lower.includes("already been registered")) return authCopy("Bu e-posta adresiyle daha önce hesap açılmış.", "An account already exists with this email address.");
  if (lower.includes("signup is disabled")) return authCopy("Yeni hesap oluşturma şu anda kapalı.", "New account creation is currently unavailable.");
  if (lower.includes("password should be at least") || lower.includes("weak password")) return authCopy("Şifre en az 8 karakter olmalı.", "Your password must be at least 8 characters.");
  if (lower.includes("new password should be different")) return authCopy("Yeni şifre önceki şifreden farklı olmalı.", "Your new password must be different from the previous one.");
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) return authCopy("Bu giriş yöntemi henüz etkinleştirilmemiş.", "This sign-in method is not enabled yet.");
  if (lower.includes("access_denied") || lower.includes("cancel") || lower.includes("user denied")) return authCopy("Giriş işlemi iptal edildi.", "Sign-in was cancelled.");
  if (lower.includes("database error saving new user")) return authCopy("Hesap profili oluşturulamadı. Kullanıcı adını değiştirip tekrar dene.", "Your account profile could not be created. Try another username.");
  if (lower.includes("rate limit") || lower.includes("email rate")) return authCopy("Çok fazla e-posta istendi. Birkaç dakika sonra tekrar dene.", "Too many emails were requested. Please try again in a few minutes.");
  if (lower.includes("code verifier") || lower.includes("pkce")) return authCopy("Güvenli giriş süresi doldu. Girişi yeniden başlat.", "The secure sign-in session expired. Start signing in again.");
  if (lower.includes("failed to fetch") || lower.includes("network request failed")) return authCopy("Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.", "Could not connect. Check your internet connection and try again.");
  if (localeFromStorage() === "tr" && /bağlantı|sunucu|zaman aşımı|oturum|giriş|e-posta|şifre|güvenli/i.test(raw)) return raw;
  return fallback || authCopy("İşlem tamamlanamadı. Lütfen tekrar dene.", "The action could not be completed. Please try again.");
}

function nativeRedirect(flow?: EmailFlow) {
  return flow ? `${NATIVE_REDIRECT}?flow=${flow}` : NATIVE_REDIRECT;
}

export function useAuth() {
  const [session, setSessionState] = useState<AuthSession | null>(() => readSession());
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState("");
  const [recoveryPending, setRecoveryPendingState] = useState(() => storageGet(RECOVERY_PENDING_KEY) === "true");
  const sessionGeneration = useRef(0);
  const refreshInFlight = useRef<RefreshInFlight | null>(null);
  const consumedAuthUrls = useRef(new Set<string>());
  const authCallbackInProgress = useRef(false);
  const signOutInFlight = useRef<Promise<void> | null>(null);

  const setRecoveryPending = useCallback((next: boolean) => {
    setRecoveryPendingState(next);
    if (next) storageSet(RECOVERY_PENDING_KEY, "true");
    else storageRemove(RECOVERY_PENDING_KEY);
  }, []);

  const setSession = useCallback((next: AuthSession | null) => {
    sessionGeneration.current += 1;
    saveSession(next);
    setSessionState(next);
    if (!next) setRecoveryPending(false);
  }, [setRecoveryPending]);

  const fail = useCallback((error: unknown, fallback?: string): never => {
    const message = localizedAuthError(error, fallback);
    setAuthError(message);
    throw new Error(message);
  }, []);

  const refreshSession = useCallback(async (current: AuthSession) => {
    if (!isSupabaseConfigured || !current.refresh_token) return current;
    const generation = sessionGeneration.current;
    const existingRefresh = refreshInFlight.current;
    if (
      existingRefresh
      && existingRefresh.userId === current.user.id
      && existingRefresh.refreshToken === current.refresh_token
      && existingRefresh.generation === generation
    ) {
      return existingRefresh.promise;
    }

    const refresh = (async () => {
      const result = await requestJson<Partial<AuthSession>>(authUrl("/token?grant_type=refresh_token"), {
        method: "POST",
        headers: authHeaders(),
        body: { refresh_token: current.refresh_token },
      });
      const next = normalizeSession(result);
      const latest = readSession();
      if (sessionGeneration.current === generation && isSameSession(latest, current)) {
        setSession(next);
      }
      return next;
    })();

    const entry: RefreshInFlight = {
      userId: current.user.id,
      refreshToken: current.refresh_token,
      generation,
      promise: refresh,
    };
    refreshInFlight.current = entry;
    try {
      return await refresh;
    } finally {
      if (refreshInFlight.current === entry) refreshInFlight.current = null;
    }
  }, [setSession]);

  const sessionFromCallbackTokens = useCallback(async (params: ReturnType<typeof callbackParams>) => {
    if (!params.accessToken || !params.refreshToken) throw new Error(authCopy("Giriş dönüş bilgisi eksik.", "The sign-in callback is incomplete."));
    const user = await requestJson<AuthUser>(authUrl("/user"), {
      headers: authHeaders(params.accessToken),
    });
    return normalizeSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
      expires_in: params.expiresIn,
      token_type: params.tokenType,
      user,
    });
  }, []);

  const consumeAuthUrl = useCallback(async (url: string) => {
    if (!isSupabaseConfigured || !isExpectedAuthCallbackUrl(url)) return;
    if (consumedAuthUrls.current.has(url)) return;
    consumedAuthUrls.current.add(url);
    authCallbackInProgress.current = true;
    const nativeCallback = isNativePlatform();
    const callback = callbackParams(url);
    const emailTransaction = readEmailTransaction();
    const oauthTransaction = readOAuthTransaction();
    const callbackFlow = callback.flow === "recovery" || callback.flow === "signup" ? callback.flow : null;
    const effectiveEmailTransaction = callbackFlow
      ? (emailTransaction?.flow === callbackFlow ? emailTransaction : null)
      : (!oauthTransaction ? emailTransaction : null);
    const effectiveOAuthTransaction = callbackFlow ? null : oauthTransaction;
    const effectiveTransaction = effectiveEmailTransaction || effectiveOAuthTransaction;
    const isRecovery = callbackFlow === "recovery" || effectiveEmailTransaction?.flow === "recovery";
    const clearCallbackTransaction = () => {
      if (effectiveEmailTransaction) storageRemove(EMAIL_TRANSACTION_KEY);
      else if (effectiveOAuthTransaction) storageRemove(OAUTH_TRANSACTION_KEY);
    };

    if (callback.error) {
      const message = localizedAuthError(new Error(callback.error), authCopy("Giriş sağlayıcısı işlemi tamamlayamadı.", "The sign-in provider could not complete the request."));
      setAuthError(message);
      clearCallbackTransaction();
      setLoading(false);
      await closeBrowser();
      authCallbackInProgress.current = false;
      return;
    }

    if (nativeCallback && (!callback.code || !effectiveTransaction)) {
      setAuthError(authCopy("Güvenli giriş dönüşü doğrulanamadı. Girişi yeniden başlat.", "The secure sign-in callback could not be verified. Start signing in again."));
      clearCallbackTransaction();
      setLoading(false);
      await closeBrowser();
      authCallbackInProgress.current = false;
      return;
    }

    setLoading(true);
    setAuthError("");
    try {
      let next: AuthSession;
      if (callback.code) {
        const verifier = effectiveEmailTransaction?.verifier || effectiveOAuthTransaction?.verifier;
        if (!verifier) throw new Error(authCopy("Güvenli giriş bilgisi bulunamadı veya süresi doldu.", "Secure sign-in information is missing or expired."));
        const result = await requestJson<Partial<AuthSession>>(authUrl("/token?grant_type=pkce"), {
          method: "POST",
          headers: authHeaders(),
          body: { auth_code: callback.code, code_verifier: verifier },
        });
        next = normalizeSession(result);
      } else if (!nativeCallback) {
        next = await sessionFromCallbackTokens(callback);
      } else {
        throw new Error(authCopy("Güvenli giriş dönüş kodu bulunamadı.", "The secure sign-in callback code is missing."));
      }
      setSession(next);
      setRecoveryPending(Boolean(isRecovery));
      clearCallbackTransaction();
    } catch (error) {
      const message = localizedAuthError(error, isRecovery
        ? authCopy("Şifre yenileme bağlantısı tamamlanamadı.", "The password reset link could not be completed.")
        : authCopy("Giriş tamamlanamadı.", "Sign-in could not be completed."));
      setAuthError(message);
      clearCallbackTransaction();
    } finally {
      await closeBrowser();
      authCallbackInProgress.current = false;
      setLoading(false);
    }
  }, [sessionFromCallbackTokens, setRecoveryPending, setSession]);

  useEffect(() => {
    let active = true;
    let appListener: { remove: () => Promise<void> } | null = null;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    let browserListener: { remove: () => Promise<void> } | null = null;
    let browserFinishedTimer: number | null = null;

    const refreshIfNeeded = async (thresholdSeconds: number) => {
      const current = readSession();
      if (!current || (current.expires_at || 0) >= Math.floor(Date.now() / 1000) + thresholdSeconds) return;
      const generation = sessionGeneration.current;
      try {
        await refreshSession(current);
      } catch (error) {
        const latest = readSession();
        if (
          active
          && generation === sessionGeneration.current
          && isSameSession(latest, current)
          && isDefinitiveRefreshRejection(error)
        ) {
          setSession(null);
        }
      }
    };

    const initialize = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      await refreshIfNeeded(90);
      if (active) setLoading(false);
    };
    void initialize();

    if (!isNativePlatform() && isExpectedAuthCallbackUrl(window.location.href)) {
      const params = callbackParams(window.location.href);
      if (params.code || params.accessToken || params.error) void consumeAuthUrl(window.location.href);
    }

    if (isNativePlatform()) {
      void addPluginListener("App", "appUrlOpen", (event) => {
        const url = typeof event.url === "string" ? event.url : "";
        if (url && isExpectedAuthCallbackUrl(url)) void consumeAuthUrl(url);
      }).then((listener) => { appListener = listener; });
      void addPluginListener("App", "appStateChange", (event) => {
        if (event.isActive === true) void refreshIfNeeded(180);
      }).then((listener) => { appStateListener = listener; });
      void addPluginListener("Browser", "browserFinished", () => {
        const pendingTransaction = readOAuthTransaction();
        if (!pendingTransaction) return;
        if (browserFinishedTimer !== null) window.clearTimeout(browserFinishedTimer);
        browserFinishedTimer = window.setTimeout(() => {
          browserFinishedTimer = null;
          if (authCallbackInProgress.current) return;
          const currentTransaction = readOAuthTransaction();
          if (
            currentTransaction
            && currentTransaction.verifier === pendingTransaction.verifier
            && currentTransaction.createdAt === pendingTransaction.createdAt
          ) {
            storageRemove(OAUTH_TRANSACTION_KEY);
            setAuthError(authCopy("Giriş işlemi iptal edildi.", "Sign-in was cancelled."));
            setLoading(false);
          }
        }, 600);
      }).then((listener) => { browserListener = listener; });
      const app = plugin("App");
      if (app?.getLaunchUrl) {
        void app.getLaunchUrl().then((value) => {
          const url = value && typeof value === "object" && "url" in value ? String((value as { url?: string }).url || "") : "";
          if (url && isExpectedAuthCallbackUrl(url)) void consumeAuthUrl(url);
        });
      }
    }

    const interval = window.setInterval(() => {
      void refreshIfNeeded(180);
    }, 120_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      if (browserFinishedTimer !== null) window.clearTimeout(browserFinishedTimer);
      void appListener?.remove();
      void appStateListener?.remove();
      void browserListener?.remove();
    };
  }, [consumeAuthUrl, refreshSession, setSession]);

  const signInWithEmail = async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error(authCopy("Supabase ayarları eksik.", "Account service settings are missing."));
    if (!password) throw new Error(authCopy("Şifreni yazmalısın.", "Enter your password."));
    setAuthError("");
    try {
      const result = await requestJson<Partial<AuthSession>>(authUrl("/token?grant_type=password"), {
        method: "POST",
        headers: authHeaders(),
        body: { email: email.trim().toLowerCase(), password },
      });
      setSession(normalizeSession(result));
      setRecoveryPending(false);
      storageRemove(EMAIL_TRANSACTION_KEY);
    } catch (error) {
      fail(error, authCopy("Giriş yapılamadı. Bilgilerini kontrol edip tekrar dene.", "Could not sign in. Check your details and try again."));
    }
  };

  const signUpWithEmail = async (email: string, password: string, profile: { fullName: string; username: string }) => {
    if (!isSupabaseConfigured) throw new Error(authCopy("Supabase ayarları eksik.", "Account service settings are missing."));
    const fullName = profile.fullName.replace(/\s+/g, " ").trim();
    const username = profile.username.trim().toLowerCase();
    if (fullName.length < 2 || fullName.length > 100) throw new Error(authCopy("Ad soyad 2–100 karakter arasında olmalı.", "Full name must be between 2 and 100 characters."));
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error(authCopy("Kullanıcı adı 3–20 karakter olmalı; yalnızca küçük harf, rakam ve alt çizgi içermeli.", "Username must be 3–20 characters and contain only lowercase letters, numbers and underscores."));
    if (password.length < 8 || password.length > 128) throw new Error(authCopy("Şifre 8–128 karakter arasında olmalı.", "Password must be between 8 and 128 characters."));
    setAuthError("");

    let challenge = "";
    if (isNativePlatform()) {
      const verifier = randomVerifier();
      challenge = await challengeFor(verifier);
      saveEmailTransaction({ flow: "signup", verifier, createdAt: Date.now() });
    }

    const redirectTo = isNativePlatform()
      ? nativeRedirect("signup")
      : "https://www.letsgo2travel.com.tr/auth/callback";
    try {
      const result = await requestJson<SignUpResponse>(`${authUrl("/signup")}?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: authHeaders(),
        body: {
          email: email.trim().toLowerCase(),
          password,
          data: { full_name: fullName, username },
          ...(challenge ? { code_challenge: challenge, code_challenge_method: "s256" } : {}),
        },
      });
      if (result.access_token && result.refresh_token && result.user) {
        storageRemove(EMAIL_TRANSACTION_KEY);
        setSession(normalizeSession(result));
        return authCopy("Hesabın açıldı.", "Your account is ready.");
      }
      return authCopy("Onay bağlantısı e-posta adresine gönderildi.", "A confirmation link was sent to your email address.");
    } catch (error) {
      storageRemove(EMAIL_TRANSACTION_KEY);
      return fail(error, authCopy("Hesap oluşturulamadı. Bilgilerini kontrol edip tekrar dene.", "Could not create your account. Check your details and try again."));
    }
  };

  const sendPasswordReset = async (email: string) => {
    if (!isSupabaseConfigured) throw new Error(authCopy("Supabase ayarları eksik.", "Account service settings are missing."));
    setAuthError("");
    let challenge = "";
    if (isNativePlatform()) {
      const verifier = randomVerifier();
      challenge = await challengeFor(verifier);
      saveEmailTransaction({ flow: "recovery", verifier, createdAt: Date.now() });
    }
    const redirectTo = isNativePlatform()
      ? nativeRedirect("recovery")
      : "https://www.letsgo2travel.com.tr/sifre-yenile";
    try {
      await requestJson<Record<string, unknown>>(`${authUrl("/recover")}?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: authHeaders(),
        body: {
          email: email.trim().toLowerCase(),
          ...(challenge ? { code_challenge: challenge, code_challenge_method: "s256" } : {}),
        },
      });
    } catch (error) {
      storageRemove(EMAIL_TRANSACTION_KEY);
      fail(error, authCopy("Şifre yenileme e-postası gönderilemedi.", "The password reset email could not be sent."));
    }
  };

  const signInWithProvider = async (provider: Provider) => {
    if (!isSupabaseConfigured) throw new Error(authCopy("Supabase ayarları eksik.", "Account service settings are missing."));
    if (provider === "apple" && !config.appleAuthEnabled) throw new Error(authCopy("Apple ile giriş henüz etkin değil.", "Sign in with Apple is not enabled yet."));
    if (readOAuthTransaction()) throw new Error(authCopy("Devam eden bir giriş işlemi var. Önce açık giriş penceresini tamamla veya kapat.", "A sign-in request is already in progress. Complete or close the open sign-in window first."));
    setAuthError("");
    setLoading(true);
    const verifier = randomVerifier();
    const challenge = await challengeFor(verifier);
    try {
      saveOAuthTransaction({ provider, verifier, createdAt: Date.now() });
      const redirectTo = isNativePlatform() ? NATIVE_REDIRECT : `${window.location.origin}/auth/callback`;
      const params = new URLSearchParams({
        provider,
        redirect_to: redirectTo,
        code_challenge: challenge,
        code_challenge_method: "s256",
      });
      const url = `${authUrl("/authorize")}?${params.toString()}`;
      if (isNativePlatform()) await openExternal(url);
      else window.location.assign(url);
    } catch (error) {
      storageRemove(OAUTH_TRANSACTION_KEY);
      setLoading(false);
      fail(error, authCopy(
        `${provider === "apple" ? "Apple" : "Google"} ile giriş başlatılamadı.`,
        `Sign in with ${provider === "apple" ? "Apple" : "Google"} could not be started.`,
      ));
    }
  };

  const signInWithGoogle = () => signInWithProvider("google");
  const signInWithApple = () => signInWithProvider("apple");

  const updatePassword = async (password: string) => {
    if (!session?.access_token || !recoveryPending) throw new Error(authCopy("Şifre yenileme oturumu bulunamadı.", "No password reset session was found."));
    if (password.length < 8 || password.length > 128) throw new Error(authCopy("Şifre 8–128 karakter arasında olmalı.", "Password must be between 8 and 128 characters."));
    setAuthError("");
    try {
      const result = await requestJson<AuthUser | { user?: AuthUser }>(authUrl("/user"), {
        method: "PUT",
        headers: authHeaders(session.access_token),
        body: { password },
      });
      const user = "user" in result && result.user ? result.user : result as AuthUser;
      setSession({ ...session, user: user?.id ? user : session.user });
      setRecoveryPending(false);
    } catch (error) {
      fail(error, authCopy("Şifre güncellenemedi. Bağlantıyı yeniden istemeyi dene.", "The password could not be updated. Try requesting a new link."));
    }
  };

  const updateProfile = async (fullNameValue: string, usernameValue: string) => {
    if (!session?.access_token) throw new Error(authCopy("Profil güncelleme oturumu bulunamadı.", "No profile update session was found."));
    const fullName = fullNameValue.replace(/\s+/g, " ").trim();
    const username = usernameValue.trim().toLowerCase();
    if (fullName.length < 2 || fullName.length > 100) throw new Error(authCopy("Ad soyad 2–100 karakter arasında olmalı.", "Full name must be between 2 and 100 characters."));
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error(authCopy("Kullanıcı adı 3–20 karakter olmalı; yalnızca küçük harf, rakam ve alt çizgi içermeli.", "Username must be 3–20 characters and contain only lowercase letters, numbers and underscores."));
    setAuthError("");
    try {
      const result = await requestJson<AuthUser | { user?: AuthUser }>(authUrl("/user"), {
        method: "PUT",
        headers: authHeaders(session.access_token),
        body: { data: { ...session.user.user_metadata, full_name: fullName, username } },
      });
      const user = "user" in result && result.user ? result.user : result as AuthUser;
      if (!user?.id) throw new Error(authCopy("Profil bilgisi güncellenemedi.", "Profile details could not be updated."));
      setSession({ ...session, user });
    } catch (error) {
      fail(error, authCopy("Profil bilgileri güncellenemedi.", "Profile details could not be updated."));
    }
  };

  const signOut = () => {
    if (signOutInFlight.current) return signOutInFlight.current;
    const accessToken = session?.access_token || "";
    const ownerId = session?.user.id || "";
    const task = (async () => {
      // Push/Live Activity temizliği ve yerel uçuş hatırlatmaları, eski
      // bearer yakalanmışken başlatılır. endAllFlightActivities kendi sync kuyruğunda
      // seri çalıştığı için yoldaki eski snapshot logout sonrasında bildirim
      // planlayamaz. Sunucu detach başarısızlıkları opak kimlikle kalıcı
      // kuyruğa alınır; hiçbir push/bearer tokenı depolanmaz.
      const cleanup = accessToken
        ? Promise.allSettled([
          detachPushForLogout(() => accessToken, ownerId),
          disableLiveActivityTokensForLogout(accessToken, ownerId),
          endAllFlightActivities(),
        ])
        : Promise.allSettled([endAllFlightActivities()]);

      // Oturumu beklemeden yerelde kapat: arka plandaki native temizliği
      // sürerken App eski hesabı hâlâ aktif görüp tokenı yeniden bağlayamaz.
      // Temizlik fonksiyonları gereken eski bearer/owner değerlerini yukarıda
      // kendi closure'larına aldı; kullanıcı arayüzü ağ yüzünden beklemez.
      setSession(null);
      storageRemove(OAUTH_TRANSACTION_KEY);
      storageRemove(EMAIL_TRANSACTION_KEY);

      if (!accessToken) return;

      // Normal "çıkış" yalnız bu cihazdaki refresh token ailesini kapatır.
      // Global scope başka cihazları ve gecikme sırasında açılmış yeni bir
      // oturumu yanlışlıkla sonlandırabileceği için açıkça local kullanılır.
      const revokeAuthSession = () => requestJson<Record<string, unknown>>(authUrl("/logout?scope=local"), {
        method: "POST",
        headers: authHeaders(accessToken),
      }).catch(() => undefined);

      // Yerel çıkış bu noktada tamamdır; hesap penceresi/ağ beklemez. Eski
      // bearer yalnız arka plandaki detach tamamlanana (en çok 45 sn) kadar
      // bellekte tutulur, ardından sunucu oturumu da kapatılır.
      void Promise.race([
        cleanup,
        new Promise((resolve) => window.setTimeout(resolve, 45_000)),
      ]).then(revokeAuthSession, revokeAuthSession);
    })();
    const tracked = task.finally(() => {
      if (signOutInFlight.current === tracked) signOutInFlight.current = null;
    });
    signOutInFlight.current = tracked;
    return tracked;
  };

  return {
    configured: isSupabaseConfigured,
    loading,
    authError,
    recoveryPending,
    session,
    user: session?.user || null,
    accessToken: session?.access_token || "",
    clearAuthError: () => setAuthError(""),
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signInWithGoogle,
    signInWithApple,
    updatePassword,
    updateProfile,
    signOut,
  };
}
