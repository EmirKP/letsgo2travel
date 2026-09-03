export type EssentialPhrase = {
  id: string;
  tr: string;
  en: string;
  local: string;
  phonetic: string;
};

export type EtiquetteRule = {
  id: string;
  icon: "info" | "alert" | "check";
  tr: string;
  en: string;
};

export type TravelEssentialProfile = {
  code: string;
  flag: string;
  nameTr: string;
  nameEn: string;
  languageTr: string;
  languageEn: string;
  phrases: EssentialPhrase[];
  etiquette: EtiquetteRule[];
};

const labels = [
  ["help", "Yardıma ihtiyacım var.", "I need help."],
  ["hospital", "Hastaneye gitmem gerekiyor.", "I need to go to a hospital."],
  ["allergy", "Bu yemekte alerjen var mı?", "Does this food contain allergens?"],
  ["airport", "Havalimanına gitmek istiyorum.", "I want to go to the airport."],
  ["bill", "Hesabı alabilir miyim?", "Could I have the bill, please?"],
] as const;

function phrases(values: Array<[string, string]>) {
  return labels.map(([id, tr, en], index) => ({ id, tr, en, local: values[index]?.[0] || en, phonetic: values[index]?.[1] || "" }));
}

export const TRAVEL_ESSENTIALS: TravelEssentialProfile[] = [
  {
    code: "XK", flag: "🇽🇰", nameTr: "Kosova", nameEn: "Kosovo", languageTr: "Arnavutça", languageEn: "Albanian",
    phrases: phrases([
      ["Kam nevojë për ndihmë.", "kam ne-vo-ye per nee-he-me"],
      ["Duhet të shkoj në spital.", "doo-het te sh-koy ne spee-tal"],
      ["A ka alergjenë në këtë ushqim?", "a ka a-ler-gye-ne ne ke-te oosh-cheem"],
      ["Dua të shkoj në aeroport.", "doo-a te sh-koy ne a-e-ro-port"],
      ["A mund ta marr faturën?", "a moond ta marr fa-too-ren"],
    ]),
    etiquette: [
      { id: "cash", icon: "info", tr: "Euro kullanılır; küçük işletmelerde nakit bulundurmak faydalıdır.", en: "The euro is used; carrying cash helps at smaller businesses." },
      { id: "religion", icon: "check", tr: "Cami, kilise ve manastır ziyaretlerinde ölçülü giyin.", en: "Dress modestly when visiting mosques, churches and monasteries." },
      { id: "politics", icon: "alert", tr: "Siyasi ve etnik konuları açarken yerel hassasiyetlere saygı göster.", en: "Be respectful of local sensitivities when discussing political or ethnic topics." },
    ],
  },
  {
    code: "DE", flag: "🇩🇪", nameTr: "Almanya", nameEn: "Germany", languageTr: "Almanca", languageEn: "German",
    phrases: phrases([
      ["Ich brauche Hilfe.", "ih brau-he hil-fe"],
      ["Ich muss ins Krankenhaus.", "ih moos ins kran-ken-haus"],
      ["Enthält dieses Essen Allergene?", "ent-helt dee-zes es-en a-ler-ge-ne"],
      ["Ich möchte zum Flughafen.", "ih möh-te tsoom floog-ha-fen"],
      ["Die Rechnung, bitte.", "dee reh-noong bit-te"],
    ]),
    etiquette: [
      { id: "time", icon: "check", tr: "Randevulara ve rezervasyon saatlerine dakik gitmek önemlidir.", en: "Punctuality matters for appointments and reservations." },
      { id: "quiet", icon: "info", tr: "Pazar günleri ve gece saatlerinde sessizlik kurallarına dikkat et.", en: "Observe quiet-hour rules at night and on Sundays." },
      { id: "cash", icon: "info", tr: "Kart yaygın olsa da bazı küçük işletmeler yalnız nakit kabul eder.", en: "Cards are common, but some small businesses still accept cash only." },
    ],
  },
  {
    code: "IT", flag: "🇮🇹", nameTr: "İtalya", nameEn: "Italy", languageTr: "İtalyanca", languageEn: "Italian",
    phrases: phrases([
      ["Ho bisogno di aiuto.", "o bee-zon-yo dee a-yoo-to"],
      ["Devo andare in ospedale.", "de-vo an-da-re een os-pe-da-le"],
      ["Questo piatto contiene allergeni?", "kwe-sto pee-at-to kon-tee-e-ne al-ler-ge-nee"],
      ["Vorrei andare all'aeroporto.", "vor-rey an-da-re al-la-e-ro-por-to"],
      ["Il conto, per favore.", "eel kon-to per fa-vo-re"],
    ]),
    etiquette: [
      { id: "church", icon: "check", tr: "Kiliselerde omuz ve dizleri örten kıyafet tercih et.", en: "Cover shoulders and knees when entering churches." },
      { id: "coffee", icon: "info", tr: "Bar tezgâhında kahve içmek masaya servisten genellikle daha ucuzdur.", en: "Coffee at the bar is usually cheaper than table service." },
      { id: "fountain", icon: "alert", tr: "Tarihî çeşme ve anıtlara girmek ya da oturmak para cezasına yol açabilir.", en: "Entering or sitting on historic fountains and monuments may lead to fines." },
    ],
  },
  {
    code: "FR", flag: "🇫🇷", nameTr: "Fransa", nameEn: "France", languageTr: "Fransızca", languageEn: "French",
    phrases: phrases([
      ["J'ai besoin d'aide.", "je be-zwen ded"],
      ["Je dois aller à l'hôpital.", "je dwa a-le a lo-pee-tal"],
      ["Ce plat contient-il des allergènes?", "se pla kon-tyen eel dez a-ler-jen"],
      ["Je voudrais aller à l'aéroport.", "je voo-dre a-le a la-e-ro-por"],
      ["L'addition, s'il vous plaît.", "la-dee-syon seel voo ple"],
    ]),
    etiquette: [
      { id: "hello", icon: "check", tr: "Bir mağaza veya kafeye girerken “Bonjour” demek temel nezakettir.", en: "Saying “Bonjour” when entering a shop or café is basic courtesy." },
      { id: "voice", icon: "info", tr: "Toplu taşımada ve küçük restoranlarda ses tonunu düşük tut.", en: "Keep your voice low on public transport and in small restaurants." },
      { id: "ticket", icon: "alert", tr: "Toplu taşıma biletini yolculuk bitene kadar sakla.", en: "Keep your public transport ticket until the journey is complete." },
    ],
  },
  {
    code: "ES", flag: "🇪🇸", nameTr: "İspanya", nameEn: "Spain", languageTr: "İspanyolca", languageEn: "Spanish",
    phrases: phrases([
      ["Necesito ayuda.", "ne-se-see-to a-yoo-da"],
      ["Necesito ir al hospital.", "ne-se-see-to eer al os-pee-tal"],
      ["¿Este plato contiene alérgenos?", "es-te pla-to kon-tye-ne a-ler-he-nos"],
      ["Quiero ir al aeropuerto.", "kye-ro eer al a-e-ro-pwer-to"],
      ["La cuenta, por favor.", "la kwen-ta por fa-vor"],
    ]),
    etiquette: [
      { id: "hours", icon: "info", tr: "Yemek saatleri Türkiye'ye göre daha geç olabilir; rezervasyon saatini kontrol et.", en: "Meal times can be later than you expect; check reservation hours." },
      { id: "siesta", icon: "info", tr: "Küçük şehirlerde bazı işletmeler öğleden sonra kapanabilir.", en: "Some businesses in smaller towns may close in the afternoon." },
      { id: "beach", icon: "alert", tr: "Bazı şehirlerde plaj kıyafetiyle merkez sokaklarında dolaşmak ceza konusu olabilir.", en: "Some cities may fine visitors for wearing beachwear away from the beach." },
    ],
  },
  {
    code: "JP", flag: "🇯🇵", nameTr: "Japonya", nameEn: "Japan", languageTr: "Japonca", languageEn: "Japanese",
    phrases: phrases([
      ["助けが必要です。", "tas-ke ga hee-tsu-yo des"],
      ["病院に行く必要があります。", "byo-in nee ee-ku hee-tsu-yo ga a-ree-mas"],
      ["この料理にアレルゲンはありますか？", "ko-no ryo-ree nee a-re-ru-gen wa a-ree-mas ka"],
      ["空港に行きたいです。", "koo-ko nee ee-kee-tay des"],
      ["お会計をお願いします。", "o-kai-ke o o-ne-gai shee-mas"],
    ]),
    etiquette: [
      { id: "train", icon: "check", tr: "Toplu taşımada telefonla konuşma ve yüksek sesle sohbet etme.", en: "Avoid phone calls and loud conversation on public transport." },
      { id: "queue", icon: "check", tr: "Tren ve mağaza kuyruklarında işaretli sırayı takip et.", en: "Follow marked queues at stations and shops." },
      { id: "trash", icon: "info", tr: "Kamusal çöp kutuları azdır; küçük çöpünü yanında taşıman gerekebilir.", en: "Public bins are scarce, so you may need to carry small waste with you." },
    ],
  },
  {
    code: "TH", flag: "🇹🇭", nameTr: "Tayland", nameEn: "Thailand", languageTr: "Tayca", languageEn: "Thai",
    phrases: phrases([
      ["ฉันต้องการความช่วยเหลือ", "chan tong-kan kwam chuay-luea"],
      ["ฉันต้องไปโรงพยาบาล", "chan tong pai rong-pha-ya-ban"],
      ["อาหารนี้มีสารก่อภูมิแพ้ไหม", "a-han nee mee san ko phum-phae mai"],
      ["ฉันต้องการไปสนามบิน", "chan tong-kan pai sa-nam-bin"],
      ["ขอเช็คบิลด้วย", "kho chek bin duay"],
    ]),
    etiquette: [
      { id: "temple", icon: "check", tr: "Tapınaklarda omuz ve dizlerini ört; ayakkabı uyarılarını takip et.", en: "Cover shoulders and knees at temples and follow shoe signs." },
      { id: "head", icon: "alert", tr: "İnsanların başına dokunmak ve ayağınla bir şeyi işaret etmek kaba kabul edilir.", en: "Touching someone's head or pointing with your foot is considered rude." },
      { id: "monarchy", icon: "alert", tr: "Kraliyet ailesiyle ilgili ifadelerde yasal ve kültürel hassasiyet vardır.", en: "Comments about the royal family carry legal and cultural sensitivities." },
    ],
  },
  {
    code: "GB", flag: "🇬🇧", nameTr: "Birleşik Krallık", nameEn: "United Kingdom", languageTr: "İngilizce", languageEn: "English",
    phrases: phrases(labels.map(([, , en]) => [en, ""])),
    etiquette: [
      { id: "queue", icon: "check", tr: "Kuyruk düzenine uymak önemlidir; sırayı atlama.", en: "Queue etiquette matters; do not cut in line." },
      { id: "road", icon: "alert", tr: "Trafik soldan akar; karşıya geçerken iki yönü de kontrol et.", en: "Traffic drives on the left; check both directions before crossing." },
      { id: "service", icon: "info", tr: "Hesapta servis ücreti varsa ayrıca bahşiş bırakman gerekmez.", en: "If the bill includes a service charge, an extra tip is not expected." },
    ],
  },
];

export function essentialProfile(code: string) {
  return TRAVEL_ESSENTIALS.find((profile) => profile.code === code) || TRAVEL_ESSENTIALS[0];
}
