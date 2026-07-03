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
      title: "Dünyayı keşfetmeye buradan başla.",
      subtitle: "Pasaportuna göre rota keşfet, gerçek gezgin deneyimlerinden ilham al ve uçuş fırsatlarını tek akışta yakala.",
      ctaPrimary: "Bilet ara",
      ctaSecondary: "Vizesiz rotaları gör",
      dynamicLines: [
        "Pasaportuna göre rotaları keşfet.",
        "Gerçek gezginlerin deneyimlerinden ilham al.",
        "Bütçene uygun yeni ülkeler bul.",
        "Vizesiz, kimlikle veya e-vize ile gidilebilecek rotaları gör.",
        "Bugünün uçuş fırsatlarını yakala.",
        "Sıradaki ülken seni bekliyor."
      ]
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
      title: "Start discovering the world from here.",
      subtitle: "Discover routes based on your passport, get inspired by real traveler experiences and catch flight deals in one flow.",
      ctaPrimary: "Search flights",
      ctaSecondary: "See visa-free routes",
      dynamicLines: [
        "Discover routes based on your passport.",
        "Get inspired by real traveler experiences.",
        "Find new countries for your budget.",
        "See routes available visa-free, with ID or e-visa.",
        "Catch today’s flight deals.",
        "Your next country is waiting."
      ]
    }
  }
} as const;

export function getL2tDictionary(locale: L2tLocale) {
  return l2tDictionaries[locale] ?? l2tDictionaries.tr;
}
