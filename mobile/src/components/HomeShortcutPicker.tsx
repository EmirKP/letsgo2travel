import { useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { appTools, type AppShortcutId } from "../lib/appTools";
import { DEFAULT_HOME_SHORTCUTS, HOME_SHORTCUT_LIMIT } from "../lib/homeShortcuts";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { TravelToolArtwork } from "./TravelToolArtwork";
import "./home-shortcuts.css";

export function HomeShortcutPicker({ views, onSave, onClose }: {
  views: readonly AppShortcutId[]; onSave: (views: readonly AppShortcutId[]) => boolean; onClose: () => void;
}) {
  const { copy, locale } = useI18n();
  const [draft, setDraft] = useState([...views]);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState<AppShortcutId | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const tools = appTools(locale);
  const move = (index: number, direction: number) => setDraft(current => {
    if (index + direction < 0 || index + direction >= current.length) return current;
    const next = [...current];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    return next;
  });
  const choose = (id: AppShortcutId, selected: boolean) => {
    setFailed(false);
    setDraft(current => selected ? current.length < HOME_SHORTCUT_LIMIT && !current.includes(id) ? [...current, id] : current : current.filter(item => item !== id));
  };
  return <Sheet open title={copy("Kısayolları düzenle", "Edit shortcuts", "Ndrysho shkurtoret")} onClose={onClose} size="large">
    <div className="home-shortcut-picker">
      <p>{copy("Tutamacı sürükleyerek sırala. Ana sayfana en fazla 5 araç ekleyebilirsin.", "Drag the handle to reorder. Add up to 5 tools to your home screen.", "Tërhiq dorezën për t’i renditur. Shto deri në 5 mjete në faqen kryesore.")}</p>
      <p className="home-shortcut-count" role="status">{copy(`${draft.length}/5 seçildi`, `${draft.length}/5 selected`, `${draft.length}/5 të zgjedhura`)}</p>
      <ol ref={list} aria-label={copy("Kısayol sırası", "Shortcut order", "Rendi i shkurtoreve")}>{draft.map((id, index) => {
        const tool = tools.find(item => item.id === id);
        if (!tool) return null;
        return <li key={id} data-shortcut-id={id} className={dragging === id ? "is-dragging" : ""}>
          <button type="button" className="shortcut-drag" aria-label={copy(`${tool.label}: sürükle veya yukarı/aşağı oklarıyla sırala`, `${tool.label}: drag or use up/down arrow keys to reorder`, `${tool.label}: tërhiq ose përdor shigjetat lart/poshtë`)}
            onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(index, event.key === "ArrowUp" ? -1 : 1); } }}
            onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(id); }}
            onPointerMove={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId) || !list.current) return;
              const rows = Array.from(list.current.children);
              const target = rows.findIndex(row => { const rect = row.getBoundingClientRect(); return event.clientY >= rect.top && event.clientY <= rect.bottom; });
              if (target < 0) return;
              setDraft(current => { const from = current.indexOf(id); if (from === target || from < 0) return current; const next = [...current]; next.splice(from, 1); next.splice(target, 0, id); return next; });
            }}
            onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(null); }}
            onPointerCancel={() => setDragging(null)} onLostPointerCapture={() => setDragging(null)}><span aria-hidden="true">⠿</span></button>
          <TravelToolArtwork kind={tool.icon} size={34}/><span><small>{index + 1}</small> {tool.label}</span>
          <button type="button" className="shortcut-remove" aria-label={copy(`${tool.label} kaldır`, `Remove ${tool.label}`, `Hiq ${tool.label}`)} onClick={() => choose(id, false)}><span aria-hidden="true">−</span></button>
        </li>;
      })}</ol>
      <details className="home-shortcut-add"><summary><Icon name="plus" size={18}/>{copy("Kısayol ekle", "Add shortcut", "Shto shkurtore")}</summary>
        {draft.length >= HOME_SHORTCUT_LIMIT && <p>{copy("Yeni bir araç eklemek için önce birini kaldır.", "Remove one tool to add another.", "Hiq një mjet për të shtuar një tjetër.")}</p>}
        <div className="home-shortcut-options">{tools.filter(tool => !draft.includes(tool.id)).map(tool => <button type="button" key={tool.id} disabled={draft.length >= HOME_SHORTCUT_LIMIT} onClick={() => choose(tool.id, true)}><TravelToolArtwork kind={tool.icon} size={32}/><span><strong>{tool.label}</strong><small>{tool.text}</small></span><Icon name="plus" size={18}/></button>)}</div>
      </details>
      {failed && <p className="home-shortcut-error" role="alert">{copy("Seçimin kaydedilemedi. Cihaz depolamasını kontrol edip yeniden dene.", "Your choice could not be saved. Check device storage and try again.", "Zgjedhja nuk u ruajt. Kontrollo hapësirën e pajisjes dhe provo sërish.")}</p>}
      <div className="home-shortcut-actions"><button type="button" onClick={() => { setDraft([...DEFAULT_HOME_SHORTCUTS]); setFailed(false); }}>{copy("Varsayılana dön", "Reset to default", "Rikthe parazgjedhjet")}</button><button type="button" disabled={draft.length === 0} onClick={() => { if (onSave(draft)) onClose(); else setFailed(true); }}>{copy("Kaydet", "Save", "Ruaj")}</button></div>
    </div>
  </Sheet>;
}
