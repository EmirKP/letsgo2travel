import type { AppLocale } from '../lib/locale';

type Labels = Readonly<Record<AppLocale, string>>;
type Category = keyof typeof CATEGORIES;

export type CityEssentialPlace = {
  id: string;
  name: string;
  category: string;
  source: { title: string; url: string };
  latitude?: number;
  longitude?: number;
};

export type CityEssentials = {
  summary: string;
  places: CityEssentialPlace[];
};

type EditorialPlace = {
  id: string;
  name: string | Labels;
  category: Category;
  source: Readonly<{ title: string; url: string }>;
};

type EditorialCity = {
  summary: Labels;
  places: readonly EditorialPlace[];
};

const CATEGORIES = {
  "history": {
    "tr": "Tarihî yer",
    "en": "Historic site",
    "sq": "Vend historik",
    "ro": "Loc istoric"
  },
  "museum": {
    "tr": "Müze",
    "en": "Museum",
    "sq": "Muze",
    "ro": "Muzeu"
  },
  "park": {
    "tr": "Park ve bahçe",
    "en": "Park and garden",
    "sq": "Park dhe kopsht",
    "ro": "Parc și grădină"
  },
  "district": {
    "tr": "Semt ve sokaklar",
    "en": "Neighbourhood and streets",
    "sq": "Lagje dhe rrugë",
    "ro": "Cartier și străzi"
  },
  "square": {
    "tr": "Meydan",
    "en": "Square",
    "sq": "Shesh",
    "ro": "Piață"
  },
  "architecture": {
    "tr": "Mimari",
    "en": "Architecture",
    "sq": "Arkitekturë",
    "ro": "Arhitectură"
  },
  "religion": {
    "tr": "Dinî yapı",
    "en": "Religious site",
    "sq": "Objekt fetar",
    "ro": "Lăcaș de cult"
  },
  "market": {
    "tr": "Pazar",
    "en": "Market",
    "sq": "Treg",
    "ro": "Piață comercială"
  },
  "culture": {
    "tr": "Kültür",
    "en": "Culture",
    "sq": "Kulturë",
    "ro": "Cultură"
  },
  "waterfront": {
    "tr": "Su kıyısı",
    "en": "Waterfront",
    "sq": "Buzë ujit",
    "ro": "Malul apei"
  },
  "landmark": {
    "tr": "Simge yapı",
    "en": "Landmark",
    "sq": "Pikë referimi",
    "ro": "Obiectiv emblematic"
  },
  "viewpoint": {
    "tr": "Manzara noktası",
    "en": "Viewpoint",
    "sq": "Pikë panoramike",
    "ro": "Punct panoramic"
  },
  "coast": {
    "tr": "Kıyı",
    "en": "Coast",
    "sq": "Bregdet",
    "ro": "Coastă"
  }
} satisfies Record<string, Labels>;

