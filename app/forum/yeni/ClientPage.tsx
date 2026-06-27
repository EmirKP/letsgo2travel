"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, PenTool, AlertCircle, Info, Loader2, CheckCircle2, AlertTriangle, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

// Form bileşeni - Sadece giriş yapmış kullanıcılar için render edilecek
function NewTopicForm({ session }: { session: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [title, setTitle] = useState(searchParams?.get("title") || "");
  const [content, setContent] = useState("");
  
  const initialCategorySlug = searchParams?.get("kategori");
  let defaultCategory = "";
  if (initialCategorySlug === "vize-konsolosluk") defaultCategory = "Vize & Konsolosluk";
  else if (initialCategorySlug === "esim-internet") defaultCategory = "eSIM & İnternet";
  else if (initialCategorySlug === "ilk-kez-yurt-disina-cikacaklar") defaultCategory = "İlk Kez Yurt Dışına Çıkacaklar";
  else if (initialCategorySlug === "ulke-bazli-sorunlar") defaultCategory = "Ülke Bazlı Sorunlar";

  const [category, setCategory] = useState(defaultCategory);
  const [country, setCountry] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const forumCategories = [
    "Genel Seyahat Soruları", "Ülke Bazlı Sorunlar", "Vize & Konsolosluk", 
    "Uçak Bileti & Havalimanı", "Otel & Konaklama", "eSIM & İnternet", 
    "İlk Kez Yurt Dışına Çıkacaklar", "Kamp & Doğa", "Balıkçılık", "Avcılık"
  ];

  const popularCountries = [
    "Genel / Ülke Bağımsız", "Almanya", "Birleşik Arap Emirlikleri", "Sırbistan", 
    "Karadağ", "Bosna-Hersek", "Gürcistan", "Kosova", "İtalya", "Fransa", "Yunanistan"
  ];

  const generateSlug = (text: string) => {
    const trMap: Record<string, string> = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
    };
    let slug = text.replace(/[çğıöşüÇĞİÖŞÜ]/g, match => trMap[match] || match);
    slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    return slug + '-' + Math.random().toString(36).substring(2, 8);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!category) {
      setError("Lütfen bir kategori seçin.");
      return;
    }

    if (title.trim().length < 5) {
      setError("Başlık en az 5 karakter olmalıdır.");
      return;
    }

    if (content.trim().length < 20) {
      setError("İçerik en az 20 karakter olmalıdır.");
      return;
    }

    setIsSubmitting(true);

    try {
      const generatedSlug = generateSlug(title);
      const { error: dbError } = await supabase.from("forum_topics").insert([
        {
          slug: generatedSlug,
          title: title.trim(),
          content: content.trim(),
          category: category,
          country_slug: country === "Genel / Ülke Bağımsız" ? null : generateSlug(country).split('-')[0],
          author_id: session.user.id,
          author_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || "Gezgin",
          status: "pending"
        }
      ]);

      if (dbError) {
        if (dbError.code === "42P01") {
          setError("Forum konu altyapısı şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.");
        } else if (dbError.code === "42501" || dbError.message?.includes("row level security")) {
          setError("Konu kaydedilemedi. Lütfen tekrar giriş yapıp deneyin.");
        } else {
          console.error("Supabase Error:", dbError);
          setError("Konu kaydedilemedi. Forum altyapısında geçici bir sorun olabilir.");
        }
      } else {
        setSuccess("Konu başarıyla gönderildi. Moderasyon onayından sonra yayına alınacaktır.");
        setTitle("");
        setContent("");
        setCategory("");
        setCountry("");
        setTimeout(() => {
          router.push("/forum");
        }, 3000);
      }
    } catch (err: any) {
      setError("Bağlantı hatası oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="l2t-page">
      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
        
        <Link href="/forum" style={{ color: "var(--l2t-soft)", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "600" }}>
          <ArrowLeft size={16} /> Foruma Dön
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div style={{ width: "56px", height: "56px", background: "linear-gradient(135deg, var(--l2t-gold), #d97706)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l2t-night)", boxShadow: "0 8px 24px rgba(245,158,11,0.2)" }}>
            <PenTool size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: "2rem", color: "var(--l2t-text)", margin: 0, fontWeight: "800" }}>Yeni Konu Aç</h1>
            <p style={{ color: "var(--l2t-soft)", margin: "4px 0 0", fontSize: "0.95rem" }}>Deneyimini paylaş veya topluluğa sor.</p>
          </div>
        </div>

        {/* Uyarı */}
        <div style={{ background: "rgba(14, 165, 233, 0.1)", borderLeft: "4px solid var(--l2t-blue)", padding: "16px 20px", borderRadius: "0 12px 12px 0", marginBottom: "24px", display: "flex", gap: "12px" }}>
          <Info size={20} color="var(--l2t-blue)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p style={{ margin: 0, color: "var(--l2t-blue)", fontSize: "0.9rem", lineHeight: "1.6" }}>
            Lütfen konuyu açmadan önce <Link href="/topluluk-kurallari" style={{ color: "var(--l2t-text)", fontWeight: "600" }}>Topluluk Kuralları</Link>'nı okuyun. 
            Telefon numarası, TC Kimlik No gibi kişisel verilerinizi paylaşmayın.
          </p>
        </div>

        {error && (
          <div style={{ background: "rgba(239, 68, 68, 0.1)", borderLeft: "4px solid var(--l2t-danger)", padding: "16px 20px", borderRadius: "0 12px 12px 0", marginBottom: "24px", color: "var(--l2t-danger)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "12px", fontWeight: "600" }}>
            <AlertTriangle size={20} /> {error}
          </div>
        )}

        {success && (
          <div style={{ background: "rgba(16, 185, 129, 0.1)", borderLeft: "4px solid var(--l2t-success)", padding: "20px", borderRadius: "12px", marginBottom: "24px", color: "var(--l2t-success)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "16px", boxShadow: "0 4px 12px rgba(16,185,129,0.1)", fontWeight: "600" }}>
            <CheckCircle2 size={28} /> 
            <div>
              <strong style={{ display: "block", marginBottom: "4px" }}>Başarılı!</strong>
              {success} Yönlendiriliyorsunuz...
            </div>
          </div>
        )}

        <div className="l2t-glass-card" style={{ padding: "40px" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Kategori ve Ülke */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--l2t-soft)" }}>Kategori Seç *</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  disabled={isSubmitting || !!success}
                  required
                  className="l2t-form-control"
                  style={{ appearance: "none" }}
                >
                  <option value="" disabled>Kategori seçiniz</option>
                  {forumCategories.map((cat, i) => (
                    <option key={i} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--l2t-soft)" }}>Ülke (Opsiyonel)</label>
                <select 
                  value={country} 
                  onChange={e => setCountry(e.target.value)}
                  disabled={isSubmitting || !!success}
                  className="l2t-form-control"
                  style={{ appearance: "none" }}
                >
                  <option value="">İlgili ülkeyi seçiniz</option>
                  {popularCountries.map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Başlık */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--l2t-soft)" }}>Konu Başlığı *</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={isSubmitting || !!success}
                placeholder="Örn: Saraybosna'ya 3 günlük gezi ne kadara mal olur?"
                required
                minLength={5}
                maxLength={100}
                className="l2t-form-control"
              />
              <span style={{ fontSize: "0.8rem", color: "var(--l2t-muted)", textAlign: "right" }}>{title.length}/100</span>
            </div>

            {/* İçerik */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--l2t-soft)" }}>İçerik *</label>
              <textarea 
                value={content}
                onChange={e => setContent(e.target.value)}
                disabled={isSubmitting || !!success}
                placeholder="Sorunuzu veya deneyiminizi detaylıca anlatın..."
                required
                minLength={20}
                className="l2t-form-control"
                style={{ minHeight: "200px", resize: "vertical" }}
              ></textarea>
              <span style={{ fontSize: "0.8rem", color: "var(--l2t-muted)", textAlign: "right" }}>En az 20 karakter</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "24px", borderTop: "1px solid var(--l2t-border)" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--l2t-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertCircle size={14} /> Konu açarak kuralları kabul etmiş sayılırsınız.
              </p>
              <button 
                type="submit" 
                disabled={isSubmitting || !!success}
                className="l2t-button l2t-button-gold" 
                style={{ cursor: (isSubmitting || !!success) ? "not-allowed" : "pointer", opacity: (isSubmitting || !!success) ? 0.7 : 1, display: "flex", gap: "8px" }}
              >
                {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Gönderiliyor...</> : "Gönder"}
              </button>
            </div>
            
          </form>
        </div>

      </div>
    </div>
  );
}

export default function NewTopicPage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch(console.error);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div className="l2t-page">
        <div className="l2t-wrap" style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 20px" }}>
          <Link href="/forum" style={{ color: "var(--l2t-soft)", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px", fontSize: "0.95rem", fontWeight: "600" }}>
            <ArrowLeft size={16} /> Foruma Dön
          </Link>
          <div className="l2t-glass-card" style={{ padding: "48px 32px", textAlign: "center" }}>
            <User size={64} color="var(--l2t-soft)" style={{ margin: "0 auto 24px" }} />
            <h1 style={{ fontSize: "1.8rem", color: "var(--l2t-text)", fontWeight: "800", marginBottom: "16px" }}>Giriş Yapmanız Gerekiyor</h1>
            <p style={{ color: "var(--l2t-soft)", marginBottom: "32px", fontSize: "1.05rem", lineHeight: "1.6" }}>
              Yeni bir konu açmak ve deneyimlerinizi toplulukla paylaşmak için lütfen giriş yapın veya ücretsiz kayıt olun.
            </p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/auth/login" className="l2t-button l2t-button-blue">
                Giriş yap
              </Link>
              <Link href="/auth/register" className="l2t-button" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--l2t-border)", color: "var(--l2t-text)" }}>
                Hesap oluştur
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="l2t-page" style={{ minHeight: "80vh", display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" size={40} color="var(--l2t-gold)" /></div>}>
      <NewTopicForm session={session} />
    </Suspense>
  );
}
