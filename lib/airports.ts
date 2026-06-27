export type LocationItem = {
  id: string;
  name: string;
  type: "country" | "city" | "anywhere";
  countryName?: string;
  code: string;
};

export const GLOBAL_LOCATIONS: LocationItem[] = [
  { id: "ANY", name: "Tüm dünyayı keşfedin", type: "anywhere", code: "" },
  
  // Türkiye
  { id: "TR", name: "Türkiye", type: "country", code: "TR" },
  { id: "IST", name: "İstanbul", type: "city", countryName: "Türkiye", code: "IST" },
  { id: "SAW", name: "Sabiha Gökçen", type: "city", countryName: "Türkiye", code: "SAW" },
  { id: "AYT", name: "Antalya", type: "city", countryName: "Türkiye", code: "AYT" },
  { id: "ESB", name: "Ankara", type: "city", countryName: "Türkiye", code: "ESB" },
  { id: "ADB", name: "İzmir", type: "city", countryName: "Türkiye", code: "ADB" },
  { id: "ADA", name: "Adana", type: "city", countryName: "Türkiye", code: "ADA" },
  { id: "TZX", name: "Trabzon", type: "city", countryName: "Türkiye", code: "TZX" },

  // Avrupa (Kapsamlı)
  { id: "GR", name: "Yunanistan", type: "country", code: "GR" },
  { id: "ATH", name: "Atina", type: "city", countryName: "Yunanistan", code: "ATH" },
  { id: "SKG", name: "Selanik", type: "city", countryName: "Yunanistan", code: "SKG" },
  { id: "JTR", name: "Santorini", type: "city", countryName: "Yunanistan", code: "JTR" },
  { id: "JMK", name: "Mikonos", type: "city", countryName: "Yunanistan", code: "JMK" },

  { id: "BG", name: "Bulgaristan", type: "country", code: "BG" },
  { id: "SOF", name: "Sofya", type: "city", countryName: "Bulgaristan", code: "SOF" },
  
  { id: "RO", name: "Romanya", type: "country", code: "RO" },
  { id: "OTP", name: "Bükreş", type: "city", countryName: "Romanya", code: "OTP" },
  
  { id: "MK", name: "Kuzey Makedonya", type: "country", code: "MK" },
  { id: "SKP", name: "Üsküp", type: "city", countryName: "Kuzey Makedonya", code: "SKP" },
  
  { id: "AL", name: "Arnavutluk", type: "country", code: "AL" },
  { id: "TIA", name: "Tiran", type: "city", countryName: "Arnavutluk", code: "TIA" },
  
  { id: "XK", name: "Kosova", type: "country", code: "XK" },
  { id: "PRN", name: "Priştine", type: "city", countryName: "Kosova", code: "PRN" },

  { id: "CY", name: "Kıbrıs", type: "country", code: "CY" },
  { id: "LCA", name: "Larnaka", type: "city", countryName: "Kıbrıs", code: "LCA" },
  { id: "ECN", name: "Lefkoşa (Ercan)", type: "city", countryName: "KKTC", code: "ECN" },

  { id: "IT", name: "İtalya", type: "country", code: "IT" },
  { id: "ROM", name: "Roma", type: "city", countryName: "İtalya", code: "ROM" },
  { id: "MIL", name: "Milano", type: "city", countryName: "İtalya", code: "MIL" },
  { id: "VCE", name: "Venedik", type: "city", countryName: "İtalya", code: "VCE" },
  { id: "NAP", name: "Napoli", type: "city", countryName: "İtalya", code: "NAP" },

  { id: "FR", name: "Fransa", type: "country", code: "FR" },
  { id: "PAR", name: "Paris", type: "city", countryName: "Fransa", code: "PAR" },
  { id: "NCE", name: "Nice", type: "city", countryName: "Fransa", code: "NCE" },
  { id: "MRS", name: "Marsilya", type: "city", countryName: "Fransa", code: "MRS" },

  { id: "DE", name: "Almanya", type: "country", code: "DE" },
  { id: "BER", name: "Berlin", type: "city", countryName: "Almanya", code: "BER" },
  { id: "MUC", name: "Münih", type: "city", countryName: "Almanya", code: "MUC" },
  { id: "FRA", name: "Frankfurt", type: "city", countryName: "Almanya", code: "FRA" },
  { id: "DUS", name: "Düsseldorf", type: "city", countryName: "Almanya", code: "DUS" },
  { id: "HAM", name: "Hamburg", type: "city", countryName: "Almanya", code: "HAM" },

  { id: "ES", name: "İspanya", type: "country", code: "ES" },
  { id: "MAD", name: "Madrid", type: "city", countryName: "İspanya", code: "MAD" },
  { id: "BCN", name: "Barselona", type: "city", countryName: "İspanya", code: "BCN" },
  { id: "AGP", name: "Malaga", type: "city", countryName: "İspanya", code: "AGP" },

  { id: "NL", name: "Hollanda", type: "country", code: "NL" },
  { id: "AMS", name: "Amsterdam", type: "city", countryName: "Hollanda", code: "AMS" },

  { id: "BE", name: "Belçika", type: "country", code: "BE" },
  { id: "BRU", name: "Brüksel", type: "city", countryName: "Belçika", code: "BRU" },

  { id: "GB", name: "Birleşik Krallık", type: "country", code: "GB" },
  { id: "LON", name: "Londra", type: "city", countryName: "Birleşik Krallık", code: "LON" },
  { id: "MAN", name: "Manchester", type: "city", countryName: "Birleşik Krallık", code: "MAN" },

  { id: "CH", name: "İsviçre", type: "country", code: "CH" },
  { id: "ZRH", name: "Zürih", type: "city", countryName: "İsviçre", code: "ZRH" },
  { id: "GVA", name: "Cenevre", type: "city", countryName: "İsviçre", code: "GVA" },

  { id: "AT", name: "Avusturya", type: "country", code: "AT" },
  { id: "VIE", name: "Viyana", type: "city", countryName: "Avusturya", code: "VIE" },

  { id: "CZ", name: "Çekya", type: "country", code: "CZ" },
  { id: "PRG", name: "Prag", type: "city", countryName: "Çekya", code: "PRG" },

  { id: "HU", name: "Macaristan", type: "country", code: "HU" },
  { id: "BUD", name: "Budapeşte", type: "city", countryName: "Macaristan", code: "BUD" },

  { id: "PL", name: "Polonya", type: "country", code: "PL" },
  { id: "WAW", name: "Varşova", type: "city", countryName: "Polonya", code: "WAW" },

  { id: "SE", name: "İsveç", type: "country", code: "SE" },
  { id: "STO", name: "Stokholm", type: "city", countryName: "İsveç", code: "STO" },

  { id: "NO", name: "Norveç", type: "country", code: "NO" },
  { id: "OSL", name: "Oslo", type: "city", countryName: "Norveç", code: "OSL" },

  { id: "DK", name: "Danimarka", type: "country", code: "DK" },
  { id: "CPH", name: "Kopenhag", type: "city", countryName: "Danimarka", code: "CPH" },

  { id: "FI", name: "Finlandiya", type: "country", code: "FI" },
  { id: "HEL", name: "Helsinki", type: "city", countryName: "Finlandiya", code: "HEL" },

  { id: "RS", name: "Sırbistan", type: "country", code: "RS" },
  { id: "BEG", name: "Belgrad", type: "city", countryName: "Sırbistan", code: "BEG" },

  { id: "BA", name: "Bosna Hersek", type: "country", code: "BA" },
  { id: "SJJ", name: "Saraybosna", type: "city", countryName: "Bosna Hersek", code: "SJJ" },

  { id: "ME", name: "Karadağ", type: "country", code: "ME" },
  { id: "TGD", name: "Podgoritsa", type: "city", countryName: "Karadağ", code: "TGD" },
  { id: "TIV", name: "Tivat", type: "city", countryName: "Karadağ", code: "TIV" },

  // Asya & Orta Doğu
  { id: "AZ", name: "Azerbaycan", type: "country", code: "AZ" },
  { id: "GYD", name: "Bakü", type: "city", countryName: "Azerbaycan", code: "GYD" },
  
  { id: "GE", name: "Gürcistan", type: "country", code: "GE" },
  { id: "TBS", name: "Tiflis", type: "city", countryName: "Gürcistan", code: "TBS" },
  { id: "BUS", name: "Batum", type: "city", countryName: "Gürcistan", code: "BUS" },

  { id: "AE", name: "Birleşik Arap Emirlikleri", type: "country", code: "AE" },
  { id: "DXB", name: "Dubai", type: "city", countryName: "B.A.E.", code: "DXB" },
  { id: "AUH", name: "Abu Dabi", type: "city", countryName: "B.A.E.", code: "AUH" },

  { id: "QA", name: "Katar", type: "country", code: "QA" },
  { id: "DOH", name: "Doha", type: "city", countryName: "Katar", code: "DOH" },

  { id: "SA", name: "Suudi Arabistan", type: "country", code: "SA" },
  { id: "RUH", name: "Riyad", type: "city", countryName: "Suudi Arabistan", code: "RUH" },
  { id: "JED", name: "Cidde", type: "city", countryName: "Suudi Arabistan", code: "JED" },

  { id: "IL", name: "İsrail", type: "country", code: "IL" },
  { id: "TLV", name: "Tel Aviv", type: "city", countryName: "İsrail", code: "TLV" },

  { id: "JP", name: "Japonya", type: "country", code: "JP" },
  { id: "TYO", name: "Tokyo", type: "city", countryName: "Japonya", code: "TYO" },

  { id: "KR", name: "Güney Kore", type: "country", code: "KR" },
  { id: "SEL", name: "Seul", type: "city", countryName: "Güney Kore", code: "SEL" },

  { id: "CN", name: "Çin", type: "country", code: "CN" },
  { id: "BJS", name: "Pekin", type: "city", countryName: "Çin", code: "BJS" },
  { id: "SHA", name: "Şanghay", type: "city", countryName: "Çin", code: "SHA" },

  { id: "IN", name: "Hindistan", type: "country", code: "IN" },
  { id: "DEL", name: "Yeni Delhi", type: "city", countryName: "Hindistan", code: "DEL" },
  { id: "BOM", name: "Mumbai", type: "city", countryName: "Hindistan", code: "BOM" },

  { id: "TH", name: "Tayland", type: "country", code: "TH" },
  { id: "BKK", name: "Bangkok", type: "city", countryName: "Tayland", code: "BKK" },
  { id: "HKT", name: "Phuket", type: "city", countryName: "Tayland", code: "HKT" },

  { id: "ID", name: "Endonezya", type: "country", code: "ID" },
  { id: "DPS", name: "Bali", type: "city", countryName: "Endonezya", code: "DPS" },
  { id: "JKT", name: "Cakarta", type: "city", countryName: "Endonezya", code: "JKT" },

  { id: "SG", name: "Singapur", type: "country", code: "SG" },
  { id: "SIN", name: "Singapur", type: "city", countryName: "Singapur", code: "SIN" },

  { id: "MY", name: "Malezya", type: "country", code: "MY" },
  { id: "KUL", name: "Kuala Lumpur", type: "city", countryName: "Malezya", code: "KUL" },

  // Afrika
  { id: "EG", name: "Mısır", type: "country", code: "EG" },
  { id: "CAI", name: "Kahire", type: "city", countryName: "Mısır", code: "CAI" },
  { id: "SSH", name: "Şarm El-Şeyh", type: "city", countryName: "Mısır", code: "SSH" },
  
  { id: "MA", name: "Fas", type: "country", code: "MA" },
  { id: "CMN", name: "Kazablanka", type: "city", countryName: "Fas", code: "CMN" },
  { id: "RAK", name: "Marakeş", type: "city", countryName: "Fas", code: "RAK" },

  { id: "ZA", name: "Güney Afrika", type: "country", code: "ZA" },
  { id: "CPT", name: "Cape Town", type: "city", countryName: "Güney Afrika", code: "CPT" },

  // Amerika Kıtası
  { id: "US", name: "Amerika Birleşik Devletleri", type: "country", code: "US" },
  { id: "NYC", name: "New York", type: "city", countryName: "ABD", code: "NYC" },
  { id: "LAX", name: "Los Angeles", type: "city", countryName: "ABD", code: "LAX" },
  { id: "MIA", name: "Miami", type: "city", countryName: "ABD", code: "MIA" },
  { id: "SFO", name: "San Francisco", type: "city", countryName: "ABD", code: "SFO" },
  { id: "WAS", name: "Washington", type: "city", countryName: "ABD", code: "WAS" },

  { id: "CA", name: "Kanada", type: "country", code: "CA" },
  { id: "YTO", name: "Toronto", type: "city", countryName: "Kanada", code: "YTO" },
  { id: "YVR", name: "Vancouver", type: "city", countryName: "Kanada", code: "YVR" },

  { id: "MX", name: "Meksika", type: "country", code: "MX" },
  { id: "MEX", name: "Mexico City", type: "city", countryName: "Meksika", code: "MEX" },
  { id: "CUN", name: "Cancun", type: "city", countryName: "Meksika", code: "CUN" },

  { id: "BR", name: "Brezilya", type: "country", code: "BR" },
  { id: "SAO", name: "Sao Paulo", type: "city", countryName: "Brezilya", code: "SAO" },
  { id: "RIO", name: "Rio de Janeiro", type: "city", countryName: "Brezilya", code: "RIO" },

  { id: "AR", name: "Arjantin", type: "country", code: "AR" },
  { id: "BUE", name: "Buenos Aires", type: "city", countryName: "Arjantin", code: "BUE" },

  { id: "CO", name: "Kolombiya", type: "country", code: "CO" },
  { id: "BOG", name: "Bogota", type: "city", countryName: "Kolombiya", code: "BOG" },

  // Okyanusya
  { id: "AU", name: "Avustralya", type: "country", code: "AU" },
  { id: "SYD", name: "Sidney", type: "city", countryName: "Avustralya", code: "SYD" },
  { id: "MEL", name: "Melbourne", type: "city", countryName: "Avustralya", code: "MEL" },

  { id: "NZ", name: "Yeni Zelanda", type: "country", code: "NZ" },
  { id: "AKL", name: "Auckland", type: "city", countryName: "Yeni Zelanda", code: "AKL" }
];
