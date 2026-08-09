const NEARBY_AIRPORT_GROUPS = [
  ["IST", "SAW"],
  ["LON", "LHR", "LGW", "STN", "LTN", "LCY", "SEN"],
  ["PAR", "CDG", "ORY", "BVA"],
  ["ROM", "FCO", "CIA"],
  ["MIL", "MXP", "LIN", "BGY"],
  ["NYC", "JFK", "LGA", "EWR"],
  ["TYO", "HND", "NRT"],
  ["BJS", "PEK", "PKX"],
  ["SHA", "PVG"],
  ["SEL", "ICN", "GMP"],
  ["STO", "ARN", "BMA", "NYO", "VST"],
  ["WAS", "IAD", "DCA", "BWI"],
  ["YTO", "YYZ", "YTZ", "YHM"],
  ["SAO", "GRU", "CGH", "VCP"],
  ["RIO", "GIG", "SDU"],
  ["BUE", "EZE", "AEP"],
  ["JKT", "CGK", "HLP"],
  ["DXB", "DWC", "SHJ"],
] as const;

const GROUP_BY_CODE = new Map<string, ReadonlySet<string>>();
for (const group of NEARBY_AIRPORT_GROUPS) {
  const values = new Set<string>(group);
  for (const code of group) GROUP_BY_CODE.set(code, values);
}

export function airportMatchesRequest(
  requestedCode: string,
  actualCode: string,
  includeNearbyAirports: boolean,
) {
  if (requestedCode === actualCode) return true;
  if (!includeNearbyAirports) return false;
  return GROUP_BY_CODE.get(requestedCode)?.has(actualCode) === true;
}

export function nearbyAirportCodes(code: string) {
  return [...(GROUP_BY_CODE.get(code) || new Set([code]))];
}

