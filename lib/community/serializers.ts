// Topluluk (Kaşifler Ligi forumu) HERKESE AÇIK yanıt serileştiricileri.
// Beyaz-liste yaklaşımı: yalnız burada adı geçen alanlar yanıtta yer alır.
// authorId yalnız engelleme/kendi içeriğini tanıma için açık UUID alanıdır.
// user_id, e-posta veya diğer profil gizli alanları HİÇBİR koşulda dönmez —
// satırda fazladan alan olsa bile kopyalanmaz (testle güvence altında).

type Unknown = Record<string, unknown>;
const publicAuthorId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
const publicPhotoUrl = (row: Unknown) => row.hasPhoto === true && publicAuthorId(row.id)
  ? `/api/country-community/questions/${row.id}/photo` : null;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function communityProfileKey(row: Unknown, username: string | null | undefined, kind: "question" | "answer") {
  const author = publicAuthorId(row.authorId);
  if (author) return `user:${author.toLowerCase()}`;
  if (row.authorId !== null || !username || !/^[a-z0-9][a-z0-9._]{1,59}$/.test(username)) return null;
  const seed = typeof row.seed_key === "string" ? row.seed_key : "";
  if (kind === "question") {
    const match = /^starter-20260930-(0[1-9]|1[0-5])$/.exec(seed);
    if (match && row.id === `f09a2026-0930-4000-8000-${match[1].padStart(12, "0")}` && row.status === "published" && row.is_paywalled === false && row.category === "Ülke Bazlı Sorunlar") return `starter:${username}`;
  } else {
    const match = /^starter-reply-20261010-(0[1-9]|1[0-5])-(0[1-9]|1[0-6])$/.exec(seed);
    if (match && row.id === `f09a2026-1010-4000-8000-${match[1].padStart(10, "0")}${match[2]}`
      && row.topic_id === `f09a2026-0930-4000-8000-${match[1].padStart(12, "0")}` && typeof row.parentProfileKey === "string" && row.parentProfileKey.startsWith("starter:")) return `starter:${username}`;
  }
  return null;
}

const avatarUrl = (row: Unknown) => typeof row.avatarUrl === "string" && /^https:\/\/[^/]+\/storage\/v1\/object\/sign\/profile-avatars\//.test(row.avatarUrl) ? row.avatarUrl : null;

export type PublicAnswer = {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  username: string;
  isStarter: boolean;
  profileKey: string | null;
  avatarUrl: string | null;
};

export type PublicQuestionSummary = {
  id: string;
  authorId: string | null;
  countryCode: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  username: string;
  answerCount: number;
  photoUrl: string | null;
  isStarter: boolean;
  profileKey: string | null;
  avatarUrl: string | null;
};

export type PublicQuestionDetail = Omit<PublicQuestionSummary, "answerCount"> & {
  answers: PublicAnswer[];
};

export function serializeAnswer(row: Unknown, username: string | null | undefined): PublicAnswer {
  return {
    id: text(row.id, 80),
    authorId: publicAuthorId(row.authorId),
    body: text(row.body, 10_000),
    createdAt: text(row.created_at, 40),
    username: username || "anonim_gezgin",
    isStarter: row.authorId === null && typeof row.seed_key === "string" && /^starter-reply-20261010-\d{2}-\d{2}$/.test(row.seed_key),
    profileKey: communityProfileKey(row, username, "answer"),
    avatarUrl: avatarUrl(row),
  };
}

export function serializeQuestionSummary(
  row: Unknown,
  username: string | null | undefined,
  answerCount: number,
): PublicQuestionSummary {
  return {
    id: text(row.id, 80),
    authorId: publicAuthorId(row.authorId),
    countryCode: text(row.country_code, 8),
    title: text(row.title, 300),
    body: text(row.body, 10_000),
    category: text(row.category, 60),
    createdAt: text(row.created_at, 40),
    username: username || "anonim_gezgin",
    answerCount: Number.isFinite(answerCount) ? Math.max(0, Math.floor(answerCount)) : 0,
    photoUrl: publicPhotoUrl(row),
    isStarter: row.authorId === null && typeof row.seed_key === "string" && /^starter-20260930-\d{2}$/.test(row.seed_key),
    profileKey: communityProfileKey(row, username, "question"),
    avatarUrl: avatarUrl(row),
  };
}

export function serializeQuestionDetail(
  row: Unknown,
  username: string | null | undefined,
  answers: PublicAnswer[],
): PublicQuestionDetail {
  const summary = serializeQuestionSummary(row, username, answers.length);
  return {
    id: summary.id,
    authorId: summary.authorId,
    countryCode: summary.countryCode,
    title: summary.title,
    body: summary.body,
    category: summary.category,
    createdAt: summary.createdAt,
    username: summary.username,
    photoUrl: summary.photoUrl,
    isStarter: summary.isStarter,
    profileKey: summary.profileKey,
    avatarUrl: summary.avatarUrl,
    answers,
  };
}

/** Test yardımcısı: nesnenin derin anahtar listesi (gizli alan denetimi). */
export function collectKeysDeep(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeysDeep(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeysDeep(nested, keys);
    }
  }
  return keys;
}
