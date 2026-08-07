import { useCallback, useEffect, useRef, useState } from "react";
import { config, isSupabaseConfigured } from "../lib/config";
import { ApiError, requestJson } from "../lib/api";
import { addPluginListener, isNativePlatform, plugin } from "../lib/capacitor";
import { closeBrowser, openExternal } from "../lib/native";
import type { AuthSession, AuthUser } from "../types";

const NATIVE_REDIRECT = "tr.com.letsgo2travel.app://auth/callback";
const SESSION_KEY = "l2t.mobile.auth-session.v1";
const VERIFIER_KEY = "l2t.mobile.pkce-verifier.v1";

type SignUpResponse = Partial<AuthSession> & { user?: AuthUser | null };

type RefreshInFlight = {
  userId: string;
  refreshToken: string;
  generation: number;
  promise: Promise<AuthSession>;
};

function callbackParams(url: string) {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const value = (key: string) => params.get(key) || fragment.get(key);
    return {
      code: value("code"),
      error: value("error_description") || value("error"),
    };
  } catch {
    return { code: null, error: null };
  }
}

function isOAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/auth/callback")
      || (parsed.host === "auth" && parsed.pathname.startsWith("/callback"));
  } catch {
    return false;
  }
}

function saveSession(session: AuthSession | null) {
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  const withExpiry = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(withExpiry));
}

function readSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.access_token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
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
  if (!value.access_token || !value.refresh_token || !value.user) throw new Error("Oturum bilgisi eksik döndü.");
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

export function useAuth() {
  const [session, setSessionState] = useState<AuthSession | null>(() => readSession());
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState("");
  const sessionGeneration = useRef(0);
  const refreshInFlight = useRef<RefreshInFlight | null>(null);
  const consumedOAuthUrls = useRef(new Set<string>());

  const setSession = useCallback((next: AuthSession | null) => {
    sessionGeneration.current += 1;
    saveSession(next);
    setSessionState(next);
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

  const consumeOAuthUrl = useCallback(async (url: string) => {
    if (!isSupabaseConfigured) return;
    if (consumedOAuthUrls.current.has(url)) return;
    consumedOAuthUrls.current.add(url);
    const callback = callbackParams(url);
    if (callback.error) {
      setAuthError(callback.error);
      window.localStorage.removeItem(VERIFIER_KEY);
      await closeBrowser();
      return;
    }
    const code = callback.code;
    const verifier = window.localStorage.getItem(VERIFIER_KEY);
    if (!code || !verifier) {
      setAuthError("Giriş dönüş bilgisi eksik. Yeniden giriş yapmayı dene.");
      await closeBrowser();
      return;
    }
    setLoading(true);
    setAuthError("");
    try {
      const result = await requestJson<Partial<AuthSession>>(authUrl("/token?grant_type=pkce"), {
        method: "POST",
        headers: authHeaders(),
        body: { auth_code: code, code_verifier: verifier },
      });
      setSession(normalizeSession(result));
      window.localStorage.removeItem(VERIFIER_KEY);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Giriş tamamlanamadı.");
    } finally {
      await closeBrowser();
      setLoading(false);
    }
  }, [setSession]);

  useEffect(() => {
    let active = true;
    let appListener: { remove: () => Promise<void> } | null = null;
    let appStateListener: { remove: () => Promise<void> } | null = null;

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

    if (!isNativePlatform() && (callbackParams(window.location.href).code || callbackParams(window.location.href).error)) {
      void consumeOAuthUrl(window.location.href);
    }

    if (isNativePlatform()) {
      void addPluginListener("App", "appUrlOpen", (event) => {
        const url = typeof event.url === "string" ? event.url : "";
        if (url && isOAuthCallbackUrl(url)) void consumeOAuthUrl(url);
      }).then((listener) => { appListener = listener; });
      void addPluginListener("App", "appStateChange", (event) => {
        if (event.isActive === true) void refreshIfNeeded(180);
      }).then((listener) => { appStateListener = listener; });
      const app = plugin("App");
      if (app?.getLaunchUrl) {
        void app.getLaunchUrl().then((value) => {
          const url = value && typeof value === "object" && "url" in value ? String((value as { url?: string }).url || "") : "";
          if (url && isOAuthCallbackUrl(url)) void consumeOAuthUrl(url);
        });
      }
    }

    const interval = window.setInterval(() => {
      void refreshIfNeeded(180);
    }, 120_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      void appListener?.remove();
      void appStateListener?.remove();
    };
  }, [consumeOAuthUrl, refreshSession, setSession]);

  const signInWithEmail = async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error("Supabase ayarları eksik.");
    setAuthError("");
    const result = await requestJson<Partial<AuthSession>>(authUrl("/token?grant_type=password"), {
      method: "POST",
      headers: authHeaders(),
      body: { email: email.trim().toLowerCase(), password },
    });
    setSession(normalizeSession(result));
  };

  const signUpWithEmail = async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error("Supabase ayarları eksik.");
    setAuthError("");
    const redirectTo = "https://www.letsgo2travel.com.tr/auth/callback";
    const result = await requestJson<SignUpResponse>(`${authUrl("/signup")}?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: authHeaders(),
      body: { email: email.trim().toLowerCase(), password },
    });
    if (result.access_token && result.refresh_token && result.user) {
      setSession(normalizeSession(result));
      return "Hesabın açıldı.";
    }
    return "Onay bağlantısı e-posta adresine gönderildi.";
  };

  const sendPasswordReset = async (email: string) => {
    if (!isSupabaseConfigured) throw new Error("Supabase ayarları eksik.");
    const redirectTo = "https://www.letsgo2travel.com.tr/sifre-yenile";
    await requestJson<Record<string, unknown>>(`${authUrl("/recover")}?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: authHeaders(),
      body: { email: email.trim().toLowerCase() },
    });
  };

  const signInWithProvider = async (provider: "apple" | "google") => {
    if (!isSupabaseConfigured) throw new Error("Supabase ayarları eksik.");
    setAuthError("");
    const verifier = randomVerifier();
    const challenge = await challengeFor(verifier);
    window.localStorage.setItem(VERIFIER_KEY, verifier);
    const redirectTo = isNativePlatform() ? NATIVE_REDIRECT : `${window.location.origin}/auth/callback`;
    const url = `${authUrl("/authorize")}?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256`;
    if (isNativePlatform()) await openExternal(url);
    else window.location.assign(url);
  };

  const signInWithGoogle = () => signInWithProvider("google");
  const signInWithApple = () => signInWithProvider("apple");

  const signOut = async () => {
    const accessToken = session?.access_token;
    setSession(null);
    if (accessToken) {
      await requestJson<Record<string, unknown>>(authUrl("/logout"), {
        method: "POST",
        headers: authHeaders(accessToken),
      }).catch(() => undefined);
    }
  };

  return {
    configured: isSupabaseConfigured,
    loading,
    authError,
    session,
    user: session?.user || null,
    accessToken: session?.access_token || "",
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signInWithGoogle,
    signInWithApple,
    signOut,
  };
}
