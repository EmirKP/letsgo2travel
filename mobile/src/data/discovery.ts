export type DiscoveryDestination = {
  name: string;
  country: string;
  alpha3: string;
  code: string;
  flag: string;
  tag: string;
  entry: string;
  description: string;
  bestMonths: string;
  budget: string;
  highlights: string[];
  localTip: string;
  gradient: string;
};

export const DISCOVERY_DESTINATIONS: DiscoveryDestination[] = [
  {
    name: "Tiflis",
    country: "Gürcistan",
    alpha3: "GEO",
    code: "TBS",
    flag: "🇬🇪",
    tag: "Yeme-içme · Kültür",
    entry: "Kimlikle",
    description: "Eski şehir, güçlü mutfak kültürü ve kısa kaçamak için dengeli maliyetler.",
    bestMonths: "Nisan–Haziran · Eylül–Ekim",
    budget: "Ekonomik–orta",
    highlights: ["Eski Tiflis sokakları", "Kükürt hamamları", "Gürcü mutfağı"],
    localTip: "Sololaki'den başlayıp eski şehre yürüyerek inmek, şehri ilk kez keşfetmek için güçlü bir başlangıç.",
    gradient: "linear-gradient(145deg,#173f52,#0b263d)",
  },
  {
    name: "Bakü",
    country: "Azerbaycan",
    alpha3: "AZE",
    code: "GYD",
    flag: "🇦🇿",
    tag: "Şehir · İlk seyahat",
    entry: "Kimlikle",
    description: "Kısa uçuş, yürünebilir merkez ve modern şehir deneyimi.",
    bestMonths: "Nisan–Haziran · Eylül",
    budget: "Orta",
    highlights: ["İçerişehir", "Alev Kuleleri", "Hazar kıyısı"],
    localTip: "İçerişehir ve sahil bulvarını aynı güne koy; akşam ışıklarında şehir bambaşka görünür.",
    gradient: "linear-gradient(145deg,#244a74,#0a2440)",
  },
  {
    name: "Saraybosna",
    country: "Bosna Hersek",
    alpha3: "BIH",
    code: "SJJ",
    flag: "🇧🇦",
    tag: "Tarih · Doğa",
    entry: "Vizesiz",
    description: "Başçarşı'dan Mostar'a uzanan bütçe dostu Balkan rotası.",
    bestMonths: "Mayıs–Haziran · Eylül",
    budget: "Ekonomik",
    highlights: ["Başçarşı", "Latin Köprüsü", "Mostar günübirlik rotası"],
    localTip: "Şehir merkezini yürüyerek keşfet; Mostar için sabah erken otobüs daha uzun bir gün kazandırır.",
    gradient: "linear-gradient(145deg,#3e664b,#123b3c)",
  },
  {
    name: "Belgrad",
    country: "Sırbistan",
    alpha3: "SRB",
    code: "BEG",
    flag: "🇷🇸",
    tag: "Şehir · Gece hayatı",
    entry: "Vizesiz",
    description: "Nehir kıyısı, canlı sokaklar ve kolay şehir içi ulaşım.",
    bestMonths: "Nisan–Haziran · Eylül–Ekim",
    budget: "Ekonomik–orta",
    highlights: ["Kalemegdan", "Zemun", "Sava ve Tuna kıyıları"],
    localTip: "Merkez ve Kalemegdan'ı yürüyerek, Zemun'u toplu taşımayla ayrı yarım gün olarak planla.",
    gradient: "linear-gradient(145deg,#6a3f57,#292944)",
  },
  {
    name: "Tiran",
    country: "Arnavutluk",
    alpha3: "ALB",
    code: "TIA",
    flag: "🇦🇱",
    tag: "Deniz · Ekonomik",
    entry: "Vizesiz",
    description: "Tiran şehir keşfini Ksamil kıyılarıyla birleştiren esnek rota.",
    bestMonths: "Mayıs–Haziran · Eylül",
    budget: "Ekonomik",
    highlights: ["İskender Bey Meydanı", "Blloku", "Arnavutluk Rivierası"],
    localTip: "Deniz planın varsa Tiran'ı bir geceyle sınırlayıp kıyı rotasına daha fazla zaman ayır.",
    gradient: "linear-gradient(145deg,#19677b,#113452)",
  },
  {
    name: "Tokyo",
    country: "Japonya",
    alpha3: "JPN",
    code: "TYO",
    flag: "🇯🇵",
    tag: "Kültür · Uzak rota",
    entry: "Vizesiz",
    description: "Gelenek, teknoloji ve gastronomiyi aynı seyahatte buluşturan büyük keşif.",
    bestMonths: "Mart–Mayıs · Ekim–Kasım",
    budget: "Yüksek",
    highlights: ["Asakusa", "Shibuya", "Yerel mahalle pazarları"],
    localTip: "Aynı gün içinde uzak semtleri karıştırma; Tokyo'yu bölgelere ayırmak hem süreyi hem ulaşım maliyetini azaltır.",
    gradient: "linear-gradient(145deg,#6b345b,#172b50)",
  },
];