// Original editorial summaries; official sources establish the places and their types.
// Research notes: outputs/overnight-cities-20261031/content-facts.json.
// No prices, opening status, distances, images or inferred place coordinates are supplied.
const CONTENT: Readonly<Record<string, EditorialCity>> = {
  "SJJ": {
    "summary": {
      "tr": "Saraybosna’da çarşı sokakları, tarihî belediye binası ve Bosna Nehri’nin kaynağı şehrin farklı yüzlerini gösterir.",
      "en": "Sarajevo brings together bazaar lanes, its historic City Hall and the springs of the River Bosna.",
      "sq": "Sarajeva ndërthur rrugicat e pazarit, bashkinë historike dhe burimet e lumit Bosna.",
      "ro": "Sarajevo îmbină străduțele bazarului, primăria istorică și izvoarele râului Bosna."
    },
    "places": [
      {
        "id": "bascarsija",
        "name": "Baščaršija",
        "category": "district",
        "source": {
          "title": "Visit Sarajevo",
          "url": "https://www.visitsarajevo.ba/bs/top-atrakcije/"
        }
      },
      {
        "id": "sarajevo-city-hall",
        "name": {
          "tr": "Saraybosna Belediye Binası",
          "en": "Sarajevo City Hall",
          "sq": "Bashkia e Sarajevës",
          "ro": "Primăria Sarajevo"
        },
        "category": "architecture",
        "source": {
          "title": "Visit Sarajevo",
          "url": "https://www.visitsarajevo.ba/bs/top-atrakcije/"
        }
      },
      {
        "id": "vrelo-bosne",
        "name": "Vrelo Bosne",
        "category": "park",
        "source": {
          "title": "Visit Sarajevo",
          "url": "https://www.visitsarajevo.ba/ilidza/"
        }
      }
    ]
  },
  "OTP": {
    "summary": {
      "tr": "Bükreş’i Parlamento Sarayı’nın mimarisi, Ateneul Român’ın müzik mirası ve Köy Müzesi’nin geleneksel yapılarıyla tanı.",
      "en": "Discover Bucharest through Parliament Palace, the musical heritage of the Romanian Athenaeum and the Village Museum’s traditional buildings.",
      "sq": "Zbulo Bukureshtin përmes Pallatit të Parlamentit, trashëgimisë muzikore të Ateneut Rumun dhe ndërtesave tradicionale të Muzeut të Fshatit.",
      "ro": "Descoperă Bucureștiul prin Palatul Parlamentului, patrimoniul muzical al Ateneului Român și gospodăriile tradiționale ale Muzeului Satului."
    },
    "places": [
      {
        "id": "palace-of-parliament",
        "name": {
          "tr": "Parlamento Sarayı",
          "en": "Palace of Parliament",
          "sq": "Pallati i Parlamentit",
          "ro": "Palatul Parlamentului"
        },
        "category": "architecture",
        "source": {
          "title": "Romanian Parliament",
          "url": "https://cic.cdep.ro/en/vizitare"
        }
      },
      {
        "id": "romanian-athenaeum",
        "name": {
          "tr": "Romanya Ateneumu",
          "en": "Romanian Athenaeum",
          "sq": "Ateneu Rumun",
          "ro": "Ateneul Român"
        },
        "category": "culture",
        "source": {
          "title": "Filarmonica George Enescu",
          "url": "https://filarmonicaenescu.ro/ro/vizitarea-ateneului-roman"
        }
      },
      {
        "id": "dimitrie-gusti-village-museum",
        "name": {
          "tr": "Dimitrie Gusti Köy Müzesi",
          "en": "Dimitrie Gusti National Village Museum",
          "sq": "Muzeu Kombëtar i Fshatit Dimitrie Gusti",
          "ro": "Muzeul Național al Satului Dimitrie Gusti"
        },
        "category": "museum",
        "source": {
          "title": "Muzeul Național al Satului Dimitrie Gusti",
          "url": "https://muzeul-satului.ro/en/contact/"
        }
      }
    ]
  },
  "TIA": {
    "summary": {
      "tr": "Tiran’ın merkezinde İskender Bey Meydanı’ndan Piramit’e uzanan keşif, kentin kamusal alanlarını ve yakın tarihini bir araya getirir.",
      "en": "Central Tirana pairs Skanderbeg Square and the Pyramid with spaces that explore Albania’s recent history.",
      "sq": "Qendra e Tiranës bashkon Sheshin Skënderbej dhe Piramidën me vende që tregojnë historinë e afërt të Shqipërisë.",
      "ro": "Centrul Tiranei reunește Piața Skanderbeg și Piramida cu locuri dedicate istoriei recente a Albaniei."
    },
    "places": [
      {
        "id": "skanderbeg-square",
        "name": {
          "tr": "İskender Bey Meydanı",
          "en": "Skanderbeg Square",
          "sq": "Sheshi Skënderbej",
          "ro": "Piața Skanderbeg"
        },
        "category": "square",
        "source": {
          "title": "Albanian National Tourism Agency",
          "url": "https://akt.gov.al/en/attractions/Skanderbeg-Square/"
        }
      },
      {
        "id": "tirana-pyramid",
        "name": {
          "tr": "Tiran Piramidi",
          "en": "Pyramid of Tirana",
          "sq": "Piramida e Tiranës",
          "ro": "Piramida din Tirana"
        },
        "category": "culture",
        "source": {
          "title": "Albanian National Tourism Agency",
          "url": "https://akt.gov.al/en/atraksionet/piramida-e-tiranes/"
        }
      },
      {
        "id": "bunkart-2",
        "name": "Bunk’Art 2",
        "category": "museum",
        "source": {
          "title": "Albanian National Tourism Agency",
          "url": "https://akt.gov.al/en/trashegimia/bunkart-2/"
        }
      }
    ]
  },
  "BEG": {
    "summary": {
      "tr": "Belgrad’da kale, Skadarlija’nın sokak dokusu ve Aziz Sava Kilisesi farklı dönemlerin izlerini taşır.",
      "en": "Belgrade’s fortress, Skadarlija streets and Saint Sava Church reveal different layers of the city’s history.",
      "sq": "Kalaja e Beogradit, rrugët e Skadarlijës dhe Kisha e Shën Savës tregojnë shtresa të ndryshme të historisë së qytetit.",
      "ro": "Cetatea Belgradului, străzile din Skadarlija și Biserica Sfântul Sava dezvăluie epoci diferite ale orașului."
    },
    "places": [
      {
        "id": "belgrade-fortress",
        "name": {
          "tr": "Belgrad Kalesi",
          "en": "Belgrade Fortress",
          "sq": "Kalaja e Beogradit",
          "ro": "Cetatea Belgradului"
        },
        "category": "history",
        "source": {
          "title": "Tourist Organization of Belgrade",
          "url": "https://www.tob.rs/en/what-to-see/belgrade-attractions/belgrade-fortress"
        }
      },
      {
        "id": "skadarlija",
        "name": "Skadarlija",
        "category": "district",
        "source": {
          "title": "Tourist Organization of Belgrade",
          "url": "https://www.tob.rs/en/what-to-see/belgrade-attractions"
        }
      },
      {
        "id": "saint-sava",
        "name": {
          "tr": "Aziz Sava Kilisesi",
          "en": "Church of Saint Sava",
          "sq": "Kisha e Shën Savës",
          "ro": "Biserica Sfântul Sava"
        },
        "category": "religion",
        "source": {
          "title": "Tourist Organization of Belgrade",
          "url": "https://www.tob.rs/rs/vracar-kat"
        }
      }
    ]
  },
  "RIX": {
    "summary": {
      "tr": "Riga’da tarihî merkezdeki süslü cepheleri ve kilise kulelerini keşfedip Merkez Pazarı’nın günlük yaşamına geçebilirsin.",
      "en": "Riga combines ornate Old Town façades and church spires with the everyday life of its Central Market.",
      "sq": "Riga bashkon fasadat e zbukuruara dhe kullat e qytetit të vjetër me jetën e përditshme të Tregut Qendror.",
      "ro": "Riga îmbină fațadele ornamentate și turlele centrului vechi cu viața cotidiană din Piața Centrală."
    },
    "places": [
      {
        "id": "house-of-blackheads",
        "name": {
          "tr": "Karabaşlar Evi",
          "en": "House of the Blackheads",
          "sq": "Shtëpia e Kokave të Zeza",
          "ro": "Casa Capetelor Negre"
        },
        "category": "history",
        "source": {
          "title": "Live Riga",
          "url": "https://www.liveriga.com/en/visit/what-to-see/top-sights/house-of-the-blackheads"
        }
      },
      {
        "id": "riga-st-peter",
        "name": {
          "tr": "Aziz Petrus Kilisesi",
          "en": "St Peter’s Church",
          "sq": "Kisha e Shën Pjetrit",
          "ro": "Biserica Sfântul Petru"
        },
        "category": "religion",
        "source": {
          "title": "Live Riga",
          "url": "https://www.liveriga.com/en/1628-st-peter-s-church/"
        }
      },
      {
        "id": "riga-central-market",
        "name": {
          "tr": "Riga Merkez Pazarı",
          "en": "Riga Central Market",
          "sq": "Tregu Qendror i Rigës",
          "ro": "Piața Centrală din Riga"
        },
        "category": "market",
        "source": {
          "title": "Live Riga",
          "url": "https://www.liveriga.com/en/visit/what-to-do/what-to-see-in-riga-in-3-days"
        }
      }
    ]
  },
  "VNO": {
    "summary": {
      "tr": "Vilnius’ta Gediminas Kulesi, Katedral Meydanı ve Užupis, tarihî merkezden farklı mahalle dokularına uzanan bir başlangıç sunar.",
      "en": "Gediminas Tower, Cathedral Square and Užupis introduce Vilnius through its historic centre and contrasting neighbourhoods.",
      "sq": "Kulla Gediminas, Sheshi i Katedrales dhe Užupis të njohin me qendrën historike dhe lagjet e ndryshme të Vilniusit.",
      "ro": "Turnul Gediminas, Piața Catedralei și Užupis prezintă centrul istoric și cartierele diferite ale orașului Vilnius."
    },
    "places": [
      {
        "id": "gediminas-tower",
        "name": {
          "tr": "Gediminas Kulesi",
          "en": "Gediminas Tower",
          "sq": "Kulla Gediminas",
          "ro": "Turnul Gediminas"
        },
        "category": "history",
        "source": {
          "title": "Go Vilnius",
          "url": "https://www.govilnius.lt/visit-vilnius/places/the-gediminas-tower"
        }
      },
      {
        "id": "vilnius-cathedral-square",
        "name": {
          "tr": "Katedral Meydanı",
          "en": "Cathedral Square",
          "sq": "Sheshi i Katedrales",
          "ro": "Piața Catedralei"
        },
        "category": "square",
        "source": {
          "title": "Go Vilnius · City map",
          "url": "https://www.govilnius.lt/api/files/684919fcaae0a96253aa5a9c/Vilnius%20City%20Map%202025.pdf"
        }
      },
      {
        "id": "uzupis",
        "name": "Užupis",
        "category": "district",
        "source": {
          "title": "Go Vilnius · City map",
          "url": "https://www.govilnius.lt/api/files/684919fcaae0a96253aa5a9c/Vilnius%20City%20Map%202025.pdf"
        }
      }
    ]
  },
  "SXB": {
    "summary": {
      "tr": "Strazburg’un katedral çevresi, Petite France’ın evleri ve Rohan Sarayı, eski şehrin mimarisini keşfetmek için birbirini tamamlar.",
      "en": "Strasbourg’s cathedral quarter, Petite France houses and Palais Rohan offer different views of the old city’s architecture.",
      "sq": "Lagjja e katedrales, shtëpitë e Petite France dhe Pallati Rohan tregojnë anë të ndryshme të arkitekturës së Strasburgut.",
      "ro": "Zona catedralei, casele din Petite France și Palatul Rohan oferă perspective diferite asupra arhitecturii vechiului Strasbourg."
    },
    "places": [
      {
        "id": "strasbourg-cathedral",
        "name": {
          "tr": "Strazburg Katedrali",
          "en": "Strasbourg Cathedral",
          "sq": "Katedralja e Strasburgut",
          "ro": "Catedrala din Strasbourg"
        },
        "category": "religion",
        "source": {
          "title": "Strasbourg Tourist Office",
          "url": "https://groups.visitstrasbourg.fr/visite/la-visite-de-la-cathedrale-et-de-la-vielle-ville-a-pied/"
        }
      },
      {
        "id": "petite-france",
        "name": "Petite France",
        "category": "district",
        "source": {
          "title": "Strasbourg Tourist Office",
          "url": "https://groups.visitstrasbourg.fr/visite/la-visite-de-la-cathedrale-et-de-la-vielle-ville-a-pied/"
        }
      },
      {
        "id": "palais-rohan",
        "name": "Palais Rohan",
        "category": "museum",
        "source": {
          "title": "Strasbourg Tourist Office",
          "url": "https://groups.visitstrasbourg.fr/visite/la-visite-de-la-cathedrale-et-de-la-vielle-ville-a-pied/"
        }
      }
    ]
  },
  "TGD": {
    "summary": {
      "tr": "Podgorica’da Stara Varoš’un tarihî sokaklarını Gorica ve Ljubović tepelerinin yeşil alanlarıyla birleştirebilirsin.",
      "en": "Podgorica pairs the historic lanes of Stara Varoš with the green spaces on Gorica and Ljubović hills.",
      "sq": "Podgorica bashkon rrugicat historike të Stara Varoš me hapësirat e gjelbra të kodrave Gorica dhe Ljubović.",
      "ro": "Podgorica îmbină străduțele istorice din Stara Varoš cu spațiile verzi de pe dealurile Gorica și Ljubović."
    },
    "places": [
      {
        "id": "stara-varos",
        "name": "Stara Varoš",
        "category": "district",
        "source": {
          "title": "Tourism Organisation of Podgorica",
          "url": "https://podgorica.travel/stara-varos-i-sahat-kula-2/"
        }
      },
      {
        "id": "gorica-hill",
        "name": {
          "tr": "Gorica Tepesi",
          "en": "Gorica Hill",
          "sq": "Kodra Gorica",
          "ro": "Dealul Gorica"
        },
        "category": "park",
        "source": {
          "title": "Tourism Organisation of Podgorica",
          "url": "https://podgorica.travel/brdo-gorica-i-avanturisticki-park/"
        }
      },
      {
        "id": "ljubovic-hill",
        "name": {
          "tr": "Ljubović Tepesi",
          "en": "Ljubović Hill",
          "sq": "Kodra Ljubović",
          "ro": "Dealul Ljubović"
        },
        "category": "park",
        "source": {
          "title": "Tourism Organisation of Podgorica",
          "url": "https://podgorica.travel/brdo-ljubovic/"
        }
      }
    ]
  },
  "TLL": {
    "summary": {
      "tr": "Tallinn’in Belediye Meydanı ve Toompea çevresi Orta Çağ kentini tanıtırken Kadriorg farklı bir saray ve park manzarası sunar.",
      "en": "Tallinn’s Town Hall Square and Toompea introduce the medieval city, while Kadriorg adds a palace-and-park setting.",
      "sq": "Sheshi i Bashkisë dhe Toompea të njohin me Talinin mesjetar, ndërsa Kadriorg sjell pamje pallatesh dhe parku.",
      "ro": "Piața Primăriei și Toompea prezintă Tallinnul medieval, iar Kadriorg adaugă peisajul unui palat și parc."
    },
    "places": [
      {
        "id": "tallinn-town-hall-square",
        "name": {
          "tr": "Belediye Meydanı",
          "en": "Town Hall Square",
          "sq": "Sheshi i Bashkisë",
          "ro": "Piața Primăriei"
        },
        "category": "square",
        "source": {
          "title": "Visit Tallinn",
          "url": "https://www.visittallinn.ee/eng/visitor/see-do/things-to-do/attractions-museums/26907/tallinn-town-hall-square"
        }
      },
      {
        "id": "toompea-castle",
        "name": {
          "tr": "Toompea Kalesi",
          "en": "Toompea Castle",
          "sq": "Kalaja Toompea",
          "ro": "Castelul Toompea"
        },
        "category": "history",
        "source": {
          "title": "Visit Tallinn",
          "url": "https://www.visittallinn.ee/eng/visitor/see-do/things-to-do/attractions-museums/108738/toompea-castle"
        }
      },
      {
        "id": "kadriorg",
        "name": "Kadriorg",
        "category": "park",
        "source": {
          "title": "Visit Tallinn",
          "url": "https://web.visittallinn.ee/eng/visitor/ideas-tips/top-guides/best-of-tallinn"
        }
      }
    ]
  },
  "WAW": {
    "summary": {
      "tr": "Varşova’da Eski Şehir ve Kraliyet Kalesi’nden Łazienki Parkı’na geçerek tarih ile yeşil alanları aynı keşifte buluşturabilirsin.",
      "en": "Warsaw brings together its reconstructed Old Town, Royal Castle and the green spaces of Royal Łazienki.",
      "sq": "Varshava bashkon qytetin e vjetër të rindërtuar, Kështjellën Mbretërore dhe gjelbërimin e Łazienki-t.",
      "ro": "Varșovia reunește centrul vechi reconstruit, Castelul Regal și spațiile verzi ale parcului Łazienki."
    },
    "places": [
      {
        "id": "warsaw-old-town",
        "name": {
          "tr": "Varşova Eski Şehir",
          "en": "Warsaw Old Town",
          "sq": "Qyteti i vjetër i Varshavës",
          "ro": "Centrul vechi al Varșoviei"
        },
        "category": "district",
        "source": {
          "title": "Warsaw Tourism Office",
          "url": "https://go2warsaw.pl/en/one-day-in-warsaw/"
        }
      },
      {
        "id": "warsaw-royal-castle",
        "name": {
          "tr": "Kraliyet Kalesi",
          "en": "Royal Castle",
          "sq": "Kështjella Mbretërore",
          "ro": "Castelul Regal"
        },
        "category": "history",
        "source": {
          "title": "Warsaw Tourism Office",
          "url": "https://go2warsaw.pl/en/one-day-in-warsaw/"
        }
      },
      {
        "id": "royal-lazienki",
        "name": {
          "tr": "Łazienki Parkı",
          "en": "Royal Łazienki Park",
          "sq": "Parku Mbretëror Łazienki",
          "ro": "Parcul Łazienki"
        },
        "category": "park",
        "source": {
          "title": "Warsaw Tourism Office",
          "url": "https://go2warsaw.pl/en/one-day-in-warsaw/"
        }
      }
    ]
  },
  "KRK": {
    "summary": {
      "tr": "Krakov’un Wawel tepesi ve Ana Pazar Meydanı, kraliyet geçmişini ve eski ticaret merkezini tanımak için iyi bir başlangıçtır.",
      "en": "Kraków’s Wawel Hill and Main Market Square bring its royal past and historic trading centre into view.",
      "sq": "Kodra Wawel dhe Sheshi Kryesor i Tregut tregojnë të kaluarën mbretërore dhe qendrën historike tregtare të Krakovit.",
      "ro": "Dealul Wawel și Piața Centrală prezintă trecutul regal și vechiul centru comercial al Cracoviei."
    },
    "places": [
      {
        "id": "wawel-royal-castle",
        "name": {
          "tr": "Wawel Kraliyet Kalesi",
          "en": "Wawel Royal Castle",
          "sq": "Kështjella Mbretërore Wawel",
          "ro": "Castelul Regal Wawel"
        },
        "category": "history",
        "source": {
          "title": "Wawel Royal Castle",
          "url": "https://wawel.krakow.pl/en/explore"
        }
      },
      {
        "id": "krakow-main-square",
        "name": "Rynek Główny",
        "category": "square",
        "source": {
          "title": "Poland Travel · Polish Tourism Organisation",
          "url": "https://www.poland.travel/en/historic-center-of-krakow/"
        }
      },
      {
        "id": "cloth-hall",
        "name": "Sukiennice",
        "category": "market",
        "source": {
          "title": "Poland Travel · Polish Tourism Organisation",
          "url": "https://www.poland.travel/en/historic-center-of-krakow/"
        }
      }
    ]
  },
  "BTS": {
    "summary": {
      "tr": "Bratislava Kalesi, Eski Belediye Binası ve Mavi Kilise; şehrin savunma tarihini, merkezini ve Art Nouveau mimarisini birleştirir.",
      "en": "Bratislava Castle, the Old Town Hall and Blue Church connect fortress history, civic life and Art Nouveau architecture.",
      "sq": "Kalaja e Bratislavës, Bashkia e Vjetër dhe Kisha Blu lidhin historinë mbrojtëse me jetën qytetare dhe arkitekturën Art Nouveau.",
      "ro": "Castelul Bratislava, Primăria Veche și Biserica Albastră îmbină istoria fortificațiilor, viața civică și arhitectura Art Nouveau."
    },
    "places": [
      {
        "id": "bratislava-castle",
        "name": {
          "tr": "Bratislava Kalesi",
          "en": "Bratislava Castle",
          "sq": "Kalaja e Bratislavës",
          "ro": "Castelul Bratislava"
        },
        "category": "history",
        "source": {
          "title": "Visit Bratislava",
          "url": "https://www.visitbratislava.com/bratislava-in-2-days-for-first-timers/"
        }
      },
      {
        "id": "bratislava-old-town-hall",
        "name": {
          "tr": "Eski Belediye Binası",
          "en": "Old Town Hall",
          "sq": "Bashkia e Vjetër",
          "ro": "Primăria Veche"
        },
        "category": "museum",
        "source": {
          "title": "Visit Bratislava",
          "url": "https://www.visitbratislava.com/bratislava-in-2-days-for-first-timers/"
        }
      },
      {
        "id": "blue-church",
        "name": {
          "tr": "Mavi Kilise",
          "en": "Blue Church",
          "sq": "Kisha Blu",
          "ro": "Biserica Albastră"
        },
        "category": "religion",
        "source": {
          "title": "Visit Bratislava",
          "url": "https://www.visitbratislava.com/places/blue-church/"
        }
      }
    ]
  },
  "GDN": {
    "summary": {
      "tr": "Gdansk’ta Neptün Çeşmesi ve Azize Meryem Bazilikası tarihî merkezi, Avrupa Dayanışma Merkezi ise yakın tarihi anlatır.",
      "en": "Gdańsk’s Neptune Fountain and St Mary’s Basilica introduce the historic centre; the European Solidarity Centre explores more recent history.",
      "sq": "Shatërvani i Neptunit dhe Bazilika e Shën Marisë tregojnë qendrën historike; Qendra Evropiane e Solidaritetit trajton historinë e afërt.",
      "ro": "Fântâna lui Neptun și Bazilica Sfânta Maria prezintă centrul istoric, iar Centrul European al Solidarității explorează istoria recentă."
    },
    "places": [
      {
        "id": "neptune-fountain",
        "name": {
          "tr": "Neptün Çeşmesi",
          "en": "Neptune Fountain",
          "sq": "Shatërvani i Neptunit",
          "ro": "Fântâna lui Neptun"
        },
        "category": "landmark",
        "source": {
          "title": "Visit Gdańsk",
          "url": "https://visitgdansk.com/top-historycznych-miejsc-w-gdansku.qbpage?setLanguage=en"
        }
      },
      {
        "id": "gdansk-st-mary",
        "name": {
          "tr": "Azize Meryem Bazilikası",
          "en": "St Mary’s Basilica",
          "sq": "Bazilika e Shën Marisë",
          "ro": "Bazilica Sfânta Maria"
        },
        "category": "religion",
        "source": {
          "title": "Visit Gdańsk",
          "url": "https://visitgdansk.com/top-historycznych-miejsc-w-gdansku.qbpage?setLanguage=en"
        }
      },
      {
        "id": "european-solidarity-centre",
        "name": {
          "tr": "Avrupa Dayanışma Merkezi",
          "en": "European Solidarity Centre",
          "sq": "Qendra Evropiane e Solidaritetit",
          "ro": "Centrul European al Solidarității"
        },
        "category": "museum",
        "source": {
          "title": "Visit Gdańsk",
          "url": "https://visitgdansk.com/top-historycznych-miejsc-w-gdansku.qbpage?setLanguage=en"
        }
      }
    ]
  },
  "LIS": {
    "summary": {
      "tr": "Lizbon’da Belém’in denizcilik mirasını Jerónimos ve Belém Kulesi’nde, kentin yükseklerden görünümünü São Jorge Kalesi’nde keşfet.",
      "en": "Explore Lisbon’s maritime heritage at Belém Tower and Jerónimos Monastery, then the city’s hilltop setting at São Jorge Castle.",
      "sq": "Zbulo trashëgiminë detare të Lisbonës te Kulla Belém dhe Manastiri Jerónimos, pastaj pamjen e qytetit nga Kalaja São Jorge.",
      "ro": "Descoperă patrimoniul maritim al Lisabonei la Turnul Belém și Mănăstirea Jerónimos, apoi orașul de pe colina Castelului São Jorge."
    },
    "places": [
      {
        "id": "belem-tower",
        "name": {
          "tr": "Belém Kulesi",
          "en": "Belém Tower",
          "sq": "Kulla Belém",
          "ro": "Turnul Belém"
        },
        "category": "history",
        "source": {
          "title": "Visit Lisboa",
          "url": "https://www.visitlisboa.com/en/places/torre-de-belem"
        }
      },
      {
        "id": "jeronimos-monastery",
        "name": {
          "tr": "Jerónimos Manastırı",
          "en": "Jerónimos Monastery",
          "sq": "Manastiri Jerónimos",
          "ro": "Mănăstirea Jerónimos"
        },
        "category": "religion",
        "source": {
          "title": "Visit Lisboa",
          "url": "https://www.visitlisboa.com/en/places/jeronimos-monastery"
        }
      },
      {
        "id": "sao-jorge-castle",
        "name": "Castelo de São Jorge",
        "category": "history",
        "source": {
          "title": "Visit Lisboa",
          "url": "https://www.visitlisboa.com/en/places/castelo-de-sao-jorge"
        }
      }
    ]
  },
  "BUD": {
    "summary": {
      "tr": "Budapeşte’nin Tuna kıyısındaki Parlamento binası ile Buda’daki Balıkçı Tabyası ve Matthias Kilisesi şehrin iki yakasını tanıtır.",
      "en": "Budapest’s riverside Parliament and Buda’s Fisherman’s Bastion and Matthias Church introduce the city’s two banks.",
      "sq": "Parlamenti buzë Danubit, Bastioni i Peshkatarëve dhe Kisha Matthias të njohin me dy brigjet e Budapestit.",
      "ro": "Parlamentul de pe Dunăre, Bastionul Pescarilor și Biserica Matthias prezintă cele două maluri ale Budapestei."
    },
    "places": [
      {
        "id": "hungarian-parliament",
        "name": {
          "tr": "Macaristan Parlamento Binası",
          "en": "Hungarian Parliament",
          "sq": "Parlamenti i Hungarisë",
          "ro": "Parlamentul Ungariei"
        },
        "category": "architecture",
        "source": {
          "title": "Budapest Info",
          "url": "https://www.budapestinfo.hu/en/budapests-inner-city-the-heart-of-the-city"
        }
      },
      {
        "id": "fishermans-bastion",
        "name": {
          "tr": "Balıkçı Tabyası",
          "en": "Fisherman’s Bastion",
          "sq": "Bastioni i Peshkatarëve",
          "ro": "Bastionul Pescarilor"
        },
        "category": "history",
        "source": {
          "title": "Budapest Info",
          "url": "https://www.budapestinfo.hu/en/the-world-heritage-tour-of-buda"
        }
      },
      {
        "id": "matthias-church",
        "name": {
          "tr": "Matthias Kilisesi",
          "en": "Matthias Church",
          "sq": "Kisha Matthias",
          "ro": "Biserica Matthias"
        },
        "category": "religion",
        "source": {
          "title": "Budapest Info",
          "url": "https://www.budapestinfo.hu/en/the-world-heritage-tour-of-buda"
        }
      }
    ]
  },
  "ZAG": {
    "summary": {
      "tr": "Zagreb’in tarihî merkezini Aziz Marko Kilisesi, katedral ve Dolac Pazarı üzerinden; mimari ile günlük yaşamı birlikte izleyerek tanı.",
      "en": "Explore Zagreb’s historic centre through St Mark’s Church, the cathedral and Dolac Market, where architecture meets everyday life.",
      "sq": "Zbulo qendrën historike të Zagrebit përmes Kishës së Shën Markut, katedrales dhe Tregut Dolac, mes arkitekturës dhe jetës së përditshme.",
      "ro": "Descoperă centrul istoric al Zagrebului prin Biserica Sfântul Marcu, catedrală și Piața Dolac, între arhitectură și viață cotidiană."
    },
    "places": [
      {
        "id": "zagreb-st-mark",
        "name": {
          "tr": "Aziz Marko Kilisesi",
          "en": "St Mark’s Church",
          "sq": "Kisha e Shën Markut",
          "ro": "Biserica Sfântul Marcu"
        },
        "category": "religion",
        "source": {
          "title": "Zagreb Tourist Board",
          "url": "https://new.infozagreb.hr/en/explore-zagreb/attractions/architectural-monuments/st-marks-church"
        }
      },
      {
        "id": "zagreb-cathedral",
        "name": {
          "tr": "Zagreb Katedrali",
          "en": "Zagreb Cathedral",
          "sq": "Katedralja e Zagrebit",
          "ro": "Catedrala din Zagreb"
        },
        "category": "religion",
        "source": {
          "title": "Zagreb Tourist Board",
          "url": "https://www.infozagreb.hr/en/travel-plan/other-information/religion/roman-catholic-churches"
        }
      },
      {
        "id": "dolac-market",
        "name": {
          "tr": "Dolac Pazarı",
          "en": "Dolac Market",
          "sq": "Tregu Dolac",
          "ro": "Piața Dolac"
        },
        "category": "market",
        "source": {
          "title": "Zagreb Tourist Board",
          "url": "https://www.infozagreb.hr/hr/zagrebacki-vremeplov-stari/kumice-s-dolca"
        }
      }
    ]
  },
  "ATH": {
    "summary": {
      "tr": "Atina’da Akropolis yamaçları ve Antik Agora geçmişi anlatırken Ulusal Bahçe şehir içinde yeşil bir durak sunar.",
      "en": "Athens pairs the ancient sites of the Acropolis slopes and Agora with the green paths of the National Garden.",
      "sq": "Athina bashkon vendet antike të shpateve të Akropolit dhe Agorasë me shtigjet e gjelbra të Kopshtit Kombëtar.",
      "ro": "Atena îmbină siturile antice de pe versanții Acropolei și din Agora cu aleile verzi ale Grădinii Naționale."
    },
    "places": [
      {
        "id": "acropolis-slopes",
        "name": {
          "tr": "Akropolis Yamaçları",
          "en": "Acropolis Slopes",
          "sq": "Shpatet e Akropolit",
          "ro": "Versanții Acropolei"
        },
        "category": "history",
        "source": {
          "title": "This is Athens",
          "url": "https://accessibleroutes.thisisathens.org/en/mobility-ancient-athens-uncovered/archaeological-site-of-the-slopes-of-the-acropolis/"
        }
      },
      {
        "id": "ancient-agora",
        "name": {
          "tr": "Antik Agora",
          "en": "Ancient Agora",
          "sq": "Agora Antike",
          "ro": "Agora Antică"
        },
        "category": "history",
        "source": {
          "title": "This is Athens",
          "url": "https://accessibleroutes.thisisathens.org/en/mobility-historic-heart-to-urban-soul-of-athens/stoa-of-attalos-ancient-agora/"
        }
      },
      {
        "id": "athens-national-garden",
        "name": {
          "tr": "Ulusal Bahçe",
          "en": "National Garden",
          "sq": "Kopshti Kombëtar",
          "ro": "Grădina Națională"
        },
        "category": "park",
        "source": {
          "title": "This is Athens",
          "url": "https://www.thisisathens.org/sights/national-garden"
        }
      }
    ]
  },
  "OPO": {
    "summary": {
      "tr": "Porto’da São Bento’nun çinileri, Clérigos’un kulesi ve Ribeira’nın nehir kıyısı, şehrin mimarisine üç farklı bakış sunar.",
      "en": "São Bento’s tiles, Clérigos Tower and Ribeira’s riverfront offer three different views of Porto’s architecture.",
      "sq": "Pllakat dekorative të São Bento-s, Kulla Clérigos dhe bregu i Ribeirës tregojnë tri anë të arkitekturës së Portos.",
      "ro": "Azulejos din São Bento, Turnul Clérigos și malul râului din Ribeira oferă trei perspective asupra arhitecturii orașului Porto."
    },
    "places": [
      {
        "id": "sao-bento-station",
        "name": {
          "tr": "São Bento İstasyonu",
          "en": "São Bento Station",
          "sq": "Stacioni São Bento",
          "ro": "Gara São Bento"
        },
        "category": "architecture",
        "source": {
          "title": "Visit Portugal · Turismo de Portugal",
          "url": "https://www.visitportugal.com/en/content/porto-accessible-tour"
        }
      },
      {
        "id": "clerigos-tower",
        "name": "Torre dos Clérigos",
        "category": "landmark",
        "source": {
          "title": "Visit Portugal · Turismo de Portugal",
          "url": "https://www.visitportugal.com/pt-pt/content/torre-dos-clerigos"
        }
      },
      {
        "id": "ribeira",
        "name": "Ribeira",
        "category": "waterfront",
        "source": {
          "title": "Visit Portugal · Turismo de Portugal",
          "url": "https://www.visitportugal.com/en/content/porto-accessible-tour"
        }
      }
    ]
  },
  "CWL": {
    "summary": {
      "tr": "Cardiff’te kalenin tarihini, Bute Park’ın yeşil alanlarını ve Ulusal Müze’nin koleksiyonlarını aynı şehir keşfinde birleştirebilirsin.",
      "en": "Cardiff combines castle history, the green spaces of Bute Park and the collections of National Museum Cardiff.",
      "sq": "Kardifi bashkon historinë e kështjellës, gjelbërimin e Bute Park dhe koleksionet e Muzeut Kombëtar.",
      "ro": "Cardiff reunește istoria castelului, spațiile verzi din Bute Park și colecțiile Muzeului Național."
    },
    "places": [
      {
        "id": "cardiff-castle",
        "name": {
          "tr": "Cardiff Kalesi",
          "en": "Cardiff Castle",
          "sq": "Kalaja e Kardifit",
          "ro": "Castelul Cardiff"
        },
        "category": "history",
        "source": {
          "title": "Visit Cardiff",
          "url": "https://www.visitcardiff.com/highlights/cardiff-castle/"
        }
      },
      {
        "id": "bute-park",
        "name": "Bute Park",
        "category": "park",
        "source": {
          "title": "Visit Cardiff",
          "url": "https://www.visitcardiff.com/highlights/bute-park/"
        }
      },
      {
        "id": "national-museum-cardiff",
        "name": "National Museum Cardiff",
        "category": "museum",
        "source": {
          "title": "Visit Cardiff",
          "url": "https://www.visitcardiff.com/visitor-info/itineraries/1-day-in-cardiff-itinerary/"
        }
      }
    ]
  },
  "LYS": {
    "summary": {
      "tr": "Lyon’da Vieux Lyon’un sokakları ve Fourvière’in manzarası tarihî kenti, Tête d’Or Parkı ise yeşil yüzünü gösterir.",
      "en": "Lyon’s Vieux Lyon lanes and Fourvière views reveal the historic city, while Tête d’Or Park brings a greener perspective.",
      "sq": "Rrugicat e Vieux Lyon dhe pamjet nga Fourvière zbulojnë qytetin historik, ndërsa Parku Tête d’Or sjell gjelbërim.",
      "ro": "Străduțele din Vieux Lyon și priveliștile de la Fourvière dezvăluie orașul istoric, iar Parcul Tête d’Or adaugă verdeață."
    },
    "places": [
      {
        "id": "vieux-lyon",
        "name": "Vieux Lyon",
        "category": "district",
        "source": {
          "title": "Lyon Tourist Office",
          "url": "https://en.visiterlyon.com/sustainable-tourism-in-lyon/alternative-means-of-transport/itineraire-a-velo-les-incontournables-pour-decouvrir-lyon"
        }
      },
      {
        "id": "fourviere-basilica",
        "name": "Basilique Notre-Dame de Fourvière",
        "category": "religion",
        "source": {
          "title": "Lyon Tourist Office",
          "url": "https://en.visiterlyon.com/discover/lyon-the-way-you-like-it/for-lovebirds/lyon-s-best-viewpoints"
        }
      },
      {
        "id": "tete-or-park",
        "name": "Parc de la Tête d’Or",
        "category": "park",
        "source": {
          "title": "Lyon Tourist Office",
          "url": "https://en.visiterlyon.com/discover/lyon-the-way-you-like-it/in-the-heart-of-nature/a-summer-s-day-at-tete-d-or-park"
        }
      }
    ]
  },
  "PRG": {
    "summary": {
      "tr": "Prag’da kale avluları, Karl Köprüsü ve Eski Şehir Meydanı, Vltava’nın iki yanında tarihî bir keşfin başlangıç noktalarıdır.",
      "en": "Prague Castle, Charles Bridge and Old Town Square introduce the city’s historic streets on both sides of the Vltava.",
      "sq": "Kalaja e Pragës, Ura e Karlit dhe Sheshi i Qytetit të Vjetër hapin rrugën për të zbuluar historinë në të dy brigjet e Vltavës.",
      "ro": "Castelul Praga, Podul Carol și Piața Orașului Vechi prezintă străzile istorice de pe ambele maluri ale Vltavei."
    },
    "places": [
      {
        "id": "prague-castle",
        "name": {
          "tr": "Prag Kalesi",
          "en": "Prague Castle",
          "sq": "Kalaja e Pragës",
          "ro": "Castelul Praga"
        },
        "category": "history",
        "source": {
          "title": "Prague City Tourism",
          "url": "https://prague.eu/en/objevujte/prague-castle-prazsky-hrad/"
        }
      },
      {
        "id": "charles-bridge",
        "name": {
          "tr": "Karl Köprüsü",
          "en": "Charles Bridge",
          "sq": "Ura e Karlit",
          "ro": "Podul Carol"
        },
        "category": "architecture",
        "source": {
          "title": "Prague City Tourism",
          "url": "https://prague.eu/en/objevujte/charles-bridge-karluv-most/"
        }
      },
      {
        "id": "prague-old-town-square",
        "name": {
          "tr": "Eski Şehir Meydanı",
          "en": "Old Town Square",
          "sq": "Sheshi i Qytetit të Vjetër",
          "ro": "Piața Orașului Vechi"
        },
        "category": "square",
        "source": {
          "title": "Prague City Tourism",
          "url": "https://prague.eu/en/home/discover/one-day-in-prague-you-wont-want-to-leave/"
        }
      }
    ]
  },
  "BER": {
    "summary": {
      "tr": "Berlin’de Brandenburg Kapısı, Müze Adası ve East Side Gallery; kent tarihini, sanat koleksiyonlarını ve duvarın izlerini bir araya getirir.",
      "en": "Berlin links city history, museum collections and traces of the Wall through Brandenburg Gate, Museum Island and the East Side Gallery.",
      "sq": "Berlini lidh historinë e qytetit, koleksionet muzeale dhe gjurmët e Murit përmes Portës së Brandenburgut, Ishullit të Muzeve dhe East Side Gallery.",
      "ro": "Berlinul leagă istoria urbană, colecțiile muzeale și urmele Zidului prin Poarta Brandenburg, Insula Muzeelor și East Side Gallery."
    },
    "places": [
      {
        "id": "brandenburg-gate",
        "name": {
          "tr": "Brandenburg Kapısı",
          "en": "Brandenburg Gate",
          "sq": "Porta e Brandenburgut",
          "ro": "Poarta Brandenburg"
        },
        "category": "landmark",
        "source": {
          "title": "visitBerlin",
          "url": "https://www.visitberlin.de/en/frequently-asked-questions"
        }
      },
      {
        "id": "museum-island",
        "name": {
          "tr": "Müze Adası",
          "en": "Museum Island",
          "sq": "Ishulli i Muzeve",
          "ro": "Insula Muzeelor"
        },
        "category": "museum",
        "source": {
          "title": "visitBerlin",
          "url": "https://www.visitberlin.de/en/frequently-asked-questions"
        }
      },
      {
        "id": "east-side-gallery",
        "name": "East Side Gallery",
        "category": "culture",
        "source": {
          "title": "visitBerlin",
          "url": "https://www.visitberlin.de/en/east-side-gallery"
        }
      }
    ]
  },
  "BRU": {
    "summary": {
      "tr": "Brüksel’de Grand-Place’ın tarihî cephelerini, Atomium’un deneysel mimarisini ve Mont des Arts’ın bahçesini keşfet.",
      "en": "Brussels contrasts the historic façades of Grand-Place with the Atomium’s experimental architecture and Mont des Arts garden.",
      "sq": "Brukseli ndërthur fasadat historike të Grand-Place me arkitekturën eksperimentale të Atomiumit dhe kopshtin Mont des Arts.",
      "ro": "Bruxelles contrastează fațadele istorice din Grand-Place cu arhitectura experimentală a Atomiumului și grădina Mont des Arts."
    },
    "places": [
      {
        "id": "grand-place",
        "name": "Grand-Place",
        "category": "square",
        "source": {
          "title": "Visit Brussels",
          "url": "https://www.visit.brussels/en/visitors/plan-your-trip/couple-trip-brussels/day-1"
        }
      },
      {
        "id": "atomium",
        "name": "Atomium",
        "category": "architecture",
        "source": {
          "title": "Visit Brussels",
          "url": "https://www.visit.brussels/en/visitors/venue-details.1213"
        }
      },
      {
        "id": "mont-des-arts",
        "name": "Mont des Arts",
        "category": "park",
        "source": {
          "title": "Visit Brussels",
          "url": "https://www.visit.brussels/en/professionals/venue-details.The-Mont-des-Arts-Garden.266026"
        }
      }
    ]
  },
  "SZG": {
    "summary": {
      "tr": "Salzburg’da Mozart’ın doğduğu ev, Hohensalzburg Kalesi ve Mirabell, müzik mirasını saraylar ve tarihî kent manzarasıyla buluşturur.",
      "en": "Salzburg connects Mozart’s birthplace with Hohensalzburg Fortress and Mirabell’s palace setting, mixing musical heritage and city history.",
      "sq": "Salzburgu lidh shtëpinë e lindjes së Mozartit me Kalanë Hohensalzburg dhe Mirabellin, mes trashëgimisë muzikore dhe historisë.",
      "ro": "Salzburg leagă casa natală a lui Mozart de Cetatea Hohensalzburg și ansamblul Mirabell, între patrimoniu muzical și istorie."
    },
    "places": [
      {
        "id": "hohensalzburg",
        "name": {
          "tr": "Hohensalzburg Kalesi",
          "en": "Hohensalzburg Fortress",
          "sq": "Kalaja Hohensalzburg",
          "ro": "Cetatea Hohensalzburg"
        },
        "category": "history",
        "source": {
          "title": "Salzburg Tourism · Themed walks",
          "url": "https://www.salzburg.info/PDF/05_hotel-angebote/rundfahrten%20fuehrungen/themenwege/Salzburger%20Themenwege_Booklet_2023_DE-EN_web.pdf"
        }
      },
      {
        "id": "mozart-birthplace",
        "name": {
          "tr": "Mozart’ın Doğduğu Ev",
          "en": "Mozart’s Birthplace",
          "sq": "Shtëpia e lindjes së Mozartit",
          "ro": "Casa natală a lui Mozart"
        },
        "category": "museum",
        "source": {
          "title": "Salzburg Tourism",
          "url": "https://www.salzburg.info/en/sights/top10/mozarts-birthplace"
        }
      },
      {
        "id": "mirabell",
        "name": {
          "tr": "Mirabell Sarayı ve Bahçeleri",
          "en": "Mirabell Palace and Gardens",
          "sq": "Pallati dhe kopshtet Mirabell",
          "ro": "Palatul și grădinile Mirabell"
        },
        "category": "park",
        "source": {
          "title": "Salzburg Tourism · Themed walks",
          "url": "https://www.salzburg.info/PDF/05_hotel-angebote/rundfahrten%20fuehrungen/themenwege/Salzburger%20Themenwege_Booklet_2023_DE-EN_web.pdf"
        }
      }
    ]
  },
  "LUX": {
    "summary": {
      "tr": "Lüksemburg’da Bock tünelleri, Corniche yolu ve Grund mahallesi; surlarla vadiler arasında katmanlı bir kent manzarası sunar.",
      "en": "Luxembourg’s Bock Casemates, Corniche and Grund reveal a city shaped by fortifications, valleys and different levels.",
      "sq": "Kazamatet Bock, Corniche dhe Grund tregojnë një qytet të formuar nga fortifikimet, luginat dhe nivelet e ndryshme.",
      "ro": "Cazematele Bock, Corniche și Grund dezvăluie un oraș modelat de fortificații, văi și niveluri diferite."
    },
    "places": [
      {
        "id": "bock-casemates",
        "name": {
          "tr": "Bock Kazamatları",
          "en": "Bock Casemates",
          "sq": "Kazamatet Bock",
          "ro": "Cazematele Bock"
        },
        "category": "history",
        "source": {
          "title": "Luxembourg City Tourist Office",
          "url": "https://www.luxembourg-city.com/fr/visites-activites/underground/casemates-du-bock"
        }
      },
      {
        "id": "corniche",
        "name": "Chemin de la Corniche",
        "category": "viewpoint",
        "source": {
          "title": "Luxembourg City Tourist Office",
          "url": "https://www.luxembourg-city.com/fr/adresse/fortification/chemin-de-la-corniche"
        }
      },
      {
        "id": "grund",
        "name": "Grund",
        "category": "district",
        "source": {
          "title": "Luxembourg City Tourist Office",
          "url": "https://www.luxembourg-city.com/fr/adresse/fortification/chemin-de-la-corniche"
        }
      }
    ]
  },
  "DBV": {
    "summary": {
      "tr": "Dubrovnik’in surları, Stradun caddesi ve Rektör Sarayı; eski kentin savunma, ticaret ve yönetim geçmişini anlatır.",
      "en": "Dubrovnik’s city walls, Stradun and Rector’s Palace tell the story of the old city’s defence, commerce and government.",
      "sq": "Muret e Dubrovnikut, Straduni dhe Pallati i Rektorit tregojnë të kaluarën mbrojtëse, tregtare dhe qeverisëse të qytetit.",
      "ro": "Zidurile Dubrovnikului, Stradun și Palatul Rectorului prezintă trecutul defensiv, comercial și administrativ al orașului."
    },
    "places": [
      {
        "id": "dubrovnik-walls",
        "name": {
          "tr": "Dubrovnik Surları",
          "en": "Dubrovnik City Walls",
          "sq": "Muret e Dubrovnikut",
          "ro": "Zidurile Dubrovnikului"
        },
        "category": "history",
        "source": {
          "title": "Dubrovnik Tourist Board · City guide",
          "url": "https://tzdubrovnik.hr/lang/13/user_files/novak/Dubrovnik_riviera_info_english.pdf"
        }
      },
      {
        "id": "stradun",
        "name": "Stradun",
        "category": "district",
        "source": {
          "title": "Dubrovnik Tourist Board · City guide",
          "url": "https://tzdubrovnik.hr/lang/13/user_files/novak/Dubrovnik_riviera_info_english.pdf"
        }
      },
      {
        "id": "rectors-palace",
        "name": {
          "tr": "Rektör Sarayı",
          "en": "Rector’s Palace",
          "sq": "Pallati i Rektorit",
          "ro": "Palatul Rectorului"
        },
        "category": "museum",
        "source": {
          "title": "Dubrovnik Tourist Board · City guide",
          "url": "https://tzdubrovnik.hr/lang/13/user_files/novak/Dubrovnik_riviera_info_english.pdf"
        }
      }
    ]
  },
  "ARN": {
    "summary": {
      "tr": "Stockholm’ü Gamla Stan’ın tarihî sokakları, Vasa gemisinin müzesi ve Skansen’in açık hava koleksiyonlarıyla tanıyabilirsin.",
      "en": "Discover Stockholm through Gamla Stan’s historic lanes, the Vasa warship and Skansen’s open-air collections.",
      "sq": "Zbulo Stokholmin përmes rrugicave historike të Gamla Stan, anijes Vasa dhe koleksioneve në ajër të hapur të Skansenit.",
      "ro": "Descoperă Stockholm prin străduțele istorice din Gamla Stan, nava Vasa și colecțiile în aer liber de la Skansen."
    },
    "places": [
      {
        "id": "gamla-stan",
        "name": "Gamla Stan",
        "category": "district",
        "source": {
          "title": "Visit Stockholm",
          "url": "https://www.visitstockholm.com/guides/shop-vintage-and-second-hand-in-gamla-stan/"
        }
      },
      {
        "id": "vasa-museum",
        "name": {
          "tr": "Vasa Müzesi",
          "en": "Vasa Museum",
          "sq": "Muzeu Vasa",
          "ro": "Muzeul Vasa"
        },
        "category": "museum",
        "source": {
          "title": "Visit Stockholm",
          "url": "https://www.visitstockholm.com/o/the-vasa-museum/"
        }
      },
      {
        "id": "skansen",
        "name": "Skansen",
        "category": "museum",
        "source": {
          "title": "Skansen",
          "url": "https://www.skansen.se/en/see-and-do/open-air-museum/"
        }
      }
    ]
  },
  "LJU": {
    "summary": {
      "tr": "Ljubljana’nın kale tepesi, Üçlü Köprü ve Prešeren Meydanı, tarihî merkez ile nehir çevresindeki yaşamı birbirine bağlar.",
      "en": "Ljubljana Castle, Triple Bridge and Prešeren Square link the historic centre with the city’s riverside life.",
      "sq": "Kalaja e Ljubljanës, Ura Treshe dhe Sheshi Prešeren lidhin qendrën historike me jetën buzë lumit.",
      "ro": "Castelul Ljubljana, Podul Triplu și Piața Prešeren leagă centrul istoric de viața de pe malul râului."
    },
    "places": [
      {
        "id": "ljubljana-castle",
        "name": {
          "tr": "Ljubljana Kalesi",
          "en": "Ljubljana Castle",
          "sq": "Kalaja e Ljubljanës",
          "ro": "Castelul Ljubljana"
        },
        "category": "history",
        "source": {
          "title": "Visit Ljubljana",
          "url": "https://www.visitljubljana.com/en/visitors/sights-and-activities/explore-the-ljubljana-old-town"
        }
      },
      {
        "id": "triple-bridge",
        "name": {
          "tr": "Üçlü Köprü",
          "en": "Triple Bridge",
          "sq": "Ura Treshe",
          "ro": "Podul Triplu"
        },
        "category": "architecture",
        "source": {
          "title": "Visit Ljubljana",
          "url": "https://www.visitljubljana.com/en/poi/triple-bridge/"
        }
      },
      {
        "id": "preseren-square",
        "name": {
          "tr": "Prešeren Meydanı",
          "en": "Prešeren Square",
          "sq": "Sheshi Prešeren",
          "ro": "Piața Prešeren"
        },
        "category": "square",
        "source": {
          "title": "Visit Ljubljana",
          "url": "https://www.visitljubljana.com/en/visitors/sights-and-activities/explore-the-ljubljana-old-town"
        }
      }
    ]
  },
  "NCE": {
    "summary": {
      "tr": "Nice’te deniz kıyısındaki Promenade des Anglais, Kale Tepesi’nin manzarası ve Matisse Müzesi, sahili sanatla birleştirir.",
      "en": "Nice combines the seaside Promenade des Anglais, Castle Hill views and the art of the Matisse Museum.",
      "sq": "Nica ndërthur shëtitoren bregdetare Promenade des Anglais, pamjet nga Kodra e Kalasë dhe artin e Muzeut Matisse.",
      "ro": "Nisa îmbină Promenade des Anglais, priveliștile de pe Colina Castelului și arta Muzeului Matisse."
    },
    "places": [
      {
        "id": "promenade-anglais",
        "name": "Promenade des Anglais",
        "category": "waterfront",
        "source": {
          "title": "Nice Côte d’Azur Tourist Office",
          "url": "https://www.explorenicecotedazur.com/en/culture/promenade-des-anglais/"
        }
      },
      {
        "id": "nice-castle-hill",
        "name": {
          "tr": "Kale Tepesi",
          "en": "Castle Hill",
          "sq": "Kodra e Kalasë",
          "ro": "Colina Castelului"
        },
        "category": "park",
        "source": {
          "title": "Nice Côte d’Azur Tourist Office",
          "url": "https://www.explorenicecotedazur.com/en/what-to-do-and-see-on-a-weekend-in-nice/"
        }
      },
      {
        "id": "matisse-museum",
        "name": "Musée Matisse",
        "category": "museum",
        "source": {
          "title": "Nice Côte d’Azur Tourist Office",
          "url": "https://www.explorenicecotedazur.com/culture/musee-matisse-nice/"
        }
      }
    ]
  },
  "BFS": {
    "summary": {
      "tr": "Belfast’ın gemi yapım geçmişini Titanic Belfast’ta, kent yaşamını Belediye Binası’nda ve anı bahçesinde keşfet.",
      "en": "Explore Belfast’s shipbuilding story at Titanic Belfast, then its civic history at City Hall and the Titanic Memorial Garden.",
      "sq": "Zbulo historinë e ndërtimit të anijeve te Titanic Belfast, pastaj historinë qytetare te Bashkia dhe Kopshti Përkujtimor i Titanikut.",
      "ro": "Explorează istoria construcțiilor navale la Titanic Belfast, apoi istoria civică la Primărie și în Grădina Memorială Titanic."
    },
    "places": [
      {
        "id": "titanic-belfast",
        "name": "Titanic Belfast",
        "category": "museum",
        "source": {
          "title": "Visit Belfast",
          "url": "https://visitbelfast.com/listing/titanic-belfast/97603101/"
        }
      },
      {
        "id": "belfast-city-hall",
        "name": {
          "tr": "Belfast Belediye Binası",
          "en": "Belfast City Hall",
          "sq": "Bashkia e Belfastit",
          "ro": "Primăria Belfast"
        },
        "category": "architecture",
        "source": {
          "title": "Visit Belfast",
          "url": "https://visitbelfast.com/partners/belfast-city-hall/"
        }
      },
      {
        "id": "titanic-memorial-garden",
        "name": {
          "tr": "Titanic Anı Bahçesi",
          "en": "Titanic Memorial Garden",
          "sq": "Kopshti Përkujtimor i Titanikut",
          "ro": "Grădina Memorială Titanic"
        },
        "category": "park",
        "source": {
          "title": "Visit Belfast",
          "url": "https://visitbelfast.com/listing/titanic-memorial-garden/97607101/"
        }
      }
    ]
  },
  "LHR": {
    "summary": {
      "tr": "Londra’da Londra Kulesi’nin kraliyet geçmişinden British Museum’un dünya koleksiyonlarına ve National Gallery’nin resimlerine uzanabilirsin.",
      "en": "London opens up through the Tower’s royal history, the British Museum’s global collections and paintings at the National Gallery.",
      "sq": "Londra zbulohet përmes historisë mbretërore të Kullës, koleksioneve botërore të British Museum dhe pikturave të Galerisë Kombëtare.",
      "ro": "Londra se dezvăluie prin istoria regală a Turnului, colecțiile mondiale ale British Museum și picturile de la National Gallery."
    },
    "places": [
      {
        "id": "tower-of-london",
        "name": {
          "tr": "Londra Kulesi",
          "en": "Tower of London",
          "sq": "Kulla e Londrës",
          "ro": "Turnul Londrei"
        },
        "category": "history",
        "source": {
          "title": "Visit London",
          "url": "https://www.visitlondon.com/things-to-do/place/22249-hm-tower-of-london"
        }
      },
      {
        "id": "british-museum",
        "name": "British Museum",
        "category": "museum",
        "source": {
          "title": "Visit London",
          "url": "https://www.visitlondon.com/things-to-do/place/285709-british-museum"
        }
      },
      {
        "id": "national-gallery-london",
        "name": "National Gallery",
        "category": "museum",
        "source": {
          "title": "Visit London",
          "url": "https://www.visitlondon.com/things-to-do/place/427197-national-gallery"
        }
      }
    ]
  },
  "HAM": {
    "summary": {
      "tr": "Hamburg’un Speicherstadt depoları ve Elbphilharmonie’si liman kimliğini, Planten un Blomen ise şehir içindeki yeşil yaşamı gösterir.",
      "en": "Hamburg’s Speicherstadt and Elbphilharmonie reflect its harbour identity, while Planten un Blomen adds a green city retreat.",
      "sq": "Speicherstadt dhe Elbphilharmonie tregojnë identitetin portual të Hamburgut, ndërsa Planten un Blomen sjell gjelbërim në qytet.",
      "ro": "Speicherstadt și Elbphilharmonie reflectă identitatea portuară a Hamburgului, iar Planten un Blomen adaugă un refugiu verde."
    },
    "places": [
      {
        "id": "speicherstadt",
        "name": "Speicherstadt",
        "category": "district",
        "source": {
          "title": "Hamburg Tourism",
          "url": "https://www.hamburg-travel.com/see-explore/sightseeing/sightseeing-from-a-to-z/?cHash=66486c7b9fd80a2aa59f295954a77f3b&page=1&showall=1"
        }
      },
      {
        "id": "elbphilharmonie",
        "name": "Elbphilharmonie",
        "category": "culture",
        "source": {
          "title": "Hamburg Tourism",
          "url": "https://www.hamburg-travel.com/see-explore/sightseeing/sightseeing-from-a-to-z/?cHash=66486c7b9fd80a2aa59f295954a77f3b&page=1&showall=1"
        }
      },
      {
        "id": "planten-un-blomen",
        "name": "Planten un Blomen",
        "category": "park",
        "source": {
          "title": "Hamburg Tourism",
          "url": "https://www.hamburg-travel.com/see-explore/sightseeing/sightseeing-from-a-to-z/?cHash=66486c7b9fd80a2aa59f295954a77f3b&page=1&showall=1"
        }
      }
    ]
  },
  "FLR": {
    "summary": {
      "tr": "Floransa’da katedralin mimarisi, Uffizi’nin sanat koleksiyonları ve Ponte Vecchio’nun dükkânları, Arno çevresinde farklı keşifler sunar.",
      "en": "Florence combines cathedral architecture, Uffizi art and the shops of Ponte Vecchio around the River Arno.",
      "sq": "Firencja ndërthur arkitekturën e katedrales, artin e Uffizi-t dhe dyqanet e Ponte Vecchio-s rreth lumit Arno.",
      "ro": "Florența îmbină arhitectura catedralei, arta de la Uffizi și magazinele de pe Ponte Vecchio, în jurul râului Arno."
    },
    "places": [
      {
        "id": "florence-cathedral",
        "name": "Cattedrale di Santa Maria del Fiore",
        "category": "religion",
        "source": {
          "title": "Feel Florence · City of Florence",
          "url": "https://www.feelflorence.it/en/editorial-staff/online-reservations"
        }
      },
      {
        "id": "uffizi-gallery",
        "name": {
          "tr": "Uffizi Galerisi",
          "en": "Uffizi Gallery",
          "sq": "Galeria Uffizi",
          "ro": "Galeria Uffizi"
        },
        "category": "museum",
        "source": {
          "title": "Feel Florence · City of Florence",
          "url": "https://www.feelflorence.it/en/editorial-staff/online-reservations"
        }
      },
      {
        "id": "ponte-vecchio",
        "name": "Ponte Vecchio",
        "category": "architecture",
        "source": {
          "title": "Feel Florence · City of Florence",
          "url": "https://www.feelflorence.it/en/points-interest/ponte-vecchio"
        }
      }
    ]
  },
  "VIE": {
    "summary": {
      "tr": "Viyana’da Schönbrunn ve Belvedere’nin saray bahçeleri ile Aziz Stefan Katedrali, şehrin mimari ve imparatorluk mirasını tanıtır.",
      "en": "Vienna’s Schönbrunn and Belvedere palace gardens join St Stephen’s Cathedral in an introduction to the city’s architectural and imperial heritage.",
      "sq": "Kopshtet e pallateve Schönbrunn dhe Belvedere, bashkë me Katedralen e Shën Stefanit, prezantojnë trashëgiminë arkitekturore dhe perandorake të Vjenës.",
      "ro": "Grădinile palatelor Schönbrunn și Belvedere, alături de Catedrala Sfântul Ștefan, prezintă patrimoniul arhitectural și imperial al Vienei."
    },
    "places": [
      {
        "id": "schoenbrunn-gardens",
        "name": {
          "tr": "Schönbrunn Saray Parkı",
          "en": "Schönbrunn Palace Park",
          "sq": "Parku i Pallatit Schönbrunn",
          "ro": "Parcul Palatului Schönbrunn"
        },
        "category": "park",
        "source": {
          "title": "Vienna Tourist Board",
          "url": "https://www.wien.info/en/livable-vienna/parks-green-spaces/baroque-gardens-palace-parks-340340"
        }
      },
      {
        "id": "belvedere-gardens",
        "name": {
          "tr": "Belvedere Saray Bahçeleri",
          "en": "Belvedere Palace Gardens",
          "sq": "Kopshtet e Pallatit Belvedere",
          "ro": "Grădinile Palatului Belvedere"
        },
        "category": "park",
        "source": {
          "title": "Vienna Tourist Board",
          "url": "https://www.wien.info/en/livable-vienna/parks-green-spaces/baroque-gardens-palace-parks-340340"
        }
      },
      {
        "id": "st-stephen-vienna",
        "name": {
          "tr": "Aziz Stefan Katedrali",
          "en": "St Stephen’s Cathedral",
          "sq": "Katedralja e Shën Stefanit",
          "ro": "Catedrala Sfântul Ștefan"
        },
        "category": "religion",
        "source": {
          "title": "Vienna Tourist Board",
          "url": "https://www.wien.info/en/see-do/view-points-364362"
        }
      }
    ]
  },
  "OST": {
    "summary": {
      "tr": "Brugge’de Markt’ın tarihî binaları ve çan kulesi şehir merkezini tanıtır; Minnewaterpark ise göl kıyısında yeşil bir duraktır.",
      "en": "Bruges pairs the historic buildings and belfry of Markt with the green lakeside setting of Minnewaterpark.",
      "sq": "Bruges bashkon ndërtesat historike dhe kambanoren e Markt me gjelbërimin buzë liqenit të Minnewaterpark.",
      "ro": "Bruges reunește clădirile istorice și clopotnița din Markt cu spațiul verde de lângă lac din Minnewaterpark."
    },
    "places": [
      {
        "id": "bruges-belfry",
        "name": {
          "tr": "Brugge Çan Kulesi",
          "en": "Belfry of Bruges",
          "sq": "Kambanorja e Bruges",
          "ro": "Clopotnița din Bruges"
        },
        "category": "landmark",
        "source": {
          "title": "Visit Bruges",
          "url": "https://www.visitbruges.be/en/things-to-do/culture-and-heritage/belfort-belfry"
        }
      },
      {
        "id": "bruges-markt",
        "name": "Markt",
        "category": "square",
        "source": {
          "title": "Visit Bruges",
          "url": "https://www.visitbruges.be/en/things-to-do/culture-and-heritage/markt-market-square"
        }
      },
      {
        "id": "minnewaterpark",
        "name": "Minnewaterpark",
        "category": "park",
        "source": {
          "title": "Visit Bruges",
          "url": "https://www.visitbruges.be/en/things-to-do/culture-and-heritage/minnewaterpark-lake-love-park"
        }
      }
    ]
  },
  "HEL": {
    "summary": {
      "tr": "Helsinki’de Suomenlinna’nın deniz kalesi, katedralin tarihî silueti ve Oodi’nin çağdaş mimarisi farklı dönemleri bir araya getirir.",
      "en": "Helsinki brings together Suomenlinna’s sea fortress, the cathedral’s historic silhouette and Oodi’s contemporary architecture.",
      "sq": "Helsinki bashkon kalanë detare Suomenlinna, siluetën historike të katedrales dhe arkitekturën bashkëkohore të Oodi-t.",
      "ro": "Helsinki reunește fortăreața maritimă Suomenlinna, silueta istorică a catedralei și arhitectura contemporană a bibliotecii Oodi."
    },
    "places": [
      {
        "id": "suomenlinna",
        "name": {
          "tr": "Suomenlinna Deniz Kalesi",
          "en": "Suomenlinna Sea Fortress",
          "sq": "Kalaja Detare Suomenlinna",
          "ro": "Fortăreața Maritimă Suomenlinna"
        },
        "category": "history",
        "source": {
          "title": "MyHelsinki",
          "url": "https://www.myhelsinki.fi/fi/places/suomenlinnan-merilinnoitus/"
        }
      },
      {
        "id": "helsinki-cathedral",
        "name": {
          "tr": "Helsinki Katedrali",
          "en": "Helsinki Cathedral",
          "sq": "Katedralja e Helsinkit",
          "ro": "Catedrala din Helsinki"
        },
        "category": "religion",
        "source": {
          "title": "MyHelsinki",
          "url": "https://www.myhelsinki.fi/places/helsinki-cathedral/"
        }
      },
      {
        "id": "oodi-library",
        "name": {
          "tr": "Oodi Merkez Kütüphanesi",
          "en": "Oodi Central Library",
          "sq": "Biblioteka Qendrore Oodi",
          "ro": "Biblioteca Centrală Oodi"
        },
        "category": "culture",
        "source": {
          "title": "Oodi · Helsinki City Library",
          "url": "https://oodihelsinki.fi/en/"
        }
      }
    ]
  },
  "MAD": {
    "summary": {
      "tr": "Madrid’de Prado’nun sanat koleksiyonları, Retiro’nun park yolları ve Kraliyet Sarayı; kültür ile açık havayı bir araya getirir.",
      "en": "Madrid combines Prado art collections, Retiro’s park paths and the Royal Palace for a mix of culture and outdoor space.",
      "sq": "Madridi bashkon koleksionet e Prados, shtigjet e Retiro-s dhe Pallatin Mbretëror, mes kulturës dhe hapësirave të hapura.",
      "ro": "Madrid reunește colecțiile Prado, aleile parcului Retiro și Palatul Regal, între cultură și spații în aer liber."
    },
    "places": [
      {
        "id": "prado-museum",
        "name": "Museo del Prado",
        "category": "museum",
        "source": {
          "title": "Madrid Tourism",
          "url": "https://www.esmadrid.com/paisaje-de-la-luz-madrid-lista-patrimonio-mundial-unesco"
        }
      },
      {
        "id": "retiro-park",
        "name": "Parque de El Retiro",
        "category": "park",
        "source": {
          "title": "Madrid Tourism",
          "url": "https://www.esmadrid.com/informacion-turistica/parque-del-retiro"
        }
      },
      {
        "id": "madrid-royal-palace",
        "name": {
          "tr": "Madrid Kraliyet Sarayı",
          "en": "Royal Palace of Madrid",
          "sq": "Pallati Mbretëror i Madridit",
          "ro": "Palatul Regal din Madrid"
        },
        "category": "history",
        "source": {
          "title": "Madrid Tourism",
          "url": "https://www.esmadrid.com/en/tourist-information/royal-palace"
        }
      }
    ]
  },
  "VCE": {
    "summary": {
      "tr": "Venedik’te San Marco çevresinin anıtsal yapıları ile Rialto Köprüsü, şehrin yönetim, ticaret ve suyla kurduğu ilişkiyi gösterir.",
      "en": "Venice’s San Marco landmarks and Rialto Bridge reveal the city’s connections with government, trade and water.",
      "sq": "Monumentet e San Marcos dhe Ura Rialto tregojnë lidhjet e Venedikut me qeverisjen, tregtinë dhe ujin.",
      "ro": "Monumentele din San Marco și Podul Rialto dezvăluie legăturile Veneției cu administrația, comerțul și apa."
    },
    "places": [
      {
        "id": "st-marks-basilica",
        "name": {
          "tr": "San Marco Bazilikası",
          "en": "St Mark’s Basilica",
          "sq": "Bazilika e Shën Markut",
          "ro": "Bazilica San Marco"
        },
        "category": "religion",
        "source": {
          "title": "Venezia Unica · City of Venice",
          "url": "https://www.veneziaunica.it/en/things-to-do-in-venice/st-mark-s-square/basilica-di-san-marco-and-its-museum"
        }
      },
      {
        "id": "doges-palace",
        "name": {
          "tr": "Dükler Sarayı",
          "en": "Doge’s Palace",
          "sq": "Pallati i Dozhëve",
          "ro": "Palatul Dogilor"
        },
        "category": "museum",
        "source": {
          "title": "Venezia Unica · City of Venice",
          "url": "https://www.veneziaunica.it/en/things-to-do-in-venice/venice-areas/sestieri/san-marco"
        }
      },
      {
        "id": "rialto-bridge",
        "name": {
          "tr": "Rialto Köprüsü",
          "en": "Rialto Bridge",
          "sq": "Ura Rialto",
          "ro": "Podul Rialto"
        },
        "category": "architecture",
        "source": {
          "title": "Venezia Unica · City of Venice",
          "url": "https://www.veneziaunica.it/en/things-to-do-in-venice/monuments-and-theatres/rialto-bridge"
        }
      }
    ]
  },
  "ORK": {
    "summary": {
      "tr": "Cork’ta English Market’ın yemek tezgâhlarını, Shandon’ın çan kulesini ve Lee Nehri kıyısındaki Fitzgerald’s Park’ı keşfet.",
      "en": "Cork offers the food stalls of the English Market, Shandon’s bell tower and Fitzgerald’s Park beside the River Lee.",
      "sq": "Korku ofron tezgat ushqimore të English Market, kambanoren Shandon dhe Fitzgerald’s Park buzë lumit Lee.",
      "ro": "Cork oferă tarabele alimentare din English Market, clopotnița Shandon și Fitzgerald’s Park, pe malul râului Lee."
    },
    "places": [
      {
        "id": "cork-english-market",
        "name": "English Market",
        "category": "market",
        "source": {
          "title": "Discover Ireland · Fáilte Ireland",
          "url": "https://www.discoverireland.ie/cork/english-market"
        }
      },
      {
        "id": "shandon-bells",
        "name": "Shandon Bells & St Anne’s Church",
        "category": "religion",
        "source": {
          "title": "Discover Ireland · Fáilte Ireland",
          "url": "https://www.discoverireland.ie/cork/shandon-bells-tower-st-anne-s-church"
        }
      },
      {
        "id": "fitzgerald-park",
        "name": "Fitzgerald’s Park",
        "category": "park",
        "source": {
          "title": "Discover Ireland · Fáilte Ireland",
          "url": "https://www.discoverireland.ie/cork/fitzgerald-s-park"
        }
      }
    ]
  },
  "AMS": {
    "summary": {
      "tr": "Amsterdam’da Museumplein çevresindeki Rijksmuseum ve Van Gogh Müzesi’ni Vondelpark’ın yeşil alanlarıyla birleştirebilirsin.",
      "en": "Amsterdam’s Museumplein brings Rijksmuseum and Van Gogh Museum art close to the green spaces of Vondelpark.",
      "sq": "Museumplein në Amsterdam bashkon artin e Rijksmuseum dhe Muzeut Van Gogh pranë gjelbërimit të Vondelpark.",
      "ro": "Museumplein din Amsterdam reunește arta de la Rijksmuseum și Muzeul Van Gogh, aproape de spațiile verzi din Vondelpark."
    },
    "places": [
      {
        "id": "rijksmuseum",
        "name": "Rijksmuseum",
        "category": "museum",
        "source": {
          "title": "I amsterdam",
          "url": "https://www.iamsterdam.com/en/whats-on/calendar/museums-and-galleries/museums/rijksmuseum"
        }
      },
      {
        "id": "van-gogh-museum",
        "name": {
          "tr": "Van Gogh Müzesi",
          "en": "Van Gogh Museum",
          "sq": "Muzeu Van Gogh",
          "ro": "Muzeul Van Gogh"
        },
        "category": "museum",
        "source": {
          "title": "I amsterdam",
          "url": "https://www.iamsterdam.com/en/explore/neighbourhoods/oud-zuid/art-and-culture"
        }
      },
      {
        "id": "vondelpark",
        "name": "Vondelpark",
        "category": "park",
        "source": {
          "title": "I amsterdam",
          "url": "https://www.iamsterdam.com/en/explore/neighbourhoods/oud-zuid/art-and-culture"
        }
      }
    ]
  },
  "DUB": {
    "summary": {
      "tr": "Dublin’de el yazmalarından arkeolojiye uzanan bir keşfi, St Stephen’s Green’de bir park molasıyla birleştirebilirsin.",
      "en": "In Dublin, pair manuscript treasures and archaeology with a pause among the paths of St Stephen’s Green.",
      "sq": "Në Dublin, bashko thesaret e dorëshkrimeve dhe arkeologjinë me një pushim në parkun St Stephen’s Green.",
      "ro": "În Dublin, poți îmbina manuscrisele și arheologia cu o pauză în parcul St Stephen’s Green."
    },
    "places": [
      {
        "id": "book-of-kells",
        "name": {
          "tr": "Book of Kells Deneyimi",
          "en": "Book of Kells Experience",
          "sq": "Përvoja Book of Kells",
          "ro": "Experiența Book of Kells"
        },
        "category": "culture",
        "source": {
          "title": "Visit Dublin · Fáilte Ireland",
          "url": "https://www.visitdublin.com//the-book-of-kells-experience"
        }
      },
      {
        "id": "national-museum-archaeology",
        "name": {
          "tr": "İrlanda Ulusal Müzesi – Arkeoloji",
          "en": "National Museum of Ireland – Archaeology",
          "sq": "Muzeu Kombëtar i Irlandës – Arkeologji",
          "ro": "Muzeul Național al Irlandei – Arheologie"
        },
        "category": "museum",
        "source": {
          "title": "Visit Dublin · Fáilte Ireland",
          "url": "https://www.visitdublin.com/national-museum-of-ireland-kildare-street"
        }
      },
      {
        "id": "st-stephens-green",
        "name": "St Stephen’s Green",
        "category": "park",
        "source": {
          "title": "Visit Dublin · Fáilte Ireland",
          "url": "https://www.visitdublin.com/st-stephen-s-green"
        }
      }
    ]
  },
  "BCN": {
    "summary": {
      "tr": "Barselona’da Gaudí’nin mimarisini Park Güell’de ve Sagrada Família’da keşfedip Gotik Mahalle’nin sokaklarına geçebilirsin.",
      "en": "Barcelona brings Gaudí’s architecture at Park Güell and the Sagrada Família together with the streets of the Gothic Quarter.",
      "sq": "Barcelona bashkon arkitekturën e Gaudí-t në Park Güell dhe Sagrada Família me rrugët e Lagjes Gotike.",
      "ro": "Barcelona îmbină arhitectura lui Gaudí din Park Güell și Sagrada Família cu străzile Cartierului Gotic."
    },
    "places": [
      {
        "id": "sagrada-familia",
        "name": "Sagrada Família",
        "category": "religion",
        "source": {
          "title": "Turisme de Barcelona",
          "url": "https://bid.barcelonaturisme.com/wv3/en/page/5707/basilica-of-la-sagrada-familia.html"
        }
      },
      {
        "id": "park-guell",
        "name": "Park Güell",
        "category": "park",
        "source": {
          "title": "Turisme de Barcelona",
          "url": "https://bid.barcelonaturisme.com/wv3/en/page/1076/park-guell.html"
        }
      },
      {
        "id": "gothic-quarter",
        "name": {
          "tr": "Gotik Mahalle",
          "en": "Gothic Quarter",
          "sq": "Lagjja Gotike",
          "ro": "Cartierul Gotic"
        },
        "category": "district",
        "source": {
          "title": "Turisme de Barcelona",
          "url": "https://bid.barcelonaturisme.com/wv3/en/page/1052/gothic-quarter.html"
        }
      }
    ]
  },
  "GVA": {
    "summary": {
      "tr": "Cenevre’de göl kıyısındaki Jet d’Eau ve Jardin Anglais’i, eski şehirdeki Saint-Pierre Katedrali ile birlikte keşfedebilirsin.",
      "en": "Geneva pairs the lakeside Jet d’Eau and Jardin Anglais with the old town around St Pierre Cathedral.",
      "sq": "Gjeneva bashkon Jet d’Eau dhe Jardin Anglais buzë liqenit me qytetin e vjetër rreth katedrales Saint-Pierre.",
      "ro": "Geneva îmbină Jet d’Eau și Jardin Anglais de pe malul lacului cu orașul vechi din jurul Catedralei Saint-Pierre."
    },
    "places": [
      {
        "id": "jet-deau",
        "name": "Jet d’Eau",
        "category": "landmark",
        "source": {
          "title": "Geneva Tourism",
          "url": "https://www.geneve.com/fr/que-faire/attractions/visiter-geneve-en-1-journee"
        }
      },
      {
        "id": "jardin-anglais",
        "name": "Jardin Anglais",
        "category": "park",
        "source": {
          "title": "Geneva Tourism",
          "url": "https://www.geneve.com/fr/que-faire/attractions/visiter-geneve-en-1-journee"
        }
      },
      {
        "id": "st-pierre-cathedral",
        "name": {
          "tr": "Saint-Pierre Katedrali",
          "en": "St Pierre Cathedral",
          "sq": "Katedralja Saint-Pierre",
          "ro": "Catedrala Saint-Pierre"
        },
        "category": "religion",
        "source": {
          "title": "Geneva Tourism",
          "url": "https://www.geneve.com/en/attractions/detail/st-pierre-cathedral-geneva-from-above"
        }
      }
    ]
  },
  "EDI": {
    "summary": {
      "tr": "Edinburgh’da kale, Royal Mile ve Holyroodhouse Sarayı, şehrin tarihî merkezini farklı açılardan tanımak için bir başlangıç sunar.",
      "en": "Edinburgh Castle, the Royal Mile and the Palace of Holyroodhouse offer different ways into the city’s historic heart.",
      "sq": "Kalaja e Edinburgut, Royal Mile dhe Pallati i Holyroodhouse ofrojnë këndvështrime të ndryshme mbi qendrën historike të qytetit.",
      "ro": "Castelul Edinburgh, Royal Mile și Palatul Holyroodhouse oferă perspective diferite asupra centrului istoric al orașului."
    },
    "places": [
      {
        "id": "edinburgh-castle",
        "name": {
          "tr": "Edinburgh Kalesi",
          "en": "Edinburgh Castle",
          "sq": "Kalaja e Edinburgut",
          "ro": "Castelul Edinburgh"
        },
        "category": "history",
        "source": {
          "title": "VisitScotland",
          "url": "https://www.visitscotland.com/planning/trip-ideas/edinburgh-72-hours?vss=UC"
        }
      },
      {
        "id": "royal-mile",
        "name": "Royal Mile",
        "category": "district",
        "source": {
          "title": "VisitScotland",
          "url": "https://www.visitscotland.com/planning/trip-ideas/edinburgh-72-hours?vss=UC"
        }
      },
      {
        "id": "holyroodhouse",
        "name": {
          "tr": "Holyroodhouse Sarayı",
          "en": "Palace of Holyroodhouse",
          "sq": "Pallati i Holyroodhouse",
          "ro": "Palatul Holyroodhouse"
        },
        "category": "history",
        "source": {
          "title": "VisitScotland",
          "url": "https://www.visitscotland.com/planning/trip-ideas/edinburgh-72-hours?vss=UC"
        }
      }
    ]
  },
  "CPH": {
    "summary": {
      "tr": "Kopenhag’da Nyhavn’ın liman manzarası, Rosenborg’un kraliyet mirası ve Tivoli’nin bahçeleri farklı ilgi alanlarına hitap eder.",
      "en": "Copenhagen offers harbour views at Nyhavn, royal history at Rosenborg and the gardens and attractions of Tivoli.",
      "sq": "Kopenhaga ofron pamje të portit në Nyhavn, histori mbretërore në Rosenborg dhe kopshtet e atraksionet e Tivolit.",
      "ro": "Copenhaga oferă priveliști ale portului în Nyhavn, istorie regală la Rosenborg și grădinile și atracțiile Tivoli."
    },
    "places": [
      {
        "id": "nyhavn",
        "name": "Nyhavn",
        "category": "waterfront",
        "source": {
          "title": "VisitCopenhagen",
          "url": "https://www.visitcopenhagen.com/copenhagen/planning/3-day-copenhagen-itinerary"
        }
      },
      {
        "id": "rosenborg-castle",
        "name": {
          "tr": "Rosenborg Şatosu",
          "en": "Rosenborg Castle",
          "sq": "Kështjella Rosenborg",
          "ro": "Castelul Rosenborg"
        },
        "category": "history",
        "source": {
          "title": "VisitCopenhagen",
          "url": "https://www.visitcopenhagen.com/copenhagen/planning/rosenborg-castle-gdk410582"
        }
      },
      {
        "id": "tivoli-gardens",
        "name": {
          "tr": "Tivoli Bahçeleri",
          "en": "Tivoli Gardens",
          "sq": "Kopshtet Tivoli",
          "ro": "Grădinile Tivoli"
        },
        "category": "culture",
        "source": {
          "title": "VisitCopenhagen",
          "url": "https://www.visitcopenhagen.com/copenhagen/planning/3-day-copenhagen-itinerary"
        }
      }
    ]
  },
  "OSL": {
    "summary": {
      "tr": "Oslo’da liman kıyısındaki opera binasını, Akershus Kalesi’ni ve Vigeland’ın açık havadaki heykellerini keşfedebilirsin.",
      "en": "Oslo combines its waterfront opera house, Akershus Fortress and the outdoor sculptures of Vigeland Park.",
      "sq": "Oslo bashkon operën buzë ujit, kalanë Akershus dhe skulpturat në ajër të hapur të parkut Vigeland.",
      "ro": "Oslo îmbină opera de pe malul apei, Fortăreața Akershus și sculpturile în aer liber din parcul Vigeland."
    },
    "places": [
      {
        "id": "akershus-fortress",
        "name": {
          "tr": "Akershus Kalesi",
          "en": "Akershus Fortress",
          "sq": "Kalaja Akershus",
          "ro": "Fortăreața Akershus"
        },
        "category": "history",
        "source": {
          "title": "VisitOSLO",
          "url": "https://www.visitoslo.com/attraction/akershus-fortress"
        }
      },
      {
        "id": "oslo-opera-house",
        "name": {
          "tr": "Oslo Opera Binası",
          "en": "Oslo Opera House",
          "sq": "Opera e Oslos",
          "ro": "Opera din Oslo"
        },
        "category": "culture",
        "source": {
          "title": "VisitOSLO",
          "url": "https://www.visitoslo.com/en/activities-and-attractions/10-suggestions/top-attractions/"
        }
      },
      {
        "id": "vigeland-park",
        "name": {
          "tr": "Vigeland Heykel Parkı",
          "en": "Vigeland Sculpture Park",
          "sq": "Parku i Skulpturave Vigeland",
          "ro": "Parcul de Sculpturi Vigeland"
        },
        "category": "park",
        "source": {
          "title": "VisitOSLO",
          "url": "https://www.visitoslo.com/en/activities-and-attractions/10-suggestions/top-attractions/"
        }
      }
    ]
  },
  "CDG": {
    "summary": {
      "tr": "Paris’te Eyfel Kulesi’nin mimarisi, Louvre’un sanat koleksiyonları ve Tuileries Bahçesi, şehir keşfine farklı duraklar ekler.",
      "en": "The Eiffel Tower’s architecture, the Louvre’s art collections and the Tuileries Garden bring variety to a Paris visit.",
      "sq": "Arkitektura e Kullës Eiffel, koleksionet e Luvrit dhe Kopshti Tuileries i japin larmi një vizite në Paris.",
      "ro": "Arhitectura Turnului Eiffel, colecțiile de artă ale Luvrului și Grădina Tuileries aduc varietate unei vizite la Paris."
    },
    "places": [
      {
        "id": "eiffel-tower",
        "name": {
          "tr": "Eyfel Kulesi",
          "en": "Eiffel Tower",
          "sq": "Kulla Eiffel",
          "ro": "Turnul Eiffel"
        },
        "category": "landmark",
        "source": {
          "title": "Paris je t’aime · Office de tourisme",
          "url": "https://parisjetaime.com/article/promenade-autour-de-la-tour-eiffel-a265"
        }
      },
      {
        "id": "louvre",
        "name": {
          "tr": "Louvre Müzesi",
          "en": "Louvre Museum",
          "sq": "Muzeu i Luvrit",
          "ro": "Muzeul Luvru"
        },
        "category": "museum",
        "source": {
          "title": "Paris je t’aime · Office de tourisme",
          "url": "https://parisjetaime.com/eng/culture/musee-du-louvre-p3489"
        }
      },
      {
        "id": "tuileries-garden",
        "name": {
          "tr": "Tuileries Bahçesi",
          "en": "Tuileries Garden",
          "sq": "Kopshti Tuileries",
          "ro": "Grădina Tuileries"
        },
        "category": "park",
        "source": {
          "title": "Paris je t’aime · Office de tourisme",
          "url": "https://parisjetaime.com/eng/culture/jardin-des-tuileries-p3545"
        }
      }
    ]
  },
  "DPS": {
    "summary": {
      "tr": "Bali’nin kıyı tapınaklarını keşfedebilir, ayrı bir ada olan Nusa Penida’daki Kelingking manzarasını gezi planına ayrıca ekleyebilirsin.",
      "en": "Explore Bali’s coastal temples and consider a separate trip to the Kelingking landscape on the island of Nusa Penida.",
      "sq": "Eksploro tempujt bregdetarë të Balit dhe mendo për një udhëtim më vete drejt peizazhit të Kelingkingut në ishullin Nusa Penida.",
      "ro": "Explorează templele de coastă din Bali și ia în calcul o excursie separată la peisajul Kelingking de pe insula Nusa Penida."
    },
    "places": [
      {
        "id": "kelingking-beach",
        "name": {
          "tr": "Kelingking Plajı · Nusa Penida",
          "en": "Kelingking Beach · Nusa Penida",
          "sq": "Plazhi Kelingking · Nusa Penida",
          "ro": "Plaja Kelingking · Nusa Penida"
        },
        "category": "coast",
        "source": {
          "title": "Indonesia Travel · Ministry of Tourism",
          "url": "https://www.indonesia.travel/id/id/destination/bali-nusa-tenggara/bali/kelingking-beach-a-marvelous-wonder-in-the-southwest-of-nusa-penida"
        }
      },
      {
        "id": "uluwatu-temple",
        "name": {
          "tr": "Uluwatu Tapınağı",
          "en": "Uluwatu Temple",
          "sq": "Tempulli Uluwatu",
          "ro": "Templul Uluwatu"
        },
        "category": "religion",
        "source": {
          "title": "Indonesia Travel · Ministry of Tourism",
          "url": "https://www.indonesia.travel/id/id/travel-ideas/pilgrimage/pura-uluwatu"
        }
      },
      {
        "id": "tanah-lot",
        "name": {
          "tr": "Tanah Lot Tapınağı",
          "en": "Tanah Lot Temple",
          "sq": "Tempulli Tanah Lot",
          "ro": "Templul Tanah Lot"
        },
        "category": "religion",
        "source": {
          "title": "Indonesia Travel · Ministry of Tourism",
          "url": "https://www.indonesia.travel/id/id/destination/bali-nusa-tenggara/bali/tanah-lot"
        }
      }
    ]
  },
  "HND": {
    "summary": {
      "tr": "Tokyo’da Asakusa’daki Sensō-ji, ağaçlarla çevrili Meiji Jingū ve Hamarikyū Bahçeleri şehrin farklı yüzlerini gösterir.",
      "en": "In Tokyo, Sensō-ji in Asakusa, the wooded setting of Meiji Jingū and Hamarikyū Gardens reveal different sides of the city.",
      "sq": "Në Tokio, Sensō-ji në Asakusa, mjedisi i pyllëzuar i Meiji Jingū dhe Kopshtet Hamarikyū tregojnë anë të ndryshme të qytetit.",
      "ro": "În Tokyo, Sensō-ji din Asakusa, cadrul împădurit al Meiji Jingū și Grădinile Hamarikyū arată fețe diferite ale orașului."
    },
    "places": [
      {
        "id": "senso-ji",
        "name": "Sensō-ji",
        "category": "religion",
        "source": {
          "title": "GO TOKYO · Tokyo Convention & Visitors Bureau",
          "url": "https://www.gotokyo.org/en/spot/15/index.html"
        }
      },
      {
        "id": "meiji-jingu",
        "name": "Meiji Jingū",
        "category": "religion",
        "source": {
          "title": "GO TOKYO · Tokyo Convention & Visitors Bureau",
          "url": "https://www.gotokyo.org/en/spot/76/index.html"
        }
      },
      {
        "id": "hamarikyu-gardens",
        "name": {
          "tr": "Hamarikyū Bahçeleri",
          "en": "Hamarikyū Gardens",
          "sq": "Kopshtet Hamarikyū",
          "ro": "Grădinile Hamarikyū"
        },
        "category": "park",
        "source": {
          "title": "GO TOKYO · Tokyo Convention & Visitors Bureau",
          "url": "https://www.gotokyo.org/en/spot/20/index.html"
        }
      }
    ]
  },
  "FCO": {
    "summary": {
      "tr": "Roma’da Kolezyum ve Pantheon antik kentin izlerini taşırken Trevi Çeşmesi meydanlar arasında ayrı bir durak sunar.",
      "en": "Rome’s Colosseum and Pantheon connect a visit with the ancient city, while the Trevi Fountain adds a stop among its squares.",
      "sq": "Koloseu dhe Panteoni i Romës të lidhin me qytetin antik, ndërsa Fontana di Trevi shton një ndalesë mes shesheve.",
      "ro": "Colosseumul și Panteonul din Roma te apropie de orașul antic, iar Fontana di Trevi adaugă o oprire printre piețe."
    },
    "places": [
      {
        "id": "colosseum",
        "name": {
          "tr": "Kolezyum",
          "en": "Colosseum",
          "sq": "Koloseu",
          "ro": "Colosseum"
        },
        "category": "history",
        "source": {
          "title": "Turismo Roma · Roma Capitale",
          "url": "https://www.turismoroma.it/it/node/1155"
        }
      },
      {
        "id": "trevi-fountain",
        "name": {
          "tr": "Trevi Çeşmesi",
          "en": "Trevi Fountain",
          "sq": "Fontana di Trevi",
          "ro": "Fontana di Trevi"
        },
        "category": "landmark",
        "source": {
          "title": "Turismo Roma · Roma Capitale",
          "url": "https://www.turismoroma.it/sites/default/files/MappaTurismoRoma_2025.pdf"
        }
      },
      {
        "id": "pantheon",
        "name": "Pantheon",
        "category": "history",
        "source": {
          "title": "Turismo Roma · Roma Capitale",
          "url": "https://www.turismoroma.it/sites/default/files/MappaTurismoRoma_2025.pdf"
        }
      }
    ]
  }
};

/** A fresh, locale-specific view; unknown/prototype keys never expose registry members. */
export function cityEssentials(code: string, locale: AppLocale): CityEssentials | undefined {
  if (typeof code !== 'string' || typeof locale !== 'string') return undefined;
  if (locale !== 'tr' && locale !== 'en' && locale !== 'sq' && locale !== 'ro') return undefined;

  const key = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(key) || !Object.prototype.hasOwnProperty.call(CONTENT, key)) return undefined;

  const entry = CONTENT[key];
  return {
    summary: entry.summary[locale],
    places: entry.places.map((place) => ({
      id: place.id,
      name: typeof place.name === 'string' ? place.name : place.name[locale],
      category: CATEGORIES[place.category][locale],
      source: { title: place.source.title, url: place.source.url },
    })),
  };
}
