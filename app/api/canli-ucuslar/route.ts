import { NextResponse } from "next/server";

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
  sabiha: "SAW",
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

function aktarmaYaz(changes?: number) {
  if (changes === 0) return "Aktarmasız";
  if (changes === 1) return "1 aktarma";
  if (typeof changes === "number") return `${changes} aktarma`;
  return "Bilinmiyor";
}

function aviasalesLink({
  origin,
  destination,
  departDate,
  returnDate,
  marker,
}: {
  origin: string;
  destination: string;
  departDate?: string;
  returnDate?: string;
  marker: string;
}) {
  const params = new URLSearchParams();

  params.set("origin_iata", origin);
  params.set("destination_iata", destination);
  params.set("adults", "1");
  params.set("children", "0");
  params.set("infants", "0");
  params.set("trip_class", "0");
  params.set("locale", "tr");
  params.set("currency", "try");

  if (returnDate) {
    params.set("oneway", "0");
  } else {
    params.set("oneway", "1");
  }

  if (departDate) {
    params.set("depart_date", departDate.slice(0, 10));
  }

  if (returnDate) {
    params.set("return_date", returnDate.slice(0, 10));
  }

  if (marker) {
    params.set("marker", marker);
  }

  return `https://search.aviasales.com/flights/?${params.toString()}`;
}

function ucusOlustur({
  id,
  origin,
  destination,
  departDate,
  returnDate,
  price,
  changes,
  airline,
  foundAt,
  source,
  marker,
}: {
  id: string;
  origin: string;
  destination: string;
  departDate?: string;
  returnDate?: string;
  price: number;
  changes?: number;
  airline?: string;
  foundAt?: string;
  source: string;
  marker: string;
}): CanliUcus {
  return {
    id,
    nereden: origin,
    nereye: destination,
    kalkisKodu: origin,
    varisKodu: destination,
    gidisTarihi: tarihYaz(departDate),
    donusTarihi: tarihYaz(returnDate),
    fiyat: fiyatYaz(price),
    fiyatSayi: price,
    aktarma: aktarmaYaz(changes),
    havayolu: airline || "Aviasales",
    sinif: "Ekonomi",
    mesafe: "—",
    sonKontrol: tarihYaz(foundAt) || "Cache verisi",
    link: aviasalesLink({
      origin,
      destination,
      departDate,
      returnDate,
      marker,
    }),
    kaynak: source,
  };
}

