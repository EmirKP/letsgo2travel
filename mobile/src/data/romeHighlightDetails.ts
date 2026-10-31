import type { AppLocale } from "../lib/locale";
import type { CityHighlightDetails } from "./cityHighlightDetails";

type RomeHighlightEntry = {
  copy: Record<AppLocale, Omit<CityHighlightDetails, "source">>;
  source: CityHighlightDetails["source"];
};

// Original editorial copy verified against official operator/tourism pages.
// Supporting claims and map references: outputs/city-highlight-variety-20261031/facts.json.
// This is editorial context, without live opening times, prices or availability.
const DETAILS: Record<string, RomeHighlightEntry> = {
  pantheon: {
    copy: {
      tr: {
        category: "Tarihi yapı",
        summary: "Açık kubbesinden ışık alan antik Roma yapısı.",
        description: "Antik Roma yapısı bugün Santa Maria ad Martyres Bazilikası. Kubbesinin ortasındaki oculus içeriye gün ışığı taşır.",
        tip: "Giriş sütunlarının üzerindeki Agrippa yazıtını incele.",
      },
      en: {
        category: "Historic site",
        summary: "Ancient Roman architecture beneath an open oculus.",
        description: "This Roman monument is now a basilica. Daylight enters through the dome’s central oculus.",
        tip: "Look for the Agrippa inscription above the entrance columns.",
      },
      sq: {
        category: "Vend historik",
        summary: "Arkitekturë romake nën kupolën me hapje drejt qiellit.",
        description: "Ky monument romak sot është bazilikë. Drita hyn nga hapja në qendër të kupolës.",
        tip: "Shiko mbishkrimin e Agripës mbi kolonat e hyrjes.",
      },
      ro: {
        category: "Sit istoric",
        summary: "Arhitectură romană sub oculusul deschis al cupolei.",
        description: "Monumentul roman este astăzi o bazilică. Lumina pătrunde prin oculusul din centrul cupolei.",
        tip: "Caută inscripția lui Agrippa deasupra coloanelor de la intrare.",
      },
    },
    source: { title: "Turismo Roma · The Pantheon", url: "https://www.turismoroma.it/en/places/pantheon" },
  },
  "vatican-museums": {
    copy: {
      tr: {
        category: "Müze",
        summary: "Sanat koleksiyonları ve Sistine Şapeli.",
        description: "Müzeler Vatikan’daki sanat ve arkeoloji koleksiyonlarını bir araya getirir. Sistine Şapeli ve Raffaello Odaları bu bütünün parçalarıdır.",
        tip: "Hangi bölümleri göreceğini resmi müze haritasından seç.",
      },
      en: {
        category: "Museum",
        summary: "Art collections and the Sistine Chapel, together.",
        description: "The museums unite art and archaeological collections in the Vatican. The complex includes the Sistine Chapel and Raphael’s Rooms.",
        tip: "Choose your route with the official museum map.",
      },
      sq: {
        category: "Muze",
        summary: "Koleksione arti dhe Kapela Sistine.",
        description: "Muzetë bashkojnë koleksione arti dhe arkeologjie në Vatikan. Kompleksi përfshin Kapelën Sistine dhe Dhomat e Rafaelit.",
        tip: "Zgjidh rrugën tënde me hartën zyrtare të muzeve.",
      },
      ro: {
        category: "Muzeu",
        summary: "Colecții de artă și Capela Sixtină.",
        description: "Muzeele reunesc colecții de artă și arheologie din Vatican. Complexul include Capela Sixtină și Camerele lui Rafael.",
        tip: "Alege traseul folosind harta oficială a muzeelor.",
      },
    },
    source: { title: "Musei Vaticani · Discover the Museums", url: "https://www.museivaticani.va/content/museivaticani/en/collezioni/musei.html" },
  },
  trastevere: {
    copy: {
      tr: {
        category: "Mahalle",
        summary: "Tiber’in öte yakasında sokak sokak Roma.",
        description: "Tiber’in karşı kıyısındaki tarihi semtte dar sokaklar ve meydanlar buluşur. Geleneksel trattoria ve zanaat dükkânları bölgenin karakterini oluşturur.",
        tip: "Semtin merkezindeki Piazza di Santa Maria in Trastevere’yi başlangıç noktası yap.",
      },
      en: {
        category: "Neighbourhood",
        summary: "Explore Rome’s winding streets across the Tiber.",
        description: "Across the Tiber, this historic neighbourhood has winding lanes and small squares. Traditional trattorias and craft shops shape its character.",
        tip: "Start at Piazza di Santa Maria in Trastevere, in the neighbourhood’s heart.",
      },
      sq: {
        category: "Lagje",
        summary: "Zbulo rrugicat e Romës në anën tjetër të Tiberit.",
        description: "Në anën tjetër të Tiberit, lagjja historike ka rrugica dhe sheshe. Trattoritë tradicionale dhe dyqanet artizanale i japin karakter.",
        tip: "Fillo nga Piazza di Santa Maria in Trastevere, në zemër të lagjes.",
      },
      ro: {
        category: "Cartier",
        summary: "Descoperă străduțele Romei, dincolo de Tibru.",
        description: "Dincolo de Tibru, cartierul istoric are străduțe și piețe. Trattoriile tradiționale și atelierele artizanale îi dau caracter.",
        tip: "Începe din Piazza di Santa Maria in Trastevere, în centrul cartierului.",
      },
    },
    source: { title: "Turismo Roma · Rione XIII - Trastevere", url: "https://www.turismoroma.it/en/page/rione-xiii-trastevere" },
  },
  "villa-borghese": {
    copy: {
      tr: {
        category: "Park",
        summary: "Bahçeler, heykeller ve göletlerle yeşil bir Roma molası.",
        description: "Ağaçlı yollar, göletler ve heykeller parkta bir araya gelir. Tarihi Borghese arazisi zamanla kent parkına dönüştü.",
        tip: "Giardino del Lago’da gölün ortasındaki Asklepios Tapınağı’nı bul.",
      },
      en: {
        category: "Park",
        summary: "A green Roman break among gardens, ponds and sculptures.",
        description: "The park brings together tree-lined paths, ponds and sculptures. The historic Borghese estate became a public city park.",
        tip: "Find the Temple of Aesculapius on the lake in Giardino del Lago.",
      },
      sq: {
        category: "Park",
        summary: "Një pushim mes gjelbërimit, pellgjeve dhe skulpturave.",
        description: "Parku bashkon shëtitore me pemë, pellgje dhe skulptura. Prona historike Borghese u kthye në park publik.",
        tip: "Gjej Tempullin e Asklepit në liqenin e Giardino del Lago.",
      },
      ro: {
        category: "Parc",
        summary: "O pauză verde printre grădini, iazuri și sculpturi.",
        description: "Parcul îmbină alei cu arbori, iazuri și sculpturi. Domeniul istoric Borghese a devenit parc public.",
        tip: "Caută Templul lui Esculap pe lacul din Giardino del Lago.",
      },
    },
    source: { title: "Turismo Roma · Villa Borghese", url: "https://www.turismoroma.it/en/places/villa-borghese" },
  },
};

export function romeHighlightDetails(id: string, locale: AppLocale): CityHighlightDetails | undefined {
  if (!Object.hasOwn(DETAILS, id)) return undefined;
  const entry = DETAILS[id];
  const copy = Object.hasOwn(entry.copy, locale) ? entry.copy[locale] : entry.copy.en;
  return { ...copy, source: { ...entry.source } };
}
