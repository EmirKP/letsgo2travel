import { IntegrationRequiredConnector } from "../integration-required";

export const directAirlineConnector = new IntegrationRequiredConnector(
  {
    id: "airline-direct",
    name: "Doğrudan havayolu",
    sourceType: "airline",
    officialUrl: null,
    integrationState: "integration_required",
    enabled: false,
    checkoutHosts: [],
  },
  "Yetkili havayolu NDC, resmî API veya partner bağlantısı gerekli. Production ortamında veri çekilmiyor.",
);
