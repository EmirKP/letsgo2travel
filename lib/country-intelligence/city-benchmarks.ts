// Dated comparison, not live booking quotes. Facts transcribed from the primary table.
export const CITY_PRICE_SOURCE = "https://www.postoffice.co.uk/dam6/jcr:46481006-9cfe-4c07-90c6-394dc52f749d/city_costs_barometer_2026_tables.2026-05-22-13-12-40.pdf";
export const CITY_PRICE_MONTH = "2026-05";
export const CITY_FX_REFERENCE_DATE = "2026-05-05"; // Approximate bridge; source says early May, not an exact rate day.
export type CityBenchmark = { id: string; code: string; city: { tr: string; en: string }; basket: number; hotel: number; meal: number; travel: number };
// GBP: basket=12-item weekend basket; hotel=two people/two nights, meal=two people/one dinner, travel=one person/48h.
export const CITY_BENCHMARKS: CityBenchmark[] = [
  {
    "id": "BA-sarajevo",
    "code": "BA",
    "city": {
      "tr": "Saraybosna",
      "en": "Sarajevo"
    },
    "basket": 248.29,
    "hotel": 157,
    "meal": 62.86,
    "travel": 5.21
  },
  {
    "id": "RO-bucharest",
    "code": "RO",
    "city": {
      "tr": "Bükreş",
      "en": "Bucharest"
    },
    "basket": 258.07,
    "hotel": 148,
    "meal": 65.53,
    "travel": 3.52
  },
  {
    "id": "AL-tirana",
    "code": "AL",
    "city": {
      "tr": "Tiran",
      "en": "Tirana"
    },
    "basket": 262.85,
    "hotel": 128,
    "meal": 63.94,
    "travel": 20.29
  },
  {
    "id": "RS-belgrade",
    "code": "RS",
    "city": {
      "tr": "Belgrad",
      "en": "Belgrade"
    },
    "basket": 265.13,
    "hotel": 144,
    "meal": 67.24,
    "travel": 0
  },
  {
    "id": "SK-trencin",
    "code": "SK",
    "city": {
      "tr": "Trenčín",
      "en": "Trencin"
    },
    "basket": 271.64,
    "hotel": 176,
    "meal": 47.64,
    "travel": 3.52
  },
  {
    "id": "LV-riga",
    "code": "LV",
    "city": {
      "tr": "Riga",
      "en": "Riga"
    },
    "basket": 278.19,
    "hotel": 140,
    "meal": 69.88,
    "travel": 7.03
  },
  {
    "id": "FR-lille",
    "code": "FR",
    "city": {
      "tr": "Lille",
      "en": "Lille"
    },
    "basket": 289.33,
    "hotel": 140,
    "meal": 78.61,
    "travel": 7.43
  },
  {
    "id": "LT-vilnius",
    "code": "LT",
    "city": {
      "tr": "Vilnius",
      "en": "Vilnius"
    },
    "basket": 289.39,
    "hotel": 162,
    "meal": 68.84,
    "travel": 11.87
  },
  {
    "id": "FR-strasbourg",
    "code": "FR",
    "city": {
      "tr": "Strazburg",
      "en": "Strasbourg"
    },
    "basket": 319.13,
    "hotel": 171,
    "meal": 89.49,
    "travel": 8.09
  },
  {
    "id": "ME-podgorica",
    "code": "ME",
    "city": {
      "tr": "Podgorica",
      "en": "Podgorica"
    },
    "basket": 332.45,
    "hotel": 217,
    "meal": 69,
    "travel": 5.27
  },
  {
    "id": "EE-tallinn",
    "code": "EE",
    "city": {
      "tr": "Tallinn",
      "en": "Tallinn"
    },
    "basket": 343.93,
    "hotel": 145,
    "meal": 104.43,
    "travel": 7.91
  },
  {
    "id": "PL-warsaw",
    "code": "PL",
    "city": {
      "tr": "Varşova",
      "en": "Warsaw"
    },
    "basket": 346.33,
    "hotel": 164,
    "meal": 92.8,
    "travel": 11.2
  },
  {
    "id": "PL-krakow",
    "code": "PL",
    "city": {
      "tr": "Krakov",
      "en": "Krakow"
    },
    "basket": 350.66,
    "hotel": 181,
    "meal": 93.01,
    "travel": 8.61
  },
  {
    "id": "SK-bratislava",
    "code": "SK",
    "city": {
      "tr": "Bratislava",
      "en": "Bratislava"
    },
    "basket": 352.27,
    "hotel": 203,
    "meal": 78.23,
    "travel": 9.41
  },
  {
    "id": "PL-gdansk",
    "code": "PL",
    "city": {
      "tr": "Gdansk",
      "en": "Gdansk"
    },
    "basket": 355.28,
    "hotel": 235,
    "meal": 66.23,
    "travel": 4.74
  },
  {
    "id": "PT-lisbon",
    "code": "PT",
    "city": {
      "tr": "Lizbon",
      "en": "Lisbon"
    },
    "basket": 357.7,
    "hotel": 213,
    "meal": 58.81,
    "travel": 12.75
  },
  {
    "id": "HU-budapest",
    "code": "HU",
    "city": {
      "tr": "Budapeşte",
      "en": "Budapest"
    },
    "basket": 361.19,
    "hotel": 176,
    "meal": 82.73,
    "travel": 13.87
  },
  {
    "id": "HR-zagreb",
    "code": "HR",
    "city": {
      "tr": "Zagreb",
      "en": "Zagreb"
    },
    "basket": 368.27,
    "hotel": 215.7,
    "meal": 89.31,
    "travel": 7
  },
  {
    "id": "GR-athens",
    "code": "GR",
    "city": {
      "tr": "Atina",
      "en": "Athens"
    },
    "basket": 373.07,
    "hotel": 181,
    "meal": 75.6,
    "travel": 17.58
  },
  {
    "id": "PT-porto",
    "code": "PT",
    "city": {
      "tr": "Porto",
      "en": "Porto"
    },
    "basket": 376.82,
    "hotel": 217,
    "meal": 65.4,
    "travel": 13.63
  },
  {
    "id": "GB-cardiff",
    "code": "GB",
    "city": {
      "tr": "Cardiff",
      "en": "Cardiff"
    },
    "basket": 377.64,
    "hotel": 257,
    "meal": 73.2,
    "travel": 10
  },
  {
    "id": "FR-lyon",
    "code": "FR",
    "city": {
      "tr": "Lyon",
      "en": "Lyon"
    },
    "basket": 382.05,
    "hotel": 161,
    "meal": 92.22,
    "travel": 38.68
  },
  {
    "id": "CZ-prague",
    "code": "CZ",
    "city": {
      "tr": "Prag",
      "en": "Prague"
    },
    "basket": 402.12,
    "hotel": 227,
    "meal": 76.97,
    "travel": 11.29
  },
  {
    "id": "DE-berlin",
    "code": "DE",
    "city": {
      "tr": "Berlin",
      "en": "Berlin"
    },
    "basket": 420.77,
    "hotel": 244,
    "meal": 86.76,
    "travel": 20.92
  },
  {
    "id": "BE-brussels",
    "code": "BE",
    "city": {
      "tr": "Brüksel",
      "en": "Brussels"
    },
    "basket": 422.95,
    "hotel": 231,
    "meal": 108.12,
    "travel": 16.7
  },
  {
    "id": "AT-salzburg",
    "code": "AT",
    "city": {
      "tr": "Salzburg",
      "en": "Salzburg"
    },
    "basket": 429.1,
    "hotel": 275,
    "meal": 87.9,
    "travel": 0
  },
  {
    "id": "LU-luxembourg",
    "code": "LU",
    "city": {
      "tr": "Lüksemburg",
      "en": "Luxembourg"
    },
    "basket": 447.77,
    "hotel": 285,
    "meal": 100.06,
    "travel": 0
  },
  {
    "id": "IT-rome",
    "code": "IT",
    "city": {
      "tr": "Roma",
      "en": "Rome"
    },
    "basket": 453.87,
    "hotel": 277,
    "meal": 70,
    "travel": 13.19
  },
  {
    "id": "HR-dubrovnik",
    "code": "HR",
    "city": {
      "tr": "Dubrovnik",
      "en": "Dubrovnik"
    },
    "basket": 459.53,
    "hotel": 270,
    "meal": 74.37,
    "travel": 9.85
  },
  {
    "id": "SE-stockholm",
    "code": "SE",
    "city": {
      "tr": "Stockholm",
      "en": "Stockholm"
    },
    "basket": 476.17,
    "hotel": 229,
    "meal": 108.54,
    "travel": 30.1
  },
  {
    "id": "SI-ljubljana",
    "code": "SI",
    "city": {
      "tr": "Ljubljana",
      "en": "Ljubljana"
    },
    "basket": 490.33,
    "hotel": 338,
    "meal": 93,
    "travel": 3.34
  },
  {
    "id": "FR-nice",
    "code": "FR",
    "city": {
      "tr": "Nice",
      "en": "Nice"
    },
    "basket": 502.7,
    "hotel": 310,
    "meal": 114.06,
    "travel": 11.43
  },
  {
    "id": "GB-belfast",
    "code": "GB",
    "city": {
      "tr": "Belfast",
      "en": "Belfast"
    },
    "basket": 508.52,
    "hotel": 332,
    "meal": 92.24,
    "travel": 13
  },
  {
    "id": "GB-london",
    "code": "GB",
    "city": {
      "tr": "Londra",
      "en": "London"
    },
    "basket": 527.5,
    "hotel": 284,
    "meal": 98.3,
    "travel": 33.2
  },
  {
    "id": "DE-hamburg",
    "code": "DE",
    "city": {
      "tr": "Hamburg",
      "en": "Hamburg"
    },
    "basket": 536.61,
    "hotel": 357,
    "meal": 98.88,
    "travel": 14.42
  },
  {
    "id": "IT-florence",
    "code": "IT",
    "city": {
      "tr": "Floransa",
      "en": "Florence"
    },
    "basket": 548.65,
    "hotel": 351,
    "meal": 71.3,
    "travel": 13.63
  },
  {
    "id": "AT-vienna",
    "code": "AT",
    "city": {
      "tr": "Viyana",
      "en": "Vienna"
    },
    "basket": 557.14,
    "hotel": 274,
    "meal": 135.2,
    "travel": 17.93
  },
  {
    "id": "BE-bruges",
    "code": "BE",
    "city": {
      "tr": "Brugge",
      "en": "Bruges"
    },
    "basket": 571.46,
    "hotel": 340,
    "meal": 99.33,
    "travel": 15.82
  },
  {
    "id": "FI-helsinki",
    "code": "FI",
    "city": {
      "tr": "Helsinki",
      "en": "Helsinki"
    },
    "basket": 575.03,
    "hotel": 304,
    "meal": 143.2,
    "travel": 13.71
  },
  {
    "id": "FR-paris",
    "code": "FR",
    "city": {
      "tr": "Paris",
      "en": "Paris"
    },
    "basket": 575.15,
    "hotel": 289,
    "meal": 111.64,
    "travel": 39.07
  },
  {
    "id": "ES-madrid",
    "code": "ES",
    "city": {
      "tr": "Madrid",
      "en": "Madrid"
    },
    "basket": 579.92,
    "hotel": 418,
    "meal": 65.98,
    "travel": 14.94
  },
  {
    "id": "IT-venice",
    "code": "IT",
    "city": {
      "tr": "Venedik",
      "en": "Venice"
    },
    "basket": 579.92,
    "hotel": 346,
    "meal": 101.35,
    "travel": 30.77
  },
  {
    "id": "IE-cork",
    "code": "IE",
    "city": {
      "tr": "Cork",
      "en": "Cork"
    },
    "basket": 602.38,
    "hotel": 416,
    "meal": 103.49,
    "travel": 7.91
  },
  {
    "id": "NL-amsterdam",
    "code": "NL",
    "city": {
      "tr": "Amsterdam",
      "en": "Amsterdam"
    },
    "basket": 609.18,
    "hotel": 391,
    "meal": 92.48,
    "travel": 14.06
  },
  {
    "id": "IE-dublin",
    "code": "IE",
    "city": {
      "tr": "Dublin",
      "en": "Dublin"
    },
    "basket": 610.79,
    "hotel": 445,
    "meal": 89.92,
    "travel": 14.06
  },
  {
    "id": "ES-barcelona",
    "code": "ES",
    "city": {
      "tr": "Barselona",
      "en": "Barcelona"
    },
    "basket": 641.03,
    "hotel": 457,
    "meal": 66.62,
    "travel": 16.44
  },
  {
    "id": "CH-geneva",
    "code": "CH",
    "city": {
      "tr": "Cenevre",
      "en": "Geneva"
    },
    "basket": 644.22,
    "hotel": 346,
    "meal": 181.57,
    "travel": 19.52
  },
  {
    "id": "GB-edinburgh",
    "code": "GB",
    "city": {
      "tr": "Edinburgh",
      "en": "Edinburgh"
    },
    "basket": 668.1,
    "hotel": 462,
    "meal": 118,
    "travel": 22
  },
  {
    "id": "DK-copenhagen",
    "code": "DK",
    "city": {
      "tr": "Kopenhag",
      "en": "Copenhagen"
    },
    "basket": 670.65,
    "hotel": 366,
    "meal": 163.73,
    "travel": 19.4
  },
  {
    "id": "NO-oslo",
    "code": "NO",
    "city": {
      "tr": "Oslo",
      "en": "Oslo"
    },
    "basket": 733.99,
    "hotel": 368,
    "meal": 186.36,
    "travel": 22.79
  }
];
