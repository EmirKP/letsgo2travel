// Currency of the entered local price. A foreign-currency hotel quote must not
// receive local CPI inflation as if it were denominated in the local currency.
export const COST_CURRENCIES: Record<string, string> = {
  TR: "TRY", IT: "EUR", RS: "RSD", BA: "BAM", GE: "GEL", AE: "AED", AZ: "AZN",
  DE: "EUR", FR: "EUR", GR: "EUR", ES: "EUR", PT: "EUR", AT: "EUR", NL: "EUR",
  BE: "EUR", IE: "EUR", FI: "EUR", HR: "EUR", SI: "EUR", SK: "EUR", EE: "EUR",
  LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR", PL: "PLN", HU: "HUF", RO: "RON",
  CZ: "CZK", SE: "SEK", DK: "DKK", NO: "NOK", CH: "CHF", GB: "GBP", ME: "EUR", LU: "EUR", NZ: "NZD",
  US: "USD", CA: "CAD", AU: "AUD", JP: "JPY", MD: "MDL", UA: "UAH",
  RU: "RUB", IR: "IRR", IL: "ILS", TH: "THB", ID: "IDR", AL: "ALL", MK: "MKD",
};
