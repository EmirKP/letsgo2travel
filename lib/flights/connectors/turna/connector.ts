import { IntegrationRequiredConnector } from "../integration-required";

export const turnaConnector = new IntegrationRequiredConnector(
  {
    id: "turna",
    name: "Turna",
    sourceType: "ota",
    officialUrl: "https://www.turna.com/turna-api-hizmeti",
    integrationState: "integration_required",
    enabled: false,
    checkoutHosts: [{ hostname: "turna.com", allowSubdomains: true }],
  },
  "Turna'nın resmî B2B API erişimi ve sözleşme kapsamındaki şeması gerekli. Production ortamında veri çekilmiyor.",
);
