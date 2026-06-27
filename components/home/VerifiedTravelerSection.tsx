"use client";

import Link from "next/link";
import { Compass, KeyRound, Star } from "lucide-react";

export default function VerifiedTravelerSection() {
  return (
    <section className="py-16 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Belgeli Gezgin Topluluğu<br/><span style={{fontSize: "0.7em", opacity: 0.9, fontWeight: 600}}>Sadece gerçekten gidenler cevap yazsın.</span></h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Bir ülkeye gittiğini belgeleyen kullanıcılar, o ülke hakkında deneyim paylaşabilir. Böylece forumda tahmin değil, gerçek saha bilgisi öne çıkar.
        </p>
      </div>

      <div className="l2t-belgeli-gezgin-grid-3">
        <div className="l2t-belgeli-gezgin-card text-center flex flex-col items-center">
          <div className="bg-[#10B981]/10 p-4 rounded-full mb-4">
            <Compass className="w-8 h-8 text-[#10B981]" />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">1. Ülkeni Doğrula</h3>
          <p className="l2t-belgeli-gezgin-text mb-6 flex-grow">Basit bir belge veya ikna edici fotoğrafla gittiğin ülkeyi doğrula.</p>
          <Link href="/profil/dogrulamalar" className="l2t-belgeli-gezgin-btn w-full">Ülke Doğrula</Link>
        </div>

        <div className="l2t-belgeli-gezgin-card text-center flex flex-col items-center">
          <div className="bg-[#F5B81B]/10 p-4 rounded-full mb-4">
            <KeyRound className="w-8 h-8 text-[#F5B81B]" />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">2. Kilitleri Aç</h3>
          <p className="l2t-belgeli-gezgin-text mb-6 flex-grow">Onaylanınca ülke haritanda açılır ve o ülke hakkında yorum/cevap yazabilirsin.</p>
          <Link href="/forum/yeni" className="l2t-belgeli-gezgin-btn-outline w-full">Forumda Soru Sor</Link>
        </div>

        <div className="l2t-belgeli-gezgin-card text-center flex flex-col items-center">
          <div className="bg-[#60A5FA]/10 p-4 rounded-full mb-4">
            <Star className="w-8 h-8 text-[#60A5FA]" />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">3. Faydalı Bilgiyle Yüksel</h3>
          <p className="l2t-belgeli-gezgin-text mb-6 flex-grow">Gezginlere yardımcı olan cevaplar Kaşifler Ligi’nde seni öne çıkarır.</p>
          <Link href="/kasifler-ligi" className="l2t-belgeli-gezgin-btn-outline w-full">Kaşifler Ligi'ni Gör</Link>
        </div>
      </div>
    </section>
  );
}
