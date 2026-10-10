import { useEffect, useId, useRef, useState } from "react";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { normalizeSearchText } from "../lib/searchText";
import { Icon } from "./Icon";
import { TravelToolArtwork, type TravelToolArtworkKind } from "./TravelToolArtwork";
import { BrandMark } from "./BrandMark";
import { LegalSheet, type LegalSlug } from "./LegalSheet";
import { Sheet } from "./Sheet";
import { SupportSheet } from "./SupportSheet";
import { AppearancePicker } from "./AppearancePicker";
import type { ViewId } from "../types";
import "./menu-artwork.css";

// Yasal metinler artık UYGULAMA İÇİNDE okunur (tarayıcıya yönlendirme yok).
export function MenuSheet({ open, onClose, online, onNavigate, onOpenAccount }: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  onNavigate: (view: ViewId) => void;
  onOpenAccount: () => void;
}) {
  const { locale, copy } = useI18n();
  const [legalSlug, setLegalSlug] = useState<LegalSlug | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const groups = [
    { id: "discover", label: copy("Keşfet", "Discover") },
    { id: "plan", label: copy("Yolculuğunu planla", "Plan your trip") },
    { id: "travel", label: copy("Yoldayken", "On your trip") },
  ] as const;
  const nativeLinks: Array<{ group: typeof groups[number]["id"]; label: string; text: string; keywords: string; icon: TravelToolArtworkKind; view: ViewId }> = [
    { group: "discover", label: copy("Ülke Gündemi", "Country Updates"), text: copy("Seyahat uyarıları, haberler ve önemli günler", "Travel advice, news and important dates"), keywords: "haber news hava weather", icon: "globe", view: "country-news" },
    { group: "plan", label: copy("Ülke Maliyetleri", "Country Costs"), text: copy("Şehir bazında tahmini bütçeler", "Estimated budgets by city"), keywords: "para money bütçe budget", icon: "money", view: "costs" },
    { group: "travel", label: copy("Havalimanı Rehberi", "Airport Guide"), text: copy("Havalimanı arama ve yolculuk hazırlığı", "Airport search and travel preparation"), keywords: "uçak uçuş flight aktarma transfer", icon: "flight", view: "airports" },
    { group: "discover", label: copy("Etkinlik Radarı", "Event Radar"), text: copy("Konser, festival, spor ve kültür", "Concerts, festivals, sport and culture"), keywords: "maç konser concert festival", icon: "events", view: "events" },
    { group: "travel", label: copy("Seyahat Asistanı", "Travel Assistant"), text: copy("Acil yardım, harita, çeviri ve yol araçları", "Emergency help, maps, translation and travel tools"), keywords: "çeviri çevir translate translation harita map çevrimdışı offline ulaşım transport para money kur currency konsolosluk consulate kayıtlı yer saved place", icon: "tools", view: "companion" },
    { group: "plan", label: copy("Pasaport Gücü", "Passport Power"), text: copy("Türkiye pasaportu için giriş koşulları", "Entry rules for a Turkish passport"), keywords: "vize visa pasaport passport", icon: "passport", view: "passport" },
    { group: "plan", label: copy("Rota Planla", "Plan a Route"), text: copy("Bütçene ve tercihlerine göre gezi oluştur", "Create a trip for your budget and interests"), keywords: "rota route plan", icon: "explore", view: "route" },
    { group: "travel", label: copy("Seyahat Kokpiti", "Travel Cockpit"), text: copy("Uçuşlarını, tarihlerini ve hazırlık listeni yönet", "Manage flights, dates and your checklist"), keywords: "uçak uçuş flight bilet ticket pnr seyahatlerim my trips", icon: "trips", view: "cockpit" },
    { group: "plan", label: copy("Fiyat Alarmı", "Price Alerts"), text: copy("Hedef fiyata düşünce haber al", "Know when the fare reaches your target"), keywords: "ucuz cheap bilet ticket uçuş flight", icon: "alerts", view: "alerts" },
    { group: "discover", label: copy("Topluluk", "Community"), text: copy("Gezginlere sor, deneyimlerini paylaş", "Ask travellers and share experiences"), keywords: "kaşif gezgin league traveller arkadaş friends soru question", icon: "community", view: "community" },
  ];
  const term = normalizeSearchText(query);
  const visibleLinks = nativeLinks.filter(link => !term || normalizeSearchText(`${link.label} ${link.text} ${link.keywords}`).includes(term));
  const legalSheets: Array<{ label: string; text: string; icon: TravelToolArtworkKind; slug: LegalSlug }> = [
    { label: copy("Gizlilik Politikası", "Privacy Policy"), text: copy("Veri kullanım bilgileri", "How data is used"), icon: "privacy", slug: "gizlilik-politikasi" },
    { label: copy("Kullanım Şartları", "Terms of Use"), text: copy("Hizmet koşulları", "Service terms"), icon: "guide", slug: "kullanim-sartlari" },
  ];

  const openNative = (view: ViewId) => {
    onClose();
    onNavigate(view);
  };

  return <Sheet open={open} title={copy("Daha Fazla", "More")} onClose={onClose} size="large">
    <div className="menu-profile-card">
      <div className="menu-brand"><BrandMark /></div>
      <p>{copy("Seyahat keşfi, planlama ve yol araçları tek uygulamada.", "Discovery, planning and on-trip tools in one app.")}</p>
      <div className={`connection-badge ${online ? "online" : "offline"}`}><Icon name={online ? "wifi" : "offline"} size={15} /> {online ? copy("İnternet bağlantısı var", "Online") : copy("Çevrimdışı mod", "Offline mode")}</div>
    </div>

    <AppearancePicker />

    <label className="sr-only" htmlFor={searchId}>{copy("Araç ara", "Search tools")}</label>
    <div className="search-input" style={{ marginTop: 16 }}><Icon name="search" size={18}/><input ref={searchInput} id={searchId} type="search" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} placeholder={copy("Harita, çeviri, uçuş…", "Maps, translation, flights…")}/>{query && <button type="button" className="icon-button compact" onClick={() => {setQuery("");searchInput.current?.focus();}} aria-label={copy("Aramayı temizle", "Clear search")}><Icon name="close" size={17}/></button>}</div>
    {term && <p className="visited-helper" role="status">{visibleLinks.length ? copy(`${visibleLinks.length} araç bulundu.`, `${visibleLinks.length} tools found.`, `U gjetën ${visibleLinks.length} mjete.`) : copy("Eşleşen araç bulunamadı. Başka bir kelime dene; destek seçenekleri aşağıda.", "No matching tools. Try another word; support options are below.")}</p>}
    {groups.map(group => {
      const links = visibleLinks.filter(link => link.group === group.id);
      return links.length ? <section key={group.id} aria-label={group.label}>
        <h3 className="menu-section-label">{group.label}</h3>
        <div className="menu-link-list feature-menu-links">{links.map(link => <button type="button" key={link.view} onClick={() => openNative(link.view)}><span><TravelToolArtwork kind={link.icon} size={56}/></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16}/></button>)}</div>
      </section> : null;
    })}

    <p className="menu-section-label">{copy("DESTEK VE HUKUKİ", "SUPPORT & LEGAL")}</p>
    <div className="menu-link-list compact-links feature-menu-links">
      {legalSheets.map((link) => <button key={link.slug} onClick={() => setLegalSlug(link.slug)}><span><TravelToolArtwork kind={link.icon} size={56} /></span><div><strong>{link.label}</strong><small>{link.text}</small></div><Icon name="chevron" size={16} /></button>)}
      <button onClick={() => { onClose(); onOpenAccount(); }}><span><TravelToolArtwork kind="privacy" size={56} /></span><div><strong>{copy("Hesap ve veri silme", "Account & data deletion")}</strong><small>{copy("Hesap bölümünden uygulama içinde talep et", "Request it inside the account section")}</small></div><Icon name="chevron" size={16} /></button>
      <button onClick={() => setSupportOpen(true)}><span><TravelToolArtwork kind="support" size={56} /></span><div><strong>{copy("Destek", "Support")}</strong><small>{config.supportEmail}</small></div><Icon name="chevron" size={16} /></button>
    </div>

    <p className="version-note">LetsGo2Travel {config.appVersion} · Build {config.buildNumber} · {locale.toUpperCase()}</p>

    {legalSlug && <LegalSheet open={Boolean(legalSlug)} slug={legalSlug} onClose={() => setLegalSlug(null)} />}
    <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
  </Sheet>;
}