async function fetchJson(url: URL, token: string) {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Access-Token": token,
    },
    cache: "no-store",
  });

  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function searchByPriceRange({
  origin,
  destination,
  maximumPrice,
  direct,
  token,
  marker,
}: {
  origin: string;
  destination: string;
  maximumPrice: number;
  direct: boolean;
  token: string;
  marker: string;
}) {
  const url = new URL(
    "https://api.travelpayouts.com/aviasales/v3/search_by_price_range"
  );

  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("value_min", "1");
  url.searchParams.set("value_max", String(maximumPrice));
  url.searchParams.set("one_way", "false");
  url.searchParams.set("direct", String(direct));
  url.searchParams.set("locale", "tr");
  url.searchParams.set("currency", "try");
  url.searchParams.set("market", "tr");
  url.searchParams.set("limit", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("token", token);

  const result = await fetchJson(url, token);

  if (!result.ok) return [];

  const rawTickets = Array.isArray(result.data?.data)
    ? result.data.data
    : Array.isArray(result.data)
      ? result.data
      : [];

  return rawTickets
    .map((ticket: any, index: number) =>
      ucusOlustur({
        id: `range-${index}`,
        origin: ticket.origin || ticket.origin_airport || origin,
        destination:
          ticket.destination || ticket.destination_airport || destination,
        departDate: ticket.depart_date,
        returnDate: ticket.return_date,
        price: Number(ticket.value || 0),
        changes: ticket.number_of_changes,
        airline: ticket.airline,
        foundAt: ticket.found_at,
        source: "Travelpayouts Search by Price",
        marker,
      })
    )
    .filter((item: CanliUcus) => item.fiyatSayi > 0);
}

async function latestPrices({
  origin,
  destination,
  maximumPrice,
  direct,
  token,
  marker,
}: {
  origin: string;
  destination: string;
  maximumPrice: number;
  direct: boolean;
  token: string;
  marker: string;
}) {
  const url = new URL("https://api.travelpayouts.com/v2/prices/latest");

  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("currency", "try");
  url.searchParams.set("limit", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("one_way", "false");
  url.searchParams.set("show_to_affiliates", "true");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("token", token);

  if (direct) {
    url.searchParams.set("direct", "true");
  }

  const result = await fetchJson(url, token);

  if (!result.ok) return [];

  const rawTickets = Array.isArray(result.data?.data) ? result.data.data : [];

  return rawTickets
    .map((ticket: any, index: number) =>
      ucusOlustur({
        id: `latest-${index}`,
        origin: ticket.origin || origin,
        destination: ticket.destination || destination,
        departDate: ticket.depart_date,
        returnDate: ticket.return_date,
        price: Number(ticket.value || ticket.price || 0),
        changes: ticket.number_of_changes,
        airline: ticket.airline,
        foundAt: ticket.found_at,
        source: "Travelpayouts Latest Prices",
        marker,
      })
    )
    .filter(
      (item: CanliUcus) =>
        item.fiyatSayi > 0 && item.fiyatSayi <= maximumPrice
    );
}

async function cheapPrices({
  origin,
  destination,
  maximumPrice,
  token,
  marker,
}: {
  origin: string;
  destination: string;
  maximumPrice: number;
  token: string;
  marker: string;
}) {
  const url = new URL("https://api.travelpayouts.com/v1/prices/cheap");

  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("currency", "try");
  url.searchParams.set("token", token);

  const result = await fetchJson(url, token);

  if (!result.ok) return [];

  const destinationData = result.data?.data?.[destination];

  if (!destinationData || typeof destinationData !== "object") return [];

  const tickets: CanliUcus[] = [];

  Object.entries(destinationData).forEach(([key, value]: [string, any]) => {
    if (!value) return;

    const price = Number(value.price || 0);

    if (!price || price > maximumPrice) return;

    tickets.push(
      ucusOlustur({
        id: `cheap-${key}`,
        origin,
        destination,
        departDate: value.departure_at,
        returnDate: value.return_at,
        price,
        changes: value.transfers,
        airline: value.airline,
        foundAt: value.expires_at,
        source: "Travelpayouts Cheapest Prices",
        marker,
      })
    );
  });

  return tickets;
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

  const originRaw =
    searchParams.get("nereden") || searchParams.get("origin") || "";
  const destinationRaw =
    searchParams.get("nereye") || searchParams.get("destination") || "";

  const origin = kodBul(originRaw);
  const destination = kodBul(destinationRaw);

  if (!origin || !destination) {
    return NextResponse.json(
      {
        message:
          "Şehri IATA koduna çeviremedim. Örnek: İstanbul, Roma veya IST, ROM yaz.",
        originRaw,
        destinationRaw,
      },
      { status: 400 }
    );
  }

  const maximumPrice = Number(searchParams.get("maksimumFiyat") || 50000);
  const aktarma = searchParams.get("aktarma") || "Tümü";
  const direct = aktarma === "Aktarmasız";

  const results1 = await searchByPriceRange({
    origin,
    destination,
    maximumPrice,
    direct,
    token,
    marker,
  });

  const results2 =
    results1.length > 0
      ? []
      : await latestPrices({
          origin,
          destination,
          maximumPrice,
          direct,
          token,
          marker,
        });

  const results3 =
    results1.length + results2.length > 0
      ? []
      : await cheapPrices({
          origin,
          destination,
          maximumPrice,
          token,
          marker,
        });

  const allResults = [...results1, ...results2, ...results3];

  const unique = new Map<string, CanliUcus>();

  allResults.forEach((item) => {
    const key = `${item.kalkisKodu}-${item.varisKodu}-${item.gidisTarihi}-${item.donusTarihi}-${item.fiyatSayi}`;

    if (!unique.has(key)) {
      unique.set(key, item);
    }
  });

  const ucuslar = Array.from(unique.values()).sort(
    (a, b) => a.fiyatSayi - b.fiyatSayi
  );

  return NextResponse.json({
    toplam: ucuslar.length,
    kaynak:
      "Travelpayouts / Aviasales Data API cache verisi. Fiyatlar değişebilir.",
    origin,
    destination,
    ucuslar,
  });
}