export type GuestDataCounts = {
  routes: number;
  favorites: number;
  visitedCountries: number;
  total: number;
};

export type GuestDataCollections<
  Route extends { id: string },
  Destination extends { alpha3: string },
> = {
  routes: Route[];
  favorites: Destination[];
  visitedCountries: Destination[];
};

export type GuestDataMergeResult<
  Route extends { id: string },
  Destination extends { alpha3: string },
> = {
  merged: GuestDataCollections<Route, Destination>;
  added: GuestDataCounts;
};

function routeKey(route: unknown) {
  if (!route || typeof route !== "object" || !("id" in route)) return "";
  return String(route.id || "").trim();
}

function destinationKey(destination: unknown) {
  if (!destination || typeof destination !== "object" || !("alpha3" in destination)) return "";
  return String(destination.alpha3 || "").trim().toLocaleUpperCase("en-US");
}

function appendMissing<T>(current: T[], incoming: T[], keyOf: (item: T) => string) {
  // Hesaptaki mevcut kayıtlar her zaman önceliklidir. Burada current dizisini
  // tekilleştirmemek bilinçli: bozuk/eski bir cihaz kaydını aktarım sırasında
  // sessizce silmeyiz. Yalnızca misafir tarafındaki yeni kayıtları ekleriz.
  const seen = new Set(current.map(keyOf).filter(Boolean));
  const merged = [...current];
  let added = 0;

  for (const item of incoming) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    added += 1;
  }

  return { merged, added };
}

export function guestDataCounts<
  Route extends { id: string },
  Destination extends { alpha3: string },
>(collections: GuestDataCollections<Route, Destination>): GuestDataCounts {
  const routes = collections.routes.length;
  const favorites = collections.favorites.length;
  const visitedCountries = collections.visitedCountries.length;
  return { routes, favorites, visitedCountries, total: routes + favorites + visitedCountries };
}

export function mergeGuestData<
  Route extends { id: string },
  Destination extends { alpha3: string },
>(
  account: GuestDataCollections<Route, Destination>,
  guest: GuestDataCollections<Route, Destination>,
): GuestDataMergeResult<Route, Destination> {
  const routes = appendMissing<Route>(account.routes, guest.routes, routeKey);
  const favorites = appendMissing<Destination>(account.favorites, guest.favorites, destinationKey);
  const visitedCountries = appendMissing<Destination>(account.visitedCountries, guest.visitedCountries, destinationKey);

  return {
    merged: {
      routes: routes.merged,
      favorites: favorites.merged,
      visitedCountries: visitedCountries.merged,
    },
    added: {
      routes: routes.added,
      favorites: favorites.added,
      visitedCountries: visitedCountries.added,
      total: routes.added + favorites.added + visitedCountries.added,
    },
  };
}

/**
 * Kararın hangi misafir veri kümesi için verildiğini belirleyen, kişisel veri
 * içermeyen küçük imza. Kayıt içeriği değil yalnızca yerel anahtarlar kullanılır.
 * Sonradan yeni bir misafir kaydı oluşursa imza değişir ve kullanıcıya yeniden
 * seçim sunulabilir.
 */
export function guestDataSignature<
  Route extends { id: string },
  Destination extends { alpha3: string },
>(collections: GuestDataCollections<Route, Destination>) {
  const source = [
    `r:${collections.routes.map(routeKey).filter(Boolean).sort().join("|")}`,
    `f:${collections.favorites.map(destinationKey).filter(Boolean).sort().join("|")}`,
    `v:${collections.visitedCountries.map(destinationKey).filter(Boolean).sort().join("|")}`,
  ].join(";");

  // FNV-1a 32 bit: güvenlik amacı taşımaz; yalnızca kısa, kararlı bir değişim
  // belirteci üretir.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const counts = guestDataCounts(collections);
  return `v1-${(hash >>> 0).toString(36)}-${counts.routes}-${counts.favorites}-${counts.visitedCountries}`;
}
