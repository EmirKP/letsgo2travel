import type { FlightSourceConnector } from "../connector";

export const enuygunConnector: FlightSourceConnector = {
  source: {
    id: "enuygun",
    name: "Enuygun",
    sourceType: "ota",
    officialUrl: "https://www.enuygun.com/",
    integrationState: "active",
    enabled: true,
    checkoutHosts: [{ hostname: "enuygun.com", allowSubdomains: true }],
  },
  async search() {
    return {
      outcome: "temporarily_unavailable",
      offers: [],
      message: "Canlı Enuygun aramaları güvenli VDS worker connector'ı üzerinden yürütülür.",
    };
  },
  async revalidate() {
    return {
      status: "integration_required",
      offer: null,
      message: "Yeniden doğrulama kayıtlı arama kriterleriyle API katmanında yürütülür.",
    };
  },
  async createCheckoutLink() {
    return null;
  },
  async healthCheck(signal) {
    try {
      const response = await fetch("https://mcp.enuygun.com/ping", {
        headers: { Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal,
      });
      return {
        state: response.ok ? "active" : "temporarily_unavailable",
        checkedAt: new Date().toISOString(),
        message: response.ok ? "Enuygun MCP erişilebilir." : "Enuygun MCP geçici olarak yanıt vermiyor.",
      };
    } catch {
      return {
        state: "temporarily_unavailable",
        checkedAt: new Date().toISOString(),
        message: "Enuygun MCP sağlık kontrolü tamamlanamadı.",
      };
    }
  },
};
