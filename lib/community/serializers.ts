// Topluluk (Kaşifler Ligi forumu) HERKESE AÇIK yanıt serileştiricileri.
// Beyaz-liste yaklaşımı: yalnız burada adı geçen alanlar yanıtta yer alır.
// user_id, e-posta veya profil gizli alanları HİÇBİR koşulda dönmez —
// satırda fazladan alan olsa bile kopyalanmaz (testle güvence altında).

type Unknown = Record<string, unknown>;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export type PublicAnswer = {
  id: string;
  body: string;
  createdAt: string;
  username: string;
};

export type PublicQuestionSummary = {
  id: string;
  countryCode: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  username: string;
  answerCount: number;
};

export type PublicQuestionDetail = Omit<PublicQuestionSummary, "answerCount"> & {
  answers: PublicAnswer[];
};

export function serializeAnswer(row: Unknown, username: string | null | undefined): PublicAnswer {
  return {
    id: text(row.id, 80),
    body: text(row.body, 10_000),
    createdAt: text(row.created_at, 40),
    username: username || "anonim_gezgin",
  };
}

export function serializeQuestionSummary(
  row: Unknown,
  username: string | null | undefined,
  answerCount: number,
): PublicQuestionSummary {
  return {
    id: text(row.id, 80),
    countryCode: text(row.country_code, 8),
    title: text(row.title, 300),
    body: text(row.body, 10_000),
    category: text(row.category, 60),
    createdAt: text(row.created_at, 40),
    username: username || "anonim_gezgin",
    answerCount: Number.isFinite(answerCount) ? Math.max(0, Math.floor(answerCount)) : 0,
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
    countryCode: summary.countryCode,
    title: summary.title,
    body: summary.body,
    category: summary.category,
    createdAt: summary.createdAt,
    username: summary.username,
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
