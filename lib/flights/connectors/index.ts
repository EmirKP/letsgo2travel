import { directAirlineConnector } from "./airline-direct/connector";
import type { FlightSourceConnector } from "./connector";
import { enuygunConnector } from "./enuygun/connector";
import { ucuzabiletConnector } from "./ucuzabilet/connector";

export type ProductionConnectorOverrides = Partial<Record<
  "enuygun" | "ucuzabilet" | "airline-direct",
  FlightSourceConnector
>>;

function acceptedOverride(
  id: "enuygun" | "ucuzabilet" | "airline-direct",
  fallback: FlightSourceConnector,
  override?: FlightSourceConnector,
) {
  if (!override) return fallback;
  if (override.source.id !== id) {
    throw new Error(`Connector override kimliği ${id} olmalıdır.`);
  }
  return override;
}

export function createProductionFlightConnectors(
  overrides: ProductionConnectorOverrides = {},
): FlightSourceConnector[] {
  return [
    acceptedOverride("enuygun", enuygunConnector, overrides.enuygun),
    acceptedOverride("ucuzabilet", ucuzabiletConnector, overrides.ucuzabilet),
    acceptedOverride("airline-direct", directAirlineConnector, overrides["airline-direct"]),
  ];
}

export { type FlightSourceConnector, FlightConnectorError } from "./connector";
export { enuygunConnector } from "./enuygun/connector";
export { ucuzabiletConnector } from "./ucuzabilet/connector";
export { directAirlineConnector } from "./airline-direct/connector";

