import { COUNTRY_LIST } from '../data/countries';
import { alpha2FromAlpha3 } from '../data/countryIso';
import { useI18n } from '../lib/i18n';
import { CountryPicker } from './CountryPicker';
import { EmbassyCards } from './TravelSafety';
import { Icon } from './Icon';
import './travel-map-embassies.css';

export function TravelMapEmbassies({ country, citizenship, open, onOpenChange, onCountryChange, onCitizenshipChange, onShowMap, onDirections }: {
  country:string; citizenship:string; open:boolean;
  onOpenChange:(open:boolean)=>void; onCountryChange:(country:string)=>void; onCitizenshipChange:(country:string)=>void;
  onShowMap:(address:string)=>void; onDirections:(address:string)=>void;
}) {
  const { copy, countryName } = useI18n();
  const options = COUNTRY_LIST.flatMap(item => {
    const code=alpha2FromAlpha3(item.alpha3);
    return code ? [{code,name:countryName(item.alpha3,item.name)}] : [];
  });
  return <details className="ume-panel" open={open} onToggle={event=>onOpenChange(event.currentTarget.open)}>
    <summary><Icon name="globe" size={18}/><span>{copy('Konsolosluk ve büyükelçilik','Consulates and embassies','Konsullatat dhe ambasadat')}</span></summary>
    <div className="ume-content">
      <div className="ume-selectors">
        <CountryPicker value={country} options={options} onChange={onCountryChange} label={copy('Bulunduğun ülke','Destination country','Shteti ku ndodhesh')} placeholder={copy('Ülke seç','Choose country','Zgjidh shtetin')}/>
        <CountryPicker value={citizenship} options={options} onChange={onCitizenshipChange} label={copy('Vatandaşlığın','Your citizenship','Shtetësia jote')} placeholder={copy('Vatandaşlık seç','Choose citizenship','Zgjidh shtetësinë')}/>
      </div>
      <p className="ume-context">{copy('Resmî iletişim kartları çevrimdışı da açılır. Harita ve yol tarifi için adres sonucunu seçerek devam et.','Official contact cards also open offline. For the map or directions, select the matching address result.','Kartat zyrtare të kontaktit hapen edhe pa internet. Për hartën ose udhëzimet, zgjidh rezultatin që përputhet me adresën.')}</p>
      {country&&citizenship ? <div className="ume-cards"><EmbassyCards country={country} citizenship={citizenship} onShowMap={onShowMap} onDirections={onDirections}/></div>
        : <p className="ume-choice-hint">{copy('İletişim bilgileri için ülke ve vatandaşlık seç.','Choose a country and citizenship to see contact details.','Zgjidh shtetin dhe shtetësinë për të parë kontaktet.')}</p>}
    </div>
  </details>;
}
