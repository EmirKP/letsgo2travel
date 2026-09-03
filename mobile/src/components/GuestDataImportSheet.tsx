import type { GuestDataCounts } from "../lib/guestData";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import "./GuestDataImportSheet.css";
import { useI18n } from "../lib/i18n";

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
  const { copy } = useI18n();
  const rows = [
    { key: "routes", icon: "route" as const, count: summary.routes, label: copy("kayıtlı rota", "saved routes") },
    { key: "favorites", icon: "heart" as const, count: summary.favorites, label: copy("favori ülke", "favourite countries") },
    { key: "visited", icon: "flag" as const, count: summary.visitedCountries, label: copy("ziyaret edilen ülke", "visited countries") },
  ].filter((row) => row.count > 0);

  return (
    <Sheet open={open} title={copy("Misafir kayıtlarını aktar", "Import guest items")} onClose={busy ? () => undefined : onClose}>
      <div className="guest-import" aria-describedby="guest-import-description">
        <span className="guest-import-hero" aria-hidden="true"><Icon name="user" size={28} /></span>
        <div className="guest-import-copy">
          <h3>{copy("Giriş yapmadan önce oluşturduğun kayıtları bulduk", "We found items you created before signing in")}</h3>
          <p id="guest-import-description">
            {copy("İstersen bu kayıtları hesabına ekleyelim. Bu telefondaki misafir kopyaları silinmeyecek.", "You can add them to your account. Guest copies on this phone will not be deleted.")}
          </p>
        </div>

        <ul className="guest-import-summary" aria-label={copy("Aktarılabilecek misafir kayıtları", "Guest items available to import")}>
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
          <span>{copy("Hesabındaki mevcut kayıtların üzerine yazılmaz. Aynı kayıt ikinci kez eklenmez.", "Existing account data will not be overwritten and duplicates will not be added.")}</span>
        </div>

        <div className="guest-import-actions" aria-busy={busy}>
          <button className="secondary-wide" type="button" disabled={busy} onClick={onKeepSeparate} aria-label={copy("Misafir kayıtlarını bu hesaptan ayrı tut", "Keep guest items separate from this account")}>
            {copy("Ayrı tut", "Keep separate")}
          </button>
          <button className="primary-wide" type="button" disabled={busy} onClick={onImport} data-autofocus aria-label={copy(`${summary.total} misafir kaydını hesabıma ekle`, `Add ${summary.total} guest items to my account`)}>
            {busy ? <span className="button-loader" aria-hidden="true" /> : <Icon name="check" size={18} />}
            {busy ? copy("Ekleniyor…", "Adding…") : copy("Hesabıma ekle", "Add to my account")}
          </button>
        </div>
        <p className="guest-import-choice">{copy("Bu seçim yalnızca giriş yaptığın hesap için hatırlanır.", "This choice is remembered only for the account you signed into.")}</p>
        <span className="sr-only" aria-live="polite">{busy ? copy("Misafir kayıtları hesabına ekleniyor.", "Adding guest items to your account.") : ""}</span>
      </div>
    </Sheet>
  );
}
