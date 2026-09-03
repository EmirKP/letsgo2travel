import type { GuestDataCounts } from "../lib/guestData";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import "./GuestDataImportSheet.css";

export function GuestDataImportSheet({
  open,
  summary,
  busy = false,
  onClose,
  onImport,
  onKeepSeparate,
}: {
  open: boolean;
  summary: GuestDataCounts;
  busy?: boolean;
  onClose: () => void;
  onImport: () => void;
  onKeepSeparate: () => void;
}) {
  const rows = [
    { key: "routes", icon: "route" as const, count: summary.routes, label: "kayıtlı rota" },
    { key: "favorites", icon: "heart" as const, count: summary.favorites, label: "favori ülke" },
    { key: "visited", icon: "flag" as const, count: summary.visitedCountries, label: "ziyaret edilen ülke" },
  ].filter((row) => row.count > 0);

  return (
    <Sheet open={open} title="Misafir kayıtlarını aktar" onClose={busy ? () => undefined : onClose}>
      <div className="guest-import" aria-describedby="guest-import-description">
        <span className="guest-import-hero" aria-hidden="true"><Icon name="user" size={28} /></span>
        <div className="guest-import-copy">
          <h3>Giriş yapmadan önce oluşturduğun kayıtları bulduk</h3>
          <p id="guest-import-description">
            İstersen bu kayıtları hesabına ekleyelim. Bu telefondaki misafir kopyaları silinmeyecek.
          </p>
        </div>

        <ul className="guest-import-summary" aria-label="Aktarılabilecek misafir kayıtları">
          {rows.map((row) => (
            <li key={row.key}>
              <span aria-hidden="true"><Icon name={row.icon} size={19} /></span>
              <strong>{row.count}</strong>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>

        <div className="guest-import-note" role="note">
          <Icon name="shield" size={18} />
          <span>Hesabındaki mevcut kayıtların üzerine yazılmaz. Aynı kayıt ikinci kez eklenmez.</span>
        </div>

        <div className="guest-import-actions" aria-busy={busy}>
          <button className="secondary-wide" type="button" disabled={busy} onClick={onKeepSeparate} aria-label="Misafir kayıtlarını bu hesaptan ayrı tut">
            Ayrı tut
          </button>
          <button className="primary-wide" type="button" disabled={busy} onClick={onImport} data-autofocus aria-label={`${summary.total} misafir kaydını hesabıma ekle`}>
            {busy ? <span className="button-loader" aria-hidden="true" /> : <Icon name="check" size={18} />}
            {busy ? "Ekleniyor…" : "Hesabıma ekle"}
          </button>
        </div>
        <p className="guest-import-choice">Bu seçim yalnızca giriş yaptığın hesap için hatırlanır.</p>
        <span className="sr-only" aria-live="polite">{busy ? "Misafir kayıtları hesabına ekleniyor." : ""}</span>
      </div>
    </Sheet>
  );
}
