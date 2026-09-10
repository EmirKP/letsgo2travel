export type ModerationAction = 'visible' | 'pending_review';

const RISKY_CATEGORIES = [
  'vize', 'sinir', 'sınır', 'kimlikle giris', 'kimlikle giriş', 
  'pasaport gecmisi', 'pasaport geçmişi', 'vize reddi', 'randevu boslugu', 'randevu boşluğu',
  'giriste sorun', 'girişte sorun', 'konsolosluk', 'visa refusal', 'border control', 'passport history', 'visa appointment'
];

const ABSOLUTE_TERMS = [
  'kesin girersin', 'kesin alirlar', 'kesin alırlar', 'asla sorun olmaz',
  'garanti vize', 'bunu yaparsan garanti', 'kesin sokarlar', 'kesin sokmazlar',
  'kesin vize alırsın', 'garanti alırlar', 'garanti alirlar', 'kesin vize alirsin',
  'guaranteed visa', 'guaranteed entry', 'you will definitely get a visa'
];

const ILLEGAL_TERMS = [
  'sahte belge', 'kacak gec', 'kaçak geç', 'rusvet', 'rüşvet', 'kacak calisma', 'kaçak çalışma',
  'fake passport', 'forged passport', 'forged documents', 'bribe the officer', 'bribe border'
];

const PROFANITY = [
  // Short forms must be complete tokens: "aq" must not match "aquarium".
  // ASCII "pic" is deliberately omitted: it is also an ordinary English word.
  'amk', 'aq', 'siktir', 'orospu', 'piç', 'siktimin', 'sikeyim',
  'fuck', 'fucking', 'motherfucker', 'asshole', 'bitch', 'bastard', 'kill yourself'
];

export interface ModerationResult {
  action: ModerationAction;
  flaggedTerms: string[];
  isIllegalOrProfane: boolean;
}

export function moderateUserText(text: string): ModerationResult {
  const lowerText = text.normalize('NFKC').toLowerCase().replace(/\u0307/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ');
  const result: ModerationResult = { action: 'visible', flaggedTerms: [], isIllegalOrProfane: false };

  const containsTerm = (term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    // Keep Turkish letters distinct (piç != pic) and recognize punctuation boundaries.
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(lowerText);
  };

  // Check Illegal/Profanity
  for (const term of [...ILLEGAL_TERMS, ...PROFANITY]) {
    if (containsTerm(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
      result.isIllegalOrProfane = true;
    }
  }

  // Check Absolute Terms
  for (const term of ABSOLUTE_TERMS) {
    if (containsTerm(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
    }
  }

  // Check Risky Categories (Optional - could just flag, but request says pending_review)
  for (const term of RISKY_CATEGORIES) {
    if (containsTerm(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
    }
  }

  return result;
}
