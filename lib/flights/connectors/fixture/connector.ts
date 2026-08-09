import type {
  ConnectorHealth,
  ConnectorRevalidationResult,
  ConnectorSearchResult,
  FlightSearchRequest,
  FlightSourceDescriptor,
  NormalizedFlightOffer,
  SourceFlightOffer,
  SourceSearchOutcome,
} from "../../core/types";
import type { FlightConnectorContext, FlightSourceConnector } from "../connector";

export type FixtureConnectorOptions = {
  source?: Partial<FlightSourceDescriptor>;
  offers?: SourceFlightOffer[];
  outcome?: SourceSearchOutcome;
  delayMs?: number;
  error?: Error | null;
};

function wait(delayMs: number, signal: AbortSignal) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(), delayMs);
    const abort = () => {
      finish(new Error("Fixture connector aborted."));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
  });
}

export class FixtureFlightConnector implements FlightSourceConnector {
  readonly source: FlightSourceDescriptor;
  private readonly offers: SourceFlightOffer[];
  private readonly outcome: SourceSearchOutcome;
  private readonly delayMs: number;
  private readonly configuredError: Error | null;

  constructor(options: FixtureConnectorOptions = {}) {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("FixtureFlightConnector yalnız NODE_ENV=test ortamında kullanılabilir.");
    }
    this.source = {
      id: options.source?.id || "fixture-source",
      name: options.source?.name || "Fixture Source",
      sourceType: options.source?.sourceType || "ota",
      officialUrl: options.source?.officialUrl || "https://fixture.test/",
      integrationState: "active",
      enabled: true,
      checkoutHosts: options.source?.checkoutHosts || [{ hostname: "fixture.test", allowSubdomains: true }],
    };
    this.offers = options.offers || [];
    this.outcome = options.outcome || (this.offers.length ? "success" : "no_results");
    this.delayMs = Math.max(0, options.delayMs || 0);
    this.configuredError = options.error || null;
  }

  async search(
    _request: FlightSearchRequest,
    context: FlightConnectorContext,
  ): Promise<ConnectorSearchResult> {
    await wait(this.delayMs, context.signal);
    if (this.configuredError) throw this.configuredError;
    return {
      outcome: this.outcome,
      offers: this.offers,
      message: this.outcome === "no_results" ? "Fixture sonucu bulunamadı." : "Fixture sonucu hazır.",
    };
  }

  async revalidate(
    offer: NormalizedFlightOffer,
  ): Promise<ConnectorRevalidationResult> {
    return { status: "confirmed", offer, message: "Test teklifi doğrulandı." };
  }

  async createCheckoutLink(
    offer: NormalizedFlightOffer,
  ) {
    return offer.checkoutUrl;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      state: "active",
      checkedAt: new Date().toISOString(),
      message: "Test connector aktif.",
    };
  }
}
