export type FlightProviderConfig = { channel: "direct" | "rapidapi"; apiKey: string };
type FlightProviderEnvironment = Record<string, string | undefined>;

/** Server configuration only. A missing channel preserves the existing Direct integration. */
export function getFlightProviderConfig(env: FlightProviderEnvironment = process.env): FlightProviderConfig | null {
  const channel = env.AERODATABOX_API_CHANNEL?.trim() ?? "direct";
  const apiKey = env.AERODATABOX_API_KEY?.trim();
  if ((channel !== "direct" && channel !== "rapidapi") || !apiKey || /[\r\n\0]/.test(apiKey)) return null;
  return { channel, apiKey };
}

/** Gateways/authentication follow the provider's Direct and RapidAPI OpenAPI specifications. */
export function buildFlightProviderRequest(query: { flightNumber: string; date: string }, config: FlightProviderConfig) {
  if (config.channel !== "direct" && config.channel !== "rapidapi") throw new Error("invalid-provider-channel");
  const host = config.channel === "rapidapi" ? "aerodatabox.p.rapidapi.com" : "api.aerodatabox.com";
  const url = `https://${host}/flights/number/${encodeURIComponent(query.flightNumber)}/${encodeURIComponent(query.date)}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false&withFlightPlan=false`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.channel === "rapidapi") {
    headers["X-RapidAPI-Key"] = config.apiKey;
    headers["X-RapidAPI-Host"] = host;
  } else {
    headers["X-Api-Key"] = config.apiKey;
  }
  return { url, headers };
}
