import { listTravelEvents } from "./api";

type EventsResponse = Awaited<ReturnType<typeof listTravelEvents>>;

export async function loadFeaturedEvents(countryCode: string, { startDate, endDate }: { startDate: string; endDate: string }) {
  const dates = { startDate, endDate };
  let result: EventsResponse | undefined;
  let countryUnavailable = false;
  let global = false;
  try {
    result = await listTravelEvents({ countryCode, ...dates, featured: true, limit: 6 });
  } catch {
    countryUnavailable = true;
  }
  const hasEvents = (response?: EventsResponse) => Array.isArray(response?.data) && response.data.length > 0;
  // Country coverage and worldwide coverage are independent. Do not give up
  // on global inspiration just because the selected country is unsupported.
  if (countryCode && !hasEvents(result) && result?.meta?.coverageStatus !== "not_configured") {
    countryUnavailable ||= Boolean(result?.meta?.coverageLimited);
    global = true;
    try {
      result = await listTravelEvents({ ...dates, featured: true, limit: 6 });
    } catch {
      result = undefined;
    }
  }
  const events = Array.isArray(result?.data) ? result.data : [];
  const status = result?.meta?.coverageStatus;
  return {
    events,
    global,
    unavailable: !result || status === "provider_unavailable" || status === "limited",
    notConfigured: status === "not_configured",
    partial: Boolean(result?.meta?.partial || result?.meta?.fallbackUsed || countryUnavailable),
  };
}
