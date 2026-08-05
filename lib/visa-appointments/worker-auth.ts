import { timingSafeEqual } from "node:crypto";

export function authorizedVisaWorker(request: Request) {
  const expected = process.env.VISA_WORKER_SECRET || "";
  const received = request.headers.get("x-worker-secret") || "";
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}
