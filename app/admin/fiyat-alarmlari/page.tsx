"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type FiyatAlarmi = {
  id: number;
  email: string;
  nereden: string;
  nereye: string;
  maksimumFiyat: number;
  gidisTarihi: string;
  donusTarihi: string;
  yolcu: string;
  durum: string;
  notlar: string;
  createdAt: string;
};

type AramaKaydi = {
  id: number;
  nereden: string;
  nereye: string;
  gidisTarihi: string;
  donusTarihi: string;
  yolcu: string;
  vize: string;
  kategori: string;
  aktarma: string;
  maksimumFiyat: number;
  sonucSayisi: number;
  createdAt: string;
};

const durumlar = ["Yeni", "Takipte", "Bilgilendirildi", "Kapatıldı"];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat || 0)} TL`;
}

function tarihYaz(tarih: string) {
  if (!tarih) return "—";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(tarih));
  } catch {
    return tarih;
  }
}

export default function FiyatAlarmlariPage() {
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [sifre, setSifre] = useState("");
  const [alarmlar, setAlarmlar] = useState<FiyatAlarmi[]>([]);
  const [aramalar, setAramalar] = useState<AramaKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [durumFiltresi, setDurumFiltresi] = useState("Tümü");
  const [arama, setArama] = useState("");

  async function verileriYukle(sifreDegeri: string) {
    setYukleniyor(true);
    setHata("");

    try {
      const response = await fetch("/api/admin/fiyat-alarmlari", {
        headers: {
          "x-admin-password": sifreDegeri,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Veriler alınamadı.");
      }

      setAlarmlar(data.alarmlar || []);
      setAramalar(data.aramalar || []);
      return true;
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
      return false;
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    const kayitliSifre = localStorage.getItem("letsgo-admin-password");

    if (kayitliSifre) {
      setSifre(kayitliSifre);
      verileriYukle(kayitliSifre).then((basarili) => {
        if (basarili) setGirisYapildi(true);
      });
    }
  }, []);

  async function girisYap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const basarili = await verileriYukle(sifre);

    if (basarili) {
      setGirisYapildi(true);
      localStorage.setItem("letsgo-admin-password", sifre);
    } else {
      setHata("Şifre yanlış olabilir.");
    }
  }

  async function alarmGuncelle(
    alarm: FiyatAlarmi,
    yeniDurum: string,
    yeniNotlar?: string
  ) {
    setYukleniyor(true);
    setHata("");
    setMesaj("");

    try {
      const response = await fetch(`/api/admin/fiyat-alarmlari/${alarm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": sifre,
        },
        body: JSON.stringify({
          durum: yeniDurum,
          notlar: yeniNotlar ?? alarm.notlar,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Alarm güncellenemedi.");
      }

      await verileriYukle(sifre);
      setMesaj("Fiyat alarmı güncellendi.");
      setTimeout(() => setMesaj(""), 2200);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  async function alarmSil(id: number) {
    const eminMi = confirm("Bu fiyat alarmını silmek istediğine emin misin?");
    if (!eminMi) return;

    setYukleniyor(true);
    setHata("");

    try {
      const response = await fetch(`/api/admin/fiyat-alarmlari/${id}`, {
        method: "DELETE",
        headers: {
          "x-admin-password": sifre,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Alarm silinemedi.");
      }

      await verileriYukle(sifre);
      setMesaj("Fiyat alarmı silindi.");
      setTimeout(() => setMesaj(""), 2200);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  const filtrelenmisAlarmlar = useMemo(() => {
    return alarmlar.filter((alarm) => {
      const metin = `${alarm.email} ${alarm.nereden} ${alarm.nereye} ${alarm.durum}`.toLocaleLowerCase(
        "tr-TR"
      );

      const aramaUyuyor = metin.includes(arama.toLocaleLowerCase("tr-TR"));
      const durumUyuyor =
        durumFiltresi === "Tümü" || alarm.durum === durumFiltresi;

      return aramaUyuyor && durumUyuyor;
    });
  }, [alarmlar, arama, durumFiltresi]);

  const popülerRotalar = useMemo(() => {
    const sayac = new Map<string, number>();

    aramalar.forEach((kayit) => {
      const rota = `${kayit.nereden || "Tümü"} → ${kayit.nereye || "Tümü"}`;
      sayac.set(rota, (sayac.get(rota) || 0) + 1);
    });

    return Array.from(sayac.entries())
      .map(([rota, adet]) => ({ rota, adet }))
      .sort((a, b) => b.adet - a.adet)
      .slice(0, 8);
  }, [aramalar]);

  const istatistik = useMemo(() => {
    const yeni = alarmlar.filter((alarm) => alarm.durum === "Yeni").length;
    const takipte = alarmlar.filter((alarm) => alarm.durum === "Takipte").length;
    const kapali = alarmlar.filter(
      (alarm) => alarm.durum === "Kapatıldı"
    ).length;

    const ortalamaMaksimum = alarmlar.length
      ? Math.round(
          alarmlar.reduce(
            (toplam, alarm) => toplam + Number(alarm.maksimumFiyat || 0),
            0
          ) / alarmlar.length
        )
      : 0;

    return {
      toplamAlarm: alarmlar.length,
      yeni,
      takipte,
      kapali,
      toplamArama: aramalar.length,
      ortalamaMaksimum,
    };
  }, [alarmlar, aramalar]);

  if (!girisYapildi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5">
        <form
          onSubmit={girisYap}
          className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
        >
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel"
            className="mx-auto h-24 w-auto"
          />

          <h1 className="mt-6 text-center text-3xl font-black">
            Fiyat Alarmları
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Kullanıcı talepleri ve arama istatistikleri.
          </p>

          <label className="mt-8 block text-sm font-black text-slate-600">
            Admin şifresi
          </label>

          <input
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            type="password"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
          />

          {hata && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
              {hata}
            </p>
          )}

          <button
            disabled={yukleniyor}
            className="mt-5 w-full rounded-xl bg-yellow-400 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {yukleniyor ? "Kontrol ediliyor..." : "Giriş Yap"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/admin" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-xl font-black">Fiyat Alarmları V5</h1>
              <p className="text-sm text-slate-500">
                Kullanıcı talepleri ve arama analizleri
              </p>
            </div>
          </a>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => verileriYukle(sifre)}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950"
            >
              Yenile
            </button>

            <a
              href="/admin"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              Admin Panel
            </a>

            <a
              href="/"
              className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black"
            >
              Siteyi Gör
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Toplam alarm</p>
            <p className="mt-2 text-4xl font-black">
              {istatistik.toplamAlarm}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Yeni</p>
            <p className="mt-2 text-4xl font-black">{istatistik.yeni}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Takipte</p>
            <p className="mt-2 text-4xl font-black">{istatistik.takipte}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Arama kaydı</p>
            <p className="mt-2 text-4xl font-black">
              {istatistik.toplamArama}
            </p>
          </div>

          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow">
            <p className="text-sm font-black text-slate-400">
              Ortalama hedef fiyat
            </p>
            <p className="mt-2 text-3xl font-black">
              {fiyatYaz(istatistik.ortalamaMaksimum)}
            </p>
          </div>
        </div>

        {(hata || mesaj) && (
          <div className="mt-5">
            {hata && (
              <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-600">
                {hata}
              </p>
            )}

            {mesaj && (
              <p className="rounded-2xl bg-green-50 p-4 font-bold text-green-700">
                {mesaj}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[1fr_420px]">
        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">Fiyat Alarmı Talepleri</h2>
              <p className="text-sm text-slate-500">
                Kullanıcıların istediği rotaları ve hedef fiyatları buradan takip et.
              </p>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="E-posta, rota veya durum ara..."
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400 md:col-span-2"
            />

            <select
              value={durumFiltresi}
              onChange={(e) => setDurumFiltresi(e.target.value)}
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
            >
              <option>Tümü</option>
              {durumlar.map((durum) => (
                <option key={durum}>{durum}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4">
            {filtrelenmisAlarmlar.map((alarm) => (
              <article
                key={alarm.id}
                className="rounded-2xl border bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">
                        {alarm.durum}
                      </span>

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                        {tarihYaz(alarm.createdAt)}
                      </span>
                    </div>

                    <h3 className="mt-3 text-xl font-black">
                      {alarm.nereden} → {alarm.nereye}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {alarm.email} · {alarm.yolcu} yolcu
                    </p>

                    <p className="mt-3 text-3xl font-black">
                      Hedef: {fiyatYaz(alarm.maksimumFiyat)}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      Gidiş: {alarm.gidisTarihi || "Seçilmedi"} · Dönüş:{" "}
                      {alarm.donusTarihi || "Seçilmedi"}
                    </p>

                    {alarm.notlar && (
                      <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-slate-600">
                        Not: {alarm.notlar}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-80">
                    {durumlar.map((durum) => (
                      <button
                        key={durum}
                        onClick={() => alarmGuncelle(alarm, durum)}
                        className={
                          alarm.durum === durum
                            ? "rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                            : "rounded-xl bg-slate-200 px-4 py-3 text-sm font-black"
                        }
                      >
                        {durum}
                      </button>
                    ))}

                    <button
                      onClick={() => {
                        const yeniNot = prompt(
                          "Bu alarm için not yaz:",
                          alarm.notlar || ""
                        );

                        if (yeniNot !== null) {
                          alarmGuncelle(alarm, alarm.durum, yeniNot);
                        }
                      }}
                      className="rounded-xl border px-4 py-3 text-sm font-black"
                    >
                      Not Ekle
                    </button>

                    <button
                      onClick={() => alarmSil(alarm.id)}
                      className="rounded-xl bg-red-100 px-4 py-3 text-sm font-black text-red-600"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {filtrelenmisAlarmlar.length === 0 && (
              <div className="rounded-2xl bg-slate-100 p-8 text-center">
                <p className="font-black">Fiyat alarmı bulunamadı.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="grid h-fit gap-6">
          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Popüler Aramalar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Kullanıcıların en çok aradığı rotalar.
            </p>

            <div className="mt-5 grid gap-3">
              {popülerRotalar.map((rota) => (
                <div
                  key={rota.rota}
                  className="rounded-2xl bg-slate-100 p-4"
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-black">{rota.rota}</p>
                    <p className="font-black text-yellow-700">
                      {rota.adet} kez
                    </p>
                  </div>
                </div>
              ))}

              {popülerRotalar.length === 0 && (
                <p className="text-sm text-slate-500">
                  Henüz arama kaydı yok.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Son Aramalar</h2>

            <div className="mt-5 grid gap-3">
              {aramalar.slice(0, 12).map((kayit) => (
                <div key={kayit.id} className="rounded-2xl border p-4">
                  <p className="font-black">
                    {kayit.nereden || "Tümü"} → {kayit.nereye || "Tümü"}
                  </p>

                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {kayit.sonucSayisi} sonuç · {kayit.kategori} ·{" "}
                    {kayit.vize}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {tarihYaz(kayit.createdAt)}
                  </p>
                </div>
              ))}

              {aramalar.length === 0 && (
                <p className="text-sm text-slate-500">
                  Henüz arama kaydı yok.
                </p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}