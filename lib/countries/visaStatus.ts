import { VisaStatus } from './countryData';

export const VISA_STATUS_INFO: Record<VisaStatus, { label: string; cssClass: string }> = {
  kimlikle: { label: 'Kimlikle Seyahat', cssClass: 'l2t-visa-kimlikle' },
  vizesiz: { label: 'Vizesiz', cssClass: 'l2t-visa-vizesiz' },
  e_vize: { label: 'E-Vize', cssClass: 'l2t-visa-evize' },
  kapida_vize: { label: 'Kapıda Vize', cssClass: 'l2t-visa-kapida' },
  vize_gerekli: { label: 'Vize Gerekli', cssClass: 'l2t-visa-gerekli' },
  bilgi_yok: { label: 'Bilgi Yok', cssClass: 'l2t-visa-bilgiyok' }
};
