import { useEffect, useMemo, useState } from "react";
import { AirportAutocomplete } from "../components/AirportAutocomplete";
import { Icon } from "../components/Icon";
import {
  ApiError,
  createFlightSearch,
  getFlightOfferRedirect,
  getFlightOfferRevalidation,
  getFlightSearch,
} from "../lib/api";
import { hapticSuccess, openExternal } from "../lib/native";
import { saveFlightSearch } from "../lib/storage";
import { getSupabaseDataErrorMessage, upsertUserTrip } from "../lib/supabaseData";
import type {
  AuthUser,
  FlightMetaItinerary,
  FlightMetaOffer,
  FlightMetaSearchCreate,
  FlightMetaSearchResult,
  FlightOfferRevalidation,
  FlightResultSort,
  FlightSearchInput,
} from "../types";

const TERMINAL_SEARCH_STATES = new Set(["completed", "failed", "no_sources", "expired"]);
const ACTIVE_POLL_LIMIT_MS = 120_000;
const PRICE_FRESHNESS_MS = 10 * 60 * 1_000;
const CLOCK_SKEW_MS = 120_000;

type AcceptedOfferVersion = {
  offerId: string;
  totalPrice: number;
  currency: string;
  verifiedAt: string;
};

function isoDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number | null, currency: string) {
  if (value === null) return "Fiyat doğrulanmadı";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
  }
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours} sa ` : ""}${rest ? `${rest} dk` : ""}`.trim();
}

function localClock(value?: string | null) {
  const match = value?.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "--:--";
}

function offerMatchesVersion(offer: FlightMetaOffer, version: AcceptedOfferVersion) {
  const offerVerifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  const acceptedVerifiedAt = Date.parse(version.verifiedAt);
  return offer.id === version.offerId
    && offer.totalPrice === version.totalPrice
    && offer.currency === version.currency
    && Number.isFinite(offerVerifiedAt)
    && offerVerifiedAt === acceptedVerifiedAt;
}

function versionFromRevalidation(revalidation: FlightOfferRevalidation): AcceptedOfferVersion | null {
  if (revalidation.status === "unavailable"
      || revalidation.totalPrice === null
      || !revalidation.verifiedAt) return null;
  return {
    offerId: revalidation.offerId,
    totalPrice: revalidation.totalPrice,
    currency: revalidation.currency,
    verifiedAt: revalidation.verifiedAt,
  };
}

function comparisonNote(offer: FlightMetaOffer) {
  if (offer.eligibilityReasons.includes("stale_price")) return "Fiyat güncelliğini yitirdi";
  if (offer.sponsored) return "Sponsorlu · Organik sıralama dışında";
  if (offer.rankingEligible) return "Karşılaştırılabilir toplam";
  if (offer.eligibilityReasons.includes("conditional_price")) return "Koşullu fiyat · Varsayılan sıralama dışında";
  if (offer.eligibilityReasons.includes("currency_mismatch")) return "Para birimi karşılaştırmaya uygun değil";
  if (offer.eligibilityReasons.some((reason) => reason.includes("baggage"))) return "İstenen bagajın toplam ücreti doğrulanmadı";
  if (offer.eligibilityReasons.includes("mandatory_fees_unknown")) return "Zorunlu ücretler doğrulanmadı";
  return "Toplam fiyat karşılaştırmaya uygun değil";
}

function baggageNote(offer: FlightMetaOffer) {
  const baggage = offer.baggage || {};
  const checkedCount = Number(baggage.checkedBagsPerPassenger) || 0;
  const checkedWeight = Number(baggage.checkedBagWeightKg) || 0;
  const cabinCount = Number(baggage.cabinBagsPerPassenger) || 0;
  if (checkedCount > 0) return `${checkedCount} parça${checkedWeight ? ` · ${checkedWeight} kg` : ""} kayıtlı bagaj`;
  if (cabinCount > 0) return `${cabinCount} kabin bagajı · kayıtlı bagaj yok`;
  return "Bagaj dahil değil";
}

function offerFreshnessDeadline(offer: FlightMetaOffer) {
  const verifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  if (!Number.isFinite(verifiedAt)) return Number.NaN;
  const expiry = offer.expiresAt ? Date.parse(offer.expiresAt) : Number.POSITIVE_INFINITY;
  if (offer.expiresAt && !Number.isFinite(expiry)) return Number.NaN;
  return Math.min(verifiedAt + PRICE_FRESHNESS_MS, expiry);
}

function isOfferStale(offer: FlightMetaOffer, now = Date.now()) {
  if (offer.eligibilityReasons.includes("stale_price")) return true;
  const verifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  const deadline = offerFreshnessDeadline(offer);
  return !Number.isFinite(verifiedAt)
    || verifiedAt > now + CLOCK_SKEW_MS
    || !Number.isFinite(deadline)
    || deadline <= now;
}

