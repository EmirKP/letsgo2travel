// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- This fixture preserves historical emitted JavaScript, not current application types.
// @ts-nocheck -- Historical JavaScript validator snapshot, intentionally frozen.
/**
 * TestFlight build 72 reader contract. Do not update when production validators change.
 * Extracted from git 62e2f08aca737b2fd9841985d481c10f965e2209; relevant files are identical to
 * released source 6dcf0d084da618d3438160e3df4565d573c6d74c.
 * Sources: mobile/src/lib/mapJourney.ts, routeCockpitIntent.ts, mapJourneyStorage.ts
 * and lib/travel-assistant/places.ts. TypeScript types were erased; runtime bodies
 * and category/photo validation constants are copied, with no current imports.
 * The Cockpit text helper is renamed to intentText to avoid a name collision.
 * inspectRoutes is exported as inspectSavedRoutes; its throw semantics are unchanged.
 */

// Discovery categories are separate from the existing emergency/touring modes.
export const DISCOVERY = ['cafe', 'bakery', 'restaurant', 'sweets', 'boutique', 'craft', 'gift', 'market', 'store', 'park', 'garden'];
export const NEEDS = ['hospital', 'pharmacy', 'police', 'atm', 'exchange', 'toilets', 'wifi', 'embassy'];
export const TOURING = ['museum', 'statue', 'monument', 'historic', 'stadium', 'palace', 'square', 'viewpoint', 'attraction'];
/** A saved POI must retain its exact provider identity and public source link. */
export function validJourneyPlaceSource(id, sourceUrl) {
    if (typeof id !== 'string' || typeof sourceUrl !== 'string')
        return false;
    if (/^(node|way|relation)\/[1-9]\d*$/.test(id) && id.length <= 64 && Number.isSafeInteger(Number(id.split('/')[1]))) {
        return sourceUrl === `https://www.openstreetmap.org/${id}`;
    }
    return /^apple\/[A-Za-z0-9_-]{1,120}$/.test(id) && sourceUrl === `https://maps.apple.com/place?place-id=${id.slice(6)}`;
}
const photoText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127 && character !== '<' && character !== '>');
const rasterName = (value) => photoText(value, 240) && value === value.trim()
    && !/[\\/?#%|:"<>]/.test(value) && !value.startsWith('.') && /\.(jpe?g|png|webp)$/i.test(value)
    ? value.replace(/_/g, ' ') : null;
function photoUrl(value) {
    if (!photoText(value, 2000) || value !== value.trim())
        return null;
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash ? u : null;
    }
    catch {
        return null;
    }
}
function uploadPhoto(value) {
    const u = photoUrl(value);
    if (!u || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(u.hostname))
        return null;
    // Current Commons imageinfo URLs include these fixed campaign parameters.
    // Drop only this known set; arbitrary queries never reach a map renderer.
    if (u.search) {
        const allowed = { utm_source: ['commons.wikimedia.org'], utm_campaign: ['imageinfo'], utm_content: ['thumbnail', 'original'] };
        let parameterCount = 0;
        u.searchParams.forEach(() => { parameterCount++; });
        if (parameterCount !== 3 || Object.entries(allowed).some(([name, values]) => u.searchParams.getAll(name).length !== 1 || !values.includes(u.searchParams.get(name))))
            return null;
        u.search = '';
    }
    try {
        const path = decodeURIComponent(u.pathname).split('/');
        const thumb = path[3] === 'thumb', offset = thumb ? 4 : 3;
        if (u.hostname === 'thumb.wikimedia.org' && !thumb || path[1] !== 'wikipedia' || path[2] !== 'commons' || path.length !== (thumb ? 8 : 6)
            || !/^[a-f0-9]$/.test(path[offset]) || !/^[a-f0-9]{2}$/.test(path[offset + 1])
            || path[offset + 1][0] !== path[offset])
            return null;
        const file = rasterName(path[offset + 2]);
        if (!file)
            return null;
        if (thumb) {
            const match = path[7].match(/^([1-9]\d{0,2})px-(.+)$/);
            if (!match || Number(match[1]) > 640 || rasterName(match[2]) !== file)
                return null;
        }
        return { url: u.href, file };
    }
    catch {
        return null;
    }
}
export function journeyPhotoLicense(value) {
    const u = photoUrl(value);
    if (!u || u.hostname !== 'creativecommons.org' || u.search)
        return null;
    if (!u.pathname.endsWith('/'))
        u.pathname += '/';
    const match = u.pathname.match(/^\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)\/$/);
    if (match)
        return { label: `CC ${match[1].toUpperCase()} ${match[2]}`, url: u.href };
    if (u.pathname === '/publicdomain/zero/1.0/')
        return { label: 'CC0 1.0', url: u.href };
    if (u.pathname === '/publicdomain/mark/1.0/')
        return { label: 'Public domain', url: u.href };
    return null;
}
/** Optional photo metadata is an all-or-nothing snapshot; old places remain valid. */
export function validJourneyPhoto(value) {
    const fields = [value.imageUrl, value.imageSourceUrl, value.imageAttribution, value.imageLicenseLabel, value.imageLicenseUrl];
    if (fields.every(field => field === undefined))
        return true;
    const image = uploadPhoto(value.imageUrl), license = journeyPhotoLicense(value.imageLicenseUrl);
    return Boolean(image && license && value.imageUrl === image.url && value.imageLicenseUrl === license.url && value.imageLicenseLabel === license.label
        && value.imageSourceUrl === `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(image.file.replace(/ /g, '_'))}`
        && photoText(value.imageAttribution, 800) && value.imageAttribution.trim());
}
export const MAX_JOURNEY_STOPS = 120;
const text = (value, max) => typeof value === 'string' && value.length <= max
    && Array.from(value).every(character => { const code = character.charCodeAt(0); return code >= 32 && code !== 127 || code === 9 || code === 10 || code === 13; });
