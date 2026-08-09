export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;

export const ADMIN_ROLES = ["moderator", "editor", "admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminSession = {
  role: AdminRole;
  subject: string;
  expiresAt: number;
};

function sessionSecret() {
  const dedicatedSecret = process.env.ADMIN_SESSION_SECRET || "";
  if (dedicatedSecret.length >= 32) return dedicatedSecret;
  if (process.env.NODE_ENV === "production") return "";
  return process.env.ADMIN_PASSWORD || "";
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isAdminRole(value: unknown): value is AdminRole {
  return ADMIN_ROLES.includes(value as AdminRole);
}

export async function createAdminSessionToken(params: {
  role: AdminRole;
  subject: string;
  ttlSeconds?: number;
}) {
  const secret = sessionSecret();
  if (!secret) throw new Error("Admin oturum anahtarı yapılandırılmamış.");

  const ttlSeconds = Math.min(
    ADMIN_SESSION_TTL_SECONDS,
    Math.max(60, Math.round(params.ttlSeconds || ADMIN_SESSION_TTL_SECONDS)),
  );
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const safeSubject = encodeURIComponent(params.subject.slice(0, 120));
  const payload = `v1:${expiresAt}:${params.role}:${safeSubject}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );

  return `${payload}.${toHex(signature)}`;
}

export async function verifyAdminSessionToken(token: string | null | undefined): Promise<AdminSession | null> {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 700) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = fromHex(token.slice(separator + 1));
  if (!signature) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const expiresAt = Number(parts[1]);
  const role = parts[2];
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !isAdminRole(role)) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  let subject = "";
  try {
    subject = decodeURIComponent(parts[3]);
  } catch {
    return null;
  }
  if (!subject) return null;

  return { role, subject, expiresAt };
}

export function adminSessionCookieOptions(maxAge = ADMIN_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export async function adminSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!token) return null;
  try {
    return verifyAdminSessionToken(decodeURIComponent(token));
  } catch {
    return null;
  }
}
