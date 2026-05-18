export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAirportByCode } from "@/lib/airports";

type FlightSegment = {
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
};

type FlightLeg = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  departTime: string;
  arriveTime: string;
  departDate: string;
  arriveDate: string;
  durationText: string;
  segments: FlightSegment[];
};

type SearchResult = {
  id: string;
  provider: "Travelpayouts" | "Demo";
  airline: string;
  price: number;
  currency: string;
  priceText: string;
  durationText: string;
  stopsText: string;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  deepLink?: string;
  cabinClass: string;
  bagsText: string;
  emissionsText?: string;
  score: number;
  foundAt?: string;
  expiresAt?: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeCode(value: string | null, fallback: string) {
  const raw = (value || "").trim().toUpperCase();
  const match = raw.match(/[A-Z]{3}/);
  const code = match?.[0] || fallback;
  return getAirportByCode(code)?.code || code;
}

function safeDate(value: string | null, fallback: string) {
  const today = todayIso();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback < today ? today : fallback;
  return value < today ? today : value;
}

function formatMoney(amount: number, currency: string) {
  const currencyCode = (currency || "TRY").toUpperCase();
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: currencyCode === "TRY" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("tr-TR").format(amount)} ${currencyCode}`;
  }
}

function formatDateTime(value?: string, fallbackDate?: string) {
  if (!value) {
    return {
      time: "--:--",
      date: fallbackDate ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(`${fallbackDate}T12:00:00`)) : "—",
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      time: "--:--",
      date: value.slice(0, 10),
    };
  }
  return {
    time: new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date),
    date: new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(date),
  };
}

function minutesToText(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (!h) return `${m || 1} dk`;
  if (!m) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

function stopText(value?: number) {
  if (value === 0) return "Aktarmasız";
  if (value === 1) return "1 aktarma";
  if (typeof value === "number") return `${value} aktarma`;
  return "Aktarma bilgisi yok";
}

function airlineName(code?: string) {
  const map: Record<string, string> = {
    TK: "Turkish Airlines",
    PC: "Pegasus",
    VF: "AJet",
    XQ: "SunExpress",
    W6: "Wizz Air",
    FR: "Ryanair",
    A3: "Aegean Airlines",
    LH: "Lufthansa",
    AF: "Air France",
    KL: "KLM",
    BA: "British Airways",
    AZ: "ITA Airways",
    QR: "Qatar Airways",
    EK: "Emirates",
    FZ: "flydubai",
  };
  const key = String(code || "").toUpperCase();
  return map[key] || key || "Havayolu";
}

function airportName(code: string) {
  const item = getAirportByCode(code);
  if (!item) return code;
  return `${item.city} (${item.displayCode || item.code})`;
}

function buildFallbackDeepLink(origin: string, destination: string, depart: string, ret?: string) {
  const dep = depart.replaceAll("-", "").slice(2);
  const retPart = ret ? ret.replaceAll("-", "").slice(2) : "";
  const marker = process.env.TRAVELPAYOUTS_MARKER || "725223.letsgo2travel";
  const url = new URL(`https://www.aviasales.com/search/${origin}${dep}${destination}${retPart}1`);
  url.searchParams.set("marker", marker);
  return url.toString();
}

function makeLeg({
  origin,
  destination,
  departDateTime,
  arriveDateTime,
  fallbackDate,
  durationMinutes,
  airline,
  flightNumber,
}: {
  origin: string;
  destination: string;
  departDateTime?: string;
  arriveDateTime?: string;
  fallbackDate: string;
  durationMinutes: number;
  transfers?: number;
  airline: string;
  flightNumber?: string;
}): FlightLeg {
  const dep = formatDateTime(departDateTime, fallbackDate);
  const arr = formatDateTime(arriveDateTime, fallbackDate);
  return {
    from: origin,
    to: destination,
    fromName: airportName(origin),
    toName: airportName(destination),
    departTime: dep.time,
    arriveTime: arr.time,
    departDate: dep.date,
    arriveDate: arr.date,
    durationText: minutesToText(durationMinutes || 150),
    segments: [{
      airline,
      flightNumber: flightNumber || "",
      from: origin,
      to: destination,
      departTime: dep.time,
      arriveTime: arr.time,
    }],
  };
}

