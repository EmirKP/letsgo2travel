export type L2tLocale = "tr" | "en";

export const l2tDictionaries = {
  tr: {
    nav: {
      flights: "Bilet Ara",
      deals: "Fırsatlar",
      passport: "Pasaport Gücü",
      assistant: "Rota Asistanı",
      forum: "Forum",
      more: "Daha Fazla",
      visaFree: "Vizesiz Ülkeler",
      visaCenter: "Vize Merkezi",
      explorers: "Kaşifler Ligi",
      guideCenter: "Rehber Merkezi",
      communityRules: "Topluluk Kuralları",
      profile: "Profil",
      login: "Giriş"
    },
    hero: {
      eyebrow: "Premium seyahat keşif platformu",
      title: "Dünyayı keşfet, rotanı akıllıca planla.",
      subtitle: "Uçuş arama, pasaport gücü, ülke rehberleri, gerçek gezgin deneyimleri ve Rota Asistanı tek akışta buluşur.",
      ctaPrimary: "Pasaportuna göre keşfet",
      ctaSecondary: "Rota Asistanı'nı aç",
      dynamicLines: [
        "Bugün pasaportun seni nereye götürebilir?",
        "Vizesiz ve kolay giriş rotalarını keşfet.",
        "Gerçek gezgin deneyimlerinden ilham al.",
        "Uçuşunu ara, rotanı planla.",
        "Pasaport gücünü gör, dünyaya açıl."
      ]
    },
    footer: {
      intro: "Uçuş arama, pasaport gücü, ülke rehberleri, gerçek gezgin deneyimleri ve Rota Asistanı’nı bir araya getiren premium seyahat keşif platformu."
    }
  },
  en: {
    nav: {
      flights: "Flights",
      deals: "Deals",
      passport: "Passport Power",
      assistant: "Route Assistant",
      forum: "Forum",
      more: "More",
      visaFree: "Visa-free Countries",
      visaCenter: "Visa Center",
      explorers: "Explorer League",
      guideCenter: "Guide Center",
      communityRules: "Community Rules",
      profile: "Profile",
      login: "Sign in"
    },
    hero: {
      eyebrow: "Premium travel discovery platform",
      title: "Discover the world and plan smarter routes.",
      subtitle: "Flight search, passport power, country guides, real traveler experiences and Route Assistant come together in one flow.",
      ctaPrimary: "Discover by passport",
      ctaSecondary: "Open Route Assistant",
      dynamicLines: [
        "Where can your passport take you today?",
        "Explore visa-free and easy-entry routes.",
        "Get inspired by real traveler experiences.",
        "Search flights and plan your route.",
        "See your passport power and open the world."
      ]
    },
    footer: {
      intro: "A premium travel discovery platform combining flight search, passport power, country guides, real traveler experiences and Route Assistant."
    }
  }
} as const;

export function getL2tDictionary(locale: L2tLocale) {
  return l2tDictionaries[locale] ?? l2tDictionaries.tr;
}
