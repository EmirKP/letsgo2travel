import { publicJson } from "@/lib/country-intelligence/fetch";
import {
  normalizeStops,
  normalizeTransit,
  validStopId,
  tubeStopsInHub,
} from "@/lib/travel-assistant/transit";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
let active = 0;
let started = 0;
let requests = 0;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q");
  const from = params.get("from");
  const to = params.get("to");
  if (params.get("city") !== "london")
    return reply({ code: "unsupported-city" }, 400);
  if (
    query !== null
      ? query.trim().length < 2 || query.length > 60
      : !validStopId(from) || !validStopId(to) || from === to
  )
    return reply({ code: "invalid" }, 400);
  if (Date.now() - started >= 60000) {
    started = Date.now();
    requests = 0;
  }
  if (active >= 4 || requests >= 60) return reply({ code: "busy" }, 429);
  active++;
  requests++;
  try {
    if (query !== null) {
      const raw = await publicJson<unknown>(
        `https://api.tfl.gov.uk/StopPoint/Search?${new URLSearchParams({ query: query.trim(), modes: "tube", maxResults: "16" })}`,
        86400,
        10000,
      );
      const matches = normalizeStops(raw).slice(0, 4);
      const groups = await Promise.all(
        matches.map(async (stop) =>
          stop.id.startsWith("HUB")
            ? tubeStopsInHub(
                await publicJson(
                  "https://api.tfl.gov.uk/StopPoint/" + stop.id,
                  86400,
                  8000,
                ),
              )
            : [stop],
        ),
      );
      return reply({
        stops: Array.from(
          new Map(groups.flat().map((stop) => [stop.id, stop])).values(),
        ).slice(0, 16),
      });
    }
    const raw = await publicJson<unknown>(
      `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(from!)}/to/${encodeURIComponent(to!)}?mode=tube,bus,walking`,
      30,
      12000,
    );
    return reply(normalizeTransit(raw));
  } catch {
    return reply({ code: "provider-unavailable" }, 503);
  } finally {
    active--;
  }
}
