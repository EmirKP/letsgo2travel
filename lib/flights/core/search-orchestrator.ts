import type { FlightSourceConnector } from "../connectors/connector";
import { FlightConnectorError } from "../connectors/connector";
import { groupOffersByItinerary } from "./itinerary-matcher";
import { normalizeSourceOffer } from "./offer-normalizer";
import { rankFlightItineraries } from "./offer-ranking";
import { sanitizePlainText, stableId } from "./sanitize";
import type {
  ConnectorErrorCode,
  ConnectorSearchResult,
  FlightSearchRequest,
  FlightSearchResponse,
  FlightSourceSearchState,
  FlightSourceStatus,
  NormalizedFlightOffer,
} from "./types";

export type SearchOrchestratorOptions = {
  searchId?: string;
  connectorTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
};

type ConnectorExecution = {
  status: FlightSourceStatus;
  offers: NormalizedFlightOffer[];
};

const CONNECTOR_OUTCOMES = new Set<ConnectorSearchResult["outcome"]>([
  "success",
  "no_results",
  "integration_required",
  "temporarily_unavailable",
]);

class ConnectorTimeoutError extends Error {
  constructor() {
    super("Kaynak zaman aşımına uğradı.");
    this.name = "ConnectorTimeoutError";
  }
}

function createSearchId(request: FlightSearchRequest, now: Date) {
  const entropy = `${now.toISOString()}|${request.origin}|${request.destination}|${Math.random()}`;
  return stableId("search", entropy);
}

function safeMessage(value: unknown, fallback: string) {
  return sanitizePlainText(value, 300) || fallback;
}

function sourceName(connector: FlightSourceConnector) {
  return sanitizePlainText(connector.source.name, 100) || connector.source.id;
}

function publicErrorMessage(code: ConnectorErrorCode) {
  switch (code) {
    case "authorization_failed":
      return "Kaynak yetkilendirmesi başarısız.";
    case "quota_exceeded":
      return "Kaynak sorgu kotasına ulaştı.";
    case "temporarily_unavailable":
    case "network_error":
      return "Kaynak geçici olarak kullanılamıyor.";
    case "format_changed":
      return "Kaynak yanıtı güvenli veri modeline doğrulanamadı.";
    case "invalid_route":
      return "Kaynak bu rotayı desteklemiyor.";
    case "integration_required":
      return "Kaynak için resmî entegrasyon erişimi gerekli.";
    case "timeout":
      return "Kaynak belirlenen süre içinde yanıt vermedi.";
    default:
      return "Kaynak sorgusu başarısız.";
  }
}

function emptyStatus(
  connector: FlightSourceConnector,
  state: FlightSourceSearchState,
  completedAt: string,
  message: string,
  errorCode: ConnectorErrorCode | null = null,
): FlightSourceStatus {
  return {
    sourceId: connector.source.id,
    sourceName: sourceName(connector),
    sourceType: connector.source.sourceType,
    state,
    integrationState: connector.source.integrationState,
    startedAt: null,
    completedAt,
    durationMs: 0,
    receivedOfferCount: 0,
    acceptedOfferCount: 0,
    rejectedOfferCount: 0,
    message,
    errorCode,
  };
}

function connectorErrorCode(error: unknown): ConnectorErrorCode {
  if (error instanceof ConnectorTimeoutError) return "timeout";
  if (error instanceof FlightConnectorError) return error.code;
  return "unknown";
}

function statusForOutcome(
  outcome: ConnectorSearchResult["outcome"],
  acceptedOffers: number,
  rejectedOffers: number,
): { state: FlightSourceSearchState; errorCode: ConnectorErrorCode | null } {
  if (outcome === "integration_required") {
    return { state: "integration_required", errorCode: "integration_required" };
  }
  if (outcome === "temporarily_unavailable") {
    return { state: "failed", errorCode: "temporarily_unavailable" };
  }
  if (outcome === "no_results") return { state: "no_results", errorCode: null };
  if (acceptedOffers === 0 && rejectedOffers > 0) {
    return { state: "failed", errorCode: "format_changed" };
  }
  return {
    state: acceptedOffers > 0 ? "succeeded" : "no_results",
    errorCode: rejectedOffers > 0 ? "format_changed" : null,
  };
}