const DISCOVERY_EN: Record<string, Partial<DiscoveryDestination>> = {
  TBS: {
    name: "Tbilisi", country: "Georgia", tag: "Food · Culture", entry: "Entry with Turkish ID card",
    description: "An old town, a strong food culture and balanced costs for a short break.", bestMonths: "April–June · September–October", budget: "Economy–mid-range",
    highlights: ["Old Tbilisi streets", "Sulphur baths", "Georgian cuisine"],
    localTip: "Start in Sololaki and walk down into the old town for a rewarding first look at the city.",
  },
  GYD: {
    name: "Baku", country: "Azerbaijan", tag: "City · First trip", entry: "Entry with Turkish ID card",
    description: "A short flight, walkable centre and modern city experience.", bestMonths: "April–June · September", budget: "Mid-range",
    highlights: ["Old City", "Flame Towers", "Caspian waterfront"],
    localTip: "Pair the Old City with the waterfront boulevard; the evening lights reveal a different side of Baku.",
  },
  SJJ: {
    name: "Sarajevo", country: "Bosnia and Herzegovina", tag: "History · Nature", entry: "Visa-free",
    description: "An affordable Balkan route from Baščaršija to Mostar.", bestMonths: "May–June · September", budget: "Economy",
    highlights: ["Baščaršija", "Latin Bridge", "Mostar day trip"],
    localTip: "Explore the centre on foot and take an early bus to make the most of a Mostar day trip.",
  },
  BEG: {
    name: "Belgrade", country: "Serbia", tag: "City · Nightlife", entry: "Visa-free",
    description: "Riverfronts, lively streets and straightforward city transport.", bestMonths: "April–June · September–October", budget: "Economy–mid-range",
    highlights: ["Kalemegdan", "Zemun", "Sava and Danube riverfronts"],
    localTip: "Walk the centre and Kalemegdan, then plan Zemun as a separate half-day by public transport.",
  },
  TIA: {
    name: "Tirana", country: "Albania", tag: "Coast · Economy", entry: "Visa-free",
    description: "A flexible route combining Tirana with the beaches around Ksamil.", bestMonths: "May–June · September", budget: "Economy",
    highlights: ["Skanderbeg Square", "Blloku", "Albanian Riviera"],
    localTip: "If the coast is your priority, keep Tirana to one night and leave more time for the Riviera.",
  },
  TYO: {
    name: "Tokyo", country: "Japan", tag: "Culture · Long-haul", entry: "Visa-free",
    description: "A major trip combining tradition, technology and food.", bestMonths: "March–May · October–November", budget: "Premium",
    highlights: ["Asakusa", "Shibuya", "Neighbourhood markets"],
    localTip: "Group nearby districts on the same day; it saves both time and transport cost in Tokyo.",
  },
};

