import { enuygunMcpConnector } from "./enuygun-mcp.mjs";

const integrationRequired = (id, name) => ({
  id,
  name,
  async search() {
    return {
      outcome: "integration_required",
      offers: [],
      message: `${name} için resmî partner API erişimi ve onaylı connector henüz bağlanmadı.`,
      errorCode: "integration_required",
    };
  },
});

const connectors = new Map([
  ["enuygun", enuygunMcpConnector],
  ["ucuzabilet", integrationRequired("ucuzabilet", "Ucuzabilet")],
  ["airline-direct", integrationRequired("airline-direct", "Doğrudan havayolu")],
]);

export function getConnector(sourceId) {
  return connectors.get(sourceId) || null;
}
