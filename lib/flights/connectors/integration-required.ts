import type {
  ConnectorHealth,
  ConnectorRevalidationResult,
  ConnectorSearchResult,
  FlightSourceDescriptor,
} from "../core/types";
import type { FlightSourceConnector } from "./connector";

export class IntegrationRequiredConnector implements FlightSourceConnector {
  readonly source: FlightSourceDescriptor;
  private readonly integrationMessage: string;

  constructor(source: FlightSourceDescriptor, message: string) {
    this.source = {
      ...source,
      enabled: false,
      integrationState: "integration_required",
      checkoutHosts: [...source.checkoutHosts],
    };
    this.integrationMessage = message;
  }

  async search(): Promise<ConnectorSearchResult> {
    return {
      outcome: "integration_required",
      offers: [],
      message: this.integrationMessage,
    };
  }

  async revalidate(): Promise<ConnectorRevalidationResult> {
    return {
      status: "integration_required",
      offer: null,
      message: this.integrationMessage,
    };
  }

  async createCheckoutLink() {
    return null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      state: "integration_required",
      checkedAt: new Date().toISOString(),
      message: this.integrationMessage,
    };
  }
}
