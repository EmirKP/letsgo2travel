"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./Card.module.css";
import type {
  ExplorerCardData,
  ExplorerCardSaveResult,
  ExplorerExportFormat,
  ExplorerPrivacy,
} from "./types";

type PermissionCapableDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type StatusState =
  | { kind: "idle"; text: "" }
  | { kind: "working" | "success" | "error"; text: string };

interface ExplorerCardProps {
  data: ExplorerCardData;
  onShowOnProfile?: (
    privacy: ExplorerPrivacy,
  ) => Promise<ExplorerCardSaveResult | void>;
}

const FORMAT_LABELS: Record<ExplorerExportFormat, string> = {
  story: "Story 1080×1920",
  post: "Post 1080×1350",
  square: "Kare 1080×1080",
};

const FORMAT_SHORT_LABELS: Record<ExplorerExportFormat, string> = {
  story: "Story",
  post: "Post",
  square: "Kare",
};

const FORMAT_DOWNLOAD_LABELS: Record<ExplorerExportFormat, string> = {
  story: "Story Olarak İndir",
  post: "Post Olarak İndir",
  square: "Kare Olarak İndir",
};

const FRAME_CLASS: Record<ExplorerCardData["level"]["key"], string> = {
  new: styles.frameNew,
  traveler: styles.frameTraveler,
  experienced: styles.frameExperienced,
  master: styles.frameMaster,
  world: styles.frameWorld,
};

const EXPORT_CLASS: Record<ExplorerExportFormat, string> = {
  story: styles.exportStory,
  post: styles.exportPost,
  square: styles.exportSquare,
};

const numberFormatter = new Intl.NumberFormat("tr-TR");

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
}

