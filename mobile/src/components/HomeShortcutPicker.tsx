import { useState } from "react";
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
  const tools = appTools(locale);
  const move = (index: number, direction: number) => setDraft(current => {
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
      <p>{copy("En fazla 5 kısayol seç ve sırala. Seçimin bu cihazda saklanır.", "Choose and order up to 5 shortcuts. Your choice is saved on this device.", "Zgjidh dhe rendit deri në 5 shkurtore. Zgjedhja ruhet në këtë pajisje.")}</p>
      <ol aria-label={copy("Kısayol sırası", "Shortcut order", "Rendi i shkurtoreve")}>{draft.map((id, index) => {
        const tool = tools.find(item => item.id === id);
        if (!tool) return null;
        return <li key={id}><span>{index + 1}. {tool.label}</span><button type="button" disabled={index === 0} aria-label={copy(`${tool.label} önceye taşı`, `Move ${tool.label} earlier`, `Zhvendos ${tool.label} më përpara`)} onClick={() => move(index, -1)}><Icon name="back" size={18}/></button><button type="button" disabled={index === draft.length - 1} aria-label={copy(`${tool.label} sonraya taşı`, `Move ${tool.label} later`, `Zhvendos ${tool.label} më pas`)} onClick={() => move(index, 1)}><Icon name="chevron" size={18}/></button></li>;
      })}</ol>
      <p className="home-shortcut-count" role="status">{copy(`${draft.length}/5 seçildi`, `${draft.length}/5 selected`, `${draft.length}/5 të zgjedhura`)}</p>
      <div className="home-shortcut-options">{tools.map(tool => <label key={tool.id}><input type="checkbox" checked={draft.includes(tool.id)} disabled={!draft.includes(tool.id) && draft.length >= HOME_SHORTCUT_LIMIT} onChange={event => choose(tool.id, event.target.checked)}/><TravelToolArtwork kind={tool.icon} size={40}/><span><strong>{tool.label}</strong><small>{tool.text}</small></span></label>)}</div>
      {failed && <p className="home-shortcut-error" role="alert">{copy("Seçimin kaydedilemedi. Cihaz depolamasını kontrol edip yeniden dene.", "Your choice could not be saved. Check device storage and try again.", "Zgjedhja nuk u ruajt. Kontrollo hapësirën e pajisjes dhe provo sërish.")}</p>}
      <div className="home-shortcut-actions"><button type="button" onClick={() => { setDraft([...DEFAULT_HOME_SHORTCUTS]); setFailed(false); }}>{copy("Varsayılana dön", "Reset to default", "Rikthe parazgjedhjet")}</button><button type="button" disabled={draft.length === 0} onClick={() => { if (onSave(draft)) onClose(); else setFailed(true); }}>{copy("Kaydet", "Save", "Ruaj")}</button></div>
    </div>
  </Sheet>;
}
