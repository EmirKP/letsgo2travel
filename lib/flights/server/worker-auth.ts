import { timingSafeEqual } from "node:crypto";

export function authorizedFlightWorker(request: Request) {
  const expected = process.env.FLIGHT_WORKER_SECRET || "";
  const received = request.headers.get("x-flight-worker-secret") || "";
  if (expected.length < 32 || received.length < 32) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

