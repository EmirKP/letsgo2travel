import type { GuideCard } from './types';
import { EMBASSIES } from './embassies';
import { EXPANDED_GUIDES } from './guide-expansion';
export { EMBASSIES } from './embassies';

// Bundled, versioned records: missing coverage is never inferred from neighbours.
export const GUIDE_VERSION = '2026-09-16';
export const GUIDE_CARDS: GuideCard[] = [
  ...EXPANDED_GUIDES,
  { country:'TH', category:'law', verifiedAt:GUIDE_VERSION,
    sourceUrl:'https://www.gov.uk/foreign-travel-advice/thailand/safety-and-security',
    title:{tr:'Kraliyetle ilgili ifadeler',en:'Comments about the monarchy'},
    text:{tr:'Kraliyeti eleştirmek suçtur; çevrimiçi paylaşımlar da kapsamda olabilir. Bu bir nezaket önerisi değil, ciddi yaptırımları olan yasal bir kısıtlamadır.',en:'Criticising the monarchy is illegal, including potentially online posts. This is a legal restriction with serious penalties, not merely an etiquette suggestion.'} },
  { country:'AE', category:'law', verifiedAt:GUIDE_VERSION,
    sourceUrl:'https://www.gov.uk/foreign-travel-advice/united-arab-emirates/safety-and-security',
    title:{tr:'Fotoğraf ve kamusal alanda alkol',en:'Photography and public alcohol use'},
    text:{tr:'İnsanları izinsiz fotoğraflama; askerî ve bazı resmî binaları çekmek yasaktır. Kamusal alanda alkol içmek veya etkisi altında olmak yasaktır. İçki izinleri ve diğer koşullar emirliğe göre değişebilir.',en:'Do not photograph people without permission; photography of military and certain official buildings is prohibited. Drinking or being under the influence in public is illegal. Licensing and other conditions vary by emirate.'} },
  { country:'ES', category:'law', verifiedAt:GUIDE_VERSION,
    sourceUrl:'https://www.gov.uk/foreign-travel-advice/spain/safety-and-security',
    title:{tr:'Plaj dışındaki kıyafet kuralları',en:'Clothing away from the beach'},
    text:{tr:'Bazı bölgelerde sokakta yalnız mayo veya bikiniyle dolaşmak yasaktır ve ceza uygulanabilir. Kural ülke genelinde aynı değildir; bulunduğun belediyenin işaret ve kurallarını kontrol et.',en:'Some areas prohibit wearing only swimwear in streets and may issue fines. This is not a uniform nationwide rule; check local municipal signs and requirements.'} },
  { country:'IT', category:'law', verifiedAt:GUIDE_VERSION,
    sourceUrl:'https://www.gov.uk/foreign-travel-advice/italy/safety-and-security',
    title:{tr:'Tarihî alanlardaki yerel yasaklar',en:'Local restrictions at historic sites'},
    text:{tr:'Roma ve Floransa dahil birçok şehirde halka açık çeşmelere girmek veya yıkanmak yasaktır. Anıt basamaklarına oturma gibi ek belediye kuralları bulunabilir. Yerel işaretleri kontrol et.',en:'Entering or bathing in public fountains is prohibited in many cities, including Rome and Florence. Additional municipal rules may restrict sitting on monument steps. Check local signs.'} },
  { country:'JP', category:'culture', verifiedAt:GUIDE_VERSION,
    sourceUrl:'https://www.japan.travel/en/plan/tipping-in-japan/',
    title:{tr:'Bahşiş kültürü',en:'Tipping customs'},
    text:{tr:'Restoran, taksi ve otellerde bahşiş genellikle beklenmez. Bazı özel rehberler farklı uygulayabilir. Bu kültürel bir tavsiyedir, kanuni yasak değildir.',en:'Tips are generally not expected at restaurants, in taxis or at hotels. Some private guides may follow different practices. This is cultural guidance, not a legal prohibition.'} },
  { country: 'JP', category: 'water', status: 'drinkable', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.japan.travel/en/plan/drinking-water/',
    title: { tr: 'Genellikle içilebilir', en: 'Generally drinkable' },
    text: { tr: 'Şebeke suyu genellikle içilebilir. İçilemez işaretlerine ve afet sonrası yerel su duyurularına uy.', en: 'Tap water is generally drinkable. Follow non-potable signs and local water notices after disasters.' } },
  { country: 'DE', category: 'water', status: 'drinkable', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.umweltbundesamt.de/en/topics/water/drinking-water',
    title: { tr: 'Genellikle içilebilir', en: 'Generally drinkable' },
    text: { tr: 'Şebeke suyu sıkı denetime tabidir. Bina tesisatı ve yerel geçici uyarılar farklılık yaratabilir; içilemez işaretli kaynaklardan içme.', en: 'Public drinking water is closely monitored. Building plumbing and temporary local notices can differ; do not drink from outlets marked non-potable.' } },
  { country: 'JP', category: 'tax-free', verifiedAt: GUIDE_VERSION, validUntil: '2026-10-31',
    sourceUrl: 'https://www.japan.travel/en/plan/japans-tax-exemption/',
    title: { tr: 'Tax Free — sistem değişiyor', en: 'Tax Free — system changing' },
    text: { tr: 'Uygun ziyaretçiler katılımcı mağazalarda yararlanabilir. Pasaportunu, belgeleri ve ürünleri hazır tut; güncel asgari tutarı mağazada doğrula. 1 Kasım 2026’dan itibaren çıkışta gümrük doğrulaması sonrası iade modeli başlıyor. Kendi gönderdiğin uluslararası paketler kapsam dışıdır.', en: 'Eligible visitors can use participating stores. Keep your passport, receipts and goods; confirm the current spending threshold. From 1 November 2026, refunds follow export confirmation by Customs. Parcels sent abroad by the buyer are excluded.' } },
  { country: 'GB', category: 'tax-free', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.gov.uk/tax-on-shopping/taxfree-shopping',
    title: { tr: 'Büyük Britanya / Kuzey İrlanda farklı', en: 'Great Britain / Northern Ireland differ' },
    text: { tr: 'İngiltere, İskoçya ve Galler’de bavulla çıkarılan turistik alışverişe genel VAT iadesi yoktur. Mağazanın doğrudan ülke dışına teslimi farklıdır. Kuzey İrlanda’da uygunluk ve ihracat kurallarına bağlı ayrı uygulama vardır; pasaport, ikamet kanıtı ve mağaza formunu kontrol et.', en: 'England, Scotland and Wales have no general tourist VAT refund for goods carried in luggage. Direct overseas delivery by the shop differs. Northern Ireland has a separate scheme subject to eligibility and export rules; check passport, residence evidence and shop forms.' } },
  { country: 'AE', category: 'tax-free', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://tax.gov.ae/en/services/tourist.vat.refunds.aspx',
    title: { tr: 'Turist KDV iadesi', en: 'Tourist VAT refund' },
    text: { tr: 'Uygun, BAE’de ikamet etmeyen turistler katılımcı mağazaları kullanabilir. Vergi hariç işlem başına en az 250 AED; pasaport ve alışveriş kaydı gerekir. Çıkıştan önce ürünleri doğrulama noktasında hazır tut. Süre, ürün istisnaları ve kesintileri resmî sayfadan kontrol et.', en: 'Eligible non-resident tourists can use participating stores. Minimum AED 250 excluding VAT per refund transaction; passport and purchase record are needed. Present goods for validation before departure. Check official deadlines, exclusions and deductions.' } },
  { country: 'FR', category: 'tax-free', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.douane.gouv.fr/fiche/la-detaxe-en-france-pour-les-touristes-pablo',
    title: { tr: 'PABLO ile iade', en: 'PABLO refund' },
    text: { tr: 'AB dışında ikamet eden uygun ziyaretçiler yararlanabilir. Aynı mağazada aynı gün vergi dahil 100 EUR üzeri alışveriş gerekir. Pasaport, ürünler ve barkodlu formu bagaj tesliminden önce PABLO/gümrük doğrulamasına sun. İhracat süresi alışveriş ayını izleyen üçüncü ayın sonudur; ürün istisnalarını kaynaktan kontrol et.', en: 'Eligible visitors resident outside the EU may qualify. Purchases must exceed EUR 100 including tax in the same shop on the same day. Present passport, goods and barcoded form for PABLO/customs validation before checking luggage. Export must be completed by the end of the third month after purchase; check product exclusions.' } },
  { country: 'NL', category: 'tax-free', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://business.gov.nl/finance-and-taxes/vat/vat-rates-and-exemptions/',
    title: { tr: 'Uygun alışverişte KDV iadesi', en: 'VAT refund on eligible purchases' },
    text: { tr: 'AB dışında ikamet eden ziyaretçiler için uygun alışverişte en az 50 EUR eşiği bulunur. Pasaport, fatura ve ürünler ile çıkış işlemlerini kontrol et; mağazanın iade hizmetini ve ihracat süresini resmî kaynaktan doğrula.', en: 'Eligible visitors resident outside the EU face a minimum EUR 50 purchase threshold. Check export procedures with your passport, invoice and goods; verify shop participation and export deadlines in the official guidance.' } },
  { country: 'JP', category: 'hours', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.japan.travel/en/plan/business-hours-and-holidays/',
    title: { tr: 'Genel çalışma saatleri', en: 'Typical business hours' },
    text: { tr: 'Şehir mağazaları genellikle 10.00–20.00, ofisler hafta içi 09.00–17.00 çalışır. Kırsalda daha erken kapanabilir. Bazı marketler 24 saattir. Banka, kamu kurumu, AVM ve restoran için tekil işletme saatini doğrula; tatiller istisnadır.', en: 'Urban shops typically open 10:00–20:00; offices weekdays 09:00–17:00. Rural shops may close earlier. Some convenience stores operate 24 hours. Verify individual banks, public offices, malls and restaurants; holidays are exceptions.' } },
  { country: 'JP', category: 'law', verifiedAt: GUIDE_VERSION,
    sourceUrl: 'https://www.gov.uk/foreign-travel-advice/japan/safety-and-security',
    title: { tr: 'Kimlik taşıma yükümlülüğü', en: 'Carry identification' },
    text: { tr: 'Pasaportunu veya Japonya oturum kartını yanında taşı. Bu bir kültürel tavsiye değil, yasal yükümlülüktür.', en: 'Carry your passport or Japanese residence card. This is a legal requirement, not a cultural suggestion.' } },
];

export const MISSION_DIRECTORIES: Record<string, string> = {
  TR: 'https://www.mfa.gov.tr/yurtdisi-teskilati.tr.mfa',
  GB: 'https://www.gov.uk/world/embassies',
  US: 'https://www.usembassy.gov/',
  DE: 'https://www.auswaertiges-amt.de/en/about-us/auslandsvertretungen',
};
export function embassiesFor(represented: string, host: string) {
  return EMBASSIES.filter(e => e.representedCountry === represented.trim().toUpperCase() && e.hostCountry === host.trim().toUpperCase());
}
