"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-client";

type Visibility = { ready: boolean; hidden: Set<string>; error: boolean };
const ForumVisibility = createContext<Visibility>({ ready: false, hidden: new Set(), error: false });

// Web sessions are stored in the browser. Keep UGC concealed until that
// session's server-backed block list is checked; never flash blocked authors.
export function ForumSafetyProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<Visibility>({ ready: false, hidden: new Set(), error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let generation = 0;
    let stopped = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      const mine = ++generation;
      controller?.abort();
      controller = new AbortController();
      const currentController = controller;
      const signal = currentController.signal;
      const timeout = window.setTimeout(() => currentController.abort(), 15_000);
      setVisibility({ ready: false, hidden: new Set(), error: false });
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (stopped || generation !== mine) return;
        if (!data.session) {
          setVisibility({ ready: true, hidden: new Set(), error: false });
          return;
        }
        const response = await fetch("/api/country-community/blocks", {
          headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal,
        });
        if (!response.ok) throw new Error("blocks_unavailable");
        const payload = await response.json();
        if (!Array.isArray(payload.hiddenUserIds)) throw new Error("invalid_blocks");
        if (!stopped && generation === mine) setVisibility({ ready: true, hidden: new Set(payload.hiddenUserIds), error: false });
      } catch {
        if (!stopped && generation === mine) setVisibility({ ready: false, hidden: new Set(), error: true });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    const changed = () => { void refresh(); };
    window.addEventListener("l2t:community-blocks-changed", changed);
    return () => { stopped = true; generation++; controller?.abort(); subscription.unsubscribe(); window.removeEventListener("l2t:community-blocks-changed", changed); };
  }, [retry]);
  return <ForumVisibility.Provider value={visibility}>
    {visibility.error ? <p role="alert" style={{ padding: 16 }}>Topluluk erişimi kontrol edilemedi. <button type="button" onClick={() => setRetry(value => value + 1)}>Yeniden dene</button></p> : null}
    {children}
  </ForumVisibility.Provider>;
}

export function ForumUserContent({ authorId, children, showHiddenMessage = false }: { authorId?: string | null; children: ReactNode; showHiddenMessage?: boolean }) {
  const visibility = useContext(ForumVisibility);
  if (!visibility.ready) return null;
  if (authorId && visibility.hidden.has(authorId)) return showHiddenMessage ? <p role="status">Bu kullanıcının içeriği engelleme tercihi nedeniyle gösterilmiyor.</p> : null;
  return children;
}