function normalizeTravelpayoutsTicket(ticket: any, index: number, originFallback: string, destinationFallback: string, departFallback: string, returnFallback: string): SearchResult | null {
  const origin = String(ticket.origin_airport || ticket.origin || originFallback).toUpperCase();
  const destination = String(ticket.destination_airport || ticket.destination || destinationFallback).toUpperCase();
  const price = Number(ticket.price || ticket.value || ticket.amount || 0);
  if (!price) return null;

  const currency = String(ticket.currency || "TRY").toUpperCase();
  const airline = airlineName(ticket.airline || ticket.airline_iata);
  const flightNumber = [ticket.airline, ticket.flight_number].filter(Boolean).join(" ");
  const departAt = ticket.departure_at || ticket.depart_date || departFallback;
  const returnAt = ticket.return_at || ticket.return_date || returnFallback;
  const transfers = typeof ticket.transfers === "number" ? ticket.transfers : typeof ticket.number_of_changes === "number" ? ticket.number_of_changes : undefined;
  const returnTransfers = typeof ticket.return_transfers === "number" ? ticket.return_transfers : transfers;
  const durationTo = Number(ticket.duration_to || ticket.duration || 160);
  const durationBack = Number(ticket.duration_back || 160);
  const totalDuration = Number(ticket.duration || durationTo + (returnAt ? durationBack : 0));

  const outbound = makeLeg({
    origin,
    destination,
    departDateTime: departAt,
    fallbackDate: departFallback,
    durationMinutes: durationTo,
    transfers,
    airline,
    flightNumber,
  });

  const inbound = returnAt ? makeLeg({
    origin: destination,
    destination: origin,
    departDateTime: returnAt,
    fallbackDate: returnFallback,
    durationMinutes: durationBack,
    transfers: returnTransfers,
    airline,
    flightNumber: "",
  }) : undefined;

  const deepLink = ticket.link
    ? `https://www.aviasales.com${String(ticket.link).startsWith("/") ? ticket.link : `/${ticket.link}`}`
    : buildFallbackDeepLink(origin, destination, departFallback, returnFallback);

  const maxStops = Math.max(0, Number(transfers || 0), Number(returnTransfers || 0));

  return {
    id: `${origin}-${destination}-${price}-${index}-${departAt}`,
    provider: "Travelpayouts",
    airline,
    price,
    currency,
    priceText: formatMoney(price, currency),
    durationText: minutesToText(totalDuration || durationTo),
    stopsText: stopText(maxStops),
    outbound,
    inbound,
    deepLink,
    cabinClass: "economy",
    bagsText: "Bagaj ve kurallar partner sayfasında kontrol edilmeli",
    emissionsText: maxStops === 0 ? "Aktarmasız seçenek" : undefined,
    score: Math.round(price + totalDuration * 1.5 + maxStops * 1250),
    foundAt: ticket.found_at || ticket.search_date,
    expiresAt: ticket.expires_at,
  };
}

