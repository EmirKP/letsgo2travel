import { redirect } from "next/navigation";

export default async function LegacyVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string | string[] }>;
}) {
  const params = await searchParams;
  const country = Array.isArray(params.country) ? params.country[0] : params.country;
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  redirect(`/profil/dogrulamalar${query}`);
}
