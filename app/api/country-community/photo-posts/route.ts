// New clients send photo posts only here. An older server returns 404 instead of
// silently ignoring an unknown photo field on its existing text creation route.
export { POST } from "../questions/route";
export const runtime = "nodejs";