function safeFilePart(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ExplorerCard({
  data,
  onShowOnProfile,
}: ExplorerCardProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [privacy, setPrivacy] = useState<ExplorerPrivacy>(data.privacy);
  const [selectedFormat, setSelectedFormat] =
    useState<ExplorerExportFormat>("story");
  const [renderFormat, setRenderFormat] =
    useState<ExplorerExportFormat>("story");
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50 });
  const [orientationAvailable, setOrientationAvailable] = useState(false);
  const [orientationEnabled, setOrientationEnabled] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    kind: "idle",
    text: "",
  });

  useEffect(() => {
    setOrientationAvailable(
      typeof window !== "undefined" && "DeviceOrientationEvent" in window,
    );
  }, []);

  useEffect(() => {
    if (!orientationEnabled) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const gamma = clamp(event.gamma ?? 0, -24, 24);
      const beta = clamp((event.beta ?? 45) - 45, -24, 24);

      setTilt({
        x: clamp(-beta * 0.28, -8, 8),
        y: clamp(gamma * 0.35, -10, 10),
        glareX: clamp(50 + gamma * 1.6, 8, 92),
        glareY: clamp(50 + beta * 1.6, 8, 92),
      });
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [orientationEnabled]);

  const cardStyle = useMemo(
    () =>
      ({
        "--rotate-x": `${tilt.x}deg`,
        "--rotate-y": `${tilt.y}deg`,
        "--glare-x": `${tilt.glareX}%`,
        "--glare-y": `${tilt.glareY}%`,
      }) as CSSProperties,
    [tilt],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const relativeY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    setTilt({
      x: (0.5 - relativeY) * 11,
      y: (relativeX - 0.5) * 14,
      glareX: relativeX * 100,
      glareY: relativeY * 100,
    });
  };

  const resetTilt = () => {
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 });
  };

  const requestOrientation = async () => {
    try {
      const OrientationEvent =
        window.DeviceOrientationEvent as PermissionCapableDeviceOrientationEvent;

      if (typeof OrientationEvent.requestPermission === "function") {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== "granted") {
          setStatus({
            kind: "error",
            text: "Telefon hareketi izni verilmedi.",
          });
          return;
        }
      }

      setOrientationEnabled(true);
      setStatus({
        kind: "success",
        text: "Telefon hareketi efekti açıldı.",
      });
    } catch {
      setStatus({
        kind: "error",
        text: "Telefon hareketi bu tarayıcıda açılamadı.",
      });
    }
  };

  const prepareExportNode = async (format: ExplorerExportFormat) => {
    setRenderFormat(format);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    if ("fonts" in document) {
      await document.fonts.ready;
    }

    if (!exportRef.current) {
      throw new Error("Dışa aktarma alanı bulunamadı.");
    }

    return exportRef.current;
  };

  const createImageFile = useCallback(
    async (format: ExplorerExportFormat) => {
      const node = await prepareExportNode(format);
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 1,
        backgroundColor: "#061b2b",
      });

      if (!blob) {
        throw new Error("PNG dosyası üretilemedi.");
      }

      return new File(
        [blob],
        `letsgo2travel-${safeFilePart(data.username)}-${format}.png`,
        { type: "image/png" },
      );
    },
    [data.username],
  );

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleDownload = async (format: ExplorerExportFormat) => {
    try {
      setStatus({ kind: "working", text: "Kart hazırlanıyor…" });
      const file = await createImageFile(format);
      downloadFile(file);
      setStatus({ kind: "success", text: "Kart PNG olarak indirildi." });
    } catch (error) {
      console.error(error);
      setStatus({
        kind: "error",
        text: "Kart indirilemedi. Görsellerin erişilebilir olduğunu kontrol et.",
      });
    }
  };

  const handleShare = async () => {
    try {
      setStatus({ kind: "working", text: "Paylaşım görseli hazırlanıyor…" });
      const file = await createImageFile(selectedFormat);
      const sharePayload: ShareData = {
        files: [file],
        title: `${data.displayName} · Kaşif Kartı`,
        text: `${data.level.label} · ${data.stats.verifiedCountries} doğrulanmış ülke`,
        url: data.profileUrl,
      };

      const fileShareSupported =
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" ||
          navigator.canShare({ files: [file] }));

      if (fileShareSupported) {
        await navigator.share(sharePayload);
        setStatus({ kind: "success", text: "Paylaşım menüsü açıldı." });
        return;
      }

      downloadFile(file);
      setStatus({
        kind: "success",
        text: "Tarayıcı dosya paylaşımını desteklemedi; PNG indirildi.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ kind: "idle", text: "" });
        return;
      }

      console.error(error);
      setStatus({ kind: "error", text: "Kart paylaşılamadı." });
    }
  };

  const handleShowOnProfile = async () => {
    try {
      setStatus({ kind: "working", text: "Profil ayarı kaydediliyor…" });

      if (onShowOnProfile) {
        const result = await onShowOnProfile(privacy);
        if (result && !result.ok) {
          throw new Error(result.message ?? "Profil ayarı kaydedilemedi.");
        }
      }

      setStatus({
        kind: "success",
        text: "Kaşif Kartı profilinde gösterilecek.",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Profil ayarı kaydedilemedi.",
      });
    }
  };

  const handleFormatSelect = (format: ExplorerExportFormat) => {
    setSelectedFormat(format);
    setRenderFormat(format);
    setStatus({
      kind: "success",
      text: `${FORMAT_LABELS[format]} seçildi. Paylaşma ve indirme bu ölçüde yapılacak.`,
    });
  };

  const togglePrivacy = (key: keyof ExplorerPrivacy) => {
    setPrivacy((current) => ({ ...current, [key]: !current[key] }));
  };

  const renderArtwork = (exportMode = false) => {
    const visibleCountries = data.verifiedCountryNames.slice(
      0,
      exportMode ? 6 : 4,
    );
    const remainingCountries =
      data.verifiedCountryNames.length - visibleCountries.length;

    return (
      <article
        className={[
          styles.card,
          FRAME_CLASS[data.level.key],
          exportMode ? styles.cardExportMode : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={exportMode ? undefined : cardStyle}
        onPointerMove={exportMode ? undefined : handlePointerMove}
        onPointerLeave={exportMode ? undefined : resetTilt}
        aria-label={`${data.displayName} için dijital Kaşif Kartı`}
      >
        <div className={styles.hologram} aria-hidden="true" />
        <div className={styles.gridGlow} aria-hidden="true" />

        <header className={styles.cardHeader}>
          <div className={styles.identity}>
            <div className={styles.avatar}>
              {data.avatarUrl ? (
                <Image
                  src={data.avatarUrl}
                  alt=""
                  width={132}
                  height={132}
                  sizes={exportMode ? "132px" : "(max-width: 600px) 72px, 92px"}
                  unoptimized
                  crossOrigin="anonymous"
                />
              ) : (
                <span aria-hidden="true">{initials(data.displayName)}</span>
              )}
            </div>

            <div className={styles.identityText}>
              <p className={styles.eyebrow}>KAŞİFLER LİGİ</p>
              <h2 className={styles.name}>
                {privacy.showName ? data.displayName : `@${data.username}`}
              </h2>
              <p className={styles.level}>
                {data.level.label}
                <span>Seviye {data.level.number}</span>
              </p>
            </div>
          </div>

          {data.documentedTraveler && (
            <div className={styles.verifiedBadge} title="Belgeli Gezgin">
              <span aria-hidden="true">✓</span>
              Belgeli Gezgin
            </div>
          )}
        </header>

        <section className={styles.statsGrid} aria-label="Kaşif istatistikleri">
          <div className={styles.stat}>
            <strong>{data.stats.verifiedCountries}</strong>
            <span>Doğrulanmış ülke</span>
          </div>
          <div className={styles.stat}>
            <strong>{data.stats.visaFreeDiscoveries}</strong>
            <span>Vizesiz keşif</span>
          </div>
          <div className={styles.stat}>
            <strong>{data.stats.continents}</strong>
            <span>Kıta</span>
          </div>
          <div className={styles.stat}>
            <strong>
              {numberFormatter.format(data.stats.explorerPoints)}
            </strong>
            <span>Kaşif puanı</span>
          </div>
        </section>

        {privacy.showRanking && (
          <div className={styles.ranking}>
            <span>Kaşifler Ligi</span>
            <strong>İlk %{data.stats.leaguePercentile}</strong>
          </div>
        )}

        {privacy.showCountryList && data.verifiedCountryNames.length > 0 && (
          <section className={styles.countries} aria-label="Doğrulanmış ülkeler">
            <p>Doğrulanmış keşifler</p>
            <div className={styles.countryChips}>
              {visibleCountries.map((country) => (
                <span key={country}>{country}</span>
              ))}
              {remainingCountries > 0 && <span>+{remainingCountries}</span>}
            </div>
          </section>
        )}

        <section className={styles.achievements} aria-label="Dönemsel başarımlar">
          {data.achievements.slice(0, 2).map((achievement) => {
            const hasProgress =
              typeof achievement.progress === "number" &&
              typeof achievement.target === "number" &&
              achievement.target > 0;
            const percentage = hasProgress
              ? clamp(
                  ((achievement.progress ?? 0) / (achievement.target ?? 1)) *
                    100,
                  0,
                  100,
                )
              : 100;

            return (
              <div className={styles.achievement} key={achievement.id}>
                <div>
                  <strong>{achievement.title}</strong>
                  <span>{achievement.detail}</span>
                </div>
                <div className={styles.progress} aria-hidden="true">
                  <i style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </section>

        <footer className={styles.cardFooter}>
          <div className={styles.brand} aria-label="LetsGo2Travel">
            <span>LetsGo</span>
            <b>2</b>
            <span>Travel</span>
            <i aria-hidden="true">✈</i>
          </div>

          <div className={styles.qrArea}>
            <div className={styles.qr}>
              <QRCodeSVG
                value={data.profileUrl}
                size={exportMode ? 152 : 94}
                bgColor="#f7fbff"
                fgColor="#06263a"
                level="M"
                marginSize={1}
                title={`${data.displayName} Kaşif profili`}
              />
            </div>
            <span>@{data.username}</span>
          </div>
        </footer>
      </article>
    );
  };

  return (
    <section className={styles.shell}>
      <div className={styles.previewColumn}>
        <div className={styles.sectionHeading}>
          <div>
            <p>Dijital kimliğin</p>
            <h1>Paylaşılabilir Kaşif Kartı</h1>
          </div>

          {orientationAvailable && (
            <button
              className={styles.motionButton}
              type="button"
              onClick={requestOrientation}
              disabled={orientationEnabled}
            >
              {orientationEnabled
                ? "Telefon hareketi açık"
                : "Telefon hareketini aç"}
            </button>
          )}
        </div>

        <div className={styles.stage}>{renderArtwork()}</div>
      </div>

      <aside className={styles.controls} aria-label="Kaşif kartı ayarları">
        <div className={styles.controlGroup}>
          <h2>Paylaşım biçimi</h2>
          <div className={styles.formatButtons}>
            {(Object.keys(FORMAT_LABELS) as ExplorerExportFormat[]).map(
              (format) => {
                const isSelected = selectedFormat === format;

                return (
                  <button
                    type="button"
                    key={format}
                    className={isSelected ? styles.formatActive : ""}
                    aria-pressed={isSelected}
                    onClick={() => handleFormatSelect(format)}
                  >
                    <span>{FORMAT_LABELS[format]}</span>
                    <b aria-hidden="true">{isSelected ? "✓" : ""}</b>
                  </button>
                );
              },
            )}
          </div>

          <div className={styles.formatPreview} aria-live="polite">
            <div
              className={`${styles.formatPreviewCanvas} ${
                styles[`formatPreview_${selectedFormat}`]
              }`}
              aria-hidden="true"
            >
              <span>Kaşif Kartı</span>
            </div>
            <p>
              <strong>{FORMAT_SHORT_LABELS[selectedFormat]}</strong> seçildi.
              İndirme ve paylaşma bu boyutta yapılacak.
            </p>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <h2>Gizlilik</h2>

          <label className={styles.switchRow}>
            <span>
              <strong>İsim</strong>
              <small>Kapalıyken kullanıcı adı gösterilir.</small>
            </span>
            <input
              type="checkbox"
              checked={privacy.showName}
              onChange={() => togglePrivacy("showName")}
            />
            <i aria-hidden="true" />
          </label>

          <label className={styles.switchRow}>
            <span>
              <strong>Sıralama</strong>
              <small>Lig yüzdeliğini kartta göster.</small>
            </span>
            <input
              type="checkbox"
              checked={privacy.showRanking}
              onChange={() => togglePrivacy("showRanking")}
            />
            <i aria-hidden="true" />
          </label>

          <label className={styles.switchRow}>
            <span>
              <strong>Ülke listesi</strong>
              <small>Doğrulanmış ülke etiketlerini göster.</small>
            </span>
            <input
              type="checkbox"
              checked={privacy.showCountryList}
              onChange={() => togglePrivacy("showCountryList")}
            />
            <i aria-hidden="true" />
          </label>
        </div>

        <div className={styles.actionStack}>
          <button
            className={styles.primaryAction}
            type="button"
            onClick={handleShare}
            disabled={status.kind === "working"}
          >
            {FORMAT_SHORT_LABELS[selectedFormat]} Olarak Paylaş
          </button>

          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => handleDownload(selectedFormat)}
            disabled={status.kind === "working"}
          >
            {FORMAT_DOWNLOAD_LABELS[selectedFormat]}
          </button>

          <button
            className={styles.ghostAction}
            type="button"
            onClick={handleShowOnProfile}
            disabled={status.kind === "working"}
          >
            Profilimde Göster
          </button>
        </div>

        {status.kind !== "idle" && (
          <p
            className={`${styles.status} ${styles[`status_${status.kind}`]}`}
            role="status"
          >
            {status.text}
          </p>
        )}
      </aside>

      <div className={styles.exportHost} aria-hidden="true">
        <div
          ref={exportRef}
          className={`${styles.exportSurface} ${EXPORT_CLASS[renderFormat]}`}
        >
          <div className={styles.exportKicker}>
            <span>LETSGO2TRAVEL</span>
            <strong>DİJİTAL KAŞİF KARTI</strong>
          </div>

          {renderArtwork(true)}

          <div className={styles.exportFooter}>
            <span>Keşfet · Doğrula · Ligde yüksel</span>
            <strong>letsgo2travel.com.tr</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
