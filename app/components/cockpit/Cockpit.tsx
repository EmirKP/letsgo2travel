"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Globe2,
  Luggage,
  MapPin,
  PhoneCall,
  Plane,
  Plus,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  destinationOptions,
  getDestinationInfo,
} from "@/lib/cockpit/destinationInfo";

import styles from "./Cockpit.module.css";
import type {
  ChecklistCategory,
  ChecklistItem,
  CreateTripInput,
  Trip,
} from "./types";

interface CockpitProps {
  trips: Trip[];
  activeTripId?: string | null;
  airaloUrl: string;
  transferUrl: string;
  isSaving?: boolean;
  onCreateTrip: (input: CreateTripInput) => Promise<void>;
  onUpdateChecklist: (
    tripId: string,
    checklistItems: ChecklistItem[],
  ) => Promise<void>;
  onDeleteTrip: (tripId: string) => Promise<void>;
}

interface CountdownValue {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
}

const categoryLabels: Record<ChecklistCategory, string> = {
  documents: "Belge",
  health: "Sağlık",
  technology: "Teknoloji",
  luggage: "Bavul",
  other: "Diğer",
};

function calculateCountdown(targetIso: string): CountdownValue {
  const difference = new Date(targetIso).getTime() - Date.now();

  if (!Number.isFinite(difference) || difference <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0 };
  }

  const totalMinutes = Math.floor(difference / 60_000);

  return {
    expired: false,
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  };
}

