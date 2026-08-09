import { requireAdminServer } from "@/lib/admin-server";
import FlightSourcesAdminClient from "./FlightSourcesAdminClient";

export const dynamic = "force-dynamic";

export default async function FlightSourcesAdminPage() {
  await requireAdminServer(["admin", "super_admin"]);
  return <FlightSourcesAdminClient />;
}

