import { useEffect, useMemo, useState } from "react";
import { AirportAutocomplete } from "../components/AirportAutocomplete";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { createFlightAlert, getFlightSearchUrl } from "../lib/api";
import { hapticSuccess, openExternal } from "../lib/native";
import { createId } from "../lib/id";
import { saveFlightSearch } from "../lib/storage";
import type { AuthUser, FlightSearchInput } from "../types";

function isoDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const INITIAL: FlightSearchInput = {
  originCode: "IST",
  originLabel: "İstanbul, Türkiye (IST)",
  destinationCode: "DXB",
  destinationLabel: "Dubai, Birleşik Arap Emirlikleri (DXB)",
  departureDate: isoDate(14),
  returnDate: isoDate(21),
  tripType: "round_trip",
  adults: 1,
  cabinClass: "economy",
};

export function FlightSearchScreen({ prefillDestination, user, accessToken, onNotice, onOpenAccount }: {
  prefillDestination?: { code: string; label: string } | null;
  user: AuthUser | null;
  accessToken: string;
  onNotice: (message: string) => void;
  onOpenAccount: () => void;
}) {
  const [form, setForm] = useState<FlightSearchInput>(INITIAL);
  const [searching, setSearching] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertEmail, setAlertEmail] = useState(user?.email || "");
  const [targetPrice, setTargetPrice] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  useEffect(() => {
    if (prefillDestination?.code) {
      setForm((current) => ({ ...current, destinationCode: prefillDestination.code, destinationLabel: prefillDestination.label }));
      setResultUrl("");
    }
  }, [prefillDestination]);

  useEffect(() => {
    setAlertEmail(user?.email || "");
  }, [user?.email, user?.id]);

  const error = useMemo(() => {
    if (!form.originCode || !form.destinationCode) return "Kalkış ve varış havalimanını listeden seç.";
    if (form.originCode === form.destinationCode) return "Kalkış ve varış farklı olmalı.";
    if (!form.departureDate) return "Gidiş tarihini seç.";
    if (form.departureDate < isoDate(0)) return "Gidiş tarihi geçmiş olamaz.";
    if (form.tripType === "round_trip" && (!form.returnDate || form.returnDate < form.departureDate)) return "Dönüş tarihi gidişten önce olamaz.";
    return "";
  }, [form]);

  const swap = () => {
    setForm((current) => ({
      ...current,
      originCode: current.destinationCode,
      originLabel: current.destinationLabel,
      destinationCode: current.originCode,
      destinationLabel: current.originLabel,
    }));
    setResultUrl("");
  };

  const search = async () => {
    if (error) return onNotice(error);
    setSearching(true);
    setResultUrl("");
    try {
      const result = await getFlightSearchUrl(form);
      setResultUrl(result.url);
      saveFlightSearch({ ...form, id: createId(), createdAt: new Date().toISOString(), resultUrl: result.url }, user?.id);
      await hapticSuccess();
      onNotice("Uçuş araması hazırlandı ve Seyahatlerim'e kaydedildi.");
    } catch (requestError) {
      onNotice(requestError instanceof Error ? requestError.message : "Uçuş araması hazırlanamadı.");
    } finally {
      setSearching(false);
    }
  };

  const createAlert = async () => {
    if (error) return onNotice(error);
    if (!/^\S+@\S+\.\S+$/.test(alertEmail)) return onNotice("Geçerli bir e-posta adresi yaz.");
    setCreatingAlert(true);
    try {
      const result = await createFlightAlert({
        ...form,
        email: alertEmail.trim(),
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        thresholdPercent: 5,
      }, accessToken || undefined);
      setAlertOpen(false);
      await hapticSuccess();
      onNotice(result.message || "Fiyat alarmı kuruldu.");
    } catch (requestError) {
      onNotice(requestError instanceof Error ? requestError.message : "Fiyat alarmı kurulamadı.");
    } finally {
      setCreatingAlert(false);
    }
  };

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plane" size={27} /></span>
        <div><small>UÇUŞ KEŞFİ</small><h1>Bilet Ara</h1><p>Rotanı seç; uçuş sonuçlarını güvenli dış bağlantıda aç.</p></div>
      </section>

      <section className="form-card flight-form">
        <div className="segmented">
          <button className={form.tripType === "round_trip" ? "active" : ""} onClick={() => setForm({ ...form, tripType: "round_trip" })}>Gidiş–dönüş</button>
          <button className={form.tripType === "one_way" ? "active" : ""} onClick={() => setForm({ ...form, tripType: "one_way", returnDate: "" })}>Tek yön</button>
        </div>

        <div className="airport-pair">
          <AirportAutocomplete label="Nereden?" placeholder="Şehir veya havalimanı" value={{ code: form.originCode, label: form.originLabel }} onChange={(value) => { setForm({ ...form, originCode: value.code, originLabel: value.label }); setResultUrl(""); }} />
          <button className="swap-button" onClick={swap} aria-label="Kalkış ve varışı değiştir"><Icon name="swap" size={19} /></button>
          <AirportAutocomplete label="Nereye?" placeholder="Şehir veya havalimanı" value={{ code: form.destinationCode, label: form.destinationLabel }} onChange={(value) => { setForm({ ...form, destinationCode: value.code, destinationLabel: value.label }); setResultUrl(""); }} />
        </div>

        <div className="form-grid two">
          <label>Gidiş<input type="date" min={isoDate(0)} value={form.departureDate} onChange={(event) => { setForm({ ...form, departureDate: event.target.value }); setResultUrl(""); }} /></label>
          <label className={form.tripType === "one_way" ? "disabled-field" : ""}>Dönüş<input type="date" disabled={form.tripType === "one_way"} min={form.departureDate || isoDate(0)} value={form.returnDate} onChange={(event) => { setForm({ ...form, returnDate: event.target.value }); setResultUrl(""); }} /></label>
        </div>

        <div className="form-grid two">
          <label>Yolcu<select value={form.adults} onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })}>{[1,2,3,4,5,6].map((count) => <option key={count} value={count}>{count} yetişkin</option>)}</select></label>
          <label>Kabin<select value={form.cabinClass} onChange={(event) => setForm({ ...form, cabinClass: event.target.value as FlightSearchInput["cabinClass"] })}><option value="economy">Ekonomi</option><option value="business">Business</option></select></label>
        </div>

        {error && <div className="inline-validation"><Icon name="info" size={16} /> {error}</div>}
        <button className="primary-wide" disabled={searching || Boolean(error)} onClick={() => void search()}>{searching ? <span className="button-loader" /> : <Icon name="search" size={19} />} {searching ? "Arama hazırlanıyor" : "Uçuşları ara"}</button>
      </section>

      {resultUrl && <section className="result-card success-result">
        <span><Icon name="check" size={24} /></span>
        <div><small>ARAMA HAZIR</small><strong>{form.originCode} → {form.destinationCode}</strong><p>Sonuçlar iş ortağı sayfasında açılacak. Fiyat ve müsaitlik dış sayfada kesinleşir.</p></div>
        <button className="primary-wide" onClick={() => void openExternal(resultUrl)}><Icon name="external" size={18} /> Sonuçları aç</button>
        <button className="secondary-wide" onClick={() => setAlertOpen(true)}><Icon name="bell" size={18} /> Fiyat alarmı kur</button>
      </section>}

      {!resultUrl && <section className="tip-card"><Icon name="bell" size={22} /><div><strong>Fiyatı hemen almak zorunda değilsin</strong><p>Önce aramayı oluştur, sonra hedef fiyat veya yüzde düşüş alarmı kur.</p></div></section>}

      <Sheet open={alertOpen} title="Fiyat alarmı kur" onClose={() => setAlertOpen(false)}>
        <div className="alert-form">
          <div className="route-summary"><strong>{form.originCode} → {form.destinationCode}</strong><span>{form.departureDate}{form.tripType === "round_trip" ? ` – ${form.returnDate}` : ""}</span></div>
          <label>E-posta<input type="email" value={alertEmail} readOnly={Boolean(user)} onChange={(event) => setAlertEmail(event.target.value)} placeholder="ornek@mail.com" /></label>
          <label>Hedef fiyat (isteğe bağlı)<div className="suffix-input"><input inputMode="numeric" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value.replace(/\D/g, ""))} placeholder="Örn. 8500" /><span>TL</span></div></label>
          {!user && <button className="account-nudge" onClick={onOpenAccount}><Icon name="user" size={18} /><span><strong>Hesapla giriş yap</strong><small>Alarmını uygulama içinde de yönetebilirsin.</small></span><Icon name="chevron" size={17} /></button>}
          <button className="primary-wide" disabled={creatingAlert} onClick={() => void createAlert()}>{creatingAlert ? <span className="button-loader" /> : <Icon name="bell" size={18} />} {creatingAlert ? "Kuruluyor" : "Alarmı etkinleştir"}</button>
          <p className="legal-note">Alarm, mevcut backend ve e-posta servisinin çalışmasına bağlıdır. Fiyat garantisi vermez.</p>
        </div>
      </Sheet>
    </div>
  );
}
