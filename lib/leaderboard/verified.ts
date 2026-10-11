import { countExplorerCountries } from "./countries";

export function countApprovedCountries(rows: ReadonlyArray<{ status?: string; verification_method?: string; country_code?: string }>) {
  return countExplorerCountries(rows.filter(row => row.status === "approved" && row.verification_method === "document").map(row => row.country_code));
}

export function verifiedExplorerLevel(count: number) {
  return count >= 25 ? "Dünya Gezgini" : count >= 10 ? "Balkan Kaşifi" : count >= 5 ? "Rota Meraklısı" : "Yeni Kaşif";
}
