import { useEffect, useId, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { MAX_PERSONAL_CARDS, PERSONAL_TRAVEL_CARDS_EVENT, readPersonalTravelCards, removePersonalTravelCard, restorePersonalTravelCard, savePersonalTravelCard, type PersonalCardDraft, type PersonalTravelCard } from "../lib/personalTravelCards";
import "./personal-travel-cards.css";

export function PersonalTravelCards({ ownerId, tripId }: { ownerId?: string | null; tripId?: string }) {
  // Changing account also discards form/undo state before another account renders.
  return <PersonalCardsEditor key={`${ownerId || "guest"}:${tripId || "all"}`} ownerId={ownerId} tripId={tripId}/>;
}

function PersonalCardsEditor({ ownerId, tripId }: { ownerId?: string | null; tripId?: string }) {
  const { copy } = useI18n();
  const [stored, setStored] = useState(() => readPersonalTravelCards(ownerId));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonalCardDraft>({ title: "", hotelName: "", address: "", reservationNote: "", tripId: tripId || null });
  const [removed, setRemoved] = useState<PersonalTravelCard | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formId = useId();
  useEffect(() => {
    const reload = () => setStored(readPersonalTravelCards(ownerId));
    window.addEventListener(PERSONAL_TRAVEL_CARDS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => { window.removeEventListener(PERSONAL_TRAVEL_CARDS_EVENT, reload); window.removeEventListener("storage", reload); };
  }, [ownerId]);
  const items = tripId ? stored.items.filter(item => item.tripId === tripId) : stored.items;
  const start = (card?: PersonalTravelCard) => {
    setEditing(card?.id || "new");
    setDraft(card ? { title: card.title, hotelName: card.hotelName, address: card.address, reservationNote: card.reservationNote, tripId: card.tripId } : { title: "", hotelName: "", address: "", reservationNote: "", tripId: tripId || null });
    setError(""); setMessage("");
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const result = savePersonalTravelCard(ownerId, draft, editing === "new" ? undefined : editing || undefined);
    if (result.error) {
      setError(result.error === "limit" ? copy(`En fazla ${MAX_PERSONAL_CARDS} kart saklayabilirsin.`, `You can keep up to ${MAX_PERSONAL_CARDS} cards.`, `Mund të ruash deri në ${MAX_PERSONAL_CARDS} karta.`) : result.error === "invalid" ? copy("Bir başlık ve en az bir otel, adres veya not yaz.", "Add a title and at least one hotel, address or note.") : copy("Kart kaydedilemedi. Cihaz depolamasını kontrol et; yazdıkların formda duruyor.", "Could not save. Check device storage; your text is still in the form."));
      return;
    }
    setStored(result); setEditing(null); setError(""); setMessage(copy("Kart bu cihaza kaydedildi. İnternetsiz de açabilirsin.", "Card saved on this device. You can open it offline."));
  };
  const remove = (card: PersonalTravelCard) => {
    const result = removePersonalTravelCard(ownerId, card.id);
    if (result.error) { setError(copy("Kart kaldırılamadı; depolamayı kontrol et.", "Could not remove the card. Check device storage.")); return; }
    setStored(result); setRemoved(card); setMessage(""); setError("");
  };
  const undo = () => {
    if (!removed) return;
    const result = restorePersonalTravelCard(ownerId, removed);
    if (result.error) { setError(copy("Kart geri alınamadı. Depolamayı kontrol edip yeniden dene.", "Could not restore the card. Check storage and retry.")); return; }
    setStored(result); setRemoved(null); setMessage(copy("Kart geri geldi.", "Card restored.")); setError("");
  };
  return <section className="personal-travel-cards" aria-labelledby={`${formId}-title`}>
    <header><span><Icon name="offline" size={24}/></span><div><small>{copy("İNTERNET GEREKTİRMEZ", "NO INTERNET NEEDED")}</small><h2 id={`${formId}-title`}>{copy("Kişisel seyahat kartın", "Your personal travel card")}</h2></div></header>
    <p className="ptc-intro">{copy("Otelini, adresini ve rezervasyon notunu kendin ekle. İhtiyacın olduğunda tek yerde bul.", "Add your hotel, address and reservation note. Keep them together for when you need them.")}</p>
    <p className="ptc-storage"><Icon name="lock" size={15}/>{ownerId ? copy("Yalnız bu cihazda, bu hesabın bölümünde saklanır. Başka cihazlara eşitlenmez.", "Stored only on this device, under this account. It does not sync to other devices.") : copy("Bu cihazın misafir bölümünde saklanır. Cihazı kullanan diğer misafirler görebilir.", "Saved in this device's guest area. Other guests using this device can see it.")}</p>
    {stored.error && <p className="ptc-error" role="alert">{copy("Mevcut kartlar okunamadı. Kayıtların üzerine yazılmadı; cihaz depolamasını kontrol et.", "Existing cards could not be read. Nothing was overwritten; check device storage.")}</p>}
    {error && <p className="ptc-error" role="alert">{error}</p>}
    {message && <p className="ptc-message" role="status">{message}</p>}
    {removed && <div className="ptc-undo" role="status"><span>{copy("Kart kaldırıldı.", "Card removed.")}</span><button type="button" onClick={undo}>{copy("Geri al", "Undo")}</button><button type="button" onClick={() => setRemoved(null)} aria-label={copy("Geri almayı kapat", "Dismiss undo")}><Icon name="close" size={17}/></button></div>}
    {editing ? <form className="ptc-form" onSubmit={save}>
      <label htmlFor={`${formId}-name`}>{copy("Kartın adı", "Card title")}<input id={`${formId}-name`} required maxLength={80} value={draft.title} placeholder={copy("Roma hafta sonu", "Rome weekend")} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}/></label>
      <label htmlFor={`${formId}-hotel`}>{copy("Otel / konaklama", "Hotel / accommodation")}<input id={`${formId}-hotel`} maxLength={120} value={draft.hotelName} onChange={event => setDraft(value => ({ ...value, hotelName: event.target.value }))}/></label>
      <label htmlFor={`${formId}-address`}>{copy("Adres", "Address")}<textarea id={`${formId}-address`} rows={2} maxLength={400} value={draft.address} onChange={event => setDraft(value => ({ ...value, address: event.target.value }))}/></label>
      <label htmlFor={`${formId}-note`}>{copy("Rezervasyon ve diğer notlar", "Reservation and other notes")}<textarea id={`${formId}-note`} rows={3} maxLength={1000} value={draft.reservationNote} placeholder={copy("Giriş saati, rezervasyon numarası, buluşma noktası…", "Check-in time, booking reference, meeting point…")} onChange={event => setDraft(value => ({ ...value, reservationNote: event.target.value }))}/></label>
      <div className="ptc-form-actions"><button type="submit" disabled={Boolean(stored.error)}>{copy("Cihaza kaydet", "Save on this device")}</button><button type="button" onClick={() => { setEditing(null); setError(""); }}>{copy("Vazgeç", "Cancel")}</button></div>
    </form> : <>
      {items.map(card => <article className="ptc-card" key={card.id}><header><h3>{card.title}</h3><button type="button" onClick={() => start(card)} aria-label={copy(`${card.title} kartını düzenle`, `Edit ${card.title}`, `Ndrysho ${card.title}`)}>{copy("Düzenle", "Edit")}</button></header>{card.hotelName && <div><small>{copy("KONAKLAMA", "STAY")}</small><p>{card.hotelName}</p></div>}{card.address && <div><small>{copy("ADRES", "ADDRESS")}</small><p>{card.address}</p></div>}{card.reservationNote && <div><small>{copy("NOTUN", "YOUR NOTE")}</small><p>{card.reservationNote}</p></div>}<button type="button" className="ptc-remove" onClick={() => remove(card)} aria-label={copy(`${card.title} kartını kaldır`, `Remove ${card.title}`, `Hiq ${card.title}`)}><Icon name="trash" size={16}/>{copy("Kartı kaldır", "Remove card")}</button></article>)}
      <button type="button" className="ptc-add" disabled={Boolean(stored.error) || stored.items.length >= MAX_PERSONAL_CARDS} onClick={() => start()}><Icon name="plus" size={19}/>{items.length ? copy("Yeni kart ekle", "Add another card") : copy("Kişisel kartımı oluştur", "Create my personal card")}</button>
    </>}
  </section>;
}
