import type { GuideCard } from './types';

// EU framework only: national thresholds and special territories are not inferred.
const euTaxFree: Omit<GuideCard, 'country'> = {
  category: 'tax-free', verifiedAt: '2026-09-26', reviewAfter: '2026-12-25',
  sourceUrl: 'https://europa.eu/youreurope/citizens/consumers/shopping/vat/index_en.htm',
  title: { tr: 'Tax Free — AB genel çerçevesi', en: 'Tax Free — EU framework' },
  text: {
    tr: 'AB dışında ikamet eden ziyaretçiler uygun ürünlerde KDV iadesi alabilir. Ürünleri ve iade belgelerini alışverişten itibaren 3 ay içinde AB çıkışında gümrüğe sun; dijital veya fiziksel onay gerekir. Asgari tutar, mağazanın katılımı, kesintiler ve özel bölgelerin kuralları farklı olabilir. Bu kart ulusal tutar eşiğini doğrulamaz; satın almadan önce mağazadan ve gümrükten kontrol et.',
    en: 'Visitors resident outside the EU may qualify for VAT refunds on eligible goods. Present goods and refund documents to customs when leaving the EU within 3 months of purchase; digital or physical validation is required. Minimum spending, shop participation, fees and special territories can differ. This card does not verify a national spending threshold; check with the shop and customs before buying.',
  },
};

export const EXPANDED_GUIDES: GuideCard[] = [
  ...['DE','IT','ES','PT','BE','AT','GR','IE','DK','SE','FI','PL','CZ','HU','HR'].map(country => ({ ...euTaxFree, country })),
  {
    country: 'SG', category: 'water', status: 'drinkable', verifiedAt: '2026-09-26', reviewAfter: '2026-12-25',
    sourceUrl: 'https://www.pub.gov.sg/Public/WaterLoop/Water-Quality/Drinking-Water',
    title: { tr: 'Şebeke suyu içilebilir', en: 'Tap water is drinkable' },
    text: {
      tr: 'PUB, şebeke suyunun doğrudan içmeye uygun olduğunu bildiriyor. Bu bilgi deniz, havuz veya içilemez işaretli kaynakları kapsamaz. Geçici yerel su uyarılarına uy.',
      en: 'PUB reports that tap water is suitable for drinking directly. This does not cover seawater, pools or outlets marked non-potable. Follow temporary local water notices.',
    },
  },
];
