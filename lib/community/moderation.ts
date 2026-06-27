export type ModerationAction = 'visible' | 'pending_review';

const RISKY_CATEGORIES = [
  'vize', 'sinir', 'sınır', 'kimlikle giris', 'kimlikle giriş', 
  'pasaport gecmisi', 'pasaport geçmişi', 'vize reddi', 'randevu boslugu', 'randevu boşluğu',
  'giriste sorun', 'girişte sorun', 'konsolosluk'
];

const ABSOLUTE_TERMS = [
  'kesin girersin', 'kesin alirlar', 'kesin alırlar', 'asla sorun olmaz',
  'garanti vize', 'bunu yaparsan garanti', 'kesin sokarlar', 'kesin sokmazlar',
  'kesin vize alırsın', 'garanti alırlar', 'garanti alirlar', 'kesin vize alirsin'
];

const ILLEGAL_TERMS = [
  'sahte belge', 'kacak gec', 'kaçak geç', 'rusvet', 'rüşvet', 'illegal', 'kacak calisma', 'kaçak çalışma'
];

const PROFANITY = [
  // Küfür filtre listesi (proje büyüdükçe genişletilebilir)
  'amk', 'aq', 'siktir', 'orospu', 'pic', 'piç'
];

export interface ModerationResult {
  action: ModerationAction;
  flaggedTerms: string[];
  isIllegalOrProfane: boolean;
}

export function moderateUserText(text: string): ModerationResult {
  const lowerText = text.toLowerCase();
  const result: ModerationResult = { action: 'visible', flaggedTerms: [], isIllegalOrProfane: false };

  // Check Illegal/Profanity
  for (const term of [...ILLEGAL_TERMS, ...PROFANITY]) {
    if (lowerText.includes(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
      result.isIllegalOrProfane = true;
    }
  }

  // Check Absolute Terms
  for (const term of ABSOLUTE_TERMS) {
    if (lowerText.includes(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
    }
  }

  // Check Risky Categories (Optional - could just flag, but request says pending_review)
  for (const term of RISKY_CATEGORIES) {
    if (lowerText.includes(term)) {
      result.action = 'pending_review';
      result.flaggedTerms.push(term);
    }
  }

  return result;
}
