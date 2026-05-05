import { NextResponse } from "next/server";

type TravelpayoutsTicket = {
  origin?: string;
  destination?: string;
  origin_airport?: string;
  destination_airport?: string;
  depart_date?: string;
  return_date?: string;
  number_of_changes?: number;
  value?: number;
  trip_class?: number;
  distance?: number;
  found_at?: string;
  link?: string;
  airline?: string;
  flight_number?: string;
};

type CanliUcus = {
  id: string;
  nereden: string;
  nereye: string;
  kalkisKodu: string;
  varisKodu: string;
  gidisTarihi: string;
  donusTarihi: string;
  fiyat: string;
  fiyatSayi: number;
  aktarma: string;
  havayolu: string;
  sinif: string;
  mesafe: string;
  sonKontrol: string;
  link: string;
  kaynak: string;
};

const sehirKodlari: Record<string, string> = {
  istanbul: "IST",
  ist: "IST",
  saw: "SAW",
  ankara: "ANK",
  esenboga: "ESB",
  esenboğa: "ESB",
  izmir: "IZM",
  adb: "ADB",
  antalya: "AYT",
  bodrum: "BJV",
  dalaman: "DLM",
  adana: "ADA",
  trabzon: "TZX",

  roma: "ROM",
  rome: "ROM",
  fco: "FCO",
  paris: "PAR",
  cdg: "CDG",
  baku: "BAK",
  bakü: "BAK",
  gyd: "GYD",
  saraybosna: "SJJ",
  sarajevo: "SJJ",
  london: "LON",
  londra: "LON",
  amsterdam: "AMS",
  berlin: "BER",
  madrid: "MAD",
  barcelona: "BCN",
  milano: "MIL",
  vienna: "VIE",
  viyana: "VIE",
  prag: "PRG",
  prague: "PRG",
  dubai: "DXB",
};

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function kodBul(value: string) {
  const temiz = normalize(value);

  if (!temiz) return "";

  const upper = value.trim().toUpperCase();

  if (/^[A-Z]{3}$/.test(upper)) {
    return upper;
  }

  return sehirKodlari[temiz] || "";
}

function fiyatYaz(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`;
}

function aktarmaYaz(changes?: number) {
  if (changes === 0) return "Aktarmasız";
  if (changes === 1) return "1 aktarma";
  if (typeof changes === "number") return `${changes} aktarma`;
  return "Bilinmiyor";
}

function sinifYaz(tripClass?: number) {
  if (tripClass === 0) return "Ekonomi";
  if (tripClass === 1) return "Business";
  if (tripClass === 2) return "First";
  return "Ekonomi";
}

function tarihYaz(value?: string) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function linkOlustur(ticket: TravelpayoutsTicket, marker: string) {
  if (ticket.link) {
    if (ticket.link.startsWith("http")) return ticket.link;
    return `https://www.aviasales.com${ticket.link}`;
  }

  const origin = ticket.origin || ticket.origin_airport || "";
  const destination = ticket.destination || ticket.destination_airport || "";
  const departDate = ticket.depart_date || "";
  const returnDate = ticket.return_date || "";

  const params = new URLSearchParams();

  if (marker) params.set("marker", marker);

  let path = `/search/${origin}${departDate.replaceAll("-", "")}${destination}`;

  if (returnDate) {
    path += returnDate.replaceAll("-", "");
  }

  return `https://www.aviasales.com${path}?${params.toString()}`;
}

function ticketDonustur(
  ticket: TravelpayoutsTicket,
  index: number,
  marker: string
): CanliUcus {
  const fiyat = Number(ticket.value || 0);
  const origin = ticket.origin || ticket.origin_airport || "";
  const destination = ticket.destination || ticket.destination_airport || "";

  return {
    id: `tp-${origin}-${destination}-${ticket.depart_date || "date"}-${index}`,
    nereden: origin,
    nereye: destination,
    kalkisKodu: origin,
    varisKodu: destination,
    gidisTarihi: tarihYaz(ticket.depart_date),
    donusTarihi: tarihYaz(ticket.return_date),
    fiyat: fiyatYaz(fiyat),
    fiyatSayi: fiyat,
    aktarma: aktarmaYaz(ticket.number_of_changes),
    havayolu: ticket.airline || "Aviasales",
    sinif: sinifYaz(ticket.trip_class),
    mesafe: ticket.distance ? `${ticket.distance} km` : "—",
    sonKontrol: tarihYaz(ticket.found_at) || "Yakın zamanda",
    link: linkOlustur(ticket, marker),
    kaynak: "Travelpayouts / Aviasales",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER || "";

  if (!token) {
    return NextResponse.json(
      {
        message:
          "TRAVELPAYOUTS_TOKEN eksik. Vercel Environment Variables içine eklemen gerekiyor.",
      },
      { status: 500 }
    );
  }

  const originRaw = searchParams.get("nereden") || searchParams.get("origin") || "";
  const destinationRaw =
    searchParams.get("nereye") || searchParams.get("destination") || "";

  const origin = kodBul(originRaw);
  const destination = kodBul(destinationRaw);

  if (!origin || !destination) {
    return NextResponse.json(
      {
        message:
          "Canlı uçuş araması için şehirleri IATA koduna çeviremedim. Örnek: İstanbul, Roma veya IST, ROM yaz.",
        originRaw,
        destinationRaw,
      },
      { status: 400 }
    );
  }

  const maksimumFiyat = Number(searchParams.get("maksimumFiyat") || 30000);
  const aktarma = searchParams.get("aktarma") || "Tümü";
  const direct = aktarma === "Aktarmasız" ? "true" : "false";

  const apiUrl = new URL(
    "https://api.travelpayouts.com/aviasales/v3/search_by_price_range"
  );

  apiUrl.searchParams.set("origin", origin);
  apiUrl.searchParams.set("destination", destination);
  apiUrl.searchParams.set("value_min", "1");
  apiUrl.searchParams.set("value_max", String(maksimumFiyat || 30000));
  apiUrl.searchParams.set("one_way", "false");
  apiUrl.searchParams.set("direct", direct);
  apiUrl.searchParams.set("locale", "tr");
  apiUrl.searchParams.set("currency", "try");
  apiUrl.searchParams.set("market", "tr");
  apiUrl.searchParams.set("limit", "30");
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("token", token);

  const response = await fetch(apiUrl.toString(), {
    headers: {
      Accept: "application/json",
      "X-Access-Token": token,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        message: "Travelpayouts canlı uçuş verisi alınamadı.",
        status: response.status,
        detail: data,
      },
      { status: response.status }
    );
  }

  const rawTickets: TravelpayoutsTicket[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];

  const ucuslar = rawTickets
    .map((ticket, index) => ticketDonustur(ticket, index, marker))
    .filter((ticket) => ticket.fiyatSayi > 0)
    .sort((a, b) => a.fiyatSayi - b.fiyatSayi);

  return NextResponse.json({
    toplam: ucuslar.length,
    kaynak: "Travelpayouts / Aviasales Data API",
    origin,
    destination,
    ucuslar,
  });
}