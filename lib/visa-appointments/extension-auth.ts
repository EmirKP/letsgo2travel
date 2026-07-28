import { createHash, randomBytes } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function hashVisaExtensionSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePairingCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

export function createPairingCode() {
  const bytes = randomBytes(10);
  let raw = "";
  for (let index = 0; index < 10; index += 1) {
    raw += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function createExtensionToken() {
  return randomBytes(32).toString("hex");
}

export const EXTENSION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
