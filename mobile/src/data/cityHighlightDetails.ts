import type { AppLocale } from "../lib/locale";
import { romeHighlightDetails } from "./romeHighlightDetails";

export type CityHighlightDetails = {
  category: string;
  summary: string;
  description: string;
  tip: string;
  source: { title: string; url: string };
};

type HighlightCopy = Omit<CityHighlightDetails, "source">;
type HighlightEntry = {
  copy: Record<AppLocale, HighlightCopy>;
  source: CityHighlightDetails["source"];
};

// Original editorial copy checked against the linked official sources.
// Claim scopes and additional supporting pages: outputs/city-detail-content-20261031/facts.json.
// No live opening hours, prices, availability, ratings or journey estimates.
const DETAILS: Record<string, HighlightEntry> = {
  "eiffel-tower": {
    copy: {
      tr: {
        category: "Simge yapı",
        summary: "Paris’i yukarıdan gördüğün simge kule.",
        description: "Paris Dünya Fuarı için inşa edildi. Seyir katlarından şehre bakabilirsin.",
        tip: "Biletindeki giriş saatini ve biletli ziyaretçi sırasını kontrol et.",
      },
      en: {
        category: "Landmark",
        summary: "Paris views from an unmistakable landmark.",
        description: "The tower was built for the Paris World’s Fair. Its viewing levels overlook the city.",
        tip: "Check your ticket time and the queue for ticket holders.",
      },
      sq: {
        category: "Monument",
        summary: "Pamje të Parisit nga kulla simbol e qytetit.",
        description: "U ndërtua për Ekspozitën Botërore të Parisit. Nga katet panoramike mund të shohësh qytetin.",
        tip: "Kontrollo orarin e biletës dhe radhën për vizitorët me biletë.",
      },
      ro: {
        category: "Monument",
        summary: "Parisul văzut de sus, din turnul său emblematic.",
        description: "A fost construit pentru Expoziția Universală de la Paris. Etajele panoramice oferă priveliști asupra orașului.",
        tip: "Verifică ora biletului și coada pentru vizitatorii cu bilet.",
      },
    },
    source: { title: "Tour Eiffel · Planning a smooth visit", url: "https://www.toureiffel.paris/en/planning-smooth-visit" },
  },
  louvre: {
    copy: {
      tr: {
        category: "Müze",
        summary: "Eski kraliyet sarayında sanat ve tarih.",
        description: "Eski bir kraliyet sarayı bugün müze. Koleksiyonunda Mona Lisa ve antik eserler de var.",
        tip: "Ücretsiz giriş hakkın olsa da resmi siteden saatli rezervasyonu kontrol et.",
      },
      en: {
        category: "Museum",
        summary: "Art and history inside a former royal palace.",
        description: "The museum occupies a former royal palace. Its collection includes the Mona Lisa and ancient artefacts.",
        tip: "Check official time-slot bookings, even if you qualify for free entry.",
      },
      sq: {
        category: "Muze",
        summary: "Art dhe histori në një ish-pallat mbretëror.",
        description: "Muzeu ndodhet në një ish-pallat mbretëror. Koleksioni përfshin Mona Lizën dhe objekte të lashtësisë.",
        tip: "Kontrollo rezervimin e orarit në faqen zyrtare, edhe nëse hyn falas.",
      },
      ro: {
        category: "Muzeu",
        summary: "Artă și istorie într-un fost palat regal.",
        description: "Muzeul ocupă un fost palat regal. Colecția include Mona Lisa și obiecte din Antichitate.",
        tip: "Verifică rezervarea intervalului de acces, inclusiv dacă ai intrare gratuită.",
      },
    },
    source: { title: "Musée du Louvre · Visit", url: "https://www.louvre.fr/en/visit" },
  },
  "kelingking-beach": {
    copy: {
      tr: {
        category: "Doğa",
        summary: "Nusa Penida’nın uçurumlarla çevrili beyaz kumsalı.",
        description: "Nusa Penida’nın güneybatısında, dik kayalıkların altında uzanır. Yukarıdan burnu ve kumsalı birlikte görebilirsin.",
        tip: "Fotoğraf için bariyerleri aşma; sahile inen patika çok dik.",
      },
      en: {
        category: "Nature",
        summary: "White sand below Nusa Penida’s dramatic cliffs.",
        description: "This beach lies beneath steep cliffs in southwest Nusa Penida. The upper viewpoint overlooks the headland and sand.",
        tip: "Stay behind barriers for photos; the beach path is very steep.",
      },
      sq: {
        category: "Natyrë",
        summary: "Rërë e bardhë nën shkëmbinjtë e Nusa Penidës.",
        description: "Ky plazh shtrihet nën shkëmbinj të pjerrët, në jugperëndim të Nusa Penidës. Nga sipër shihen kepi dhe rëra.",
        tip: "Mos kalo barrierat për foto; shtegu drejt plazhit është shumë i pjerrët.",
      },
      ro: {
        category: "Natură",
        summary: "Nisip alb sub stâncile spectaculoase din Nusa Penida.",
        description: "Plaja se află sub stânci abrupte, în sud-vestul insulei Nusa Penida. De sus vezi promontoriul și plaja.",
        tip: "Rămâi în spatele barierelor pentru fotografii; poteca spre plajă este foarte abruptă.",
      },
    },
    source: { title: "Indonesia Travel · Pantai Kelingking", url: "https://www.indonesia.travel/id/id/destination/bali-nusa-tenggara/bali/kelingking-beach-a-marvelous-wonder-in-the-southwest-of-nusa-penida" },
  },
  "uluwatu-temple": {
    copy: {
      tr: {
        category: "Tapınak",
        summary: "Okyanusa bakan kayalıkların üstünde Hindu tapınağı.",
        description: "Pecatu’daki tapınak Hint Okyanusu’na bakan bir uçurumda. Hindu ibadetine adanmış kutsal bir yer.",
        tip: "Sarong ve kuşak giy; ibadet edenlerin yanında sessiz ol.",
      },
      en: {
        category: "Temple",
        summary: "A Hindu temple on cliffs facing the ocean.",
        description: "This Pecatu temple stands above the Indian Ocean. It is a sacred place of Hindu worship.",
        tip: "Wear a sarong and sash, and keep quiet around worshippers.",
      },
      sq: {
        category: "Tempull",
        summary: "Tempull hindu mbi shkëmbinjtë përballë oqeanit.",
        description: "Tempulli në Pecatu ngrihet mbi Oqeanin Indian. Është vend i shenjtë adhurimi hindu.",
        tip: "Vish sarong dhe brez; ruaj qetësinë pranë atyre që luten.",
      },
      ro: {
        category: "Templu",
        summary: "Un templu hindus pe stâncile dinspre ocean.",
        description: "Templul din Pecatu se află deasupra Oceanului Indian. Este un loc sacru de cult hindus.",
        tip: "Poartă sarong și eșarfă și păstrează liniștea lângă cei care se roagă.",
      },
    },
    source: { title: "Indonesia Travel · Pura Uluwatu", url: "https://www.indonesia.travel/gb/en/travel-ideas/pilgrimage/pura-uluwatu" },
  },
  "senso-ji": {
    copy: {
      tr: {
        category: "Tapınak",
        summary: "Asakusa’da Kannon’a adanmış Budist tapınağı.",
        description: "Tokyo’nun en eski tapınağıdır. Tapınağa Kaminarimon kapısından ve Nakamise yolundan ulaşırsın.",
        tip: "Kaminarimon’dan geçip Nakamise boyunca tapınağa doğru yürü.",
      },
      en: {
        category: "Temple",
        summary: "Asakusa’s Buddhist temple dedicated to Kannon.",
        description: "This is Tokyo’s oldest temple. Kaminarimon gate and Nakamise form its main approach.",
        tip: "Enter through Kaminarimon and follow Nakamise towards the temple.",
      },
      sq: {
        category: "Tempull",
        summary: "Tempulli budist i Asakusës, kushtuar Kannonit.",
        description: "Është tempulli më i vjetër i Tokios. Porta Kaminarimon dhe Nakamise formojnë rrugën kryesore të hyrjes.",
        tip: "Kalo nga Kaminarimon dhe ndiq Nakamise drejt tempullit.",
      },
      ro: {
        category: "Templu",
        summary: "Templul budist din Asakusa, dedicat lui Kannon.",
        description: "Este cel mai vechi templu din Tokyo. Poarta Kaminarimon și Nakamise formează traseul principal de acces.",
        tip: "Treci prin Kaminarimon și urmează Nakamise spre templu.",
      },
    },
    source: { title: "Senso-ji · Official temple guide", url: "https://www.senso-ji.jp/english/" },
  },
  "shibuya-crossing": {
    copy: {
      tr: {
        category: "Şehir yaşamı",
        summary: "Tokyo’nun farklı yönlere aynı anda akan yaya geçidi.",
        description: "Shibuya İstasyonu önünde yayalar farklı yönlere birlikte geçer. Çevredeki sokaklar alışveriş ve eğlence bölgesine açılır.",
        tip: "Geçide ulaşmak için istasyondaki Hachiko çıkışı tabelalarını takip et.",
      },
      en: {
        category: "City life",
        summary: "Tokyo’s famous crossing in every direction.",
        description: "Pedestrians cross together outside Shibuya Station. The surrounding streets lead into a shopping and entertainment district.",
        tip: "Follow the station signs for the Hachiko exit to reach the crossing.",
      },
      sq: {
        category: "Jetë urbane",
        summary: "Kalimi i famshëm i Tokios në çdo drejtim.",
        description: "Këmbësorët kalojnë së bashku përpara stacionit Shibuya. Rrugët përreth çojnë drejt zonës së dyqaneve dhe argëtimit.",
        tip: "Ndiq tabelat për daljen Hachiko që të arrish te kalimi.",
      },
      ro: {
        category: "Viață urbană",
        summary: "Celebra trecere din Tokyo, în toate direcțiile.",
        description: "Pietonii traversează împreună în fața gării Shibuya. Străzile din jur duc spre zona de cumpărături și divertisment.",
        tip: "Urmează indicatoarele spre ieșirea Hachiko pentru a ajunge la trecere.",
      },
    },
    source: { title: "GO TOKYO · Explore Shibuya", url: "https://www.gotokyo.org/en/story/walks-and-tours/shibuya/index.html" },
  },
  colosseum: {
    copy: {
      tr: {
        category: "Antik yapı",
        summary: "Gladyatör gösterilerinin antik Roma’daki sahnesi.",
        description: "Bu Roma amfitiyatrosunu Flavius hanedanı yaptırdı. Antik dönemde gladyatör oyunları ve hayvan avları düzenlenirdi.",
        tip: "Ziyaretinden önce resmi siteden Kolezyum giriş saati ayırt.",
      },
      en: {
        category: "Ancient site",
        summary: "Ancient Rome’s arena for gladiatorial spectacles.",
        description: "The Flavian dynasty built this Roman amphitheatre. It hosted gladiatorial games and animal hunts in antiquity.",
        tip: "Reserve your Colosseum entry slot through the official site.",
      },
      sq: {
        category: "Vend antik",
        summary: "Arena e Romës së lashtë për shfaqjet e gladiatorëve.",
        description: "Këtë amfiteatër romak e ndërtoi dinastia Flaviane. Në lashtësi priste ndeshje gladiatorësh dhe gjueti kafshësh.",
        tip: "Rezervo orarin e hyrjes në faqen zyrtare të Koloseut.",
      },
      ro: {
        category: "Sit antic",
        summary: "Arena Romei antice pentru spectacole cu gladiatori.",
        description: "Dinastia Flaviilor a construit acest amfiteatru roman. În Antichitate găzduia lupte de gladiatori și vânători de animale.",
        tip: "Rezervă intervalul de acces la Colosseum pe site-ul oficial.",
      },
    },
    source: { title: "Parco archeologico del Colosseo · Visit", url: "https://colosseo.it/en/opening-times-and-tickets/" },
  },
  "trevi-fountain": {
    copy: {
      tr: {
        category: "Çeşme",
        summary: "Heykeller ve suyun buluştuğu anıtsal Roma çeşmesi.",
        description: "Palazzo Poli’nin cephesine yaslanan çeşmenin tasarımı Nicola Salvi’ye ait. Ortada Okeanos’un heykeli yer alır.",
        tip: "Suyun içine girme ve havuz kenarına oturma.",
      },
      en: {
        category: "Fountain",
        summary: "A monumental Roman fountain of water and sculpture.",
        description: "Nicola Salvi designed the fountain against Palazzo Poli. Oceanus stands at the centre of its sculptural scene.",
        tip: "Do not enter the water or sit on the basin’s edge.",
      },
      sq: {
        category: "Shatërvan",
        summary: "Shatërvan monumental romak me ujë dhe skulptura.",
        description: "Shatërvani i Nicola Salvit mbështetet në fasadën e Palazzo Poli. Në qendër qëndron statuja e Oceanusit.",
        tip: "Mos hyr në ujë dhe mos u ul në buzën e basenit.",
      },
      ro: {
        category: "Fântână",
        summary: "O fântână monumentală romană, cu apă și sculpturi.",
        description: "Nicola Salvi a proiectat fântâna pe fațada Palazzo Poli. Oceanus se află în centrul compoziției sculpturale.",
        tip: "Nu intra în apă și nu te așeza pe marginea bazinului.",
      },
    },
    source: { title: "Roma Capitale · Trevi Fountain", url: "https://fontanaditrevi.roma.it/en" },
  },
};

export function cityHighlightDetails(id: string, locale: AppLocale): CityHighlightDetails | undefined {
  if (!Object.hasOwn(DETAILS, id)) return romeHighlightDetails(id, locale);
  const entry = DETAILS[id];
  const copy = Object.hasOwn(entry.copy, locale) ? entry.copy[locale] : entry.copy.en;
  return { ...copy, source: { ...entry.source } };
}
