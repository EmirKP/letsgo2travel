import { useEffect, useRef, useState, type ReactNode } from "react";
import { communityTranslationQueue, type CommunityTranslationResult } from "../lib/communityTranslation";
import { useI18n } from "../lib/i18n";
import "./forum-translation.css";

type ForumTranslationProps = {
  text: string; title?: string; accessToken: string;
  children?: (displayText: string, displayTitle?: string) => ReactNode;
};

export function ForumTranslation(props: ForumTranslationProps) {
  const { locale } = useI18n();
  return <TranslationText key={`${locale}\u0000${props.title || ""}\u0000${props.text}\u0000${props.accessToken}`} {...props} />;
}

function TranslationText({ text, title, accessToken, children }: ForumTranslationProps) {
  const { copy, locale } = useI18n();
  const element = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<CommunityTranslationResult | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "120px 0px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    return communityTranslationQueue.subscribe({ text, title, accessToken, locale }, setResult);
  }, [text, title, accessToken, locale, visible]);
  const ready = result?.status === "ready";
  const display = ready ? result.text : text;
  const displayTitle = ready ? result.title : title;
  return <div ref={element} className="forum-translation" lang={ready ? locale : undefined} aria-busy={!result}>
    {result ? children ? children(display, displayTitle) : <p className="forum-translation-text">{display}</p>
      : <p className="forum-translation-loading">{copy("İçerik yükleniyor…", "Loading content…", "Përmbajtja po ngarkohet…")}</p>}
    {result?.status === "failed" && <span className="forum-translation-fallback">{copy("Çeviri yüklenemedi; özgün metin gösteriliyor.", "Translation unavailable; showing the original text.", "Përkthimi nuk u ngarkua; po shfaqet teksti origjinal.")}</span>}
  </div>;
}