function getCountdownTarget(trip: Trip) {
  if (trip.departureAt) return trip.departureAt;
  return `${trip.startDate}T09:00:00`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function calculateProgress(items: ChecklistItem[]) {
  if (items.length === 0) return 0;
  const completed = items.filter((item) => item.completed).length;
  return Math.round((completed / items.length) * 100);
}

function normalizeUrl(url: string) {
  return url && url !== "#" ? url : "/partnerler";
}

function LiveCountdown({ trip }: { trip: Trip }) {
  const target = useMemo(() => getCountdownTarget(trip), [trip]);
  const [countdown, setCountdown] = useState(() => calculateCountdown(target));

  useEffect(() => {
    setCountdown(calculateCountdown(target));

    const timer = window.setInterval(() => {
      setCountdown(calculateCountdown(target));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [target]);

  if (countdown.expired) {
    return (
      <div className={styles.departureMessage}>
        <Plane size={21} />
        <div>
          <strong>Seyahat zamanı geldi</strong>
          <span>Kontrol listesindeki son maddelere göz at.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.countdownGrid} aria-label="Seyahate kalan süre">
      <div>
        <strong>{countdown.days}</strong>
        <span>Gün</span>
      </div>
      <div>
        <strong>{String(countdown.hours).padStart(2, "0")}</strong>
        <span>Saat</span>
      </div>
      <div>
        <strong>{String(countdown.minutes).padStart(2, "0")}</strong>
        <span>Dakika</span>
      </div>
    </div>
  );
}

export default function Cockpit({
  trips,
  activeTripId,
  airaloUrl,
  transferUrl,
  isSaving = false,
  onCreateTrip,
  onUpdateChecklist,
  onDeleteTrip,
}: CockpitProps) {
  const [selectedTripId, setSelectedTripId] = useState(
    activeTripId ?? trips[0]?.id ?? null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemCategory, setNewItemCategory] =
    useState<ChecklistCategory>("other");
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? trips[0] ?? null,
    [selectedTripId, trips],
  );

  useEffect(() => {
    if (!selectedTripId && trips[0]) {
      setSelectedTripId(trips[0].id);
      return;
    }

    if (selectedTripId && !trips.some((trip) => trip.id === selectedTripId)) {
      setSelectedTripId(trips[0]?.id ?? null);
    }
  }, [selectedTripId, trips]);

  useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => dialogRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen]);

  const persistChecklist = async (nextItems: ChecklistItem[]) => {
    if (!selectedTrip) return;

    setChecklistSaving(true);
    setFeedback("");

    try {
      await onUpdateChecklist(selectedTrip.id, nextItems);
    } catch (error) {
      console.error(error);
      setFeedback("Kontrol listesi kaydedilemedi. Tekrar dene.");
    } finally {
      setChecklistSaving(false);
    }
  };

  const toggleChecklistItem = (itemId: string) => {
    if (!selectedTrip) return;

    const nextItems = selectedTrip.checklistItems.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );
    void persistChecklist(nextItems);
  };

  const deleteChecklistItem = (itemId: string) => {
    if (!selectedTrip) return;
    void persistChecklist(
      selectedTrip.checklistItems.filter((item) => item.id !== itemId),
    );
  };

  const addChecklistItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTrip) return;

    const label = newItemLabel.trim();
    if (!label) return;

    if (selectedTrip.checklistItems.length >= 50) {
      setFeedback("Bir seyahatte en fazla 50 kontrol listesi maddesi olabilir.");
      return;
    }

    const nextItems: ChecklistItem[] = [
      ...selectedTrip.checklistItems,
      {
        id: crypto.randomUUID(),
        label: label.slice(0, 90),
        completed: false,
        category: newItemCategory,
        createdAt: new Date().toISOString(),
      },
    ];

    setNewItemLabel("");
    void persistChecklist(nextItems);
  };

  const handleDeleteTrip = async () => {
    if (!selectedTrip) return;

    const approved = window.confirm(
      `${selectedTrip.destinationCountry} seyahatini kokpitten silmek istiyor musun?`,
    );
    if (!approved) return;

    await onDeleteTrip(selectedTrip.id);
  };

  const destinationInfo = selectedTrip
    ? getDestinationInfo(selectedTrip.destinationCode)
    : null;
  const checklistProgress = selectedTrip
    ? calculateProgress(selectedTrip.checklistItems)
    : 0;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>
              <Plane size={16} /> Akıllı Seyahat Kokpiti
            </span>
            <h1>Seyahatin, tek panelde ve kontrol altında.</h1>
            <p>
              Uçuş gününe kalan süreyi takip et, hazırlıklarını tamamla ve
              destinasyona özel pratik bilgilere hızlıca ulaş.
            </p>
          </div>

          <button
            className={styles.addTripButton}
            type="button"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={19} /> Seyahatini ekle
          </button>
        </div>
      </section>

      <section className={styles.content}>
        {trips.length > 0 && (
          <div className={styles.tripTabs} aria-label="Seyahat seçimi">
            {trips.map((trip) => (
              <button
                type="button"
                key={trip.id}
                className={trip.id === selectedTrip?.id ? styles.tripTabActive : ""}
                onClick={() => setSelectedTripId(trip.id)}
              >
                <MapPin size={15} />
                <span>{trip.destinationCountry}</span>
                <small>{formatDate(trip.startDate)}</small>
              </button>
            ))}
          </div>
        )}

        {!selectedTrip || !destinationInfo ? (
          <section className={styles.emptyState}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <Luggage size={42} />
            </div>
            <h2>İlk seyahatini kokpite ekle</h2>
            <p>
              Gideceğin ülkeyi ve tarihleri eklediğinde geri sayımın, hazırlık
              listen ve pratik destinasyon bilgilerin burada görünecek.
            </p>
            <button type="button" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} /> Seyahat oluştur
            </button>
          </section>
        ) : (
          <>
            <section className={styles.topGrid}>
              <article className={`${styles.card} ${styles.countdownCard}`}>
                <div className={styles.cardHeading}>
                  <div>
                    <span className={styles.cardEyebrow}>SIRADAKİ SEYAHAT</span>
                    <h2>
                      {selectedTrip.destinationCity
                        ? `${selectedTrip.destinationCity}, `
                        : ""}
                      {selectedTrip.destinationCountry}
                    </h2>
                  </div>
                  <span className={styles.countryCode}>
                    {selectedTrip.destinationCode}
                  </span>
                </div>

                <div className={styles.dateLine}>
                  <CalendarDays size={17} />
                  <span>
                    {formatDate(selectedTrip.startDate)} – {formatDate(selectedTrip.endDate)}
                  </span>
                </div>

                <LiveCountdown trip={selectedTrip} />

                <div className={styles.tripMeta}>
                  <span>
                    <Clock3 size={15} />
                    {selectedTrip.departureAt
                      ? new Intl.DateTimeFormat("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(selectedTrip.departureAt))
                      : "Saat eklenmedi"}
                  </span>
                  <span>
                    <Plane size={15} />
                    {selectedTrip.flightPnr
                      ? `PNR: ${selectedTrip.flightPnr}`
                      : "PNR eklenmedi"}
                  </span>
                </div>
              </article>

              <article className={`${styles.card} ${styles.destinationCard}`}>
                <div className={styles.cardHeading}>
                  <div>
                    <span className={styles.cardEyebrow}>PRATİK BİLGİLER</span>
                    <h2>{destinationInfo.countryName}</h2>
                  </div>
                  <Globe2 size={26} />
                </div>

                <div className={styles.infoGrid}>
                  <div>
                    <WalletCards size={19} />
                    <span>Para birimi</span>
                    <strong>{destinationInfo.currencyCode}</strong>
                    <small>{destinationInfo.mockRateText}</small>
                  </div>
                  <div>
                    <PlugZap size={19} />
                    <span>Priz tipi</span>
                    <strong>{destinationInfo.plugTypes.join(" / ")}</strong>
                    <small>{destinationInfo.voltage}</small>
                  </div>
                  <div>
                    <PhoneCall size={19} />
                    <span>Acil durum</span>
                    <strong>{destinationInfo.emergency.general}</strong>
                    <small>
                      {destinationInfo.emergency.ambulance
                        ? `Ambulans ${destinationInfo.emergency.ambulance}`
                        : "Genel acil hat"}
                    </small>
                  </div>
                  <div>
                    <Clock3 size={19} />
                    <span>Saat dilimi</span>
                    <strong>{destinationInfo.timezone}</strong>
                    <small>{destinationInfo.language}</small>
                  </div>
                </div>

                <p className={styles.quickTip}>
                  <ShieldCheck size={17} /> {destinationInfo.quickTip}
                </p>
                <p className={styles.demoNotice}>
                  Kur ve destinasyon bilgileri şu anda demo veridir; işlemden
                  önce resmî kaynaklardan doğrula.
                </p>
              </article>
            </section>

            <section className={styles.workspaceGrid}>
              <div className={styles.mainColumn}>
                <a
                  className={styles.esimCard}
                  href={normalizeUrl(airaloUrl)}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                >
                  <div className={styles.esimIcon} aria-hidden="true">
                    <Smartphone size={28} />
                  </div>
                  <div>
                    <span>Yola çıkmadan internetini hazırla</span>
                    <h2>eSIM’ini şimdi ayarla</h2>
                    <p>
                      Havalimanında SIM kart aramadan, uygun paketi önceden seç.
                    </p>
                    <small>
                      Airalo iş ortaklığı bağlantısı olabilir; sana ek ücret oluşturmaz.
                    </small>
                  </div>
                  <span className={styles.esimCta}>
                    eSIM Ayarla <ExternalLink size={16} />
                  </span>
                </a>

                <article className={`${styles.card} ${styles.checklistCard}`}>
                  <div className={styles.checklistHeader}>
                    <div>
                      <span className={styles.cardEyebrow}>HAZIRLIK PLANI</span>
                      <h2>İnteraktif kontrol listesi</h2>
                    </div>
                    <div className={styles.progressLabel}>
                      <strong>%{checklistProgress}</strong>
                      <span>tamamlandı</span>
                    </div>
                  </div>

                  <div className={styles.progressTrack} aria-hidden="true">
                    <span style={{ width: `${checklistProgress}%` }} />
                  </div>

                  <form className={styles.addChecklistForm} onSubmit={addChecklistItem}>
                    <input
                      type="text"
                      value={newItemLabel}
                      onChange={(event) => setNewItemLabel(event.target.value)}
                      placeholder="Yeni madde ekle…"
                      maxLength={90}
                      aria-label="Yeni kontrol listesi maddesi"
                    />
                    <select
                      value={newItemCategory}
                      onChange={(event) =>
                        setNewItemCategory(event.target.value as ChecklistCategory)
                      }
                      aria-label="Madde kategorisi"
                    >
                      {Object.entries(categoryLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={checklistSaving}>
                      <Plus size={17} /> Ekle
                    </button>
                  </form>

                  <div className={styles.checklistItems}>
                    {selectedTrip.checklistItems.length === 0 ? (
                      <div className={styles.emptyChecklist}>
                        <CheckCircle2 size={28} />
                        <p>Liste boş. İlk hazırlık maddeni ekleyebilirsin.</p>
                      </div>
                    ) : (
                      selectedTrip.checklistItems.map((item) => (
                        <div
                          className={`${styles.checklistItem} ${
                            item.completed ? styles.checklistItemDone : ""
                          }`}
                          key={item.id}
                        >
                          <button
                            type="button"
                            className={styles.checkButton}
                            onClick={() => toggleChecklistItem(item.id)}
                            aria-label={
                              item.completed
                                ? `${item.label} maddesini tamamlanmadı olarak işaretle`
                                : `${item.label} maddesini tamamlandı olarak işaretle`
                            }
                            disabled={checklistSaving}
                          >
                            {item.completed ? (
                              <CheckCircle2 size={22} />
                            ) : (
                              <Circle size={22} />
                            )}
                          </button>
                          <div>
                            <span>{item.label}</span>
                            <small>{categoryLabels[item.category]}</small>
                          </div>
                          <button
                            type="button"
                            className={styles.deleteItemButton}
                            onClick={() => deleteChecklistItem(item.id)}
                            aria-label={`${item.label} maddesini sil`}
                            disabled={checklistSaving}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {checklistSaving && (
                    <p className={styles.savingNotice} role="status">
                      <RefreshCw size={14} /> Liste kaydediliyor…
                    </p>
                  )}
                  {feedback && (
                    <p className={styles.errorNotice} role="alert">
                      <AlertCircle size={15} /> {feedback}
                    </p>
                  )}
                </article>
              </div>

              <aside className={styles.sideColumn}>
                <article className={`${styles.card} ${styles.transferCard}`}>
                  <span className={styles.cardEyebrow}>VARIŞ PLANI</span>
                  <h2>Havalimanı transferini önceden ayarla</h2>
                  <p>
                    Varışta taksi aramak yerine transfer seçeneklerini seyahatten
                    önce karşılaştır.
                  </p>
                  <a
                    href={normalizeUrl(transferUrl)}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Transfer seçenekleri <ExternalLink size={16} />
                  </a>
                  <small>
                    İş ortaklığı bağlantısı olabilir; sana ek ücret oluşturmaz.
                  </small>
                </article>

                <article className={`${styles.card} ${styles.summaryCard}`}>
                  <span className={styles.cardEyebrow}>SEYAHAT ÖZETİ</span>
                  <h2>Hazırlık durumu</h2>
                  <dl>
                    <div>
                      <dt>Kontrol listesi</dt>
                      <dd>%{checklistProgress}</dd>
                    </div>
                    <div>
                      <dt>PNR</dt>
                      <dd>{selectedTrip.flightPnr ? "Eklendi" : "Eksik"}</dd>
                    </div>
                    <div>
                      <dt>eSIM</dt>
                      <dd>Kontrol et</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className={styles.deleteTripButton}
                    onClick={handleDeleteTrip}
                  >
                    <Trash2 size={16} /> Seyahati sil
                  </button>
                </article>
              </aside>
            </section>
          </>
        )}
      </section>

      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-trip-title"
            tabIndex={-1}
            ref={dialogRef}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setIsModalOpen(false)}
              aria-label="Pencereyi kapat"
            >
              <X size={20} />
            </button>
            <div className={styles.modalHeading}>
              <span className={styles.modalIcon} aria-hidden="true">
                <Plane size={24} />
              </span>
              <div>
                <span>YENİ SEYAHAT</span>
                <h2 id="add-trip-title">Seyahatini kokpite ekle</h2>
                <p>Ülke ve tarihleri seç; hazırlık panelin otomatik oluşsun.</p>
              </div>
            </div>

            <TripForm
              isSaving={isSaving}
              onCancel={() => setIsModalOpen(false)}
              onSubmit={async (input) => {
                await onCreateTrip(input);
                setIsModalOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function TripForm({
  isSaving,
  onCancel,
  onSubmit,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTripInput) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [countryCode, setCountryCode] = useState("AE");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [departureTime, setDepartureTime] = useState("09:00");
  const [flightPnr, setFlightPnr] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (endDate < startDate) {
      setFormError("Dönüş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }

    const country = destinationOptions.find((option) => option.code === countryCode);
    if (!country) {
      setFormError("Geçerli bir ülke seç.");
      return;
    }

    try {
      await onSubmit({
        destinationCountry: country.name,
        destinationCode: country.code,
        destinationCity: city.trim() || undefined,
        startDate,
        endDate,
        departureTime: departureTime || undefined,
        flightPnr: flightPnr.trim().toUpperCase() || undefined,
      });
    } catch (error) {
      console.error(error);
      setFormError(
        error instanceof Error
          ? error.message
          : "Seyahat kaydedilemedi. Tekrar dene.",
      );
    }
  };

  return (
    <form className={styles.tripForm} onSubmit={handleSubmit}>
      <label className={styles.fullField}>
        <span>Gidilecek ülke</span>
        <select
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
        >
          {destinationOptions.map((country) => (
            <option value={country.code} key={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.fullField}>
        <span>Şehir <small>isteğe bağlı</small></span>
        <input
          type="text"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Örn. Dubai"
          maxLength={80}
        />
      </label>

      <label>
        <span>Başlangıç tarihi</span>
        <input
          type="date"
          min={today}
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            if (event.target.value > endDate) setEndDate(event.target.value);
          }}
          required
        />
      </label>

      <label>
        <span>Dönüş tarihi</span>
        <input
          type="date"
          min={startDate}
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          required
        />
      </label>

      <label>
        <span>Uçuş saati <small>isteğe bağlı</small></span>
        <input
          type="time"
          value={departureTime}
          onChange={(event) => setDepartureTime(event.target.value)}
        />
      </label>

      <label>
        <span>PNR <small>isteğe bağlı</small></span>
        <input
          type="text"
          value={flightPnr}
          onChange={(event) => setFlightPnr(event.target.value)}
          placeholder="ABC123"
          maxLength={20}
          autoCapitalize="characters"
        />
      </label>

      {formError && (
        <p className={styles.formError} role="alert">
          <AlertCircle size={15} /> {formError}
        </p>
      )}

      <div className={styles.modalActions}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <RefreshCw size={16} /> Kaydediliyor…
            </>
          ) : (
            <>
              <Check size={17} /> Kokpiti oluştur
            </>
          )}
        </button>
      </div>
    </form>
  );
}
