import { permanentRedirect } from "next/navigation";

type LegacyFlightsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyFlightsPage({ searchParams }: LegacyFlightsPageProps) {
  const values = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (typeof value === "string") params.set(key, value);
  }

  const query = params.toString();
  permanentRedirect(`/ucak-bileti-ara${query ? `?${query}` : ""}`);
}