const finitePoint = (point) => Boolean(point && typeof point === 'object'
    && typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const dayDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const id = (value) => text(value, 160) && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);
const categories = new Set([...NEEDS, ...TOURING, ...DISCOVERY]);
const url = (value) => {
    if (!text(value, 2000))
        return false;
    try {
        const u = new URL(value);
        return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
    }
    catch {
        return false;
    }
};
export function timeMinutes(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        return null;
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function validateJourneyPlace(value) {
    if (!value || typeof value !== 'object')
        return false;
    const p = value;
    return finitePoint(p) && validJourneyPlaceSource(p.id, p.sourceUrl) && text(p.name, 180)
        && categories.has(p.category)
        && (p.description === null || text(p.description, 500)) && (p.hours === null || text(p.hours, 180))
        && (p.website === null || url(p.website)) && (p.free === null || typeof p.free === 'boolean')
        && (p.accessible === null || typeof p.accessible === 'boolean')
        && (p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))
        && iso(p.fetchedAt) && (p.group === undefined || ['food', 'shopping', 'culture', 'nature', 'essentials'].includes(p.group))
        && (p.kind === undefined || text(p.kind, 60)) && (p.address === undefined || p.address === null || text(p.address, 500)) && validJourneyPhoto(p);
}
export function validateMapJourney(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const j = value;
    if (j.version !== 1 || !id(j.id) || !text(j.title, 160) || !j.title.trim() || !text(j.city, 160) || !j.city.trim()
        || !finitePoint(j.center) || !Number.isInteger(j.dayCount) || j.dayCount < 1 || j.dayCount > 14
        || !(j.startDate === null || dayDate(j.startDate)) || !['relaxed', 'balanced', 'busy'].includes(j.pace)
        || !Array.isArray(j.interests) || j.interests.length > 12 || j.interests.some(i => !text(i, 80))
        || !Array.isArray(j.stops) || j.stops.length > MAX_JOURNEY_STOPS || !iso(j.createdAt) || !iso(j.updatedAt)
        || !text(j.budgetNote, 280) || !(j.accommodation === null || finitePoint(j.accommodation) && text(j.accommodation.name, 160)))
        return false;
    if (j.planning !== undefined && !validateJourneyPlanning(j.planning, j.dayCount))
        return false;
    const stopIds = new Set(), placeIds = new Set();
    for (const stop of j.stops) {
        if (!stop || !id(stop.id) || stopIds.has(stop.id) || !validateJourneyPlace(stop.place) || placeIds.has(stop.place.id)
            || !Number.isInteger(stop.day) || stop.day < 1 || stop.day > j.dayCount || !Number.isInteger(stop.order) || stop.order < 0
            || !Number.isInteger(stop.durationMinutes) || stop.durationMinutes < 5 || stop.durationMinutes > 720
            || !text(stop.note, 500) || !(stop.fixedTime === null || typeof stop.fixedTime === 'string' && timeMinutes(stop.fixedTime) !== null)
            || !['normal', 'high'].includes(stop.priority) || !(stop.sourceUrl === null || url(stop.sourceUrl)))
            return false;
        stopIds.add(stop.id);
        placeIds.add(stop.place.id);
    }
    for (let day = 1; day <= j.dayCount; day++) {
        if (journeyDayStops(j, day).some((stop, index) => stop.order !== index))
            return false;
    }
    try {
        return JSON.stringify(j).length <= 300_000;
    }
    catch {
        return false;
    }
}
export function validateJourneyPlanning(value, dayCount) {
    if (!value || typeof value !== 'object')
        return false;
    const p = value, prefs = p.preferences;
    return p.generatedBy === 'ai' && ['tr', 'en', 'sq'].includes(p.locale) && iso(p.fetchedAt)
        && text(p.summary, 1600) && Boolean(p.summary.trim()) && text(p.attribution, 240)
        && (p.edited === undefined || typeof p.edited === 'boolean')
        && Boolean(prefs) && ['solo', 'couple', 'friends', 'family'].includes(prefs.party)
        && ['economical', 'moderate', 'comfortable'].includes(prefs.budget)
        && ['relaxed', 'balanced', 'busy'].includes(prefs.pace) && ['light', 'standard'].includes(prefs.walking)
        && text(prefs.notes, 1000) && Array.isArray(prefs.interests) && prefs.interests.length >= 1 && prefs.interests.length <= 4
        && new Set(prefs.interests).size === prefs.interests.length && prefs.interests.every(item => ['culture', 'food', 'shopping', 'nature'].includes(item))
        && Array.isArray(p.limitations) && p.limitations.length <= 8 && p.limitations.every(item => text(item, 500))
        && Array.isArray(p.days) && p.days.length === dayCount && p.days.every((day, index) => day && day.day === index + 1 && text(day.theme, 120) && text(day.explanation, 800));
}
export function journeyDayStops(journey, day) {
    return journey.stops.filter(stop => stop.day === day).sort((a, b) => a.order - b.order);
}
const intentText = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateRouteCockpitIntent(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const intent = value;
    if (intent.kind !== "saved-route" || !(intent.ownerId === null || intentText(intent.ownerId, 80)) || !intentText(intent.sourceRouteId, 160)
        || !intentText(intent.sourceSavedAt, 40) || !Number.isFinite(Date.parse(intent.sourceSavedAt))
        || !Number.isInteger(intent.routeIndex) || intent.routeIndex < 0 || intent.routeIndex > 29)
        return false;
    const route = intent.route;
    const mapJourney = route?.mapJourney;
    if (mapJourney !== undefined && (!validateMapJourney(mapJourney) || mapJourney.id !== intent.sourceRouteId || mapJourney.dayCount !== route.dailyPlan?.length))
        return false;
    // A geocoded map plan may not have a verified country. The Cockpit form
    // collects it explicitly; only validated structured plans may omit it.
    if (!route || !intentText(route.name, 240) || !(intentText(route.country, 240) || mapJourney !== undefined && route.country === '') || !Array.isArray(route.dailyPlan)
        || route.dailyPlan.length < 1 || route.dailyPlan.length > 30 || route.dailyPlan.some(day => !intentText(day, 600)))
        return false;
    for (const key of ["cityOrRegion", "destinationCode", "why", "visaStatus", "visaNote", "visaSourceUrl", "estimatedBudget", "idealDuration", "bestFor", "difficulty", "transportEase", "safetyNote"]) {
        if (route[key] !== undefined && (typeof route[key] !== "string" || route[key].length > 3000))
            return false;
    }
    if (route.warnings !== undefined && (!Array.isArray(route.warnings) || route.warnings.length > 30 || route.warnings.some(warning => !intentText(warning, 3000))))
        return false;
    if (intent.input !== null) {
        if (!intent.input || typeof intent.input !== "object" || !Array.isArray(intent.input.vibe) || intent.input.vibe.length > 20 || intent.input.vibe.some(item => !intentText(item, 120)))
            return false;
        for (const key of ["origin", "days", "month", "budget", "accommodation", "who", "tempo", "visa"]) {
            if (intent.input[key] !== undefined && (typeof intent.input[key] !== "string" || intent.input[key].length > 600))
                return false;
        }
    }
    if (intent.dates && (!validDay(intent.dates.startDate) || !validDay(intent.dates.endDate) || intent.dates.endDate < intent.dates.startDate))
        return false;
    try {
        return JSON.stringify(intent).length <= 60_000;
    }
    catch {
        return false;
    }
}
export function inspectSavedRoutes(value) {
    if (!Array.isArray(value))
        throw new Error('corrupt');
    const ids = new Set();
    for (const route of value) {
        if (!route || typeof route.id !== 'string' || ids.has(route.id) || !Array.isArray(route.plan?.routes))
            throw new Error('corrupt');
        ids.add(route.id);
        for (const suggestion of route.plan.routes) {
            if (suggestion.mapJourney !== undefined && (!validateMapJourney(suggestion.mapJourney) || suggestion.mapJourney.id !== route.id))
                throw new Error('corrupt');
        }
    }
}
