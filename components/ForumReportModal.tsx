"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";
import { Flag, ShieldAlert, X } from "lucide-react";

const reasons = [
  ["spam", "Spam veya dolandırıcılık"], ["harassment", "Hakaret veya taciz"],
  ["hate", "Nefret söylemi"], ["dangerous", "Tehlikeli veya yasa dışı yönlendirme"],
  ["personal_data", "Kişisel bilgi paylaşımı"], ["other", "Diğer"],
];

type Target = { targetId: string; targetType: "topic" | "reply" };
type Block = { userId: string; authorName: string };

function useForumSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const initial = version;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      version += 1;
      if (active) setSession(next);
    });
    void supabase.auth.getSession().then(({ data }) => { if (active && version === initial) setSession(data.session); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return session;
}

async function safetyRequest(path: string, token: string, method: "GET" | "POST" | "DELETE", body?: unknown) {
  const response = await fetch(`/api/country-community/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "İşlem tamamlanamadı. Tekrar deneyin.");
  return result;
}

function SafetyDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} style={{ width: "min(500px, calc(100vw - 32px))", maxHeight: "85dvh", margin: "auto", border: "1px solid #dce4ee", borderRadius: 20, padding: 24, background: "#fff", color: "#172033" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 }}>
      <h2 id={titleId} style={{ margin: 0, fontSize: "1.2rem" }}>{title}</h2>
      <button type="button" aria-label="Kapat" disabled={busy} onClick={onClose} style={{ minWidth: 44, minHeight: 44 }}><X size={20} /></button>
    </header>
    {children}
  </dialog>;
}

export default function ForumReportButton(props: Target) {
  const session = useForumSession();
  const router = useRouter();
  return <ForumSafetyButton key={session?.user.id || "guest"} {...props} session={session} onLogin={() => router.push("/auth/login")} />;
}

function ForumSafetyButton({ targetId, targetType, session, onLogin }: Target & { session: Session | null; onLogin: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"report" | "block">("report");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit() {
    if (!session || pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    const target = { targetId, targetType: targetType === "topic" ? "question" : "answer" };
    try {
      await safetyRequest(mode === "report" ? "report" : "blocks", session.access_token, "POST", mode === "report" ? { ...target, reason, note: note.trim() } : target);
      if (!active.current) return;
      setSuccess(mode === "report" ? "Şikâyetin moderasyon sırasına eklendi. İnceleme sonucuna göre içerik kaldırılabilir ve ilgili hesap için işlem yapılabilir." : "Kullanıcı engellendi. Engellenen hesaplar bölümünden engeli kaldırabilirsin.");
      if (mode === "block") window.dispatchEvent(new Event("l2t:community-blocks-changed"));
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "İşlem tamamlanamadı.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <>
    <button type="button" onClick={() => { if (!session) return onLogin(); setOpen(true); setSuccess(""); setError(""); setReason(""); setNote(""); setMode("report"); }} style={{ minHeight: 44, background: "transparent", border: "none", color: "#315575", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Flag size={16} /> Şikâyet / Engelle</button>
    {open && <SafetyDialog title="Topluluk güvenliği" busy={busy} onClose={() => setOpen(false)}>
      {error && <p role="alert" style={{ color: "#991b1b" }}>{error}</p>}
      {success ? <div role="status"><h3>İşlem tamamlandı</h3><p>{success}</p>{mode === "report" && <button type="button" className="l2t-btn" onClick={() => { setMode("block"); setSuccess(""); }}>Bu kullanıcıyı da engelle</button>}<button type="button" className="l2t-btn" onClick={() => setOpen(false)}>Tamam</button></div> : <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" disabled={busy} aria-pressed={mode === "report"} className="l2t-btn" onClick={() => setMode("report")}>Şikâyet et</button>
          <button type="button" disabled={busy} aria-pressed={mode === "block"} className="l2t-btn" onClick={() => setMode("block")}>Engelle</button>
        </div>
        {mode === "report" ? <>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gap: 8 }}>
            <legend>Şikâyet nedeni</legend>
            {reasons.map(([value, label]) => <label key={value} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}><input type="radio" name="reportReason" value={value} checked={reason === value} onChange={() => setReason(value)} required />{label}</label>)}
            <label>Açıklama (Diğer için gerekli)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} minLength={reason === "other" ? 5 : undefined} required={reason === "other"} rows={3} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 12, font: "inherit" }} /></label>
          </fieldset>
          <p>Şikâyetin moderasyon ekibine iletilir. Kimliğin içerik sahibine gösterilmez. Özel belgelerini veya iletişim bilgilerini ekleme.</p>
        </> : <p>Bu hesabın topluluk soruları ve cevapları gizlenir; aranızdaki yeni topluluk etkileşimleri engellenir. Engeli daha sonra Engellenen hesaplar bölümünden kaldırabilirsin.</p>}
        <button type="submit" className="l2t-btn" disabled={busy || (mode === "report" && (!reason || (reason === "other" && note.trim().length < 5)))}>{busy ? "İşleniyor…" : mode === "report" ? "Şikâyeti gönder" : "Evet, engelle"}</button>
      </form>}
    </SafetyDialog>}
  </>;
}

export function ForumBlocksButton() {
  const session = useForumSession();
  return <ForumBlocksForAccount key={session?.user.id || "guest"} session={session} />;
}

function ForumBlocksForAccount({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function load() {
    if (!session) return;
    setOpen(true); setLoading(true); setError("");
    try {
      const result = await safetyRequest("blocks", session.access_token, "GET");
      if (active.current) setRows(Array.isArray(result.data) ? result.data : []);
    } catch { if (active.current) setError("Engellenen hesaplar yüklenemedi."); }
    finally { if (active.current) setLoading(false); }
  }
  async function unblock(userId: string) {
    if (!session || pending.current) return;
    pending.current = true; setBusy(userId); setError("");
    try {
      await safetyRequest("blocks", session.access_token, "DELETE", { userId });
      if (!active.current) return;
      setRows((current) => current.filter((row) => row.userId !== userId));
      window.dispatchEvent(new Event("l2t:community-blocks-changed"));
    } catch { if (active.current) setError("Engel kaldırılamadı. Tekrar deneyin."); }
    finally { pending.current = false; if (active.current) setBusy(""); }
  }
  if (!session) return null;
  return <>
    <button type="button" className="l2t-btn" onClick={() => void load()}><ShieldAlert size={17} /> Engellenen hesaplar</button>
    {open && <SafetyDialog title="Engellenen hesaplar" busy={Boolean(busy)} onClose={() => setOpen(false)}>
      {loading && <p role="status">Yükleniyor…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={Boolean(busy)} onClick={() => void load()}>Tekrar dene</button></div>}
      {!loading && !error && !rows.length && <p>Engellediğin hesap yok.</p>}
      {!loading && rows.map((row) => <div key={row.userId} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 12 }}><strong>@{row.authorName || "Gezgin"}</strong><button type="button" className="l2t-btn" disabled={Boolean(busy)} onClick={() => void unblock(row.userId)}>{busy === row.userId ? "Kaldırılıyor…" : "Engeli kaldır"}</button></div>)}
    </SafetyDialog>}
  </>;
}
