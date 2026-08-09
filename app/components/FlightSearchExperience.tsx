"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRightLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Filter,
  Luggage,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TimerReset,
  WalletCards,
} from "lucide-react";
import { GLOBAL_LOCATIONS } from "@/lib/airports";
import styles from "./FlightSearchExperience.module.css";

type SourceStatus = {
  sourceId: string;
  sourceName: string;
  state: string;
  message: string;
  offerCount?: number;
  responseTimeMs?: number | null;
};

type FlightSegment = {
  id: string;
  order: number;
  legIndex: number;
  marketingAirline: string;
  flightNumber: string;
  operatingAirline: string | null;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  departureLocal: string;
  arrivalLocal: string;
  departureTerminal: string | null;
  arrivalTerminal: string | null;
  cabinClass: string;
  aircraft: string | null;
  selfTransfer: boolean;
};

type FlightOffer = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  fareFamily: string | null;
  totalPrice: number | null;
  perPersonPrice: number | null;
  currency: string;
  priceCompleteness: string;
  conditional: boolean;
  conditionSummary: string | null;
  baggage: Record<string, unknown>;
  fareRules: { refundable?: boolean | null; changeable?: boolean | null };
  installmentOptions: string[];
  benefits: string[];
  directAirlineSale: boolean;
  sponsored: boolean;
  rankingEligible: boolean;
  effectiveTotalPrice: number | null;
  eligibilityReasons: string[];
  observedAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

type FlightItinerary = {
  id: string;
  totalDurationMinutes: number;
  stopCount: number;
  marketingAirlines: string[];
  transferAirports: string[];
  hasAirportChange: boolean;
  hasSelfTransfer: boolean;
  hasOvernightLayover: boolean;
  labels: string[];
  rankingExplanation: { reasons?: string[]; score?: number };
  segments: FlightSegment[];
  offers: FlightOffer[];
};

type SearchResult = {
  id: string;
  status: string;
  isComplete: boolean;
  criteria: Record<string, unknown>;
  sourceStatuses: SourceStatus[];
  itineraries: FlightItinerary[];
  summary: {
    itineraryCount: number;
    offerCount: number;
    sourceCount: number;
    completedSourceCount: number;
    failedSourceCount: number;
  };
};

type SearchForm = {
  tripType: "one_way" | "round_trip";
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabinClass: "economy" | "premium_economy" | "business" | "first";
  checkedBagsPerPassenger: number;
  checkedBagWeightKg: number;
  currency: "TRY" | "EUR" | "USD";
  directOnly: boolean;
  includeNearbyAirports: boolean;
};

function isoDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const INITIAL: SearchForm = {
  tripType: "round_trip",
  origin: "IST",
  destination: "",
  departureDate: isoDate(14),
  returnDate: isoDate(21),
  adults: 1,
  children: 0,
  infants: 0,
  cabinClass: "economy",
  checkedBagsPerPassenger: 0,
  checkedBagWeightKg: 20,
  currency: "TRY",
  directOnly: false,
  includeNearbyAirports: true,
};

const AIRPORTS = GLOBAL_LOCATIONS
  .filter((location) => /^[A-Z]{3}$/.test(location.code || ""))
  .filter((location, index, rows) => rows.findIndex((item) => item.code === location.code) === index);

type RevalidatedOfferCommon = {
  offerId: string;
  currency: string;
  verifiedAt: string;
  expiresAt: string;
  message: string;
};

type AvailableRevalidatedOffer = RevalidatedOfferCommon & {
  status: "confirmed" | "price_changed";
  totalPrice: number;
  perPersonPrice: number;
  effectiveTotalPrice: number | null;
  baggage: Record<string, unknown>;
  fareFamily: string | null;
  benefits: string[];
  priceChanged: boolean;
  termsChanged: boolean;
};

type UnavailableRevalidatedOffer = RevalidatedOfferCommon & {
  status: "unavailable";
  totalPrice: null;
  perPersonPrice: null;
  effectiveTotalPrice: null;
  baggage: null;
  fareFamily: null;
  benefits: string[];
  priceChanged: false;
  termsChanged: false;
};

type RevalidatedOffer = AvailableRevalidatedOffer | UnavailableRevalidatedOffer;

type OfferVersion = {
  offerId: string;
  totalPrice: number | null;
  currency: string;
  verifiedAt: string | null;
};

type OfferChangeNotice = OfferVersion & {
  sourceName: string;
  previousPrice: number | null;
  nextPrice: number | null;
  priceChanged: boolean;
  termsChanged: boolean;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRevalidatedOffer(value: unknown): value is RevalidatedOffer {
  if (!isRecord(value)
      || !["confirmed", "price_changed", "unavailable"].includes(String(value.status))
      || typeof value.offerId !== "string"
      || typeof value.currency !== "string"
      || !/^[A-Z]{3}$/.test(value.currency)
      || !isDateString(value.verifiedAt)
      || !isDateString(value.expiresAt)
      || typeof value.message !== "string"
      || !Array.isArray(value.benefits)
      || !value.benefits.every((benefit) => typeof benefit === "string")
      || typeof value.priceChanged !== "boolean"
      || typeof value.termsChanged !== "boolean") {
    return false;
  }
  if (value.status === "unavailable") {
    return value.totalPrice === null
      && value.perPersonPrice === null
      && value.effectiveTotalPrice === null
      && value.baggage === null
      && value.fareFamily === null
      && value.priceChanged === false
      && value.termsChanged === false;
  }
  const effectivePriceIsValid = value.effectiveTotalPrice === null || isPositiveNumber(value.effectiveTotalPrice);
  const fareFamilyIsValid = value.fareFamily === null || typeof value.fareFamily === "string";
  const changeStateIsValid = value.status === "price_changed"
    ? value.priceChanged || value.termsChanged
    : !value.priceChanged && !value.termsChanged;
  return isPositiveNumber(value.totalPrice)
    && isPositiveNumber(value.perPersonPrice)
    && effectivePriceIsValid
    && isRecord(value.baggage)
    && fareFamilyIsValid
    && changeStateIsValid;
}

function normalizeLocationText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

function resolveFriendlyLocation(value: string) {
  const normalized = normalizeLocationText(value);
  if (!normalized) return "";
  const match = AIRPORTS.find((location) => (
    normalizeLocationText(location.code) === normalized
    || normalizeLocationText(location.name) === normalized
  ));
  if (match) return match.code;

  const countryIndex = GLOBAL_LOCATIONS.findIndex((location) => (
    location.type === "country"
    && (normalizeLocationText(location.name) === normalized
      || normalizeLocationText(location.code) === normalized)
  ));
  if (countryIndex < 0) return "";
  for (let index = countryIndex + 1; index < GLOBAL_LOCATIONS.length; index += 1) {
    const location = GLOBAL_LOCATIONS[index];
    if (location.type === "country") break;
    if (location.type === "city" && /^[A-Z0-9]{3}$/.test(location.code)) return location.code;
  }
  return "";
}

function explicitIata(value: string) {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{3}$/.test(code) ? code : "";
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "Fiyat doğrulanmadı";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours} sa ` : ""}${rest ? `${rest} dk` : ""}`.trim();
}

