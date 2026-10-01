import { useEffect, useRef, useState } from "react";
import { isNativePlatform, plugin } from "../lib/capacitor";
import { useI18n } from "../lib/i18n";
import { EMPTY_TICKET, parseTicketText, type TicketFields } from "../lib/ticketText";
import { normalizeFlightNumber, normalizePnr } from "../lib/cockpitForm";
import { DateTimeField } from "./DateTimeField";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";

type Props = { onConfirm: (fields: TicketFields) => Promise<void> | void; disabled?: boolean };
export function CockpitTicketImport({ onConfirm, disabled = false }: Props) {
  const { copy } = useI18n();
  const [open, setOpen] = useState(false), [review, setReview] = useState(false), [busy, setBusy] = useState(false);
  const [text, setText] = useState(""), [notice, setNotice] = useState("");
  const [fields, setFields] = useState<TicketFields>({ ...EMPTY_TICKET });
  const generation = useRef(0), pending = useRef(false);
  const reader = isNativePlatform() ? plugin("TicketImport")?.pickAndRead : undefined;
  useEffect(() => () => { generation.current++; }, []);
  const close = () => { generation.current++; pending.current = false; setOpen(false); setText(""); setFields({ ...EMPTY_TICKET }); setReview(false); setNotice(""); setBusy(false); };
  const inspect = (value: string, truncated = false) => {
    const result = parseTicketText(value);
    setFields(result.fields); setText(""); setReview(true);
    setNotice(truncated ? copy("Belgenin bir kısmı okunabildi. Alanları biletinle karşılaştır.", "Only part of the document was read. Compare these fields with your ticket.")
      : result.ambiguous.length ? copy("Birden fazla uçuş veya farklı bilgi bulundu. Belirsiz alanları boş bıraktık; kullanacağın uçuşu doğrula.", "Multiple flights or conflicting details were found. Ambiguous fields are blank; confirm the flight you want.")
      : copy("Okunan bilgileri biletinle karşılaştır. Onaylamadan hiçbir alan kullanılmaz.", "Compare these details with your ticket. Nothing is used until you confirm."));
  };
  async function readTicket(source: "photos" | "files") {
    if (!reader || pending.current) return;
    pending.current = true;
    const id = ++generation.current; setBusy(true); setNotice("");
    try {
      const result = await reader.call(plugin("TicketImport"), { source }) as { text?: unknown; cancelled?: boolean; truncated?: boolean };
      if (id !== generation.current || result.cancelled) return;
      if (typeof result.text !== "string" || !result.text.trim()) { setNotice(copy("Belgede okunabilir metin bulunamadı. Metni yapıştırabilir veya bilgileri kendin girebilirsin.", "No readable text was found. Paste the text or enter the details yourself.")); return; }
      inspect(result.text, result.truncated || result.text.length > 24000);
    } catch { if (id === generation.current) setNotice(copy("Belge okunamadı. Metni yapıştırarak devam edebilirsin.", "The document could not be read. You can paste its text instead.")); }
    finally { if (id === generation.current) { pending.current = false; setBusy(false); } }
  }
  async function confirm() {
    if (pending.current || !Object.values(fields).some(Boolean)) return;
    pending.current = true;
    const id = ++generation.current; setBusy(true);
    try { await onConfirm({ ...fields }); if (id === generation.current) close(); }
    catch { if (id === generation.current) setNotice(copy("Bilgiler aktarılamadı. Tekrar dene.", "The details could not be applied. Try again.")); }
    finally { if (id === generation.current) { pending.current = false; setBusy(false); } }
  }
  return <>
    <button type="button" className="cockpit-ticket-open" disabled={disabled} onClick={() => setOpen(true)}><Icon name="passport" size={18}/>{copy("Biletimden doldur", "Fill from my ticket")}</button>
    <Sheet open={open} title={copy("Bilet bilgilerini al", "Import ticket details")} onClose={close} size="large">
      <div className="cockpit-ticket-import">
        {notice && <p role="status">{notice}</p>}
        {!review ? <>
          <p>{copy("Biletin cihazında okunur. Dosya ve metin sunucuya gönderilmez; belge kalıcı olarak saklanmaz.", "Your ticket is read on your device. The file and text are not sent to a server; the document is not kept permanently.", "Bileta lexohet në pajisjen tënde. Skedari dhe teksti nuk dërgohen në server; dokumenti nuk ruhet përgjithmonë.")}</p>
          {reader && <div className="form-grid two stack-narrow"><button className="primary-wide" type="button" disabled={busy} onClick={() => void readTicket("photos")}>{copy("Fotoğraf seç", "Choose photo")}</button><button className="secondary-wide" type="button" disabled={busy} onClick={() => void readTicket("files")}>{copy("PDF veya dosya seç", "Choose PDF or file")}</button></div>}{busy && <p role="status">{copy("Okunuyor…", "Reading…")}</p>}
          <label>{copy("Bilet / e-posta metni", "Ticket / email text")}<textarea value={text} maxLength={24000} rows={8} disabled={busy} onChange={event => setText(event.target.value)} placeholder={copy("Biletinden kopyaladığın metni yapıştır", "Paste text copied from your ticket")}/></label>
          <button className="secondary-wide" type="button" disabled={busy || !text.trim()} onClick={() => inspect(text)}>{copy("Bilgileri incele", "Review details")}</button>
        </> : <>
          <div className="form-grid two stack-narrow">
            <label>{copy("Uçuş numarası", "Flight number")}<input value={fields.flightNumber} maxLength={8} onChange={e => setFields({ ...fields, flightNumber: normalizeFlightNumber(e.target.value) })}/></label>
            <DateTimeField type="date" label={copy("Kalkış tarihi", "Departure date")} value={fields.departureDate} onChange={departureDate => setFields({ ...fields, departureDate })}/>
            <label>{copy("Kalkış kodu · biletteki 3 harf", "Departure code · 3 letters on ticket")}<input value={fields.originIata} maxLength={3} onChange={e => setFields({ ...fields, originIata: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}/></label>
            <label>{copy("Varış kodu · biletteki 3 harf", "Arrival code · 3 letters on ticket")}<input value={fields.destinationIata} maxLength={3} onChange={e => setFields({ ...fields, destinationIata: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}/></label>
            <DateTimeField type="time" label={copy("Kalkış · yerel saat", "Departure · local time")} value={fields.departureTime} onChange={departureTime => setFields({ ...fields, departureTime })}/>
            <DateTimeField type="date" label={copy("Varış tarihi", "Arrival date")} value={fields.arrivalDate} onChange={arrivalDate => setFields({ ...fields, arrivalDate })}/>
            <DateTimeField type="time" label={copy("Varış · yerel saat", "Arrival · local time")} value={fields.arrivalTime} onChange={arrivalTime => setFields({ ...fields, arrivalTime })}/>
            <label>PNR<input value={fields.flightPnr} maxLength={20} onChange={e => setFields({ ...fields, flightPnr: normalizePnr(e.target.value) })}/></label>
          </div>
          <p>{copy("Yalnız doğruladığın alanlar aktarılır. Eksikleri sonraki adımda tamamlayabilirsin.", "Only the fields you confirm are applied. Complete anything missing in the next step.")}</p>
          <button className="primary-wide" type="button" disabled={busy || !Object.values(fields).some(Boolean)} onClick={() => void confirm()}>{busy ? copy("Aktarılıyor…", "Applying…") : copy("Bu bilgileri onayla ve kullan", "Confirm and use these details")}</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => { setReview(false); setFields({ ...EMPTY_TICKET }); setNotice(""); }}>{copy("Başka bilet oku", "Read another ticket")}</button>
        </>}
      </div>
    </Sheet>
  </>;
}
