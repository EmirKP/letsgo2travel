import { requestJson } from "./api";

export type IssueDraft = { requestId: string; description: string; email: string; screen: string; screenshot: string | null };
const DRAFT_KEY = "l2t-support-draft";
let memoryDraft: IssueDraft | null = null;
let activeOwner: string | null = null;
const ownerKey = (ownerId?: string | null) => ownerId ? `user:${ownerId}` : "guest";

export function reportScreen(screen?: string) {
  const value = screen || (typeof window !== "undefined" ? window.location.hash.slice(1).split(/[/?&]/)[0] : "home");
  return /^[a-z][a-z0-9-]{0,49}$/.test(value) ? value : "home";
}

export function newIssueId() { return crypto.randomUUID(); }

export function readIssueDraft(screen?: string, ownerId?: string | null): IssueDraft {
  const owner = ownerKey(ownerId);
  if (activeOwner !== owner) memoryDraft = null;
  activeOwner = owner;
  if (memoryDraft) return { ...memoryDraft };
  try {
    const record = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    const stored = record?.owner === owner ? record.draft : null;
    if (record && !stored) sessionStorage.removeItem(DRAFT_KEY);
    if (stored && typeof stored.description === "string" && typeof stored.email === "string" && typeof stored.requestId === "string" && /^[0-9a-f-]{36}$/i.test(stored.requestId)) {
      return { requestId: stored.requestId, description: stored.description.slice(0, 3000), email: stored.email.slice(0, 254), screen: reportScreen(stored.screen), screenshot: null };
    }
  } catch { /* The form remains usable when private storage is unavailable. */ }
  return { requestId: newIssueId(), description: "", email: "", screen: reportScreen(screen), screenshot: null };
}

export function saveIssueDraft(draft: IssueDraft, ownerId?: string | null) {
  const owner = ownerKey(ownerId);
  // Ignore work completing from an older account's already closed sheet.
  if (activeOwner !== owner) return;
  memoryDraft = { ...draft };
  // Do not retain screenshot pixels on disk. A selected image stays only in memory.
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ owner, draft: { ...draft, screenshot: null } })); } catch { /* Memory fallback. */ }
}

export function clearIssueDraft(expectedId?: string, ownerId?: string | null) {
  if (activeOwner !== ownerKey(ownerId)) return;
  if (expectedId && memoryDraft?.requestId !== expectedId) return;
  memoryDraft = null;
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage is optional. */ }
}

export async function prepareIssueScreenshot(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8_000_000) throw new Error("invalid-image");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("invalid-image"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error("invalid-image");
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("invalid-image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.8);
    if (!result.startsWith("data:image/jpeg;base64,") || result.length > 2_000_000) throw new Error("invalid-image");
    return result;
  } finally { URL.revokeObjectURL(url); }
}

export async function sendIssueReport(draft: IssueDraft, context: { locale: "tr" | "en" | "sq"; version: string; build: string }, accessToken?: string) {
  const result = await requestJson<{ id?: string }>("/api/support/issues", {
    method: "POST", body: { ...draft, ...context },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    timeoutMs: 25_000,
  });
  if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id)) throw new Error("unavailable");
  return result.id;
}
