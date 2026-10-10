import { useEffect, useRef, useState } from "react";
import { loadCommunityPhoto } from "../lib/communityPhoto";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

type Props = { photoUrl: string; accessToken: string; alt: string; onOpen?: () => void };
export function SocialPhoto(props: Props) {
  return <PrivatePhoto key={`${props.photoUrl}:${props.accessToken}`} {...props}/>;
}
function PrivatePhoto({ photoUrl, accessToken, alt, onOpen }: Props) {
  const { copy } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [source, setSource] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "160px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl = "";
    setError(false);
    void loadCommunityPhoto(photoUrl, accessToken, controller.signal).then(blob => {
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, photoUrl, accessToken, attempt]);
  const image = <img src={source} alt={alt} decoding="async" onError={() => setError(true)}/>;
  return <figure ref={ref} className="social-photo">
    {source && !error ? onOpen ? <button type="button" className="social-photo-open" aria-label={alt} onClick={onOpen}>{image}</button> : image : error ? <button type="button" className="social-photo-retry" onClick={() => setAttempt(value => value + 1)}><Icon name="refresh" size={22}/><span>{copy("Tekrar dene", "Retry", "Provo sërish")}</span></button> : <span className="social-photo-loading" role="status"><Icon name="camera" size={24}/><span className="sr-only">{copy("Fotoğraf yükleniyor", "Loading photo", "Duke ngarkuar fotografinë")}</span></span>}
  </figure>;
}
