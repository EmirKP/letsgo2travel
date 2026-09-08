/** Small, inert JPEGs only. No SVG, remote URL download or client-supplied owner. */
export const MAX_AVATAR_BYTES = 300_000;
export function decodeAvatar(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length > 400_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const data = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  if (data.length < 4 || data.length > MAX_AVATAR_BYTES || data[0] !== 255 || data[1] !== 216 || data[2] !== 255 || data.at(-2) !== 255 || data.at(-1) !== 217) return null;
  return data;
}

export function ownedAvatarPath(path: unknown, userId: string): path is string {
  return /^[a-f0-9-]{36}$/i.test(userId) && typeof path === "string" && new RegExp(`^${userId}/[a-f0-9-]{36}\\.jpg$`, "i").test(path);
}
