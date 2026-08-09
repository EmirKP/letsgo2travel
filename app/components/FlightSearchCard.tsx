"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
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
import { GLOBAL_LOCATIONS, type LocationItem } from "@/lib/airports";
import PriceAlertForm from "./PriceAlertForm";
import styles from "./FlightSearchCard.module.css";

const defaultOrigin = GLOBAL_LOCATIONS.find((location) => location.code === "IST") || GLOBAL_LOCATIONS[2];
const defaultDestination = GLOBAL_LOCATIONS.find((location) => location.code === "DXB") || null;
const localFlightLocations = GLOBAL_LOCATIONS.filter((location) => location.type === "city" && /^[A-Z0-9]{3}$/.test(location.code));

function normalizedText(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
}

function localMatches(query: string) {
  const normalized = normalizedText(query.trim());
  if (normalized.length < 2) return localFlightLocations.slice(0, 8);
  return localFlightLocations.filter((location) => (
    normalizedText(location.name).includes(normalized)
    || normalizedText(location.countryName || "").includes(normalized)
    || location.code.toLocaleLowerCase("tr-TR").startsWith(normalized)
  )).slice(0, 12);
}

export default function FlightSearchCard() {
  const [originObj, setOriginObj] = useState<LocationItem | null>(defaultOrigin);
  const [destinationObj, setDestinationObj] = useState<LocationItem | null>(defaultDestination);
  const [originSearch, setOriginSearch] = useState(defaultOrigin.name);
  const [destSearch, setDestSearch] = useState(defaultDestination?.name || "");
  const [isOriginOpen, setIsOriginOpen] = useState(false);
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [originResults, setOriginResults] = useState<LocationItem[]>(localFlightLocations.slice(0, 8));
  const [destResults, setDestResults] = useState<LocationItem[]>(localFlightLocations.slice(0, 8));
  const [originActiveIndex, setOriginActiveIndex] = useState(-1);
  const [destActiveIndex, setDestActiveIndex] = useState(-1);
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
        setOriginSearch(originObj?.name || "");
        setOriginActiveIndex(-1);
      }
      if (destRef.current && !destRef.current.contains(event.target as Node)) {
        setIsDestOpen(false);
        setDestSearch(destinationObj?.name || "");
        setDestActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [originObj, destinationObj]);

  const fetchLocations = async (query: string, setter: (locations: LocationItem[]) => void) => {
    if (query.trim().length < 2) {
      setter(localFlightLocations.slice(0, 8));
      return;
    }
    try {
      const response = await fetch(`/api/airports?q=${encodeURIComponent(query)}`);
      if (!response.ok) return;
      const data = await response.json();
      setter(Array.isArray(data) ? data : localMatches(query));
    } catch {
      setter(localMatches(query));
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

  const validSearch = Boolean(
    originObj?.code
    && destinationObj?.code
    && originObj.code !== destinationObj.code
    && departDate
    && (tripType === "tek" || returnDate),
  );
  const searchParams = new URLSearchParams();
  if (originObj?.code) searchParams.set("origin", originObj.code);
  if (destinationObj?.code) searchParams.set("destination", destinationObj.code);
  searchParams.set("tripType", tripType === "gidis_donus" ? "round_trip" : "one_way");
  if (departDate) searchParams.set("departureDate", departDate);
  if (tripType === "gidis_donus" && returnDate) searchParams.set("returnDate", returnDate);
  const href = `/ucak-bileti-ara?${searchParams.toString()}`;

  const selectLocation = (location: LocationItem, type: "origin" | "destination") => {
    if (type === "origin") {
      setOriginObj(location);
      setOriginSearch(location.name);
      setIsOriginOpen(false);
      setOriginActiveIndex(-1);
    } else {
      setDestinationObj(location);
      setDestSearch(location.name);
      setIsDestOpen(false);
      setDestActiveIndex(-1);
    }
  };

  const swapLocations = () => {
    if (!originObj || !destinationObj) return;
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

  const onLocationKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    type: "origin" | "destination",
    results: LocationItem[],
    activeIndex: number,
    setActiveIndex: (value: number) => void,
  ) => {
    if (event.key === "Escape") {
      if (type === "origin") {
        setIsOriginOpen(false);
        setOriginSearch(originObj?.name || "");
      } else {
        setIsDestOpen(false);
        setDestSearch(destinationObj?.name || "");
      }
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (type === "origin") setIsOriginOpen(true);
      else setIsDestOpen(true);
      if (!results.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex < 0
        ? (direction > 0 ? 0 : Math.max(0, results.length - 1))
        : Math.max(0, Math.min(results.length - 1, activeIndex + direction));
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      selectLocation(results[activeIndex], type);
    }
  };

  const renderResults = (results: LocationItem[], type: "origin" | "destination", activeIndex: number, setActiveIndex: (value: number) => void) => (
    <div className={styles.dropdown} role="listbox" id={`flight-${type}-options`}>
      {results.length === 0 && <p className={styles.noOption} role="status">Eşleşen havalimanı bulunamadı.</p>}
      {results.map((location, index) => (
        <button type="button" role="option" aria-selected={activeIndex === index} id={`flight-${type}-option-${index}`} key={location.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectLocation(location, type)} className={`${styles.option} ${activeIndex === index ? styles.optionActive : ""}`}>
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
        <div className={styles.tripType} role="group" aria-label="Uçuş tipi">
          <button type="button" aria-pressed={tripType === "gidis_donus"} className={tripType === "gidis_donus" ? styles.active : ""} onClick={() => setTripType("gidis_donus")}>Gidiş-dönüş</button>
          <button type="button" aria-pressed={tripType === "tek"} className={tripType === "tek" ? styles.active : ""} onClick={() => setTripType("tek")}>Tek yön</button>
        </div>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.locationPair}>
          <div className={`${styles.field} ${styles.locationField}`} ref={originRef}>
            <label htmlFor="flight-origin"><MapPin size={15} /> Nereden</label>
            <input
              id="flight-origin"
              value={originSearch}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOriginOpen}
              aria-controls="flight-origin-options"
              aria-activedescendant={originActiveIndex >= 0 ? `flight-origin-option-${originActiveIndex}` : undefined}
              onFocus={(event) => { setIsOriginOpen(true); setOriginActiveIndex(-1); event.currentTarget.select(); }}
              onKeyDown={(event) => onLocationKeyDown(event, "origin", originResults, originActiveIndex, setOriginActiveIndex)}
              onChange={(event) => { setOriginSearch(event.target.value); setOriginObj(null); setIsOriginOpen(true); setOriginActiveIndex(-1); }}
              placeholder="Şehir veya havalimanı"
              autoComplete="off"
            />
            {isOriginOpen && renderResults(originResults, "origin", originActiveIndex, setOriginActiveIndex)}
          </div>

          <button type="button" className={styles.swap} onClick={swapLocations} disabled={!destinationObj} aria-label="Kalkış ve varış yerlerini değiştir">
            <ArrowRightLeft size={18} />
          </button>

          <div className={`${styles.field} ${styles.locationField}`} ref={destRef}>
            <label htmlFor="flight-destination"><MapPin size={15} /> Nereye</label>
            <input
              id="flight-destination"
              value={destSearch}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isDestOpen}
              aria-controls="flight-destination-options"
              aria-activedescendant={destActiveIndex >= 0 ? `flight-destination-option-${destActiveIndex}` : undefined}
              onFocus={(event) => { setIsDestOpen(true); setDestActiveIndex(-1); event.currentTarget.select(); }}
              onKeyDown={(event) => onLocationKeyDown(event, "destination", destResults, destActiveIndex, setDestActiveIndex)}
              onChange={(event) => { setDestSearch(event.target.value); setDestinationObj(null); setIsDestOpen(true); setDestActiveIndex(-1); }}
              placeholder="Şehir veya havalimanı"
              autoComplete="off"
            />
            {isDestOpen && renderResults(destResults, "destination", destActiveIndex, setDestActiveIndex)}
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

        {validSearch ? (
          <Link href={href} className={styles.submit}>
            <Search size={19} /> LetsGo2Travel'da ara
          </Link>
        ) : (
          <button type="button" className={styles.submit} disabled aria-disabled="true">
            <Search size={19} /> Bilgileri tamamla
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <p>Yetkili kaynaklar LetsGo2Travel sunucularında karşılaştırılır; ödeme seçtiğin resmî satış kanalında tamamlanır.</p>
        {originObj && destinationObj && departDate && (
          <button type="button" className={styles.alertToggle} onClick={() => setIsAlertOpen((current) => !current)}>
            <BellRing size={16} /> {isAlertOpen ? "Alarm formunu kapat" : "Bu rota için fiyat alarmı kur"}
          </button>
        )}
      </div>

      {isAlertOpen && originObj && destinationObj && departDate && (
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
