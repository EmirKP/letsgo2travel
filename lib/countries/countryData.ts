export type VisaStatus = 'kimlikle' | 'vizesiz' | 'e_vize' | 'kapida_vize' | 'vize_gerekli' | 'bilgi_yok';

export interface CountryData {
  code: string;
  nameTR: string;
  slug: string;
  region: string;
  visaStatus: VisaStatus;
  flagEmoji: string;
  hasVisaCenterPage: boolean;
}

export const COUNTRIES: CountryData[] = [
  { code: 'AL', nameTR: 'Arnavutluk', slug: 'arnavutluk', region: 'Balkanlar', visaStatus: 'vizesiz', flagEmoji: '🇦🇱', hasVisaCenterPage: false },
  { code: 'XK', nameTR: 'Kosova', slug: 'kosova', region: 'Balkanlar', visaStatus: 'vizesiz', flagEmoji: '🇽🇰', hasVisaCenterPage: false },
  { code: 'MD', nameTR: 'Moldova', slug: 'moldova', region: 'Doğu Avrupa', visaStatus: 'kimlikle', flagEmoji: '🇲🇩', hasVisaCenterPage: false },
  { code: 'AZ', nameTR: 'Azerbaycan', slug: 'azerbaycan', region: 'Kafkaslar', visaStatus: 'kimlikle', flagEmoji: '🇦🇿', hasVisaCenterPage: false },
  { code: 'GE', nameTR: 'Gürcistan', slug: 'gurcistan', region: 'Kafkaslar', visaStatus: 'kimlikle', flagEmoji: '🇬🇪', hasVisaCenterPage: false },
  { code: 'FR', nameTR: 'Fransa', slug: 'fransa', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇫🇷', hasVisaCenterPage: true },
  { code: 'DE', nameTR: 'Almanya', slug: 'almanya', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇩🇪', hasVisaCenterPage: true },
  { code: 'IT', nameTR: 'İtalya', slug: 'italya', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇮🇹', hasVisaCenterPage: true },
  { code: 'NL', nameTR: 'Hollanda', slug: 'hollanda', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇳🇱', hasVisaCenterPage: true },
  { code: 'GB', nameTR: 'İngiltere', slug: 'ingiltere', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇬🇧', hasVisaCenterPage: true },
  { code: 'US', nameTR: 'ABD', slug: 'abd', region: 'Kuzey Amerika', visaStatus: 'vize_gerekli', flagEmoji: '🇺🇸', hasVisaCenterPage: true },
  { code: 'AE', nameTR: 'BAE', slug: 'bae', region: 'Orta Doğu', visaStatus: 'e_vize', flagEmoji: '🇦🇪', hasVisaCenterPage: true },
  { code: 'GR', nameTR: 'Yunanistan', slug: 'yunanistan', region: 'Avrupa', visaStatus: 'vize_gerekli', flagEmoji: '🇬🇷', hasVisaCenterPage: true },
  { code: 'EG', nameTR: 'Mısır', slug: 'misir', region: 'Afrika', visaStatus: 'kapida_vize', flagEmoji: '🇪🇬', hasVisaCenterPage: false }
];

export function getCountryByCode(code: string): CountryData | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function getCountryBySlug(slug: string): CountryData | undefined {
  return COUNTRIES.find((c) => c.slug === slug);
}
