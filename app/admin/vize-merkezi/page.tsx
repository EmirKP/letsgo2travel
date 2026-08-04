"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { APPOINTMENT_STATUS_INFO } from "@/lib/visa/appointmentStatus";
import styles from "./AdminVisaCenter.module.css";

type VisaPage = {
  id: string;
  country_name: string;
  visa_title: string;
  appointment_status: string | null;
  appointment_note: string | null;
  source_note: string | null;
  official_source_url: string | null;
  last_checked_at: string | null;
};

export default function AdminVizeMerkeziPage() {
  const [pages, setPages] = useState<VisaPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [officialSourceUrl, setOfficialSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchPages() {
    const { data } = await supabase.from("visa_center_pages").select("id,country_name,visa_title,appointment_status,appointment_note,source_note,official_source_url,last_checked_at").order("country_name", { ascending: true });
    setPages((data as VisaPage[]) || []);
    setLoading(false);
  }

  useEffect(() => { void fetchPages(); }, []);

  function selectPage(page: VisaPage) {
    setSelectedId(page.id);
    setStatus(page.appointment_status || "bilgi_yok");
    setNote(page.appointment_note || "");
    setSourceNote(page.source_note || "");
    setOfficialSourceUrl(page.official_source_url || "");
  }

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/visa-center/${selectedId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_status: status, appointment_note: note, source_note: sourceNote, official_source_url: officialSourceUrl }),
      });
      if (!response.ok) throw new Error();
      setSelectedId(null);
      await fetchPages();
    } catch {
      window.alert("Güncelleme başarısız oldu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <Link href="/admin">← Admin merkezine dön</Link>
          <h1>Vize Merkezi Yönetimi</h1>
          <p>Yayımlanan vize rehberlerindeki manuel randevu notlarını yönet.</p>
        </header>
        {loading ? <div className={styles.empty}>Yükleniyor...</div> : (
          <div className={styles.grid}>
            <div className={styles.list}>
              {pages.map((page) => (
                <button type="button" key={page.id} className={`${styles.item} ${selectedId === page.id ? styles.selected : ""}`} onClick={() => selectPage(page)}>
                  <div className={styles.itemTop}><strong>{page.country_name} — {page.visa_title}</strong><em>{page.appointment_status || "bilgi_yok"}</em></div>
                  <span>Son kontrol: {page.last_checked_at ? new Date(page.last_checked_at).toLocaleString("tr-TR") : "Yok"}</span>
                </button>
              ))}
            </div>
            <aside className={styles.editor}>
              {!selectedId ? <div className={styles.empty}>Düzenlemek için bir rehber seç.</div> : (
                <>
                  <h2>Randevu durumunu güncelle</h2>
                  <div className={styles.field}><label>Durum</label><select value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(APPOINTMENT_STATUS_INFO).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
                  <div className={styles.field}><label>Kullanıcıya gösterilecek not</label><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></div>
                  <div className={styles.field}><label>Kaynak / iç not</label><textarea rows={3} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} /></div>
                  <div className={styles.field}><label>Kullanıcıya gösterilecek resmî kaynak URL’si</label><input type="url" inputMode="url" placeholder="https://..." value={officialSourceUrl} onChange={(event) => setOfficialSourceUrl(event.target.value)} /></div>
                  <div className={styles.warning}>Bu bilgi kesin randevu garantisi olarak yayımlanmamalıdır.</div>
                  <button type="button" className={styles.save} onClick={() => void save()} disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
