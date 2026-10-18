import { boundedJson } from '@/lib/travel-assistant/http';
import { parseJourneyPhotoRequest } from '@/lib/travel-assistant/journey-photo-contract';
import { loadVenuePhotos } from '@/lib/travel-assistant/journey-venue-photos';

export const runtime = 'nodejs';
export const maxDuration = 15;
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  let input;
  try { input = parseJourneyPhotoRequest(await boundedJson(request, 8000)); }
  catch (error) { return Response.json({ code: 'photos_invalid' }, { status: error instanceof Error && error.message === 'too-large' ? 413 : 400, headers }); }
  if (!input) return Response.json({ code: 'photos_invalid' }, { status: 400, headers });
  try { return Response.json(await loadVenuePhotos(input), { headers }); }
  catch { return Response.json({ photos: [], complete: false }, { headers }); }
}
