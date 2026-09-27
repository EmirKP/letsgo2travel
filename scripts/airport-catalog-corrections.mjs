// Reviewed additions missing from the pinned upstream airport snapshots.
// Chisinau changed KIV -> RMO on 18 January 2024. Keep the old KIV record
// unchanged for saved/historical trips; a new code is not a rewrite of old data.
// Primary evidence:
// https://www.tarom.ro/stiri/informare-pasageri-aeroport-chisinau-schimbare-cod-iata-din-kiv-in-rmo/
// https://airport.md/files/Caiet%20de%20sarcini%20Travel%20Retail%20ro.pdf
export const airportCatalogAdditions = [
  { iata: "RMO", name: "Chişinău International Airport", city: "Chişinău", countryCode: "MD", priority: 1 },
];

// Both codes refer to the same Chisinau airport. Use the IANA zone, not a
// fixed offset, so winter UTC+02:00 and summer UTC+03:00 remain date-dependent.
export const airportTimeZoneCorrections = { KIV: "Europe/Chisinau", RMO: "Europe/Chisinau" };
