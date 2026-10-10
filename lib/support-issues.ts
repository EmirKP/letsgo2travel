import { createHash, createHmac } from "node:crypto";
import sharp from "sharp";

export const SUPPORT_BODY_LIMIT = 2_100_000;
export const SUPPORT_PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const SUPPORT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupportIssue = {
  requestId: string; description: string; email: string; screen: string;
  locale: "tr" | "en" | "sq"; version: string; build: string;
  screenshot: string | null;
};

export function parseSupportIssue(value: unknown): SupportIssue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.requestId !== "string" || !SUPPORT_UUID.test(data.requestId)) return null;
  if (typeof data.description !== "string") return null;
  const description = data.description.trim();
  if (description.length < 10 || description.length > 3000) return null;
  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (email.length > 254 || (email && !/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email))) return null;
  if (typeof data.screen !== "string" || !/^[a-z][a-z0-9-]{0,49}$/.test(data.screen)) return null;
  if (!["tr", "en", "sq"].includes(String(data.locale))) return null;
  if (typeof data.version !== "string" || !/^[\w.+-]{1,40}$/.test(data.version)) return null;
  if (typeof data.build !== "string" || !/^[\w.+-]{1,40}$/.test(data.build)) return null;
  if (data.screenshot != null && (typeof data.screenshot !== "string" || data.screenshot.length > 2_000_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.screenshot))) return null;
  return { requestId: data.requestId, description, email, screen: data.screen, locale: data.locale as SupportIssue["locale"], version: data.version, build: data.build, screenshot: (data.screenshot as string | null) || null };
}

/** Decode, verify and re-encode. User-selected pixels only; strip EXIF and other metadata. */
export async function normalizeSupportScreenshot(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null;
  const input = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  if (!input.length || input.length > 1_500_000) throw new Error("invalid-image");
  const image = sharp(input, { limitInputPixels: 32_000_000, animated: false, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) throw new Error("invalid-image");
  const output = await image.rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
  if (output.length > 600_000) throw new Error("invalid-image");
  return output.toString("base64");
}

export function supportActorKey(request: Request, userId: string | null) {
  if (userId) return `user:${userId}`;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("unavailable");
  // Vercel overwrites its forwarding header. Other deployments may supply a trusted real-IP header.
  const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  return `guest:${createHmac("sha256", secret).update(ip).digest("hex")}`;
}

export function supportPayloadHash(issue: SupportIssue) {
  // A locale/app-version change during a retry must not create another report.
  return createHash("sha256").update(JSON.stringify({ description: issue.description, email: issue.email, screen: issue.screen, screenshot: issue.screenshot })).digest("hex");
}
