import TravelpayoutsWidget from "@/components/TravelpayoutsWidget";

export default function FlightsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">
        Ucuz Uçak Bileti Ara
      </h1>

      <p className="mb-6 text-gray-600">
        Türkiye ve dünyadaki uçuşları karşılaştır, uygun bileti bul.
      </p>

      <TravelpayoutsWidget />
    </main>
  );
}