function linkedAbortController(parent?: AbortSignal) {
  const controller = new AbortController();
  if (!parent) return { controller, removeParentListener: () => undefined };
  const abort = () => controller.abort(parent.reason);
  if (parent.aborted) controller.abort(parent.reason);
  else parent.addEventListener("abort", abort, { once: true });
  return {
    controller,
    removeParentListener: () => parent.removeEventListener("abort", abort),
  };
}

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  const { controller, removeParentListener } = linkedAbortController(parentSignal);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new ConnectorTimeoutError());
          reject(new ConnectorTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    removeParentListener();
  }
}

async function executeConnector(
  connector: FlightSourceConnector,
  request: FlightSearchRequest,
  searchId: string,
  options: Required<Pick<SearchOrchestratorOptions, "connectorTimeoutMs" | "now">>
    & Pick<SearchOrchestratorOptions, "signal">,
): Promise<ConnectorExecution> {
  const completedWithoutRun = options.now().toISOString();
  if (request.excludedSources.includes(connector.source.id)) {
    return {
      status: emptyStatus(
        connector,
        "skipped",
        completedWithoutRun,
        "Kaynak kullanıcı tercihiyle hariç bırakıldı.",
      ),
      offers: [],
    };
  }
  if (connector.source.integrationState === "integration_required") {
    return {
      status: emptyStatus(
        connector,
        "integration_required",
        completedWithoutRun,
        "Resmî API veya partner erişimi gerekli; bu kaynak sorgulanmadı.",
        "integration_required",
      ),
      offers: [],
    };
  }
  if (!connector.source.enabled || connector.source.integrationState === "disabled") {
    return {
      status: emptyStatus(connector, "disabled", completedWithoutRun, "Kaynak geçici olarak pasif."),
      offers: [],
    };
  }
  if (connector.source.integrationState === "temporarily_unavailable") {
    return {
      status: emptyStatus(
        connector,
        "failed",
        completedWithoutRun,
        "Kaynak geçici olarak kullanılamıyor.",
        "temporarily_unavailable",
      ),
      offers: [],
    };
  }

  const started = options.now();
  const startedAt = started.toISOString();
  try {
    const result = await withTimeout(
      (signal) => connector.search(request, {
        searchId,
        signal,
        requestedAt: startedAt,
      }),
      options.connectorTimeoutMs,
      options.signal,
    );
    if (!result || typeof result !== "object"
      || !CONNECTOR_OUTCOMES.has(result.outcome)
      || !Array.isArray(result.offers)) {
      throw new FlightConnectorError("Connector yanıt sözleşmesi geçersiz.", "format_changed");
    }
    const rawOffers = result.offers;
    const contradictoryOutcome = result.outcome !== "success" && rawOffers.length > 0;
    const offers: NormalizedFlightOffer[] = [];
    let rejectedOfferCount = contradictoryOutcome ? rawOffers.length : 0;
    if (!contradictoryOutcome && result.outcome === "success") {
      for (const rawOffer of rawOffers) {
        const normalized = normalizeSourceOffer(rawOffer, connector.source, request);
        if (normalized.ok) offers.push(normalized.offer);
        else rejectedOfferCount += 1;
      }
    }
    const outcomeStatus = contradictoryOutcome
      ? { state: "failed" as const, errorCode: "format_changed" as const }
      : statusForOutcome(result.outcome, offers.length, rejectedOfferCount);
    const completed = options.now();
    const defaultMessage = outcomeStatus.state === "succeeded"
      ? `${offers.length} teklif doğrulandı.`
      : outcomeStatus.state === "no_results"
        ? "Bu kaynakta uygun uçuş bulunamadı."
        : outcomeStatus.state === "integration_required"
          ? "Resmî entegrasyon erişimi gerekli."
          : outcomeStatus.errorCode === "format_changed"
            ? "Kaynak teklifleri güvenli veri modeline doğrulanamadı."
            : "Kaynak geçici olarak yanıt vermedi.";
    return {
      status: {
        sourceId: connector.source.id,
        sourceName: sourceName(connector),
        sourceType: connector.source.sourceType,
        state: outcomeStatus.state,
        integrationState: connector.source.integrationState,
        startedAt,
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        receivedOfferCount: rawOffers.length,
        acceptedOfferCount: offers.length,
        rejectedOfferCount,
        message: contradictoryOutcome
          ? "Kaynak sonucu ve teklif listesi birbiriyle çelişiyor. Teklifler reddedildi."
          : safeMessage(result.message, defaultMessage),
        errorCode: outcomeStatus.errorCode,
      },
      offers,
    };
  } catch (error) {
    const completed = options.now();
    const errorCode = connectorErrorCode(error);
    return {
      status: {
        sourceId: connector.source.id,
        sourceName: sourceName(connector),
        sourceType: connector.source.sourceType,
        state: errorCode === "timeout" ? "timed_out" : "failed",
        integrationState: connector.source.integrationState,
        startedAt,
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        receivedOfferCount: 0,
        acceptedOfferCount: 0,
        rejectedOfferCount: 0,
        message: publicErrorMessage(errorCode),
        errorCode,
      },
      offers: [],
    };
  }
}

