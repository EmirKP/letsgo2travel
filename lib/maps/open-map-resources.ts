/** The one public map host we use. Never turn the resource route into a URL proxy. */
export const OPEN_MAP_ORIGIN = 'https://tiles.openfreemap.org';
export const OPEN_MAP_STYLE = `${OPEN_MAP_ORIGIN}/styles/positron`;
export const OPEN_MAP_MAX_BYTES = 50_000_000;
export const OPEN_MAP_MAX_RESOURCES = 3000;
export const OPEN_MAP_RESOURCE_MAX_BYTES = 8_000_000;
export const OPEN_MAP_MAX_PACKS = 3;
export const OPEN_MAP_MIN_ZOOM = 10;
export const OPEN_MAP_MAX_ZOOM = 14;

export function allowedOpenMapUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 700 || /[\u0000-\u001f\u007f]/.test(value) || value.includes('..') || /%2e|%2f|%5c/i.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.origin !== OPEN_MAP_ORIGIN || u.username || u.password || u.search || u.hash) return null;
    const p = decodeURIComponent(u.pathname);
    if (p.includes('..') || p.includes('\\')) return null;
    if (/^\/styles\/(positron|liberty|dark)$/.test(p) || p === '/planet') return u.href;
    if (/^\/sprites\/ofm_[a-z0-9]+\/ofm(?:@2x)?\.(json|png)$/.test(p)) return u.href;
    const font = p.match(/^\/fonts\/([A-Za-z0-9 ,_.-]{1,180})\/(\d+)-(\d+)\.pbf$/);
    if (font && Number(font[2]) % 256 === 0 && Number(font[3]) === Number(font[2]) + 255 && Number(font[3]) <= 65535) return `${OPEN_MAP_ORIGIN}/fonts/${encodeURIComponent(font[1])}/${Number(font[2])}-${Number(font[3])}.pbf`;
    const tile = p.match(/^\/(planet\/[A-Za-z0-9_-]{1,70}|natural_earth\/ne2sr)\/(\d+)\/(\d+)\/(\d+)\.(pbf|png)$/);
    if (tile) {
      const z = Number(tile[2]), x = Number(tile[3]), y = Number(tile[4]);
      if (z <= 16 && x < 2 ** z && y < 2 ** z && (tile[1].startsWith('planet/') ? tile[5] === 'pbf' : tile[5] === 'png')) return u.href;
    }
  } catch { /* Malformed and encoded traversal URLs are rejected. */ }
  return null;
}

/** Templates are expanded only to our vector tiles or font ranges, never arbitrary URLs. */
export function allowedOpenMapTemplate(value: unknown, kind: 'tile' | 'glyph'): string | null {
  if (typeof value !== 'string') return null;
  const tokens = value.match(/\{[^}]+\}/g)?.sort().join(',');
  const expected = kind === 'tile' ? '{x},{y},{z}' : '{fontstack},{range}';
  if (tokens !== expected) return null;
  const sample = value.replace('{fontstack}', 'Noto Sans Regular').replace('{range}', '0-255').replace('{z}', '10').replace('{x}', '1').replace('{y}', '1');
  const safe = allowedOpenMapUrl(sample);
  if (!safe || kind === 'tile' && !new URL(safe).pathname.startsWith('/planet/') || kind === 'glyph' && !new URL(safe).pathname.startsWith('/fonts/')) return null;
  return value;
}

export function regionBounds(latitude: number, longitude: number, radiusKm = 2) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 84 || Math.abs(longitude) > 179.8 || ![1, 2, 3].includes(radiusKm)) throw new Error('invalid_area');
  const dy = radiusKm / 111.32, dx = dy / Math.cos(latitude * Math.PI / 180);
  if (Math.abs(longitude) + dx >= 180 || Math.abs(latitude) + dy > 85) throw new Error('invalid_area');
  return { west: longitude - dx, south: latitude - dy, east: longitude + dx, north: latitude + dy };
}

export function regionTiles(bounds: ReturnType<typeof regionBounds>, template: string) {
  if (!bounds || !Object.values(bounds).every(Number.isFinite) || bounds.west < -180 || bounds.east > 180 || bounds.south < -85 || bounds.north > 85 || bounds.west >= bounds.east || bounds.south >= bounds.north) throw new Error('invalid_area');
  if (!allowedOpenMapTemplate(template, 'tile')) throw new Error('invalid_tile_source');
  const x = (lng: number, z: number) => Math.floor((lng + 180) / 360 * 2 ** z);
  const y = (lat: number, z: number) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  const result: string[] = [];
  for (let z = OPEN_MAP_MIN_ZOOM; z <= OPEN_MAP_MAX_ZOOM; z++) {
    for (let tx = x(bounds.west,z); tx <= x(bounds.east,z); tx++) for (let ty = y(bounds.north,z); ty <= y(bounds.south,z); ty++) {
      const url = template.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty));
      if (!allowedOpenMapUrl(url)) throw new Error('invalid_tile_source');
      result.push(url);
      if (result.length > OPEN_MAP_MAX_RESOURCES) throw new Error('area_too_large');
    }
  }
  return result;
}
