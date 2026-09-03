"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2, PenTool, X } from "lucide-react";

import {
  countryCodeFromForumSlug,
  forumCountrySlugFromCode,
} from "@/lib/community/forum-sync";
import { supabase } from "@/lib/supabase-client";

import styles from "./Forum.module.css";

interface CountryQuestionModalProps {
  countrySlug: string;
  countryName: string;
  presets: string[];
  mode: "hero" | "presets";
}

function slugify(value: string) {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  };

  return `${value
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (character) => map[character] ?? character)
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CountryQuestionModal({
  countrySlug,
  countryName,
  presets,
  mode,
}: CountryQuestionModalProps) {
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const canonicalCountrySlug = forumCountrySlugFromCode(
    countryCodeFromForumSlug(countrySlug),
  ) ?? forumCountrySlugFromCode(
    countryCodeFromForumSlug(countryName),
  );

  const openModal = (preset = "") => {
    setTitle(preset);
    setContent("");
    setError("");
    setSuccess("");
    setNeedsLogin(false);
    setOpen(true);
  };

  const closeModal = useCallback(() => {
    if (loading) return;
    setOpen(false);
  }, [loading]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => titleInputRef.current?.focus());

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeModal]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setNeedsLogin(false);

    if (title.trim().length < 5) {
      setError("Soru başlığı en az 5 karakter olmalıdır.");
      return;
    }

    if (content.trim().length < 20) {
      setError("Açıklama en az 20 karakter olmalıdır.");
      return;
    }

    if (!canonicalCountrySlug) {
      setError("Geçerli bir ülke seçilemedi. Lütfen ülke rehberinden tekrar dene.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setNeedsLogin(true);
        setError("Soru yayınlamak için giriş yapmalısın.");
        return;
      }

      const { error: insertError } = await supabase.from("forum_topics").insert({
        slug: slugify(title),
        title: title.trim(),
        content: content.trim(),
        category: "Vize & Konsolosluk",
        country_slug: canonicalCountrySlug,
        author_id: session.user.id,
        author_name:
          session.user.user_metadata?.full_name ||
          session.user.email?.split("@")[0] ||
          "Gezgin",
        status: "pending",
        is_paywalled: true,
      });

      if (insertError) {
        throw insertError;
      }

      setSuccess("Sorun moderasyon onayına gönderildi.");
      setTitle("");
      setContent("");
      router.refresh();
    } catch (caughtError) {
      console.error(caughtError);
      setError("Soru kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {mode === "hero" ? (
        <button type="button" className={styles.primaryButton} onClick={() => openModal()}>
          <PenTool size={18} aria-hidden="true" />
          {countryName} hakkında soru sor
        </button>
      ) : (
        <div className={styles.presetGrid}>
          {presets.map((preset) => (
            <button key={preset} type="button" className={styles.presetCard} onClick={() => openModal(preset)}>
              <HelpCircle size={18} aria-hidden="true" />
              <span>{preset}</span>
            </button>
          ))}
        </div>
      )}

      {open ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="country-question-modal-title">
            <header className={styles.modalHeader}>
              <div>
                <p>Vize ve giriş deneyimleri</p>
                <h2 id="country-question-modal-title">{countryName} hakkında soru sor</h2>
              </div>
              <button type="button" className={styles.modalClose} onClick={closeModal} aria-label="Pencereyi kapat">
                <X size={20} />
              </button>
            </header>

            <form className={styles.modalForm} onSubmit={handleSubmit}>
              <label className={styles.modalField}>
                <span>Soru başlığı</span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={5}
                  maxLength={160}
                  required
                />
              </label>

              <label className={styles.modalField}>
                <span>Açıklama</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  minLength={20}
                  maxLength={3000}
                  placeholder="Seyahat tarihi, havalimanı ve merak ettiğin ayrıntıları yaz."
                  required
                />
              </label>

              {error ? (
                <div className={styles.formError} role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              {success ? (
                <div className={styles.formSuccess} role="status">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>{success}</span>
                </div>
              ) : null}

              {needsLogin ? (
                <div className={styles.loginActions}>
                  <Link href={`/auth/login?next=${encodeURIComponent(`/forum/ulke/${countrySlug}`)}`}>Giriş yap</Link>
                  <Link href={`/auth/register?next=${encodeURIComponent(`/forum/ulke/${countrySlug}`)}`}>Üye ol</Link>
                </div>
              ) : null}

              <footer className={styles.modalActions}>
                <button type="button" className={styles.cancelButton} onClick={closeModal} disabled={loading}>
                  Vazgeç
                </button>
                <button type="submit" className={styles.submitButton} disabled={loading || Boolean(success)}>
                  {loading ? <Loader2 size={18} className={styles.spin} /> : null}
                  {loading ? "Gönderiliyor..." : "Soruyu gönder"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
