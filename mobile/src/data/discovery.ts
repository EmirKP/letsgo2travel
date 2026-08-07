export type DiscoveryDestination = {
  name: string;
  country: string;
  alpha3: string;
  code: string;
  flag: string;
  tag: string;
  entry: string;
  description: string;
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
    gradient: "linear-gradient(145deg,#6b345b,#172b50)",
  },
];

export function dailyDiscovery() {
  const day = Math.floor(Date.now() / 86_400_000);
  return DISCOVERY_DESTINATIONS[day % DISCOVERY_DESTINATIONS.length];
}