function nextOfferFreshnessDelay(result: FlightMetaSearchResult) {
  const now = Date.now();
  const deadlines = result.itineraries.flatMap((itinerary) => itinerary.offers.flatMap((offer) => {
    if (offer.eligibilityReasons.includes("stale_price")) return [];
    const deadline = offerFreshnessDeadline(offer);
    return Number.isFinite(deadline) ? [deadline] : [now];
  }));
  if (!deadlines.length) return null;
  return Math.max(250, Math.min(...deadlines) - now + 250);
}

function recalculateComparableLabels(result: FlightMetaSearchResult) {
  const eligible = result.itineraries.flatMap((itinerary) => itinerary.offers.flatMap((offer) => (
    offer.rankingEligible && typeof offer.effectiveTotalPrice === "number"
      ? [{ itineraryId: itinerary.id, price: offer.effectiveTotalPrice, duration: itinerary.totalDurationMinutes }]
      : []
  )));
  const minimumPrice = eligible.length ? Math.min(...eligible.map((item) => item.price)) : null;
  const minimumDuration = eligible.length ? Math.min(...eligible.map((item) => item.duration)) : null;
  return {
    ...result,
    itineraries: result.itineraries.map((itinerary) => {
      const ownEligible = eligible.filter((item) => item.itineraryId === itinerary.id);
      const rankingOfferEligible = Boolean(itinerary.rankingExplanation?.offerId
        && itinerary.offers.some((offer) => (
          offer.id === itinerary.rankingExplanation?.offerId && offer.rankingEligible
        )));
      const labels = itinerary.labels.filter((label) => (
        label !== "cheapest"
        && label !== "fastest"
        && (label !== "best_value" || rankingOfferEligible)
      ));
      if (minimumPrice !== null && ownEligible.some((item) => item.price === minimumPrice)) labels.push("cheapest");
      if (minimumDuration !== null && ownEligible.length && itinerary.totalDurationMinutes === minimumDuration) labels.push("fastest");
      return {
        ...itinerary,
        labels: [...new Set(labels)],
        rankingExplanation: rankingOfferEligible ? itinerary.rankingExplanation : {},
      };
    }),
  };
}

