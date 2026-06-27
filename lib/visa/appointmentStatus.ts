export type AppointmentStatus = 'bilgi_yok' | 'yakin_tarih_zor' | 'ara_ara_bosluk_var' | 'yakin_tarih_bulundu' | 'manuel_kontrol_edildi';

export const APPOINTMENT_STATUS_INFO: Record<AppointmentStatus, { label: string; cssClass: string }> = {
  bilgi_yok: { label: 'Bilgi Yok', cssClass: 'l2t-apt-bilgiyok' },
  yakin_tarih_zor: { label: 'Yakın Tarih Zor', cssClass: 'l2t-apt-zor' },
  ara_ara_bosluk_var: { label: 'Ara Ara Boşluk Var', cssClass: 'l2t-apt-araara' },
  yakin_tarih_bulundu: { label: 'Yakın Tarih Bulundu', cssClass: 'l2t-apt-bulundu' },
  manuel_kontrol_edildi: { label: 'Manuel Kontrol Edildi', cssClass: 'l2t-apt-manuel' }
};
