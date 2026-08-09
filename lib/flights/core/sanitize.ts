export function sanitizePlainText(value: unknown, maximumLength = 160) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function stableId(prefix: string, value: string) {
  let forwardHash = 0x811c9dc5;
  let reverseHash = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    forwardHash ^= value.charCodeAt(index);
    forwardHash = Math.imul(forwardHash, 0x01000193);
    reverseHash ^= value.charCodeAt(value.length - index - 1);
    reverseHash = Math.imul(reverseHash, 0x01000193);
  }
  return `${prefix}_${(forwardHash >>> 0).toString(36)}${(reverseHash >>> 0).toString(36)}`;
}

export function uniqueSanitizedTextList(value: unknown, maximumItems = 20, maximumLength = 160) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value.slice(0, maximumItems)) {
    const cleaned = sanitizePlainText(item, maximumLength);
    if (cleaned && !result.includes(cleaned)) result.push(cleaned);
  }
  return result;
}
