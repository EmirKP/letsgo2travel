export default function FlightsPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow">
        <h1 className="text-3xl font-black">Uçuş Arama</h1>

        <p className="mt-3 text-slate-600">
          Uçuş aramak için ana arama sayfasını kullan.
        </p>

        <a
          href="/arama"
          className="mt-6 inline-block rounded-xl bg-yellow-400 px-6 py-4 font-black text-slate-950"
        >
          Arama Sayfasına Git
        </a>
      </section>
    </main>
  );
}