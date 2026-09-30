import { isCalendarDate } from "./dates";

export type TicketFields = { flightNumber: string; departureDate: string; flightPnr: string; originIata: string; destinationIata: string; departureTime: string; arrivalDate: string; arrivalTime: string };
export const EMPTY_TICKET: TicketFields = { flightNumber: "", departureDate: "", flightPnr: "", originIata: "", destinationIata: "", departureTime: "", arrivalDate: "", arrivalTime: "" };
const months = ["jan|january|oca|ocak|janar", "feb|february|sub|subat|shk|shkurt", "mar|march|mart|mars", "apr|april|nis|nisan|pri|prill", "may|mayis|maj", "jun|june|haz|haziran|qer|qershor", "jul|july|tem|temmuz|kor|korrik", "aug|august|agu|agustos|gus|gusht", "sep|sept|september|eyl|eylul|sht|shtator", "oct|october|eki|ekim|tet|tetor", "nov|november|kas|kasim|nen|nentor", "dec|december|ara|aralik|dhj|dhjetor"];
const clean = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");

/** Conservative suggestions from user-provided text. No date, route or time is guessed. */
export function parseTicketText(value: unknown): { fields: TicketFields; ambiguous: Array<keyof TicketFields> } {
  const fields = { ...EMPTY_TICKET }, ambiguous: Array<keyof TicketFields> = [];
  if (typeof value !== "string") return { fields, ambiguous };
  const text = clean(value.slice(0, 24000)).replace(/\r/g, "");
  const choose = (key: keyof TicketFields, values: string[]) => {
    const unique = [...new Set(values.filter(Boolean))];
    if (unique.length === 1) fields[key] = unique[0];
    else if (unique.length > 1) ambiguous.push(key);
  };
  const captures = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map(match => match[1]);
  const dates = (source: string) => {
    const values = captures(source, /\b(20\d{2}-\d{2}-\d{2})\b/g);
    for (const match of source.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g)) values.push(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
    for (const match of source.matchAll(/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/g)) {
      const month = months.findIndex(value => new RegExp(`^(?:${value})$`, "i").test(match[2]));
      if (month >= 0) values.push(`${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`);
    }
    return values.filter(isCalendarDate);
  };
  const departure = text.split("\n").filter(line => /^\s*(?:departure|depart(?:ure)? date|depart(?:ure)? time|kalkis|gidis|nisja|nisje|(?:data|ora)\s+(?:e\s+)?nisjes)\b/i.test(line)).join("\n");
  const arrival = text.split("\n").filter(line => /^\s*(?:arrival|arrive|varis|mberritja|mberritje|(?:data|ora)\s+(?:e\s+)?mberritjes)\b/i.test(line)).join("\n");
  const labeledFlights = captures(text, /(?:^|\n)\s*(?:flight(?:\s*(?:number|no\.?))?|ucus(?:\s*(?:no|numarasi))?|fluturimi|numri\s+i\s+fluturimit)\s*[:#-]?\s*([A-Z0-9]{2,3}\s*\d{1,4}[A-Z]?)\b/gim);
  choose("flightNumber", (labeledFlights.length ? labeledFlights : captures(text, /\b((?:[A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])\s*\d{1,4}[A-Z]?)\b/g)).map(v => v.replace(/\s/g, "").toUpperCase()));
  choose("departureDate", departure ? dates(departure) : dates(text));
  choose("arrivalDate", dates(arrival));
  choose("departureTime", captures(departure, /\b((?:[01]\d|2[0-3]):[0-5]\d)\b/g));
  choose("arrivalTime", captures(arrival, /\b((?:[01]\d|2[0-3]):[0-5]\d)\b/g));
  choose("flightPnr", captures(text, /(?:^|\n)\s*(?:PNR|booking\s*(?:reference|code)|reservation\s*(?:reference|code)|rezervasyon\s*kodu|kodi\s+i\s+rezervimit|referenca\s+e\s+rezervimit)\s*[:#-]\s*([A-Z0-9-]{3,20})\b/gim).map(v => v.toUpperCase()));
  const routes = [...text.matchAll(/\b([A-Z]{3})\s*(?:→|->|–|—|-)\s*([A-Z]{3})\b/g)];
  choose("originIata", [...routes.map(m => m[1]), ...captures(text, /(?:^|\n)\s*(?:from|origin|kalkis havalimani|nereden|nga|aeroporti\s+i\s+nisjes)\s*:\s*([A-Z]{3})\b/gim).map(v => v.toUpperCase())]);
  choose("destinationIata", [...routes.map(m => m[2]), ...captures(text, /(?:^|\n)\s*(?:to|destination|varis havalimani|nereye|destinacioni|aeroporti\s+i\s+mberritjes)\s*:\s*([A-Z]{3})\b/gim).map(v => v.toUpperCase())]);
  if (fields.originIata && fields.originIata === fields.destinationIata) { fields.originIata = ""; fields.destinationIata = ""; ambiguous.push("originIata", "destinationIata"); }
  return { fields, ambiguous };
}
