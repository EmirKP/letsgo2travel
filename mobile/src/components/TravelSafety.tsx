import { useState } from 'react';
import { emergencyContacts, dialUrl } from '../../../lib/travel-assistant/emergency';
import { embassiesFor, MISSION_DIRECTORIES } from '../../../lib/travel-assistant/guides';
import type { EmergencyCategory, Evidence } from '../../../lib/travel-assistant/types';
import { useI18n } from '../lib/i18n';
import { openExternal, shareContent } from '../lib/native';
import { directionsUrl, locateForTravel } from '../lib/travelAssistant';
import { Icon } from './Icon';

export function EvidenceLine({ item }: { item: Evidence }) {
  const { copy } = useI18n();
  return <small className="ta-evidence"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); void openExternal(item.sourceUrl); }}>{copy('Resmî kaynak', 'Official source')}</a> · {copy('Kontrol', 'Checked')}: {item.verifiedAt}</small>;
}
const serviceLabels: Record<EmergencyCategory, [string,string]> = {
  general:['Genel acil','Emergency'], police:['Polis','Police'], ambulance:['Ambulans','Ambulance'], fire:['İtfaiye','Fire'],
  'tourist-police':['Turist polisi','Tourist police'], coastguard:['Sahil güvenlik','Coastguard'],
};
export function TravelSafety({ country, onOpen, onNotice }: {
  country: string; onOpen: (tool: 'needs'|'embassies'|'phrases') => void; onNotice: (message:string) => void;
}) {
  const { copy, locale } = useI18n();
  const [sharing, setSharing] = useState(false);
  const contacts = emergencyContacts(country);
  async function share() {
    setSharing(true);
    try {
      const c = await locateForTravel();
      const ok = await shareContent({ title: copy('Yaklaşık konumum', 'My approximate location'),
        text: copy('Yaklaşık konumum (~1 km):', 'My approximate location (~1 km):'),
        url: `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}` });
      onNotice(ok ? copy('Paylaşım penceresi açıldı veya bağlantı kopyalandı.', 'Share sheet opened or link copied.') : copy('Paylaşım tamamlanmadı.', 'Sharing was not completed.'));
    } catch { onNotice(copy('Konum alınamadı. İzni ve cihaz konum ayarını kontrol et.', 'Location unavailable. Check permission and device location settings.')); }
    finally { setSharing(false); }
  }
  return <section className="ta-panel">
    <div className="ta-emergency-heading"><Icon name="shield" size={28}/><div><h3>{copy('Acil Mod', 'Emergency mode')}</h3><p>{copy('Resmî acil servis değiliz. Hayati tehlikede yerel acil hattı ara.', 'We are not an emergency service. Call local emergency services in immediate danger.')}</p></div></div>
    {!contacts.length && <p role="status" className="ta-empty">{copy('Bu ülke için doğrulanmış numara henüz yok. Genel bir numara varsaymıyoruz; yerel resmî kaynağa başvur.', 'Verified numbers are not yet available for this country. No universal number is assumed; consult local official guidance.')}</p>}
    <div className="ta-call-grid">{contacts.map(c => <article key={c.category}>
      <a href={dialUrl(c.number) || undefined} aria-label={`${serviceLabels[c.category][locale === 'tr' ? 0 : 1]} ${c.number}`}><span>{serviceLabels[c.category][locale === 'tr' ? 0 : 1]}</span><strong>{c.number}</strong><small>{copy('Ara', 'Call')}</small></a>
      {c.note && <small>{c.note[locale]}</small>}
    </article>)}</div>
    {contacts[0] && <EvidenceLine item={contacts[0]}/>}
    <p className="ta-muted">{copy('Numaralar internetsiz görüntülenir; arama için telefon hizmeti gerekir.', 'Numbers can be viewed offline; calls require telephone service.')}</p>
    <div className="ta-actions"><button type="button" onClick={() => onOpen('needs')}>{copy('Yakın hastane, eczane ve polis', 'Nearby hospital, pharmacy and police')}</button><button type="button" onClick={() => onOpen('embassies')}>{copy('Konsolosluğum', 'My consulate')}</button><button type="button" onClick={() => onOpen('phrases')}>{copy('Acil durum ifadeleri', 'Emergency phrases')}</button></div>
    <p className="ta-muted">{copy('Paylaş dediğinde yaklaşık konum istenir. Konum geçmişi tutmayız; kime göndereceğini sen seçersin.', 'Sharing requests approximate location. We keep no location history; you choose the recipient.')}</p>
    <button className="secondary-wide" type="button" disabled={sharing} onClick={() => void share()}><Icon name="share" size={18}/>{sharing ? copy('Konum alınıyor…','Getting location…') : copy('Yaklaşık konumumu paylaş','Share my approximate location')}</button>
  </section>;
}
export function EmbassyCards({ country, citizenship }: {country:string; citizenship:string}) {
  const { copy, locale } = useI18n();
  const rows = embassiesFor(citizenship, country);
  return <section className="ta-panel"><h3>{copy('Konsolosluk ve büyükelçilik', 'Consulates and embassies')}</h3>
    <p className="ta-muted">{copy('Kayıtlı kartlar çevrimdışı açılır. Bu liste tüm temsilcilikleri kapsamaz; konsolosluk işlemi için yetki alanını ve randevuyu doğrula.', 'Saved cards open offline. This list is not exhaustive; confirm jurisdiction and appointments for consular services.')}</p>
    {!rows.length && <p className="ta-empty" role="status">{copy('Seçtiğin vatandaşlık ve ülke için doğrulanmış çevrimdışı kart henüz yok.', 'No verified offline card for this citizenship and destination yet.')}</p>}
    {rows.map(e => <article className="ta-card" key={e.id}><h4>{e.name[locale]}</h4><p>{e.address}</p><p>{e.hours?.[locale] || copy('Çalışma saatleri doğrulanmadı; resmî sayfaya bak.', 'Hours not verified; check the official page.')}</p>
      <div className="ta-actions"><a href={dialUrl(e.phone) || undefined}>{copy('Telefon','Phone')}: {e.phone}</a>{e.emergencyPhone && <a href={dialUrl(e.emergencyPhone) || undefined}>{copy('Acil telefon','Emergency phone')}: {e.emergencyPhone}</a>}
      <button type="button" onClick={() => void openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`)}>{copy('Haritada göster','Show on map')}</button>
      <button type="button" onClick={() => void openExternal(directionsUrl(e.address))}>{copy('Yol tarifi','Directions')}</button></div>
      {!e.emergencyPhone && <small>{copy('Ayrı acil telefon doğrulanmadı.', 'Separate emergency phone not verified.')}</small>}<EvidenceLine item={e}/></article>)}
    {MISSION_DIRECTORIES[citizenship] && <button className="secondary-wide" type="button" onClick={() => void openExternal(MISSION_DIRECTORIES[citizenship])}>{copy('Resmî temsilcilik dizini','Official mission directory')}<Icon name="external" size={16}/></button>}
  </section>;
}