async function fetchJson(url: URL, token: string) {
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "X-Access-Token": token,
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function pricesForDates({ origin, destination, depart, ret, direct, token }: { origin: string; destination: string; depart: string; ret: string; direct: boolean; token: string; }) {
  const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("departure_at", depart);
  url.searchParams.set("return_at", ret);
  url.searchParams.set("one_way", ret ? "false" : "true");
  url.searchParams.set("direct", String(direct));
  url.searchParams.set("sorting", "price");
  url.searchParams.set("unique", "false");
  url.searchParams.set("currency", "try");
  url.searchParams.set("cy", "try");
  url.searchParams.set("market", "tr");
  url.searchParams.set("limit", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("token", token);
  const result = await fetchJson(url, token);
  if (!result.ok) return [];
  return Array.isArray(result.data?.data) ? result.data.data : [];
}

async function latestPrices({ origin, destination, depart, token }: { origin: string; destination: string; depart: string; token: string; }) {
  const url = new URL("https://api.travelpayouts.com/aviasales/v3/get_latest_prices");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("beginning_of_period", depart.slice(0, 7) + "-01");
  url.searchParams.set("period_type", "month");
  url.searchParams.set("currency", "try");
  url.searchParams.set("market", "tr");
  url.searchParams.set("one_way", "false");
  url.searchParams.set("show_to_affiliates", "true");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("limit", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("token", token);
  const result = await fetchJson(url, token);
  if (!result.ok) return [];
  return Array.isArray(result.data?.data) ? result.data.data : [];
}

function demoResults(origin: string, destination: string, depart: string, ret: string, adults: number): SearchResult[] {
  const basePrices = [3250, 4690, 6890, 9597];
  const airlines = ["Pegasus", "AJet", "Turkish Airlines", "Wizz Air + Ryanair"];
  const stops = [0, 0, 1, 1];
  const times = [
    ["09:20", "11:05", "18:10", "20:00"],
    ["12:40", "14:25", "21:05", "22:55"],
    ["07:30", "13:10", "16:45", "22:35"],
    ["08:30", "16:40", "09:40", "12:20"],
  ];
  return basePrices.map((price, index) => ({
    id: `demo-tp-${index}`,
    provider: "Demo",
    airline: airlines[index],
    price: price * adults,
    currency: "TRY",
    priceText: formatMoney(price * adults, "TRY"),
    durationText: index < 2 ? "2 sa 35 dk" : index === 2 ? "5 sa 40 dk" : "5 sa 25 dk",
    stopsText: stopText(stops[index]),
    outbound: {
      from: origin,
      to: destination,
      fromName: airportName(origin),
      toName: airportName(destination),
      departTime: times[index][0],
      arriveTime: times[index][1],
      departDate: formatDateTime(depart, depart).date,
      arriveDate: formatDateTime(depart, depart).date,
      durationText: index < 2 ? "2 sa 35 dk" : "5 sa 25 dk",
      segments: [{ airline: airlines[index], flightNumber: "", from: origin, to: destination, departTime: times[index][0], arriveTime: times[index][1] }],
    },
    inbound: {
      from: destination,
      to: origin,
      fromName: airportName(destination),
      toName: airportName(origin),
      departTime: times[index][2],
      arriveTime: times[index][3],
      departDate: formatDateTime(ret, ret).date,
      arriveDate: formatDateTime(ret, ret).date,
      durationText: index < 2 ? "2 sa 45 dk" : "5 sa 50 dk",
      segments: [{ airline: airlines[index], flightNumber: "", from: destination, to: origin, departTime: times[index][2], arriveTime: times[index][3] }],
    },
    deepLink: buildFallbackDeepLink(origin, destination, depart, ret),
    cabinClass: "economy",
    bagsText: "Bagaj bilgisi partner sayfasında kontrol edilmeli",
    emissionsText: stops[index] === 0 ? "Aktarmasız seçenek" : undefined,
    score: price + stops[index] * 1250,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = safeCode(searchParams.get("nereden") || searchParams.get("origin"), "IST");
  const destination = safeCode(searchParams.get("nereye") || searchParams.get("destination"), "ROM");
  const depart = safeDate(searchParams.get("gidis") || searchParams.get("departureDate"), todayIso());
  const retRaw = searchParams.get("donus") || searchParams.get("returnDate") || addDays(depart, 7);
  const ret = retRaw < depart ? addDays(depart, 7) : retRaw;
  const adults = Math.max(1, Math.min(9, Number(searchParams.get("yolcu") || searchParams.get("adults") || 1)));
  const aktarma = searchParams.get("aktarma") || "Tümü";
  const direct = aktarma === "Aktarmasız";
  const maxPrice = Number(searchParams.get("maksimumFiyat") || searchParams.get("maxPrice") || 0);
  const token = process.env.TRAVELPAYOUTS_TOKEN;

  if (!token) {
    return NextResponse.json({
      mode: "demo",
      provider: "Travelpayouts hazırlık modu",
      message: "TRAVELPAYOUTS_TOKEN eklenmedi. Token eklenince Travelpayouts / Aviasales son bulunan fiyat verileri gösterilecek.",
      search: { origin, destination, depart, returnDate: ret, adults },
      offers: demoResults(origin, destination, depart, ret, adults),
    });
  }

  const exact = await pricesForDates({ origin, destination, depart, ret, direct, token });
  const fallback = exact.length ? [] : await latestPrices({ origin, destination, depart, token });
  const raw = [...exact, ...fallback];
  const normalized = raw
    .map((ticket, index) => normalizeTravelpayoutsTicket(ticket, index, origin, destination, depart, ret))
    .filter((item): item is SearchResult => Boolean(item))
    .filter((item) => !maxPrice || item.price <= maxPrice)
    .filter((item) => !direct || item.stopsText === "Aktarmasız")
    .sort((a, b) => a.price - b.price)
    .slice(0, 40);

  return NextResponse.json({
    mode: "travelpayouts",
    provider: "Travelpayouts / Aviasales",
    message: normalized.length
      ? "Travelpayouts / Aviasales son bulunan fiyat verileri getirildi. Fiyatlar cache kaynaklıdır ve değişebilir."
      : "Bu rota/tarih için Travelpayouts tarafında son bulunan fiyat yok. Rota veya tarih değiştirilebilir.",
    search: { origin, destination, depart, returnDate: ret, adults },
    offers: normalized,
  });
}
