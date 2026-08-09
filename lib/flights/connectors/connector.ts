import type {
  ConnectorHealth,
  ConnectorRevalidationResult,
  ConnectorSearchResult,
  FlightSearchRequest,
  FlightSourceDescriptor,
  NormalizedFlightOffer,
} from "../core/types";

export type FlightConnectorContext = {
  searchId: string;
  signal: AbortSignal;
  requestedAt: string;
};

export interface FlightSourceConnector {
  readonly source: FlightSourceDescriptor;

  search(
    request: FlightSearchRequest,
    context: FlightConnectorContext,
  ): Promise<ConnectorSearchResult>;

  revalidate(
    offer: NormalizedFlightOffer,
    context: FlightConnectorContext,
  ): Promise<ConnectorRevalidationResult>;

  createCheckoutLink(
    offer: NormalizedFlightOffer,
    context: FlightConnectorContext,
  ): Promise<string | null>;

  healthCheck(signal?: AbortSignal): Promise<ConnectorHealth>;
}

export class FlightConnectorError extends Error {
  readonly code:
    | "authorization_failed"
    | "quota_exceeded"
    | "temporarily_unavailable"
    | "format_changed"
    | "network_error"
    | "invalid_route"
    | "unknown";

  constructor(
    message: string,
    code: FlightConnectorError["code"] = "unknown",
  ) {
    super(message);
    this.name = "FlightConnectorError";
    this.code = code;
  }
}

