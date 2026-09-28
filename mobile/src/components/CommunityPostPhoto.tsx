import { useEffect, useRef, useState } from "react";
import { isCommunityPhotoPath, loadCommunityPhoto } from "../lib/communityPhoto";
import { useI18n } from "../lib/i18n";

type PhotoProps = { photoUrl: string; accessToken: string; alt: string };

function LoadedPostPhoto({ photoUrl, accessToken, alt }: PhotoProps) {
  const { copy } = useI18n();
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible || !container.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px 0px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl = "";
    let active = true;
    setSource("");
    setFailed(false);
    void loadCommunityPhoto(photoUrl, accessToken, controller.signal).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl, accessToken, visible, attempt]);

  return <figure ref={container} className={`cs-post-photo${source && !failed ? " is-loaded" : ""}`}>
    {source && !failed ? <img src={source} alt={alt} decoding="async" onError={() => setFailed(true)} /> : failed ?
      <button type="button" className="cs-post-photo-retry" onClick={() => setAttempt((value) => value + 1)}>
        {copy("Fotoğraf yüklenemedi · Tekrar dene", "Photo unavailable · Retry")}
      </button> : <span className="sr-only" role="status">{copy("Fotoğraf yükleniyor…", "Loading photo…")}</span>}
  </figure>;
}

export function CommunityPostPhoto(props: PhotoProps) {
  if (!isCommunityPhotoPath(props.photoUrl)) return null;
  // A new account or photo gets a fresh loader before render, avoiding stale private images.
  return <LoadedPostPhoto key={`${props.photoUrl}\u0000${props.accessToken}`} {...props} />;
}
