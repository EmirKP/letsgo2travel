import { useEffect, useRef, useState, type ReactNode } from "react";
import { communityTranslationQueue, type CommunityTranslationResult } from "../lib/communityTranslation";
import { useI18n } from "../lib/i18n";
import type { AppLocale } from "../lib/locale";
import "./forum-translation.css";

type ForumTranslationProps = {
  text: string; title?: string; accessToken: string;
  sourceLocale?: AppLocale; inline?: boolean;
  children?: (displayText: string, displayTitle?: string) => ReactNode;
};

export function ForumTranslation(props: ForumTranslationProps) {
  const { locale } = useI18n();
  if (props.sourceLocale === locale) return <>{props.children ? props.children(props.text, props.title) : props.text}</>;
  return <TranslationText key={`${locale}\u0000${props.title || ""}\u0000${props.text}\u0000${props.accessToken}`} {...props} />;
}

function TranslationText({ text, title, accessToken, children, inline }: ForumTranslationProps) {
  const { copy, locale } = useI18n();
  const element = useRef<HTMLDivElement & HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<CommunityTranslationResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const subscribedAttempt = useRef(0);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: "120px 0px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    const retry = attempt > subscribedAttempt.current;
    subscribedAttempt.current = attempt;
    const stop = communityTranslationQueue.subscribe({ text, title, accessToken, locale }, value => { if (current) { setResult(value); setRetrying(false); } }, retry);
    return () => { current = false; stop(); };
  }, [text, title, accessToken, locale, visible, attempt]);
  useEffect(() => {
    if (!visible || retrying || result?.status !== "failed" || result.retryAt === undefined || attempt >= 2) return;
    let retried = false;
    const retry = () => {
      if (retried || typeof navigator !== "undefined" && !navigator.onLine) return;
      retried = true;
      setRetrying(true);
      setAttempt(value => value + 1);
    };
    const timer = window.setTimeout(retry, Math.max(0, result.retryAt - Date.now()) + 50);
    // Only connectivity failures can bypass the delay. HTTP quotas and invalid
    // sessions never turn a reconnect event into a rapid retry loop.
    const online = () => { if (result.retryOnReconnect || Date.now() >= result.retryAt!) retry(); };
    window.addEventListener("online", online);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", online); };
  }, [visible, result, attempt, retrying]);
  const ready = result?.status === "ready";
  const Container = inline ? "span" : "div";
  const Text = inline ? "span" : "p";
  const display = ready ? result.text : text;
  const displayTitle = ready ? result.title : title;
  return <Container ref={element} className="forum-translation" lang={ready ? locale : undefined} aria-busy={!result || retrying}>
    {result ? children ? children(display, displayTitle) : <Text className="forum-translation-text">{display}</Text>
      : <Text className="forum-translation-loading">{copy("İçerik yükleniyor…", "Loading content…", "Përmbajtja po ngarkohet…")}</Text>}
    {result?.status === "failed" && <span className="forum-translation-fallback">{copy("Çeviri yüklenemedi; özgün metin gösteriliyor.", "Translation unavailable; showing the original text.", "Përkthimi nuk u ngarkua; po shfaqet teksti origjinal.")}</span>}
  </Container>;
}
