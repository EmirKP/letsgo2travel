import { AUTH_REDIRECT, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import type { Profile, Session, SessionUser } from "../types";
import { loadSession, saveSession } from "./storage";

function authHeaders(token?: string) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || "İşlem başarısız.";
    throw new Error(message);
  }
  return data;
}

function normalizeSession(data: any): Session {
  const user = (data.user || {}) as SessionUser;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    expires_at: data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : undefined),
    user,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const session = normalizeSession(await parseResponse(response));
  saveSession(session);
  return session;
}

export async function signUp(input: { name: string; username: string; email: string; password: string }) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      data: { full_name: input.name.trim(), username: input.username.trim() },
      gotrue_meta_security: {},
    }),
  });
  const data = await parseResponse(response);
  if (data?.access_token && data?.refresh_token) {
    const session = normalizeSession(data);
    saveSession(session);
    return session;
  }
  return data;
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), redirect_to: redirectTo }),
  });
  return parseResponse(response);
}

export async function signOut(session: Session | null) {
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: authHeaders(session.access_token),
    }).catch(() => undefined);
  }
  saveSession(null);
}

export async function refreshSession(current: Session) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  const session = normalizeSession(await parseResponse(response));
  saveSession(session);
  return session;
}

export async function ensureFreshSession(session: Session | null) {
  if (!session) return null;
  const expiresAt = session.expires_at || 0;
  if (expiresAt > Math.floor(Date.now() / 1000) + 90) return session;
  try {
    return await refreshSession(session);
  } catch {
    saveSession(null);
    return null;
  }
}

export async function getProfile(session: Session) {
  const params = new URLSearchParams({ select: "id,username,role,visited_countries,wishlist_countries", id: `eq.${session.user.id}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: { ...authHeaders(session.access_token), Accept: "application/json" },
  });
  const rows = (await parseResponse(response)) as Profile[];
  return rows[0] || null;
}

export async function selectRows<T>(table: string, query: string, session: Session) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { ...authHeaders(session.access_token), Accept: "application/json" },
  });
  return (await parseResponse(response)) as T[];
}

export async function insertRows<T>(table: string, rows: unknown[], session: Session) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...authHeaders(session.access_token),
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  return (await parseResponse(response)) as T[];
}

export async function deleteRows(table: string, query: string, session: Session) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { ...authHeaders(session.access_token), Prefer: "return=minimal" },
  });
  if (!response.ok) await parseResponse(response);
}

function randomString(length = 64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  new Uint8Array(bytes).forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createGoogleOAuthUrl() {
  const verifier = randomString(72);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(digest);
  sessionStorage.setItem("l2t-pkce-verifier", verifier);

  const params = new URLSearchParams({
    provider: "google",
    redirect_to: AUTH_REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "s256",
  });
  return `${SUPABASE_URL}/auth/v1/authorize?${params}`;
}

export async function completeAuthUrl(url: string) {
  const parsed = new URL(url);
  const error = parsed.searchParams.get("error_description") || parsed.searchParams.get("error");
  if (error) throw new Error(error);

  const code = parsed.searchParams.get("code");
  if (code) {
    const verifier = sessionStorage.getItem("l2t-pkce-verifier") || "";
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const session = normalizeSession(await parseResponse(response));
    sessionStorage.removeItem("l2t-pkce-verifier");
    saveSession(session);
    return session;
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(accessToken) });
    const user = (await parseResponse(userResponse)) as SessionUser;
    const session: Session = { access_token: accessToken, refresh_token: refreshToken, user };
    saveSession(session);
    return session;
  }

  throw new Error("Giriş bağlantısı tamamlanamadı.");
}

export function currentStoredSession() {
  return loadSession();
}
