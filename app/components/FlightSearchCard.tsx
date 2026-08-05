"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BellRing,
  Calendar,
  Flag,
  Globe2,
  MapPin,
  Plane,
  Search,
} from "lucide-react";
import { googleFlightsUrl } from "@/lib/affiliate";
import { GLOBAL_LOCATIONS, type LocationItem } from "@/lib/airports";
import PriceAlertForm from "./PriceAlertForm";
import styles from "./FlightSearchCard.module.css";

const defaultOrigin = GLOBAL_LOCATIONS.find((location) => location.code === "IST") || GLOBAL_LOCATIONS[2];
const defaultDestination = GLOBAL_LOCATIONS.find((location) => location.code === "DXB") || null;

export default function FlightSearchCard() {
  const [originObj, setOriginObj] = useState<LocationItem>(defaultOrigin);
  const [destinationObj, setDestinationObj] = useState<LocationItem | null>(defaultDestination);
  const [originSearch, setOriginSearch] = useState(defaultOrigin.name);
  const [destSearch, setDestSearch] = useState(defaultDestination?.name || "");
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [originResults, setOriginResults] = useState<LocationItem[]>(GLOBAL_LOCATIONS.slice(0, 8));
  const [destResults, setDestResults] = useState<LocationItem[]>(GLOBAL_LOCATIONS.slice(0, 8));
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [tripType, setTripType] = useState<"gidis_donus" | "tek">("gidis_donus");
  const [minDateStr, setMinDateStr] = useState("");
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date();
    setMinDateStr(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (originRef.current && !originRef.current.contains(event.target as Node)) {
        setIsOriginOpen(false);
        setOriginSearch(originObj.name);
      }
      if (destRef.current && !destRef.current.contains(event.target as Node)) {
        setIsDestOpen(false);
        setDestSearch(destinationObj?.name || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [originObj, destinationObj]);

  const fetchLocations = async (query: string, setter: (locations: LocationItem[]) => void) => {
    if (query.trim().length < 2) {
      setter(GLOBAL_LOCATIONS.slice(0, 8));
      return;
    }
    try {
      const response = await fetch(`/api/airports?q=${encodeURIComponent(query)}`);
      if (!response.ok) return;
      const data = await response.json();
      setter(Array.isArray(data) && data.length ? data : GLOBAL_LOCATIONS.slice(0, 8));
    } catch {
      setter(GLOBAL_LOCATIONS.slice(0, 8));
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isOriginOpen) void fetchLocations(originSearch, setOriginResults);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [originSearch, isOriginOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isDestOpen) void fetchLocations(destSearch, setDestResults);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [destSearch, isDestOpen]);

  const href = googleFlightsUrl({
    origin: originObj.code || "IST",
    destination: destinationObj?.code || "DXB",
    departDate,
    returnDate: tripType === "gidis_donus" ? returnDate : undefined,
  });

  const selectLocation = (location: LocationItem, type: "origin" | "destination") => {
    if (type === "origin") {
      setOriginObj(location);
      setOriginSearch(location.name);
      setIsOriginOpen(false);
    } else {
      setDestinationObj(location);
      setDestSearch(location.name);
      setIsDestOpen(false);
    }
  };

  const swapLocations = () => {
    if (!destinationObj) return;
    const previousOrigin = originObj;
    setOriginObj(destinationObj);
    setOriginSearch(destinationObj.name);
    setDestinationObj(previousOrigin);
    setDestSearch(previousOrigin.name);
  };

  const onDepartDateChange = (value: string) => {
    setDepartDate(value);
    if (returnDate && value && returnDate < value) setReturnDate("");
  };

  const renderResults = (results: LocationItem[], type: "origin" | "destination") => (
    <div className={styles.dropdown} role="listbox">
      {results.map((location) => (
        <button type="button" key={location.id} onClick={() => selectLocation(location, type)} className={styles.option}>
          <span className={styles.optionIcon}>
            {location.type === "country" ? <Flag size={18} /> : location.type === "anywhere" ? <Globe2 size={18} /> : <Plane size={18} />}
          </span>
          <span>
            <strong>{location.name}{location.code ? ` (${location.code})` : ""}</strong>
            <small>{location.countryName || (location.type === "anywhere" ? "Tüm destinasyonlar" : location.name)}</small>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.card}>
      <div className={styles.headingRow}>
        <div>
          <span className={styles.kicker}>Uçuş arama</span>
          <h2>Bir sonraki yolculuğun nereden başlasın?</h2>
        </div>
        <div className={styles.tripType} aria-label="Uçuş tipi">
          <button type="button" className={tripType === "gidis_donus" ? styles.active : ""} onClick={() => setTripType("gidis_donus")}>Gidiş-dönüş</button>
          <button type="button" className={tripType === "tek" ? styles.active : ""} onClick={() => setTripType("tek")}>Tek yön</button>
        </div>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.locationPair}>
          <div className={`${styles.field} ${styles.locationField}`} ref={originRef}>
            <label htmlFor="flight-origin"><MapPin size={15} /> Nereden</label>
            <input
              id="flight-origin"
              value={originSearch}
              onFocus={() => { setIsOriginOpen(true); setOriginSearch(""); }}
              onChange={(event) => { setOriginSearch(event.target.value); setIsOriginOpen(true); }}
              placeholder="Şehir veya havalimanı"
              autoComplete="off"
            />
            {isOriginOpen && renderResults(originResults, "origin")}
          </div>

          <button type="button" className={styles.swap} onClick={swapLocations} disabled={!destinationObj} aria-label="Kalkış ve varış yerlerini değiştir">
            <ArrowRightLeft size={18} />
          </button>

          <div className={`${styles.field} ${styles.locationField}`} ref={destRef}>
            <label htmlFor="flight-destination"><MapPin size={15} /> Nereye</label>
            <input
              id="flight-destination"
              value={destSearch}
              onFocus={() => { setIsDestOpen(true); setDestSearch(""); }}
              onChange={(event) => { setDestSearch(event.target.value); setIsDestOpen(true); }}
              placeholder="Şehir veya havalimanı"
              autoComplete="off"
            />
            {isDestOpen && renderResults(destResults, "destination")}
          </div>
        </div>

        <label className={styles.field} htmlFor="flight-departure">
          <span><Calendar size={15} /> Gidiş</span>
          <input id="flight-departure" type="date" value={departDate} min={minDateStr || undefined} onChange={(event) => onDepartDateChange(event.target.value)} />
        </label>

        {tripType === "gidis_donus" ? (
          <label className={styles.field} htmlFor="flight-return">
            <span><Calendar size={15} /> Dönüş</span>
            <input id="flight-return" type="date" value={returnDate} min={departDate || minDateStr || undefined} onChange={(event) => setReturnDate(event.target.value)} />
          </label>
        ) : (
          <button type="button" className={`${styles.field} ${styles.addReturn}`} onClick={() => setTripType("gidis_donus")}>
            <Calendar size={17} /> Dönüş tarihi ekle
          </button>
        )}

        <a href={href} target="_blank" rel="nofollow sponsored noreferrer" className={styles.submit}>
          <Search size={19} /> Uçuş ara
        </a>
      </div>

      <div className={styles.footer}>
        <p>Sonuçlar partner uçuş arama sayfasında açılır. Fiyatlar anlık olarak değişebilir.</p>
        {destinationObj && departDate && (
          <button type="button" className={styles.alertToggle} onClick={() => setIsAlertOpen((current) => !current)}>
            <BellRing size={16} /> {isAlertOpen ? "Alarm formunu kapat" : "Bu rota için fiyat alarmı kur"}
          </button>
        )}
      </div>

      {isAlertOpen && destinationObj && departDate && (
        <div className={styles.alertWrap}>
          <PriceAlertForm
            originCode={originObj.code || ""}
            originLabel={originObj.name}
            destinationCode={destinationObj.code || ""}
            destinationLabel={destinationObj.name}
            departureDate={departDate}
            onClose={() => setIsAlertOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
