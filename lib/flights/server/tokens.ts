import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SEARCH_TOKEN_HEADER = "x-flight-search-token";

export function createFlightSearchToken() {
  return randomBytes(32).toString("base64url");
}

export function hashFlightToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function flightSearchTokenFromRequest(request: Request) {
  const token = request.headers.get(SEARCH_TOKEN_HEADER)?.trim() || "";
  return token.length >= 32 && token.length <= 256 ? token : "";
}

export function tokenHashMatches(token: string, expectedHash: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashFlightToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