function uniqueConnectors(connectors: readonly FlightSourceConnector[]) {
  const identifiers = new Set<string>();
  for (const connector of connectors) {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(connector.source.id)) {
      throw new Error(`Geçersiz connector kimliği: ${connector.source.id}`);
    }
    if (identifiers.has(connector.source.id)) {
      throw new Error(`Aynı connector iki kez kaydedilemez: ${connector.source.id}`);
    }
    identifiers.add(connector.source.id);
  }
}

function preferredOrder(
  connectors: readonly FlightSourceConnector[],
  preferredSources: readonly string[],
) {
  const preferred = new Map(preferredSources.map((source, index) => [source, index]));
  return [...connectors].sort((left, right) => {
    const leftIndex = preferred.get(left.source.id) ?? Number.POSITIVE_INFINITY;
    const rightIndex = preferred.get(right.source.id) ?? Number.POSITIVE_INFINITY;
    return leftIndex - rightIndex || left.source.id.localeCompare(right.source.id);
  });
}

export async function orchestrateFlightSearch(
  request: FlightSearchRequest,
  connectors: readonly FlightSourceConnector[],
  options: SearchOrchestratorOptions = {},
): Promise<FlightSearchResponse> {
  uniqueConnectors(connectors);
  const now = options.now || (() => new Date());
  const started = now();
  if (options.searchId && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/.test(options.searchId)) {
    throw new Error("Geçersiz arama kimliği.");
  }
  const searchId = options.searchId || createSearchId(request, started);
  const configuredTimeout = options.connectorTimeoutMs ?? 8_000;
  if (!Number.isFinite(configuredTimeout)) throw new Error("Connector zaman aşımı sonlu olmalıdır.");
  const connectorTimeoutMs = Math.min(60_000, Math.max(100, configuredTimeout));
  const orderedConnectors = preferredOrder(connectors, request.preferredSources);
  const executions = await Promise.all(orderedConnectors.map((connector) => executeConnector(
    connector,
    request,
    searchId,
    { connectorTimeoutMs, signal: options.signal, now },
  )));
  const sourceStatuses = executions.map((execution) => execution.status);
  const offers = executions.flatMap((execution) => execution.offers);
  const itineraries = rankFlightItineraries(groupOffersByItinerary(offers), request);
  const successfulSourceCount = sourceStatuses.filter(
    (status) => status.state === "succeeded" || status.state === "no_results",
  ).length;
  const failedSourceCount = sourceStatuses.filter(
    (status) => status.state === "failed" || status.state === "timed_out",
  ).length;
  const integrationRequiredSourceCount = sourceStatuses.filter(
    (status) => status.state === "integration_required",
  ).length;
  const rejectedOfferCount = sourceStatuses.reduce(
    (total, source) => total + source.rejectedOfferCount,
    0,
  );
  const completedAt = now().toISOString();
  const status = (failedSourceCount > 0 || rejectedOfferCount > 0)
    && (successfulSourceCount > 0 || offers.length > 0)
    ? "partial"
    : successfulSourceCount === 0 && offers.length === 0
      ? "unavailable"
      : "completed";

  return {
    searchId,
    status,
    request,
    startedAt: started.toISOString(),
    completedAt,
    sourceStatuses,
    itineraries,
    summary: {
      itineraryCount: itineraries.length,
      offerCount: offers.length,
      checkedSourceCount: sourceStatuses.filter(
        (source) => !["disabled", "skipped", "integration_required"].includes(source.state),
      ).length,
      successfulSourceCount,
      failedSourceCount,
      integrationRequiredSourceCount,
    },
  };
}
