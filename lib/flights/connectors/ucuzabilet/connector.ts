import { IntegrationRequiredConnector } from "../integration-required";

export const ucuzabiletConnector = new IntegrationRequiredConnector(
  {
    id: "ucuzabilet",
    name: "Ucuzabilet",
    sourceType: "ota",
    officialUrl: "https://www.ucuzabilet.com/",
    integrationState: "integration_required",
    enabled: false,
    checkoutHosts: [{ hostname: "ucuzabilet.com", allowSubdomains: true }],
  },
  "Ucuzabilet resmî API, affiliate veya partner erişimi gerekli. Production ortamında veri çekilmiyor.",
);