function localClock(value: string) {
  const match = value?.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "--:--";
}

function localDate(value: string) {
  const raw = value?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${raw}T12:00:00Z`));
}

function terminalText(value: string | null) {
  if (!value) return "";
  return value.toLocaleLowerCase("tr-TR").includes("terminal") ? value : `Terminal ${value}`;
}

function formatVerifiedAt(value: string | null) {
  if (!value) return "Kontrol zamanı bilinmiyor";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Kontrol zamanı bilinmiyor";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "Az önce doğrulandı";
  if (elapsedMinutes < 10) return `${elapsedMinutes} dk önce doğrulandı`;
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function isOfferStale(offer: FlightOffer, now = Date.now()) {
  const verifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  const expiresAt = offer.expiresAt ? Date.parse(offer.expiresAt) : Number.NaN;
  return offer.eligibilityReasons.includes("stale_price")
    || !Number.isFinite(verifiedAt)
    || !Number.isFinite(expiresAt)
    || verifiedAt > now + 120_000
    || now - verifiedAt > 10 * 60 * 1000
    || expiresAt <= now;
}

function groupOffersBySeller(offers: FlightOffer[]) {
  const sellers = new Map<string, FlightOffer[]>();
  for (const offer of offers) {
    const current = sellers.get(offer.sourceId) || [];
    current.push(offer);
    sellers.set(offer.sourceId, current);
  }
  return [...sellers.entries()].map(([sourceId, sellerOffers]) => ({
    sourceId,
    sourceName: sellerOffers[0]?.sourceName || sourceId,
    sourceType: sellerOffers[0]?.sourceType || "ota",
    directAirlineSale: sellerOffers.some((offer) => offer.directAirlineSale),
    offers: [...sellerOffers].sort((left, right) => (
      (left.effectiveTotalPrice ?? left.totalPrice ?? Number.POSITIVE_INFINITY)
      - (right.effectiveTotalPrice ?? right.totalPrice ?? Number.POSITIVE_INFINITY)
    )),
  }));
}

function updateResultOffer(result: SearchResult, update: AvailableRevalidatedOffer) {
  return {
    ...result,
    itineraries: result.itineraries.map((itinerary) => ({
      ...itinerary,
      offers: itinerary.offers.map((offer) => offer.id === update.offerId ? {
        ...offer,
        totalPrice: update.totalPrice,
        perPersonPrice: update.perPersonPrice,
        effectiveTotalPrice: update.effectiveTotalPrice,
        currency: update.currency,
        baggage: update.baggage,
        fareFamily: update.fareFamily,
        benefits: update.benefits,
        verifiedAt: update.verifiedAt,
        expiresAt: update.expiresAt,
        rankingEligible: update.effectiveTotalPrice !== null,
        eligibilityReasons: offer.eligibilityReasons.filter((reason) => reason !== "stale_price"),
      } : offer),
    })),
  };
}

function removeResultOffer(result: SearchResult, offerId: string) {
  const itineraries = result.itineraries.map((itinerary) => ({
    ...itinerary,
    offers: itinerary.offers.filter((offer) => offer.id !== offerId),
  })).filter((itinerary) => itinerary.offers.length > 0);
  return {
    ...result,
    itineraries,
    summary: {
      ...result.summary,
      itineraryCount: itineraries.length,
      offerCount: itineraries.reduce((count, itinerary) => count + itinerary.offers.length, 0),
    },
  };
}

function offerMatchesVersion(offer: FlightOffer, version: OfferVersion) {
  const offerVerifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  const versionVerifiedAt = version.verifiedAt ? Date.parse(version.verifiedAt) : Number.NaN;
  return offer.id === version.offerId
    && offer.totalPrice === version.totalPrice
    && offer.currency === version.currency
    && ((offer.verifiedAt === null && version.verifiedAt === null)
      || (Number.isFinite(offerVerifiedAt) && offerVerifiedAt === versionVerifiedAt));
}

function sourceStateLabel(state: string) {
  if (state === "queued") return "Sırada";
  if (state === "running") return "Kontrol ediliyor";
  if (state === "completed") return "Tamamlandı";
  if (state === "no_results") return "Sonuç yok";
  if (state === "integration_required") return "Entegrasyon bekleniyor";
  if (state === "disabled" || state === "skipped") return "Bu aramaya dahil değil";
  if (state === "failed" || state === "dead_letter") return "Yanıt vermedi";
  return state;
}

function nextOfferFreshnessDelay(result: SearchResult) {
  const deadlines = result.itineraries.flatMap((itinerary) => itinerary.offers.flatMap((offer) => {
    const verifiedAt = offer.rankingEligible && offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
    const expiresAt = offer.rankingEligible && offer.expiresAt ? Date.parse(offer.expiresAt) : Number.NaN;
    return Number.isFinite(verifiedAt) && Number.isFinite(expiresAt)
      ? [Math.min(verifiedAt + 10 * 60 * 1000, expiresAt) + 250]
      : [];
  }));
  if (!deadlines.length) return null;
  return Math.max(250, Math.min(...deadlines) - Date.now());
}

function markStaleOffers(result: SearchResult, now = Date.now()) {
  let changed = false;
  const withFreshness = result.itineraries.map((itinerary) => ({
    ...itinerary,
    offers: itinerary.offers.map((offer) => {
      const verifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
      const expiresAt = offer.expiresAt ? Date.parse(offer.expiresAt) : Number.NaN;
      const stale = offer.rankingEligible && (
        !Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt)
        || verifiedAt > now + 120_000 || now - verifiedAt > 10 * 60 * 1000 || expiresAt <= now
      );
      if (!stale) return offer;
      changed = true;
      return {
        ...offer,
        rankingEligible: false,
        effectiveTotalPrice: null,
        eligibilityReasons: [...new Set([...offer.eligibilityReasons, "stale_price"])],
      };
    }),
  }));
  if (!changed) return result;

  const eligible = withFreshness.flatMap((itinerary) => itinerary.offers
    .filter((offer) => offer.rankingEligible && offer.effectiveTotalPrice !== null)
    .map((offer) => ({ itineraryId: itinerary.id, duration: itinerary.totalDurationMinutes, price: offer.effectiveTotalPrice! })));
  const minimumPrice = eligible.length ? Math.min(...eligible.map((item) => item.price)) : null;
  const minimumDuration = eligible.length ? Math.min(...eligible.map((item) => item.duration)) : null;
  return {
    ...result,
    itineraries: withFreshness.map((itinerary) => {
      const ownEligible = eligible.filter((item) => item.itineraryId === itinerary.id);
      const labels = itinerary.labels.filter((label) => !["cheapest", "fastest", "best_value"].includes(label));
      if (minimumPrice !== null && ownEligible.some((item) => item.price === minimumPrice)) labels.push("cheapest");
      if (minimumDuration !== null && ownEligible.length && itinerary.totalDurationMinutes === minimumDuration) labels.push("fastest");
      return { ...itinerary, labels: [...new Set(labels)], rankingExplanation: {} };
    }),
  };
}

function emptyResultCopy(result: SearchResult) {
  if (!result.isComplete) {
    return {
      title: "İlk doğrulanmış teklifler bekleniyor",
      body: "Yetkili kaynaklar birbirinden bağımsız kontrol ediliyor; gelen ilk geçerli teklif burada gösterilecek.",
    };
  }
  const states = result.sourceStatuses.map((source) => source.state);
  const hasNoResults = states.includes("no_results");
  const hasFailure = states.some((state) => state === "failed" || state === "dead_letter");
  const integrationOnly = states.length > 0 && states.every((state) => (
    state === "integration_required" || state === "disabled" || state === "skipped"
  ));
  if (integrationOnly || result.status === "no_sources") {
    return {
      title: "Canlı kaynak entegrasyonu bekleniyor",
      body: "Resmî partner erişimi tamamlanmayan kaynaklar çalışıyormuş gibi gösterilmedi; sahte fiyat üretilmedi.",
    };
  }
  if (hasNoResults) {
    return {
      title: "Bu aramada uygun uçuş bulunamadı",
      body: hasFailure
        ? "Cevap veren kaynaklarda uygun teklif yoktu; bazı kaynaklar da geçici olarak yanıt veremedi."
        : "Kontrol edilen kaynaklar seçtiğin rota, tarih ve yolcu kriterlerine uygun teklif döndürmedi.",
    };
  }
  if (states.includes("completed")) {
    return {
      title: "Güncel teklif kalmadı",
      body: "Kaynağın daha önce döndürdüğü teklifler artık geçerli değil. Güncel fiyatlar için yeni bir arama başlat.",
    };
  }
  return {
    title: "Uçuş kaynakları yanıt veremedi",
    body: "Arama güvenli biçimde tamamlanamadı. Bir süre sonra yeniden deneyebilirsin.",
  };
}

export default function FlightSearchExperience() {
  const query = useSearchParams();
  const queryString = query.toString();
  const [form, setForm] = useState<SearchForm>(INITIAL);
  const [searching, setSearching] = useState(false);
  const [searchId, setSearchId] = useState("");
  const [searchToken, setSearchToken] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [prefillWarning, setPrefillWarning] = useState("");
  const [offerChange, setOfferChange] = useState<OfferChangeNotice | null>(null);
  const [sort, setSort] = useState<"best_value" | "cheapest" | "fastest" | "departure">("best_value");
  const [airline, setAirline] = useState("all");
  const [seller, setSeller] = useState<"all" | "direct">("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [openingOffer, setOpeningOffer] = useState("");
  const pollTimer = useRef<number | null>(null);
  const searchRun = useRef(0);
  const resultsStatusRef = useRef<HTMLHeadingElement | null>(null);

  const invalidateSearch = useCallback(() => {
    searchRun.current += 1;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setSearching(false);
    setSearchId("");
    setSearchToken("");
    setResult(null);
    setMessage("");
    setError("");
    setOfferChange(null);
    setExpanded([]);
    setOpeningOffer("");
  }, []);

  const changeForm = useCallback((updater: (current: SearchForm) => SearchForm) => {
    invalidateSearch();
    setForm(updater);
  }, [invalidateSearch]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const rawOrigin = String(params.get("origin") || "");
    const rawDestinationCode = String(params.get("destination") || "");
    const rawFriendlyDestination = rawDestinationCode
      ? ""
      : String(params.get("to") || params.get("country") || "");
    const origin = rawOrigin ? explicitIata(rawOrigin) : "";
    const destination = rawDestinationCode
      ? explicitIata(rawDestinationCode)
      : resolveFriendlyLocation(rawFriendlyDestination);
    const rawCurrency = String(params.get("currency") || "").toUpperCase();
    const currency = (["TRY", "EUR", "USD"] as const).find((item) => item === rawCurrency);
    const unresolved: string[] = [];
    if (rawOrigin && !origin) unresolved.push("kalkış");
    if ((rawDestinationCode || rawFriendlyDestination) && !destination) unresolved.push("varış");
    setPrefillWarning(unresolved.length
      ? `Bağlantıdaki ${unresolved.join(" ve ")} bilgisi kesin bir havalimanıyla eşleşmedi. Lütfen aşağıdan seçim yap.`
      : "");
    changeForm((current) => ({
      ...current,
      origin: rawOrigin ? origin : current.origin,
      destination: rawDestinationCode || rawFriendlyDestination ? destination : current.destination,
      departureDate: /^\d{4}-\d{2}-\d{2}$/.test(params.get("departureDate") || "") ? params.get("departureDate")! : current.departureDate,
      returnDate: /^\d{4}-\d{2}-\d{2}$/.test(params.get("returnDate") || "") ? params.get("returnDate")! : current.returnDate,
      tripType: params.get("tripType") === "one_way" ? "one_way" : current.tripType,
      currency: currency || current.currency,
      includeNearbyAirports: params.get("includeNearbyAirports") === null
        ? current.includeNearbyAirports
        : ["1", "true", "yes"].includes(String(params.get("includeNearbyAirports")).toLowerCase()),
    }));
  }, [changeForm, queryString]);

  useEffect(() => () => {
    searchRun.current += 1;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
  }, []);

  const validationError = useMemo(() => {
    if (!/^[A-Z]{3}$/.test(form.origin) || !/^[A-Z]{3}$/.test(form.destination)) return "Kalkış ve varış için üç harfli havalimanı kodu seç.";
    if (form.origin === form.destination) return "Kalkış ve varış aynı olamaz.";
    if (!form.departureDate || form.departureDate < isoDate(0)) return "Geçerli bir gidiş tarihi seç.";
    if (form.tripType === "round_trip" && (!form.returnDate || form.returnDate < form.departureDate)) return "Dönüş tarihi gidiş tarihinden önce olamaz.";
    if (form.infants > form.adults) return "Bebek sayısı yetişkin sayısını aşamaz.";
    if (form.adults + form.children + form.infants > 9) return "Toplam yolcu sayısı 9'u aşamaz.";
    return "";
  }, [form]);

  const poll = useCallback(async (id: string, token: string, attempt = 0, runId = searchRun.current) => {
    if (searchRun.current !== runId) return;
    try {
      const response = await fetch(`/api/flights/searches/${encodeURIComponent(id)}`, {
        headers: { "x-flight-search-token": token },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Uçuş sonuçları alınamadı.");
      if (searchRun.current !== runId) return;
      const next = payload.data as SearchResult;
      setResult(next);
      if (!next.isComplete && attempt < 90) {
        pollTimer.current = window.setTimeout(() => void poll(id, token, attempt + 1, runId), 1_000);
      } else {
        setSearching(false);
        if (next.isComplete) setMessage("");
        const freshnessDelay = nextOfferFreshnessDelay(next);
        if (freshnessDelay !== null) {
          pollTimer.current = window.setTimeout(() => {
            setResult((current) => current ? markStaleOffers(current) : current);
            void poll(id, token, 0, runId);
          }, freshnessDelay);
        }
      }
    } catch (nextError) {
      if (searchRun.current !== runId) return;
      setSearching(false);
      setError(nextError instanceof Error ? nextError.message : "Uçuş sonuçları alınamadı.");
    }
  }, []);

  useEffect(() => {
    if (!searchId || !searchToken) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
      setResult((current) => current ? markStaleOffers(current) : current);
      void poll(searchId, searchToken, 0, searchRun.current);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [poll, searchId, searchToken]);

  const submit = async () => {
    if (validationError) return setError(validationError);
    invalidateSearch();
    const runId = searchRun.current;
    setSearching(true);
    try {
      const response = await fetch("/api/flights/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripType: form.tripType,
          origin: form.origin,
          destination: form.destination,
          departureDate: form.departureDate,
          returnDate: form.tripType === "round_trip" ? form.returnDate : null,
          passengers: { adults: form.adults, children: form.children, infants: form.infants },
          cabinClass: form.cabinClass,
          baggage: {
            cabinBagsPerPassenger: 1,
            checkedBagsPerPassenger: form.checkedBagsPerPassenger,
            checkedBagWeightKg: form.checkedBagsPerPassenger ? form.checkedBagWeightKg : null,
          },
          currency: form.currency,
          directOnly: form.directOnly,
          includeNearbyAirports: form.includeNearbyAirports,
          flexibleDates: 0,
          preferredAirlines: [],
          excludedAirlines: [],
          preferredSources: [],
          excludedSources: [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Uçuş araması başlatılamadı.");
      if (searchRun.current !== runId) return;
      const id = String(payload.data?.id || "");
      const token = String(payload.data?.accessToken || "");
      if (!id || !token) throw new Error("Arama erişim bilgisi alınamadı.");
      setSearchId(id);
      setSearchToken(token);
      setMessage(String(payload.data?.message || "Uçuş kaynakları kontrol ediliyor."));
      window.sessionStorage.setItem(`l2t.flight-search.${id}`, token);
      await poll(id, token, 0, runId);
    } catch (nextError) {
      if (searchRun.current !== runId) return;
      setSearching(false);
      setError(nextError instanceof Error ? nextError.message : "Uçuş araması başlatılamadı.");
    }
  };

  const swap = () => changeForm((current) => ({ ...current, origin: current.destination, destination: current.origin }));

  const airlines = useMemo(() => [...new Set((result?.itineraries || []).flatMap((item) => item.marketingAirlines))].sort(), [result]);
  const visibleItineraries = useMemo(() => {
    const filtered = (result?.itineraries || []).filter((item) => (
      (airline === "all" || item.marketingAirlines.includes(airline))
      && (seller === "all" || item.offers.some((offer) => offer.directAirlineSale))
    ));
    const lowest = (item: FlightItinerary) => Math.min(...item.offers
      .filter((offer) => offer.rankingEligible && (seller === "all" || offer.directAirlineSale))
      .map((offer) => offer.effectiveTotalPrice ?? Number.POSITIVE_INFINITY));
    return [...filtered].sort((left, right) => {
      if (sort === "cheapest") return lowest(left) - lowest(right);
      if (sort === "fastest") return left.totalDurationMinutes - right.totalDurationMinutes;
      if (sort === "departure") return Date.parse(left.segments[0]?.departureAt || "") - Date.parse(right.segments[0]?.departureAt || "");
      const leftScore = Number(left.rankingExplanation?.score) || 0;
      const rightScore = Number(right.rankingExplanation?.score) || 0;
      return rightScore - leftScore || lowest(left) - lowest(right);
    });
  }, [airline, result, seller, sort]);
  const conciseSourceStatuses = useMemo(() => {
    const sources = result?.sourceStatuses || [];
    const searched = sources.filter((source) => (
      ["queued", "running", "completed", "no_results", "failed", "dead_letter"].includes(source.state)
    ));
    if (searched.length) {
      return searched
        .sort((left, right) => {
          const priority = (state: string) => state === "running" ? 0 : state === "queued" ? 1 : state === "completed" ? 2 : 3;
          return priority(left.state) - priority(right.state);
        })
        .slice(0, 8);
    }
    return sources.filter((source) => source.state === "integration_required").slice(0, 3);
  }, [result]);
  const actualFailedSourceCount = useMemo(() => (result?.sourceStatuses || [])
    .filter((source) => source.state === "failed" || source.state === "dead_letter").length, [result]);
  const emptyCopy = result ? emptyResultCopy(result) : null;

  const continueToSeller = async (offer: FlightOffer) => {
    if (!searchId || !searchToken || openingOffer) return;
    setOpeningOffer(offer.id);
    setError("");
    try {
      const acceptedVersion = offerChange && offerMatchesVersion(offer, offerChange) && !isOfferStale(offer)
        ? offerChange
        : null;
      let redirectVersion: OfferVersion = acceptedVersion || {
        offerId: offer.id,
        totalPrice: offer.totalPrice,
        currency: offer.currency,
        verifiedAt: offer.verifiedAt,
      };
      if (!acceptedVersion) {
        const revalidationResponse = await fetch(`/api/flights/offers/${encodeURIComponent(offer.id)}/revalidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-flight-search-token": searchToken },
          body: JSON.stringify({ searchId }),
        });
        const revalidationPayload = await revalidationResponse.json().catch(() => ({}));
        if (!revalidationResponse.ok) {
          throw new Error(revalidationPayload.error || "Teklif yeniden doğrulanamadı.");
        }
        const revalidated: unknown = revalidationPayload.data;
        if (!isRevalidatedOffer(revalidated) || revalidated.offerId !== offer.id) {
          throw new Error("Kaynak geçerli bir teklif doğrulama yanıtı vermedi.");
        }
        if (revalidated.status === "unavailable") {
          setResult((current) => current ? removeResultOffer(current, offer.id) : current);
          window.requestAnimationFrame(() => resultsStatusRef.current?.focus());
          throw new Error(revalidated.message || "Bu teklif artık satıcıda bulunmuyor.");
        }
        setResult((current) => current ? updateResultOffer(current, revalidated) : current);
        redirectVersion = {
          offerId: revalidated.offerId,
          totalPrice: revalidated.totalPrice,
          currency: revalidated.currency,
          verifiedAt: revalidated.verifiedAt,
        };
        if (revalidated.status === "price_changed") {
          setOfferChange({
            ...redirectVersion,
            sourceName: offer.sourceName,
            previousPrice: offer.effectiveTotalPrice ?? offer.totalPrice,
            nextPrice: revalidated.effectiveTotalPrice ?? revalidated.totalPrice,
            priceChanged: revalidated.priceChanged,
            termsChanged: revalidated.termsChanged,
            message: revalidated.message,
          });
          void poll(searchId, searchToken, 0, searchRun.current);
          return;
        }
      }

      if (redirectVersion.totalPrice === null || !redirectVersion.currency || !redirectVersion.verifiedAt) {
        throw new Error("Doğrulanan teklif sürümü eksik; fiyatı yeniden kontrol et.");
      }

      const response = await fetch(`/api/flights/offers/${encodeURIComponent(offer.id)}/redirect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-flight-search-token": searchToken },
        body: JSON.stringify({
          searchId,
          expectedOfferId: redirectVersion.offerId,
          expectedTotalPrice: redirectVersion.totalPrice,
          expectedCurrency: redirectVersion.currency,
          expectedVerifiedAt: redirectVersion.verifiedAt,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Satış kanalına geçilemedi.");
      const url = String(payload.data?.redirectUrl || "");
      if (!/^https:\/\//.test(url)) throw new Error("Güvenli satış bağlantısı alınamadı.");
      setOfferChange(null);
      window.location.assign(url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Satış kanalına geçilemedi.");
    } finally {
      setOpeningOffer("");
    }
  };

  return (
    <div className={styles.experience}>
      <datalist id="l2t-airports">{AIRPORTS.map((airport) => <option key={airport.code} value={airport.code}>{airport.name} · {airport.countryName}</option>)}</datalist>

      <section className={styles.searchCard}>
        <div className={styles.searchTop}>
          <div><span><Sparkles size={15} /> Akıllı uçuş karşılaştırma</span><h2>Tek arama, yetkili kaynaklardaki bütün teklifler</h2></div>
          <div className={styles.tripSwitch} role="group" aria-label="Uçuş tipi">
            <button type="button" aria-pressed={form.tripType === "round_trip"} className={form.tripType === "round_trip" ? styles.active : ""} onClick={() => changeForm((current) => ({ ...current, tripType: "round_trip" }))}>Gidiş–dönüş</button>
            <button type="button" aria-pressed={form.tripType === "one_way"} className={form.tripType === "one_way" ? styles.active : ""} onClick={() => changeForm((current) => ({ ...current, tripType: "one_way", returnDate: "" }))}>Tek yön</button>
          </div>
        </div>

        <div className={styles.primaryGrid}>
          <label><span>Nereden</span><input aria-invalid={!/^[A-Z0-9]{3}$/.test(form.origin)} autoComplete="off" list="l2t-airports" value={form.origin} maxLength={3} placeholder="IST" onChange={(event) => { setPrefillWarning(""); changeForm((current) => ({ ...current, origin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })); }} /></label>
          <button type="button" className={styles.swap} onClick={swap} aria-label="Kalkış ve varışı değiştir"><ArrowRightLeft size={18} /></button>
          <label><span>Nereye</span><input aria-invalid={!/^[A-Z0-9]{3}$/.test(form.destination)} autoComplete="off" list="l2t-airports" value={form.destination} maxLength={3} placeholder="Şehir veya kod" onChange={(event) => { setPrefillWarning(""); changeForm((current) => ({ ...current, destination: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })); }} /></label>
          <label><span>Gidiş</span><input type="date" min={isoDate(0)} value={form.departureDate} onChange={(event) => changeForm((current) => ({ ...current, departureDate: event.target.value }))} /></label>
          <label className={form.tripType === "one_way" ? styles.disabled : ""}><span>Dönüş</span><input type="date" disabled={form.tripType === "one_way"} min={form.departureDate || isoDate(0)} value={form.returnDate} onChange={(event) => changeForm((current) => ({ ...current, returnDate: event.target.value }))} /></label>
        </div>

        <div className={styles.detailGrid}>
          <label><span>Yetişkin</span><select value={form.adults} onChange={(event) => changeForm((current) => ({ ...current, adults: Number(event.target.value) }))}>{[1,2,3,4,5,6,7,8,9].map((count) => <option key={count}>{count}</option>)}</select></label>
          <label><span>Çocuk</span><select value={form.children} onChange={(event) => changeForm((current) => ({ ...current, children: Number(event.target.value) }))}>{[0,1,2,3,4,5,6,7,8].map((count) => <option key={count}>{count}</option>)}</select></label>
          <label><span>Bebek</span><select value={form.infants} onChange={(event) => changeForm((current) => ({ ...current, infants: Number(event.target.value) }))}>{[0,1,2,3,4,5,6,7,8].map((count) => <option key={count}>{count}</option>)}</select></label>
          <label><span>Kabin</span><select value={form.cabinClass} onChange={(event) => changeForm((current) => ({ ...current, cabinClass: event.target.value as SearchForm["cabinClass"] }))}><option value="economy">Ekonomi</option><option value="premium_economy">Premium ekonomi</option><option value="business">Business</option><option value="first">First</option></select></label>
          <label><span>Kayıtlı bagaj</span><select value={form.checkedBagsPerPassenger} onChange={(event) => changeForm((current) => ({ ...current, checkedBagsPerPassenger: Number(event.target.value) }))}><option value={0}>İstemiyorum</option><option value={1}>1 parça</option><option value={2}>2 parça</option></select></label>
          <label className={!form.checkedBagsPerPassenger ? styles.disabled : ""}><span>Parça başı ağırlık</span><select disabled={!form.checkedBagsPerPassenger} value={form.checkedBagWeightKg} onChange={(event) => changeForm((current) => ({ ...current, checkedBagWeightKg: Number(event.target.value) }))}><option value={15}>15 kg</option><option value={20}>20 kg</option><option value={23}>23 kg</option><option value={30}>30 kg</option></select></label>
          <label><span>Para birimi</span><select value={form.currency} onChange={(event) => changeForm((current) => ({ ...current, currency: event.target.value as SearchForm["currency"] }))}><option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
          <label className={styles.check}><input type="checkbox" checked={form.directOnly} onChange={(event) => changeForm((current) => ({ ...current, directOnly: event.target.checked }))} /><span>Sadece direkt uçuş</span></label>
          <label className={styles.check}><input type="checkbox" checked={form.includeNearbyAirports} onChange={(event) => changeForm((current) => ({ ...current, includeNearbyAirports: event.target.checked }))} /><span>Yakın havalimanlarını dahil et</span></label>
        </div>

        {prefillWarning && <div className={styles.prefillWarning} role="status"><AlertCircle size={16} /> {prefillWarning}</div>}
        {validationError && form.destination && <div className={styles.inlineError}><AlertCircle size={16} /> {validationError}</div>}
        <button type="button" className={styles.searchButton} disabled={searching || Boolean(validationError)} onClick={() => void submit()}>
          {searching ? <RefreshCw className={styles.spin} size={19} /> : <Search size={19} />}
          {searching ? "Yetkili kaynaklar kontrol ediliyor" : "En uygun uçuşu bul"}
        </button>
        <p className={styles.privacy}><ShieldCheck size={15} /> Kart bilgisi LetsGo2Travel'a girilmez. Ödeme, seçtiğin resmî bilet sitesi veya havayolunda tamamlanır.</p>
      </section>

      {message && <div className={styles.notice} role="status" aria-live="polite">{searching ? <RefreshCw className={styles.spin} size={18} /> : <CheckCircle2 size={18} />} {message}</div>}
      {offerChange && <div className={styles.priceChange} role="status" aria-live="assertive"><AlertCircle size={18} /><div><strong>{offerChange.sourceName} {offerChange.priceChanged && offerChange.termsChanged ? "fiyatı ve koşulları değişti" : offerChange.termsChanged ? "bilet koşulları değişti" : "fiyatı değişti"}</strong>{offerChange.priceChanged && <span>{formatMoney(offerChange.previousPrice, offerChange.currency)} → {formatMoney(offerChange.nextPrice, offerChange.currency)}</span>}{offerChange.termsChanged && <span>Bagaj veya tarife koşulları değişti; güncel ayrıntılar teklif kartına işlendi.</span>}<small>{offerChange.message || "Güncel teklifle devam etmek için aynı düğmeye tekrar bas."}</small></div></div>}
      {error && <div className={styles.error} role="alert"><AlertCircle size={18} /> {error}</div>}

      {result && (
        <section className={styles.results}>
          <div className={styles.progressPanel} role="status" aria-live="polite">
            <div><span><Plane size={19} /></span><div><h2 className={styles.progressHeading} ref={resultsStatusRef} tabIndex={-1}>{result.summary.itineraryCount} uçuş · {result.summary.offerCount} teklif</h2><small>{result.summary.completedSourceCount} kaynak tamamlandı{actualFailedSourceCount ? ` · ${actualFailedSourceCount} kaynak yanıt vermedi` : ""}</small></div></div>
            <div className={styles.sourceList}>{conciseSourceStatuses.map((source) => <span key={source.sourceId} className={styles[source.state] || ""} title={source.message}><i aria-hidden="true" />{source.sourceName}: {sourceStateLabel(source.state)}</span>)}</div>
            {conciseSourceStatuses.length === 0 && <small>Bu aramaya dahil edilen kaynak bulunamadı.</small>}
          </div>

          {result.itineraries.length > 0 && (
            <div className={styles.resultToolbar}>
              <label><Filter size={16} aria-hidden="true" /><span className={styles.srOnly}>Havayolu filtresi</span><select aria-label="Havayolu filtresi" value={airline} onChange={(event) => setAirline(event.target.value)}><option value="all">Tüm havayolları</option>{airlines.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
              <label><WalletCards size={16} aria-hidden="true" /><span className={styles.srOnly}>Satıcı filtresi</span><select aria-label="Satıcı filtresi" value={seller} onChange={(event) => setSeller(event.target.value as "all" | "direct")}><option value="all">Tüm satıcılar</option><option value="direct">Yalnız havayolu</option></select></label>
              <label><ChevronDown size={16} aria-hidden="true" /><span className={styles.srOnly}>Sonuç sıralaması</span><select aria-label="Sonuç sıralaması" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="best_value">En avantajlı</option><option value="cheapest">En ucuz</option><option value="fastest">En hızlı</option><option value="departure">En erken kalkış</option></select></label>
            </div>
          )}

          {visibleItineraries.map((itinerary) => {
            const displayedOffers = seller === "direct"
              ? itinerary.offers.filter((offer) => offer.directAirlineSale)
              : itinerary.offers;
            const eligibleOffers = displayedOffers
              .filter((offer) => offer.rankingEligible)
              .sort((left, right) => (
                (left.effectiveTotalPrice ?? Number.POSITIVE_INFINITY)
                - (right.effectiveTotalPrice ?? Number.POSITIVE_INFINITY)
              ));
            const lowestOffer = eligibleOffers[0] || null;
            const sellerGroups = groupOffersBySeller(displayedOffers);
            const legs = [...new Set(itinerary.segments.map((segment) => segment.legIndex))].map((legIndex) => {
              const segments = itinerary.segments.filter((segment) => segment.legIndex === legIndex);
              const first = segments[0];
              const last = segments[segments.length - 1];
              const elapsed = Date.parse(last?.arrivalAt || "") - Date.parse(first?.departureAt || "");
              return {
                legIndex,
                first,
                last,
                durationMinutes: Number.isFinite(elapsed) && elapsed > 0 ? Math.round(elapsed / 60_000) : 0,
                stopCount: Math.max(0, segments.length - 1),
              };
            });
            const first = legs[0]?.first;
            const isOpen = expanded.includes(itinerary.id);
            const offerPanelId = `offers-${itinerary.id}`;
            return (
              <article className={styles.itinerary} key={itinerary.id}>
                <div className={styles.tags}>
                  {itinerary.labels.map((label) => <span key={label}>{label === "cheapest" ? "En ucuz" : label === "fastest" ? "En hızlı" : "En avantajlı"}</span>)}
                  {itinerary.hasSelfTransfer && <span className={styles.warningTag}>Kendin transfer</span>}
                  {itinerary.hasAirportChange && <span className={styles.warningTag}>Havalimanı değişikliği</span>}
                  {itinerary.hasOvernightLayover && <span className={styles.warningTag}>Gece aktarması</span>}
                </div>
                <div className={styles.itineraryMain}>
                  <div className={styles.airline}><span>{first?.marketingAirline || "—"}</span><div><strong>{first?.marketingAirline || "Havayolu"}</strong><small>{first?.flightNumber || ""}</small></div></div>
                  <div className={styles.legStack}>{legs.map((leg) => <div className={styles.routeTime} key={leg.legIndex}><div><strong>{localClock(leg.first?.departureLocal)}</strong><span>{leg.first?.origin}</span><small>{[localDate(leg.first?.departureLocal), terminalText(leg.first?.departureTerminal)].filter(Boolean).join(" · ")}</small></div><div className={styles.routeLine}><small>{leg.legIndex === 0 ? "Gidiş" : "Dönüş"} · {leg.durationMinutes ? formatDuration(leg.durationMinutes) : "Süre doğrulanmadı"}</small><i /><span>{leg.stopCount === 0 ? "Direkt" : `${leg.stopCount} aktarma`}</span></div><div><strong>{localClock(leg.last?.arrivalLocal)}</strong><span>{leg.last?.destination}</span><small>{[localDate(leg.last?.arrivalLocal), terminalText(leg.last?.arrivalTerminal)].filter(Boolean).join(" · ")}</small></div></div>)}</div>
                  <div className={styles.lowest}><small>{sellerGroups.length} farklı satıcıda bulundu</small><strong>{lowestOffer ? formatMoney(lowestOffer.effectiveTotalPrice, lowestOffer.currency) : "Karşılaştırılabilir fiyat yok"}</strong><span>{lowestOffer?.baggage && Number(lowestOffer.baggage.checkedBagsPerPassenger) >= form.checkedBagsPerPassenger ? <><Luggage size={14} /> İstenen bagaj dahil</> : "Ücret/bagaj eksik"}</span></div>
                  <button type="button" className={styles.expandButton} aria-expanded={isOpen} aria-controls={offerPanelId} onClick={() => setExpanded((current) => current.includes(itinerary.id) ? current.filter((id) => id !== itinerary.id) : [...current, itinerary.id])}>{isOpen ? "Teklifleri gizle" : "Teklifleri karşılaştır"}<ChevronDown className={isOpen ? styles.chevronOpen : ""} size={17} /></button>
                </div>

                {isOpen && <div className={styles.offerArea} id={offerPanelId}>
                  {itinerary.rankingExplanation?.reasons?.length ? <div className={styles.why}><Sparkles size={17} /><div><strong>Neden bu sonuç?</strong>{itinerary.rankingExplanation.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div></div> : null}
                  <div className={styles.segmentDetails} aria-label="Uçuş ve terminal ayrıntıları">{itinerary.segments.map((segment) => <article key={segment.id}><strong>{segment.marketingAirline} {segment.flightNumber}</strong><span>{segment.origin} → {segment.destination}</span><small>{[
                    segment.operatingAirline && segment.operatingAirline !== segment.marketingAirline ? `Operasyon: ${segment.operatingAirline}` : "",
                    terminalText(segment.departureTerminal),
                    segment.aircraft,
                    segment.cabinClass,
                  ].filter(Boolean).join(" · ")}</small></article>)}</div>
                  <div className={styles.offers}>{sellerGroups.map((sellerGroup) => <section className={styles.sellerGroup} key={sellerGroup.sourceId} aria-label={`${sellerGroup.sourceName} teklifleri`}>
                    <header className={styles.sellerHead}><div><strong>{sellerGroup.sourceName}</strong><span>{sellerGroup.directAirlineSale ? "Doğrudan havayolu" : sellerGroup.sourceType === "ota" ? "Bilet sitesi" : "Yetkili kaynak"}</span></div><small>{sellerGroup.offers.length > 1 ? `${sellerGroup.offers.length} tarife` : "1 tarife"}</small></header>
                    {sellerGroup.offers.map((offer) => {
                      const stale = isOfferStale(offer);
                      const acceptsChangedOffer = Boolean(offerChange && offerMatchesVersion(offer, offerChange) && !stale);
                      return <div className={`${styles.offer} ${stale ? styles.staleOffer : ""}`} key={offer.id}>
                        <div><strong>{offer.fareFamily || "Standart tarife"}</strong><span>{offer.conditional ? (offer.conditionSummary || "Koşullu fiyat") : offer.priceCompleteness === "complete" ? "Zorunlu ücretler dahil" : "Ücret bilgisi eksik"}</span>{offer.sponsored && <em>Sponsorlu</em>}</div>
                        <div className={styles.benefits}>
                          <span>{offer.baggage && Number(offer.baggage.checkedBagsPerPassenger) > 0 ? `${String(offer.baggage.checkedBagWeightKg || "")} kg bagaj dahil` : "Kayıtlı bagaj dahil değil"}</span>
                          {offer.fareRules?.refundable === true && <span>İade edilebilir</span>}
                          {offer.fareRules?.changeable === true && <span>Değiştirilebilir</span>}
                          {offer.installmentOptions?.[0] && <span>{offer.installmentOptions[0]}</span>}
                          {offer.benefits?.slice(0, 3).map((benefit) => <span key={benefit}>{benefit}</span>)}
                        </div>
                        <div className={styles.offerPrice}><small>{offer.rankingEligible && offer.id === lowestOffer?.id ? "En düşük uygun toplam" : offer.rankingEligible ? "Karşılaştırılabilir toplam" : "Karşılaştırma dışı"}</small><strong>{formatMoney(offer.effectiveTotalPrice ?? offer.totalPrice, offer.currency)}</strong><span>{stale ? "Fiyat güncelliğini yitirdi" : formatVerifiedAt(offer.verifiedAt)}</span>{offer.perPersonPrice !== null && <span>Kişi başı {formatMoney(offer.perPersonPrice, offer.currency)}</span>}</div>
                        <button type="button" aria-busy={openingOffer === offer.id} disabled={Boolean(openingOffer)} title={stale ? "Teklifi satıcı kaynağında yeniden doğrula" : acceptsChangedOffer ? "Güncellenen teklifle satıcı sitesine git" : `${sellerGroup.sourceName} sitesine git`} onClick={() => void continueToSeller(offer)}>{openingOffer === offer.id ? <RefreshCw className={styles.spin} size={16} /> : stale ? <RefreshCw size={16} /> : <ExternalLink size={16} />}{stale ? "Teklifi yenile" : acceptsChangedOffer ? "Güncel teklifle siteye git" : "Siteye git"}</button>
                      </div>;
                    })}
                  </section>)}</div>
                </div>}
              </article>
            );
          })}

          {result.itineraries.length > 0 && visibleItineraries.length === 0 && (
            <div className={`${styles.emptyState} ${styles.filterEmpty}`}>
              <span><Filter size={27} /></span>
              <h2>Bu filtrelerle eşleşen uçuş yok</h2>
              <p>Sonuçları yeniden görmek için havayolu ve satıcı filtrelerini temizle.</p>
              <button type="button" onClick={() => { setAirline("all"); setSeller("all"); }}>Filtreleri temizle</button>
            </div>
          )}

          {result.itineraries.length === 0 && (
            <div className={styles.emptyState}>
              <span><TimerReset size={28} /></span>
              <h2>{emptyCopy?.title}</h2>
              <p>{emptyCopy?.body}</p>
              <div>{conciseSourceStatuses.map((source) => <article key={source.sourceId}><strong>{source.sourceName}</strong><span>{sourceStateLabel(source.state)}</span></article>)}</div>
            </div>
          )}
        </section>
      )}

      {!result && !searching && (
        <section className={styles.promiseGrid}>
          <article><WalletCards size={22} /><div><strong>Gerçek toplam maliyet</strong><span>Zorunlu ücret ve istediğin bagaj bilinmiyorsa teklif “en ucuz” seçilmez.</span></div></article>
          <article><BriefcaseBusiness size={22} /><div><strong>Tek uçuş, çok satıcı</strong><span>Aynı uçuş farklı sitelerde tekrar kart olarak gösterilmez.</span></div></article>
          <article><Clock3 size={22} /><div><strong>Fiyat güncelliği</strong><span>Satış kanalına geçmeden önce teklif zamanı ve uygunluk kontrol edilir.</span></div></article>
        </section>
      )}
    </div>
  );
}