function markStaleOffers(result: FlightMetaSearchResult, now = Date.now()) {
  let changed = false;
  const withFreshness = result.itineraries.map((itinerary) => ({
    ...itinerary,
    offers: itinerary.offers.map((offer) => {
      if (!isOfferStale(offer, now) || offer.eligibilityReasons.includes("stale_price")) return offer;
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

  return recalculateComparableLabels({ ...result, itineraries: withFreshness });
}

function updateOfferFromRevalidation(
  result: FlightMetaSearchResult,
  currentOfferId: string,
  revalidation: FlightOfferRevalidation,
) {
  return recalculateComparableLabels({
    ...result,
    itineraries: result.itineraries.map((itinerary) => ({
      ...itinerary,
      offers: itinerary.offers.map((offer) => {
        if (offer.id !== currentOfferId) return offer;
        const eligibilityReasons = offer.eligibilityReasons.filter((reason) => reason !== "stale_price");
        const effectiveTotalPrice = revalidation.effectiveTotalPrice;
        return {
          ...offer,
          totalPrice: revalidation.totalPrice ?? offer.totalPrice,
          perPersonPrice: revalidation.perPersonPrice === undefined
            ? offer.perPersonPrice
            : revalidation.perPersonPrice,
          effectiveTotalPrice,
          currency: revalidation.currency || offer.currency,
          baggage: revalidation.baggage || offer.baggage,
          fareFamily: revalidation.fareFamily,
          benefits: revalidation.benefits,
          verifiedAt: revalidation.verifiedAt,
          expiresAt: revalidation.expiresAt,
          rankingEligible: effectiveTotalPrice !== null && !offer.sponsored && eligibilityReasons.length === 0,
          eligibilityReasons,
        };
      }),
    })),
  });
}

function markOfferUnavailable(result: FlightMetaSearchResult, offerId: string) {
  return recalculateComparableLabels({
    ...result,
    itineraries: result.itineraries.map((itinerary) => ({
      ...itinerary,
      offers: itinerary.offers.map((offer) => offer.id === offerId ? {
        ...offer,
        rankingEligible: false,
        effectiveTotalPrice: null,
        eligibilityReasons: [...new Set([...offer.eligibilityReasons, "stale_price"])],
      } : offer),
    })),
  });
}

function lowestComparablePrice(itinerary: FlightMetaItinerary) {
  const prices = itinerary.offers.flatMap((offer) => (
    offer.rankingEligible && !isOfferStale(offer) && typeof offer.effectiveTotalPrice === "number"
      ? [offer.effectiveTotalPrice]
      : []
  ));
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function sortItineraries(itineraries: FlightMetaItinerary[], sort: FlightResultSort) {
  return [...itineraries].sort((left, right) => {
    const leftPrice = lowestComparablePrice(left);
    const rightPrice = lowestComparablePrice(right);
    if (sort === "cheapest") return leftPrice - rightPrice || left.totalDurationMinutes - right.totalDurationMinutes;
    if (sort === "fastest") return left.totalDurationMinutes - right.totalDurationMinutes || leftPrice - rightPrice;
    if (sort === "departure") {
      const leftDeparture = Date.parse(left.segments[0]?.departureAt || "");
      const rightDeparture = Date.parse(right.segments[0]?.departureAt || "");
      return leftDeparture - rightDeparture || leftPrice - rightPrice;
    }
    const leftScore = Number(left.rankingExplanation?.score) || (left.labels.includes("best_value") ? 100 : 0);
    const rightScore = Number(right.rankingExplanation?.score) || (right.labels.includes("best_value") ? 100 : 0);
    return rightScore - leftScore || leftPrice - rightPrice || left.totalDurationMinutes - right.totalDurationMinutes;
  });
}

function labelCopy(label: string) {
  if (label === "cheapest") return "En ucuz";
  if (label === "fastest") return "En hızlı";
  if (label === "best_value") return "En avantajlı";
  return "";
}

const INITIAL: FlightSearchInput = {
  originCode: "IST",
  originLabel: "İstanbul, Türkiye (IST)",
  destinationCode: "DXB",
  destinationLabel: "Dubai, Birleşik Arap Emirlikleri (DXB)",
  departureDate: isoDate(14),
  returnDate: isoDate(21),
  tripType: "round_trip",
  adults: 1,
  children: 0,
  infants: 0,
  cabinClass: "economy",
  cabinBagsPerPassenger: 1,
  checkedBagsPerPassenger: 0,
  checkedBagWeightKg: 20,
  currency: "TRY",
  directOnly: false,
  includeNearbyAirports: false,
};

export function FlightSearchScreen({ prefillDestination, user, accessToken, onNotice }: {
  prefillDestination?: { code: string; label: string } | null;
  user: AuthUser | null;
  accessToken: string;
  onNotice: (message: string) => void;
  onOpenAccount: () => void;
}) {
  const [form, setForm] = useState<FlightSearchInput>(INITIAL);
  const [searching, setSearching] = useState(false);
  const [session, setSession] = useState<FlightMetaSearchCreate | null>(null);
  const [result, setResult] = useState<FlightMetaSearchResult | null>(null);
  const [openingOffer, setOpeningOffer] = useState("");
  const [expandedItineraries, setExpandedItineraries] = useState<string[]>([]);
  const [acceptedOfferVersions, setAcceptedOfferVersions] = useState<AcceptedOfferVersion[]>([]);
  const [sort, setSort] = useState<FlightResultSort>("best_value");
  const [pollStopped, setPollStopped] = useState(false);
  const [pollRun, setPollRun] = useState(0);

  const resetResults = () => {
    setSession(null);
    setResult(null);
    setExpandedItineraries([]);
    setAcceptedOfferVersions([]);
    setPollStopped(false);
  };

  const changeForm = (updater: (current: FlightSearchInput) => FlightSearchInput) => {
    setForm(updater);
    resetResults();
  };

  useEffect(() => {
    if (!prefillDestination?.code) return;
    setForm((current) => ({
      ...current,
      destinationCode: prefillDestination.code,
      destinationLabel: prefillDestination.label,
    }));
    setSession(null);
    setResult(null);
    setExpandedItineraries([]);
    setAcceptedOfferVersions([]);
    setPollStopped(false);
  }, [prefillDestination]);

  useEffect(() => {
    if (!session || TERMINAL_SEARCH_STATES.has(session.status)) return;
    let active = true;
    let timer = 0;
    let failures = 0;
    let polling = false;
    let complete = false;
    const startedAt = Date.now();
    setPollStopped(false);

    const poll = async () => {
      if (polling) return;
      if (Date.now() - startedAt >= ACTIVE_POLL_LIMIT_MS) {
        setPollStopped(true);
        return;
      }
      polling = true;
      try {
        const next = markStaleOffers(await getFlightSearch(session.id, session.accessToken, accessToken || undefined));
        if (!active) return;
        failures = 0;
        complete = next.isComplete;
        setResult(next);
        if (!next.isComplete) {
          if (Date.now() - startedAt >= ACTIVE_POLL_LIMIT_MS) {
            setPollStopped(true);
          } else {
            timer = window.setTimeout(() => void poll(), 2_000);
          }
        }
      } catch (pollError) {
        if (!active) return;
        failures += 1;
        if (failures <= 3 && Date.now() - startedAt < ACTIVE_POLL_LIMIT_MS) {
          timer = window.setTimeout(() => void poll(), failures * 2_000);
        } else {
          setPollStopped(true);
          onNotice(pollError instanceof Error ? pollError.message : "Uçuş sonuçları güncellenemedi.");
        }
      } finally {
        polling = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      setResult((current) => current ? markStaleOffers(current) : current);
      if (!complete && Date.now() - startedAt < ACTIVE_POLL_LIMIT_MS) void poll();
      else if (!complete) setPollStopped(true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accessToken, onNotice, pollRun, session]);

  useEffect(() => {
    if (!result) return;
    const freshnessDelay = nextOfferFreshnessDelay(result);
    if (freshnessDelay === null) return;
    const timer = window.setTimeout(() => {
      setResult((current) => current ? markStaleOffers(current) : current);
    }, freshnessDelay);
    return () => window.clearTimeout(timer);
  }, [result]);

  const error = useMemo(() => {
    if (!form.originCode || !form.destinationCode) return "Kalkış ve varış havalimanını listeden seç.";
    if (form.originCode === form.destinationCode) return "Kalkış ve varış farklı olmalı.";
    if (!form.departureDate) return "Gidiş tarihini seç.";
    if (form.departureDate < isoDate(0)) return "Gidiş tarihi geçmiş olamaz.";
    if (form.tripType === "round_trip" && (!form.returnDate || form.returnDate < form.departureDate)) return "Dönüş tarihi gidişten önce olamaz.";
    if (form.infants > form.adults) return "Bebek sayısı yetişkin sayısını aşamaz.";
    if (form.adults + form.children + form.infants > 9) return "Toplam yolcu sayısı 9'u aşamaz.";
    return "";
  }, [form]);

  const swap = () => changeForm((current) => ({
    ...current,
    originCode: current.destinationCode,
    originLabel: current.destinationLabel,
    destinationCode: current.originCode,
    destinationLabel: current.originLabel,
  }));

  const search = async () => {
    if (error) return onNotice(error);
    setSearching(true);
    resetResults();
    try {
      const created = await createFlightSearch(form, accessToken || undefined);
      setSession(created);
      const clientKey = [
        form.originCode,
        form.destinationCode,
        form.departureDate,
        form.returnDate || "one-way",
        form.tripType,
        form.adults,
        form.children,
        form.infants,
        form.cabinClass,
        form.cabinBagsPerPassenger,
        form.checkedBagsPerPassenger,
        form.checkedBagWeightKg || 0,
        form.currency,
        form.directOnly ? "direct" : "all",
        form.includeNearbyAirports ? "nearby" : "exact",
      ].join("-");
      const savedAt = new Date().toISOString();
      saveFlightSearch({ ...form, id: `search-${clientKey}`, createdAt: savedAt, searchId: created.id }, user?.id);

      let syncWarning = "";
      if (user && accessToken) {
        try {
          await upsertUserTrip(user.id, {
            title: `${form.originCode} → ${form.destinationCode}`,
            destination: form.destinationLabel.slice(0, 160),
            mobileKind: "flight_search",
            clientKey: `search-${clientKey}`,
            tripData: { search: form, flight_search_id: created.id, saved_at: savedAt },
          }, accessToken);
        } catch (syncError) {
          syncWarning = `${getSupabaseDataErrorMessage(syncError, "Arama hesabınla eşitlenemedi.")} Cihaz kaydı korundu.`;
        }
      }
      await hapticSuccess();
      onNotice(syncWarning || created.message);
    } catch (requestError) {
      onNotice(requestError instanceof Error ? requestError.message : "Uçuş araması başlatılamadı.");
    } finally {
      setSearching(false);
    }
  };

  const continueToSeller = async (offer: FlightMetaOffer) => {
    if (!session || openingOffer) return;
    setOpeningOffer(offer.id);
    try {
      const storedVersion = acceptedOfferVersions.find((version) => version.offerId === offer.id) || null;
      const acceptedVersion = storedVersion && offerMatchesVersion(offer, storedVersion) ? storedVersion : null;
      if (storedVersion && !acceptedVersion) {
        setAcceptedOfferVersions((current) => current.filter((version) => version.offerId !== offer.id));
        onNotice("Teklif, onayından sonra değişti. Güncel fiyat ve koşulları yeniden kontrol et.");
        return;
      }

      let redirectVersion = acceptedVersion;
      if (!redirectVersion) {
        const revalidation = await getFlightOfferRevalidation({
          offerId: offer.id,
          searchId: session.id,
          searchToken: session.accessToken,
          accessToken: accessToken || undefined,
        });

        if (revalidation.status === "unavailable") {
          setResult((current) => current ? markOfferUnavailable(current, offer.id) : current);
          setAcceptedOfferVersions((current) => current.filter((version) => version.offerId !== offer.id));
          onNotice(revalidation.message || "Bu teklif artık kullanılamıyor. Diğer satıcıları deneyebilirsin.");
          return;
        }

        redirectVersion = versionFromRevalidation(revalidation);
        if (!redirectVersion) throw new Error("Doğrulanan teklif sürümü yönlendirme için geçersiz.");
        setResult((current) => current ? updateOfferFromRevalidation(current, offer.id, revalidation) : current);
        if (revalidation.status === "price_changed") {
          const nextVersion = redirectVersion;
          setAcceptedOfferVersions((current) => [
            ...current.filter((version) => version.offerId !== offer.id),
            nextVersion,
          ]);
          try {
            const refreshed = markStaleOffers(await getFlightSearch(session.id, session.accessToken, accessToken || undefined));
            setResult(updateOfferFromRevalidation(refreshed, offer.id, revalidation));
          } catch {
            // Güncel fiyat yerel karta işlendi; tam sıralama sonraki sonuç yenilemesinde alınır.
          }
          const updatedPrice = revalidation.effectiveTotalPrice ?? revalidation.totalPrice;
          const priceNote = revalidation.priceChanged && updatedPrice !== null
            ? ` Güncel toplam ${money(updatedPrice, revalidation.currency)}.`
            : "";
          onNotice(`${revalidation.message || "Teklif ayrıntıları güncellendi."}${priceNote} Devam etmek için güncel teklifi tekrar onayla.`);
          return;
        }
      }

      if (!redirectVersion) throw new Error("Onaylanan teklif sürümü bulunamadı.");
      setAcceptedOfferVersions((current) => current.filter((version) => version.offerId !== offer.id));
      const redirect = await getFlightOfferRedirect({
        offerId: offer.id,
        searchId: session.id,
        searchToken: session.accessToken,
        expectedOfferId: redirectVersion.offerId,
        expectedTotalPrice: redirectVersion.totalPrice,
        expectedCurrency: redirectVersion.currency,
        expectedVerifiedAt: redirectVersion.verifiedAt,
        accessToken: accessToken || undefined,
      });
      const opened = await openExternal(redirect.redirectUrl);
      if (!opened) throw new Error("Güvenli satıcı penceresi açılamadı. Uygulamayı güncelleyip tekrar dene.");
    } catch (redirectError) {
      setAcceptedOfferVersions((current) => current.filter((version) => version.offerId !== offer.id));
      if (redirectError instanceof ApiError && (
        redirectError.status === 410
        || redirectError.code === "OFFER_EXPIRED"
        || redirectError.code === "OFFER_VERSION_MISMATCH"
        || redirectError.code === "REVALIDATION_REQUIRED"
      )) {
        setResult((current) => current ? markOfferUnavailable(current, offer.id) : current);
      }
      onNotice(redirectError instanceof Error ? redirectError.message : "Teklif doğrulanamadı.");
    } finally {
      setOpeningOffer("");
    }
  };

  const sourceStatuses = result?.sourceStatuses || session?.sourceStatuses || [];
  const sortedItineraries = useMemo(() => sortItineraries(result?.itineraries || [], sort), [result, sort]);
  const currentStatus = result?.status || session?.status || "";
  const currentComplete = result ? result.isComplete : TERMINAL_SEARCH_STATES.has(currentStatus);
  const hasOffers = (result?.summary.offerCount || 0) > 0;
  const noResults = Boolean(result?.isComplete && !hasOffers && !["failed", "no_sources"].includes(currentStatus));
  const statusHeading = currentStatus === "no_sources"
    ? "ENTEGRASYON BEKLENİYOR"
    : currentStatus === "failed"
    ? "ARAMA TAMAMLANAMADI"
    : noResults
    ? "UYGUN UÇUŞ BULUNAMADI"
    : currentComplete
    ? "ARAMA TAMAMLANDI"
    : pollStopped
    ? "ARAMA DEVAM EDİYOR"
    : "ARAMA SÜRÜYOR";
  const statusMessage = result
    ? currentStatus === "failed"
      ? "Kaynaklar güvenli biçimde tamamlanamadı. Daha sonra yeniden dene."
      : noResults
      ? `${result.summary.completedSourceCount}/${result.summary.sourceCount} kaynak kontrol edildi; uygun teklif bulunamadı.`
      : currentComplete
      ? `${result.summary.itineraryCount} uçuş ve ${result.summary.offerCount} satıcı teklifi hazır.`
      : pollStopped
      ? "Otomatik kontrol iki dakika sonunda durdu. İstersen sonuçları yeniden kontrol edebilirsin."
      : `${result.summary.completedSourceCount}/${result.summary.sourceCount} kaynak tamamlandı.`
    : session?.message || "";

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plane" size={27} /></span>
        <div><small>UÇUŞ META-ARAMA</small><h1>Bilet Ara</h1><p>Yetkili bilet siteleri ve havayollarındaki teklifleri aynı uçuş altında karşılaştır.</p></div>
      </section>

      <section className="form-card flight-form">
        <div className="segmented" role="group" aria-label="Yolculuk türü">
          <button type="button" className={form.tripType === "round_trip" ? "active" : ""} aria-pressed={form.tripType === "round_trip"} onClick={() => changeForm((current) => ({ ...current, tripType: "round_trip", returnDate: current.returnDate || isoDate(21) }))}>Gidiş–dönüş</button>
          <button type="button" className={form.tripType === "one_way" ? "active" : ""} aria-pressed={form.tripType === "one_way"} onClick={() => changeForm((current) => ({ ...current, tripType: "one_way", returnDate: "" }))}>Tek yön</button>
        </div>

        <div className="airport-pair">
          <AirportAutocomplete label="Nereden?" placeholder="Şehir veya havalimanı" value={{ code: form.originCode, label: form.originLabel }} onChange={(value) => changeForm((current) => ({ ...current, originCode: value.code, originLabel: value.label }))} />
          <button className="swap-button" onClick={swap} aria-label="Kalkış ve varışı değiştir"><Icon name="swap" size={19} /></button>
          <AirportAutocomplete label="Nereye?" placeholder="Şehir veya havalimanı" value={{ code: form.destinationCode, label: form.destinationLabel }} onChange={(value) => changeForm((current) => ({ ...current, destinationCode: value.code, destinationLabel: value.label }))} />
        </div>

        <div className="form-grid two">
          <label>Gidiş<input type="date" min={isoDate(0)} max={isoDate(730)} value={form.departureDate} onChange={(event) => changeForm((current) => ({ ...current, departureDate: event.target.value }))} /></label>
          <label className={form.tripType === "one_way" ? "disabled-field" : ""}>Dönüş<input type="date" disabled={form.tripType === "one_way"} min={form.departureDate || isoDate(0)} max={isoDate(730)} value={form.returnDate} onChange={(event) => changeForm((current) => ({ ...current, returnDate: event.target.value }))} /></label>
        </div>

        <div className="form-grid three flight-passengers">
          <label>Yetişkin<select value={form.adults} onChange={(event) => changeForm((current) => ({ ...current, adults: Number(event.target.value) }))}>{[1,2,3,4,5,6,7,8,9].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>Çocuk<select value={form.children} onChange={(event) => changeForm((current) => ({ ...current, children: Number(event.target.value) }))}>{[0,1,2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>Bebek<select value={form.infants} onChange={(event) => changeForm((current) => ({ ...current, infants: Number(event.target.value) }))}>{[0,1,2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        </div>

        <div className="form-grid two">
          <label>Kabin<select value={form.cabinClass} onChange={(event) => changeForm((current) => ({ ...current, cabinClass: event.target.value as FlightSearchInput["cabinClass"] }))}><option value="economy">Ekonomi</option><option value="premium_economy">Premium ekonomi</option><option value="business">Business</option><option value="first">First</option></select></label>
          <label>Para birimi<select value={form.currency} onChange={(event) => changeForm((current) => ({ ...current, currency: event.target.value as FlightSearchInput["currency"] }))}><option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
        </div>

        <div className="form-grid three flight-baggage-grid">
          <label>Kabin bagajı<select value={form.cabinBagsPerPassenger} onChange={(event) => changeForm((current) => ({ ...current, cabinBagsPerPassenger: Number(event.target.value) }))}><option value={0}>Yok</option><option value={1}>1 parça</option><option value={2}>2 parça</option></select></label>
          <label>Kayıtlı bagaj<select value={form.checkedBagsPerPassenger} onChange={(event) => changeForm((current) => ({ ...current, checkedBagsPerPassenger: Number(event.target.value), checkedBagWeightKg: Number(event.target.value) ? current.checkedBagWeightKg || 20 : null }))}><option value={0}>Yok</option><option value={1}>1 parça</option><option value={2}>2 parça</option></select></label>
          <label className={!form.checkedBagsPerPassenger ? "disabled-field" : ""}>Ağırlık<select disabled={!form.checkedBagsPerPassenger} value={form.checkedBagWeightKg || 20} onChange={(event) => changeForm((current) => ({ ...current, checkedBagWeightKg: Number(event.target.value) }))}><option value={15}>15 kg</option><option value={20}>20 kg</option><option value={23}>23 kg</option><option value={30}>30 kg</option></select></label>
        </div>

        <div className="flight-options">
          <label><input type="checkbox" checked={form.directOnly} onChange={(event) => changeForm((current) => ({ ...current, directOnly: event.target.checked }))} /><span><strong>Sadece direkt</strong><small>Aktarmalı uçuşları çıkar</small></span></label>
          <label><input type="checkbox" checked={form.includeNearbyAirports} onChange={(event) => changeForm((current) => ({ ...current, includeNearbyAirports: event.target.checked }))} /><span><strong>Yakın havalimanları</strong><small>Alternatif havalimanlarını da ara</small></span></label>
        </div>

        {error && <div className="inline-validation"><Icon name="info" size={16} /> {error}</div>}
        <button className="primary-wide" disabled={searching || Boolean(error)} onClick={() => void search()}>{searching ? <span className="button-loader" /> : <Icon name="search" size={19} />} {searching ? "Arama başlatılıyor" : "En uygun uçuşu bul"}</button>
        <p className="flight-redirect-note"><Icon name="shield" size={15} /> Ödeme ve yolcu bilgileri LetsGo2Travel'da alınmaz; seçtiğin satıcının sitesinde tamamlanır.</p>
      </section>

      {session && <section className={`result-card ${currentComplete && hasOffers ? "success-result" : ""}`}>
        <span><Icon name={currentComplete && hasOffers ? "check" : "info"} size={24} /></span>
        <div>
          <small>{statusHeading}</small>
          <strong>{form.originCode} → {form.destinationCode}</strong>
          <p>{statusMessage}</p>
        </div>
        {pollStopped && !currentComplete && <button className="secondary-wide" onClick={() => { setPollStopped(false); setPollRun((value) => value + 1); }}><Icon name="refresh" size={17} /> Sonuçları yeniden kontrol et</button>}
        {sourceStatuses.length > 0 && <div className="route-summary flight-source-summary">
          {sourceStatuses.map((source) => <span key={source.sourceId}><strong>{source.sourceName}</strong> · {source.message}</span>)}
        </div>}
      </section>}

      {sortedItineraries.length > 0 && <div className="flight-results-toolbar">
        <label htmlFor="flight-sort">Sonuçları sırala</label>
        <select id="flight-sort" value={sort} onChange={(event) => setSort(event.target.value as FlightResultSort)}>
          <option value="best_value">En avantajlı</option>
          <option value="cheapest">En ucuz</option>
          <option value="fastest">En hızlı</option>
          <option value="departure">En erken kalkış</option>
        </select>
      </div>}

      <div className="flight-itinerary-list">
        {sortedItineraries.map((itinerary) => {
          const legs = [...new Set(itinerary.segments.map((segment) => segment.legIndex))].sort((left, right) => left - right).map((legIndex) => {
            const segments = itinerary.segments.filter((segment) => segment.legIndex === legIndex).sort((left, right) => left.order - right.order);
            return { legIndex, segments, first: segments[0], last: segments[segments.length - 1], stops: Math.max(0, segments.length - 1) };
          });
          const first = legs[0]?.first;
          const offers = [...itinerary.offers].sort((left, right) => {
            const leftFresh = !isOfferStale(left);
            const rightFresh = !isOfferStale(right);
            if (leftFresh !== rightFresh) return leftFresh ? -1 : 1;
            return (left.effectiveTotalPrice ?? Number.POSITIVE_INFINITY) - (right.effectiveTotalPrice ?? Number.POSITIVE_INFINITY)
              || (left.totalPrice ?? Number.POSITIVE_INFINITY) - (right.totalPrice ?? Number.POSITIVE_INFINITY);
          });
          const sellerCount = new Set(offers.map((offer) => offer.sourceId)).size;
          const lowestOffer = offers.find((offer) => offer.rankingEligible && !isOfferStale(offer) && offer.effectiveTotalPrice !== null) || null;
          const expanded = expandedItineraries.includes(itinerary.id);
          const warningLabels = [
            itinerary.hasSelfTransfer ? "Kendin transfer" : "",
            itinerary.hasAirportChange ? "Havalimanı değişikliği" : "",
            itinerary.hasOvernightLayover ? "Gece aktarması" : "",
          ].filter(Boolean);
          return <section className={`saved-card search-saved-card flight-itinerary-card ${expanded ? "open" : ""}`} key={itinerary.id}>
            <div className="flight-result-labels">
              {itinerary.labels.map((label) => labelCopy(label)).filter(Boolean).map((label) => <span key={label}>{label}</span>)}
              {warningLabels.map((label) => <span className="warning" key={label}>{label}</span>)}
            </div>
            <div className="saved-card-head flight-itinerary-head">
              <span className="saved-icon"><Icon name="plane" /></span>
              <div><small>{itinerary.stopCount === 0 ? "DİREKT" : `${itinerary.stopCount} TOPLAM AKTARMA`} · {duration(itinerary.totalDurationMinutes)}</small><strong>{legs.map((leg) => `${leg.first?.origin || "—"}→${leg.last?.destination || "—"}`).join(" · ")}</strong></div>
              <div className="flight-lowest-price"><small>{sellerCount} satıcı</small><strong>{lowestOffer ? money(lowestOffer.effectiveTotalPrice, lowestOffer.currency) : "Fiyat eksik"}</strong></div>
            </div>
            {first && <p>{first.marketingAirline} {first.flightNumber}{itinerary.marketingAirlines && itinerary.marketingAirlines.length > 1 ? ` · ${itinerary.marketingAirlines.join(", ")}` : ""}</p>}
            <div className="flight-leg-list">{legs.map((leg) => <div key={leg.legIndex}>
              <span>{leg.legIndex === 0 ? "Gidiş" : "Dönüş"}</span>
              <strong>{localClock(leg.first?.departureLocal)} {leg.first?.origin} <i>→</i> {localClock(leg.last?.arrivalLocal)} {leg.last?.destination}</strong>
              <small>{leg.stops === 0 ? "Direkt" : `${leg.stops} aktarma`}</small>
            </div>)}</div>
            <button className="flight-offer-toggle" type="button" aria-expanded={expanded} onClick={() => setExpandedItineraries((current) => current.includes(itinerary.id) ? current.filter((id) => id !== itinerary.id) : [...current, itinerary.id])}>
              <span><strong>{sellerCount} satıcıdaki teklifleri karşılaştır</strong><small>{expanded ? "Teklifleri gizle" : "Bagaj, koşul ve fiyat ayrıntılarını gör"}</small></span><Icon name="chevron" size={18} />
            </button>
            {expanded && <div className="flight-offer-area">
              {itinerary.rankingExplanation?.reasons?.length ? <div className="flight-ranking-reasons"><Icon name="sparkles" size={18} /><div><strong>Neden bu sonuç?</strong>{itinerary.rankingExplanation.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div></div> : null}
              <div className="flight-seller-list">{offers.map((offer) => {
                const stale = isOfferStale(offer);
                const acceptedVersion = acceptedOfferVersions.find((version) => version.offerId === offer.id) || null;
                const offerUpdated = Boolean(acceptedVersion && offerMatchesVersion(offer, acceptedVersion));
                return <article className={`flight-seller-offer ${stale ? "stale" : ""}`} key={offer.id}>
                  <div className="flight-seller-head"><div><strong>{offer.sourceName}</strong><small>{offer.directAirlineSale ? "Doğrudan havayolu" : "Bilet satıcısı"}{offer.fareFamily ? ` · ${offer.fareFamily}` : ""}</small></div>{offer.sponsored && <em>Sponsorlu</em>}</div>
                  <div className="flight-seller-benefits"><span>{baggageNote(offer)}</span>{offer.fareRules?.refundable === true && <span>İade edilebilir</span>}{offer.fareRules?.changeable === true && <span>Değiştirilebilir</span>}{offer.installmentOptions?.[0] && <span>{offer.installmentOptions[0]}</span>}{offer.benefits?.map((benefit) => <span key={benefit}>{benefit}</span>)}</div>
                  <div className="flight-seller-price"><small>{comparisonNote(offer)}</small><strong>{money(offer.effectiveTotalPrice ?? offer.totalPrice, offer.currency)}</strong>{offer.perPersonPrice !== null && <span>Kaynak kişi başı {money(offer.perPersonPrice, offer.currency)}</span>}</div>
                  <button className="secondary-wide" disabled={openingOffer === offer.id} onClick={() => void continueToSeller(offer)}><Icon name={stale ? "refresh" : offerUpdated ? "check" : "external"} size={17} /> {openingOffer === offer.id ? "Teklif kontrol ediliyor" : offerUpdated ? "Güncel teklifi onayla" : stale ? "Teklifi yenile" : `${offer.sourceName}’da devam et`}</button>
                </article>;
              })}</div>
            </div>}
          </section>;
        })}
      </div>

      {!session && <section className="tip-card"><Icon name="info" size={22} /><div><strong>Tek uçuş, çok satıcı</strong><p>Aynı uçuş ayrı ayrı tekrarlanmaz; yetkili satıcıların gerçek fiyatları aynı kart altında karşılaştırılır.</p></div></section>}
    </div>
  );
}
