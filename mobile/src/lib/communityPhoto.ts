import { isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";

export const COMMUNITY_PHOTO_MAX_BYTES = 300_000;
const PHOTO_PATH = /^\/api\/(?:country-community\/(?:questions|social)|admin\/social)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/photo$/i;
const JPEG_PREFIX = "data:image/jpeg;base64,";

export function isCommunityPhotoPath(value: unknown): value is string {
  return typeof value === "string" && PHOTO_PATH.test(value);
}

function decodedLength(base64: string) {
  return base64.length * 3 / 4 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

/** Re-encoding removes camera metadata and preserves the photograph's proportions. */
export async function prepareCommunityPhoto(file: File): Promise<string> {
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error("photo_heic");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) throw new Error("photo_type");
  if (!file.size || file.size > 12_000_000) throw new Error("photo_size");
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  let decodeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = objectUrl;
    try {
      await Promise.race([
        image.decode(),
        new Promise<never>((_, reject) => {
          decodeTimer = setTimeout(() => reject(new Error("photo_decode")), 7000);
        }),
      ]);
    } catch {
      throw new Error("photo_decode");
    }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24_000_000) {
      throw new Error("photo_dimensions");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("photo_compress");
    let scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.6, 0.48]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (!data.startsWith(JPEG_PREFIX)) throw new Error("photo_compress");
        const encoded = data.slice(JPEG_PREFIX.length);
        if (encoded.length > 0 && decodedLength(encoded) <= COMMUNITY_PHOTO_MAX_BYTES) return data;
      }
      scale *= 0.78;
    }
    throw new Error("photo_compress");
  } finally {
    if (decodeTimer) clearTimeout(decodeTimer);
    image.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

function abortError() {
  return new DOMException("Photo request cancelled", "AbortError");
}

async function jpegBlob(bytes: Uint8Array<ArrayBuffer>) {
  if (!bytes.length || bytes.length > COMMUNITY_PHOTO_MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("photo_response");
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

/** Only the app's protected media endpoint receives account credentials. */
export async function loadCommunityPhoto(path: string, accessToken: string, signal?: AbortSignal): Promise<Blob> {
  if (!isCommunityPhotoPath(path)) throw new Error("photo_path");
  if (signal?.aborted) throw abortError();
  const url = new URL(`${config.apiBaseUrl}${path}`);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("photo_path");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  const headers: Record<string, string> = { Accept: "image/jpeg" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let cancelNative: (() => void) | undefined;
  try {
    if (isNativePlatform()) {
      const http = plugin("CapacitorHttp");
      if (!http?.request) throw new Error("photo_bridge");
      // Capacitor 8 returns base64 for arraybuffer responses on iOS and Android.
      // Its transport cannot be aborted; the bounded request is ignored after cancellation.
      const response = await Promise.race([
        http.request({
          url: url.href, method: "GET", headers, responseType: "arraybuffer",
          connectTimeout: 15_000, readTimeout: 15_000, disableRedirects: true,
        }) as Promise<{ status: number; data: unknown; url?: string; headers?: Record<string, string> }>,
        new Promise<never>((_, reject) => {
          cancelNative = () => reject(abortError());
          controller.signal.addEventListener("abort", cancelNative, { once: true });
        }),
      ]);
      if (controller.signal.aborted) throw abortError();
      if (response.status !== 200 || (response.url && response.url !== url.href)) throw new Error("photo_response");
      const type = Object.entries(response.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1];
      if (!type || type.split(";")[0].trim().toLowerCase() !== "image/jpeg") throw new Error("photo_response");
      if (typeof response.data !== "string" || response.data.length > 400_000 || response.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.data)) {
        throw new Error("photo_response");
      }
      const decoded = atob(response.data);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
      return jpegBlob(bytes);
    }
    const response = await fetch(url.href, {
      headers, signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit",
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "image/jpeg") {
      throw new Error("photo_response");
    }
    const advertisedSize = Number(response.headers.get("content-length"));
    if (advertisedSize > COMMUNITY_PHOTO_MAX_BYTES) throw new Error("photo_response");
    const blob = await response.blob();
    if (controller.signal.aborted) throw abortError();
    if (blob.size > COMMUNITY_PHOTO_MAX_BYTES) throw new Error("photo_response");
    return jpegBlob(new Uint8Array(await blob.arrayBuffer()));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    if (cancelNative) controller.signal.removeEventListener("abort", cancelNative);
  }
}
