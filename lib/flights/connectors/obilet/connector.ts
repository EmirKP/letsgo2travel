import { IntegrationRequiredConnector } from "../integration-required";

export const obiletConnector = new IntegrationRequiredConnector(
  {
    id: "obilet",
    name: "Obilet",
    sourceType: "ota",
    officialUrl: "https://www.obilet.com/ucak-bileti",
    integrationState: "integration_required",
    enabled: false,
    checkoutHosts: [{ hostname: "obilet.com", allowSubdomains: true }],
  },
  "Obilet resmî uçuş API, affiliate veya partner erişimi gerekli. Production ortamında veri çekilmiyor.",
);
