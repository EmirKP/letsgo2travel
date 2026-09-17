export type Text = { tr: string; en: string };
export type Evidence = { sourceUrl: string; verifiedAt: string };
export type EmergencyCategory = 'general' | 'police' | 'ambulance' | 'fire' | 'tourist-police' | 'coastguard';
export type EmergencyContact = Evidence & { country: string; category: EmergencyCategory; number: string; note?: Text };
export type Embassy = Evidence & {
  id: string; representedCountry: string; hostCountry: string; city: string; name: Text;
  address: string; phone: string; emergencyPhone: string | null; hours: Text | null;
  latitude: number | null; longitude: number | null;
};
export type GuideCard = Evidence & {
  country: string; category: 'water' | 'tax-free' | 'hours' | 'law' | 'culture';
  title: Text; text: Text; status?: 'drinkable' | 'regional' | 'avoid'; validUntil?: string;
};
export type PointCategory = 'hospital' | 'pharmacy' | 'police' | 'atm' | 'exchange' | 'toilets' | 'wifi' | 'embassy' | 'museum' | 'statue' | 'monument' | 'historic' | 'stadium' | 'palace' | 'square' | 'viewpoint' | 'attraction';
export type MapMode = 'needs' | 'explore';
export type Coordinates = { latitude: number; longitude: number };
export type Place = Coordinates & {
  id: string; category: PointCategory; name: string; description: string | null;
  hours: string | null; free: boolean | null; accessible: boolean | null; website: string | null;
  representedCountry: string | null; sourceUrl: string; fetchedAt: string;
};
export type PlacesResult = { places: Place[]; center: Coordinates; fetchedAt: string; limited: boolean; radius: number };
export type FxQuote = {
  base: string; quote: string; rate: number; date: string; previousRate: number | null;
  previousDate: string | null; changePercent: number | null; sourceUrl: string; fetchedAt: string;
};
