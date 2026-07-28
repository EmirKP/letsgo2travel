"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Puzzle,
  Clipboard,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import styles from "./visa-appointment.module.css";

type PairingState = {
  executionMode: "vds" | "browser_extension";
  extensionLastSeenAt: string | null;
  pairing: {
    status: "pending" | "connected" | "revoked" | "expired";
    expires_at: string;
    connected_at: string | null;
    last_seen_at: string | null;
    browser_name: string | null;
    extension_version: string | null;
  } | null;
};

function formatDate(value: string | null) {
  if (!value) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BrowserHelperPanel({
  trackId,
  officialUrl,
}: {
  trackId: string;
  officialUrl: string | null;
}) {
  const [state, setState] = useState<PairingState | null>(null);
  const [code, setCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await authorizedFetch(`/api/visa-appointments/extension/pair?trackId=${encodeURIComponent(trackId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as { data?: PairingState; error?: string };
    if (response.ok && payload.data) setState(payload.data);
  }, [authorizedFetch, trackId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!code || state?.pairing?.status === "connected") return;
    const timer = window.setInterval(() => void loadStatus(), 3000);
    return () => window.clearInterval(timer);
  }, [code, loadStatus, state?.pairing?.status]);

  async function createCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await authorizedFetch("/api/visa-appointments/extension/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const payload = (await response.json()) as {
        data?: { code: string; expiresAt: string };
        error?: string;
        message?: string;
      };
      if (!response.ok || !payload.data) {
        setMessage(payload.error || "Bağlantı kodu oluşturulamadı.");
        return;
      }
      setCode(payload.data.code);
      setCodeExpiresAt(payload.data.expiresAt);
      setMessage(payload.message || "Bağlantı kodu oluşturuldu.");
      await loadStatus();
    } catch {
      setMessage("Bağlantı kodu oluşturulurken ağ hatası oluştu.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setMessage("Kod panoya kopyalandı.");
  }

  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await authorizedFetch(`/api/visa-appointments/extension/pair?trackId=${encodeURIComponent(trackId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      setMessage(payload.error || payload.message || "Bağlantı kaldırıldı.");
      if (response.ok) {
        setCode("");
        setCodeExpiresAt(null);
        await loadStatus();
      }
    } finally {
      setBusy(false);
    }
  }

  const connected = state?.pairing?.status === "connected";

  return (
    <div className={styles.extensionPanel}>
      <div className={styles.extensionTitle}>
        <Puzzle size={22} />
        <div>
          <strong>LetsGo2Travel Chrome Yardımcısı</strong>
          <p>iDATA sayfasındaki doğrulanmış oturumunda yalnızca görünür randevu durumunu okur.</p>
        </div>
      </div>

      {connected ? (
        <div className={styles.extensionConnected}>
          <CheckCircle2 size={21} />
          <div>
            <strong>Chrome yardımcısı bağlı</strong>
            <p>
              {state?.pairing?.browser_name || "Chrome"} · sürüm {state?.pairing?.extension_version || "1.0.0"}
              {state?.pairing?.last_seen_at ? ` · son bağlantı ${formatDate(state.pairing.last_seen_at)}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <ol className={styles.extensionSteps}>
          <li><span>1</span><div><strong>Yardımcıyı indir</strong><p>ZIP’i açıp Chrome uzantılar ekranından yükle.</p></div></li>
          <li><span>2</span><div><strong>Bağlantı kodu oluştur</strong><p>Kodu uzantıdaki alana yaz. Kod 10 dakika geçerlidir.</p></div></li>
          <li><span>3</span><div><strong>iDATA sayfasını açık tut</strong><p>Doğrulamayı kendin tamamla; yardımcı görünür sonucu LetsGo2Travel’a iletsin.</p></div></li>
        </ol>
      )}

      {code && !connected && (
        <div className={styles.extensionCodeBox}>
          <span>Bağlantı kodun</span>
          <div>
            <strong>{code}</strong>
            <button type="button" onClick={() => void copyCode()} aria-label="Bağlantı kodunu kopyala">
              <Clipboard size={16} /> Kopyala
            </button>
          </div>
          <small>{codeExpiresAt ? `${formatDate(codeExpiresAt)} tarihine kadar geçerli` : "10 dakika geçerli"}</small>
        </div>
      )}

      <div className={styles.extensionActions}>
        <a href="/downloads/letsgo2travel-vize-yardimcisi-v1.zip" download>
          <Download size={16} /> Chrome yardımcısını indir
        </a>
        {!connected ? (
          <button type="button" onClick={() => void createCode()} disabled={busy}>
            {busy ? <LoaderCircle className={styles.spin} size={16} /> : <Link2 size={16} />}
            {code ? "Yeni kod oluştur" : "Bağlantı kodu oluştur"}
          </button>
        ) : (
          <button type="button" onClick={() => void disconnect()} disabled={busy}>
            <Unplug size={16} /> Bağlantıyı kaldır
          </button>
        )}
        {officialUrl && (
          <a href={officialUrl} target="_blank" rel="noreferrer" className={styles.extensionOfficialLink}>
            iDATA sayfasını aç <ExternalLink size={15} />
          </a>
        )}
      </div>

      <div className={styles.extensionPrivacy}>
        <ShieldCheck size={17} />
        <span>Çerez, parola, kart bilgisi ve form alanı değerleri gönderilmez. Sonuç gönderimi kullanıcı onayıyla veya açık sekmede etkinleştirilen 5 dakikalık izlemeyle yapılır.</span>
      </div>

      {message && <p className={styles.extensionMessage}>{message}</p>}
    </div>
  );
}