const DISCOVERY_SQ: Record<string, Partial<DiscoveryDestination>> = {
  TBS: { name: 'Tbilisi', country: 'Gjeorgjia', tag: 'Ushqim · Kulturë', entry: 'Hyrje me letërnjoftim turk', description: 'Qytet i vjetër, kuzhinë e pasur dhe kosto të përballueshme për një pushim të shkurtër.', bestMonths: 'Prill–Qershor · Shtator–Tetor', budget: 'Ekonomik–mesatar', highlights: ['Rrugët e Tbilisit të vjetër', 'Banjat e squfurit', 'Kuzhina gjeorgjiane'], localTip: 'Fillo nga Sololaki dhe zbrit në këmbë drejt qytetit të vjetër për një njohje të bukur me qytetin.' },
  GYD: { name: 'Baku', country: 'Azerbajxhani', tag: 'Qytet · Udhëtimi i parë', entry: 'Hyrje me letërnjoftim turk', description: 'Fluturim i shkurtër, qendër që përshkohet në këmbë dhe përvojë qytetare moderne.', bestMonths: 'Prill–Qershor · Shtator', budget: 'Mesatar', highlights: ['Qyteti i vjetër', 'Kullat e Flakës', 'Bregu i Kaspikut'], localTip: 'Bashko vizitën në qytetin e vjetër me bulevardin buzë detit; dritat e mbrëmjes zbulojnë një tjetër anë të Bakut.' },
  SJJ: { name: 'Sarajeva', country: 'Bosnjë-Hercegovina', tag: 'Histori · Natyrë', entry: 'Pa vizë', description: 'Një itinerar ballkanik me kosto të përballueshme, nga Baščaršija deri në Mostar.', bestMonths: 'Maj–Qershor · Shtator', budget: 'Ekonomik', highlights: ['Baščaršija', 'Ura Latine', 'Ekskursion ditor në Mostar'], localTip: 'Eksploro qendrën në këmbë dhe nisu herët me autobus për të shijuar sa më shumë ditën në Mostar.' },
  BEG: { name: 'Beogradi', country: 'Serbia', tag: 'Qytet · Jetë nate', entry: 'Pa vizë', description: 'Brigje lumenjsh, rrugë të gjalla dhe transport qytetar i thjeshtë.', bestMonths: 'Prill–Qershor · Shtator–Tetor', budget: 'Ekonomik–mesatar', highlights: ['Kalemegdan', 'Zemun', 'Brigjet e Savës dhe Danubit'], localTip: 'Shëtit qendrën dhe Kalemegdanin në këmbë; për Zemunin lër veçmas një gjysmë dite me transport publik.' },
  TIA: { name: 'Tirana', country: 'Shqipëria', tag: 'Bregdet · Ekonomik', entry: 'Pa vizë', description: 'Një itinerar fleksibël që bashkon Tiranën me plazhet rreth Ksamilit.', bestMonths: 'Maj–Qershor · Shtator', budget: 'Ekonomik', highlights: ['Sheshi Skënderbej', 'Blloku', 'Riviera shqiptare'], localTip: 'Nëse bregdeti është përparësia jote, qëndro një natë në Tiranë dhe lër më shumë kohë për Rivierën.' },
  TYO: { name: 'Tokio', country: 'Japonia', tag: 'Kulturë · Udhëtim i largët', entry: 'Pa vizë', description: 'Një udhëtim i madh që bashkon traditën, teknologjinë dhe kuzhinën.', bestMonths: 'Mars–Maj · Tetor–Nëntor', budget: 'I lartë', highlights: ['Asakusa', 'Shibuya', 'Tregjet e lagjeve'], localTip: 'Vizito lagjet pranë njëra-tjetrës në të njëjtën ditë; kështu kursen kohë dhe kosto transporti në Tokio.' },
};

export function localizedDiscovery(destination: DiscoveryDestination, locale: "tr" | "en" | "sq" = "tr"): DiscoveryDestination {
  if (locale === "tr") return destination;
  const translated = (locale === 'sq' ? DISCOVERY_SQ : DISCOVERY_EN)[destination.code];
  return translated ? { ...destination, ...translated } : destination;
}

export function dailyDiscovery() {
  const day = Math.floor(Date.now() / 86_400_000);
  return DISCOVERY_DESTINATIONS[day % DISCOVERY_DESTINATIONS.length];
}
