// Opsiyonel referans: Proje Tailwind v4 + custom CSS kullandığı için bu dosya otomatik çalıştırılmaz.
// Tailwind config kullanacaksan renkleri böyle tanımla.
module.exports = {
  theme: {
    extend: {
      colors: {
        l2t: {
          bg: "#F9FAFB",
          surface: "#FFFFFF",
          heading: "#111827",
          text: "#334155",
          muted: "#6B7280",
          primary: "#6366F1",
          primaryHover: "#4F46E5",
          success: "#10B981",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Inter", "sans-serif"],
        body: ["var(--font-body)", "Inter", "sans-serif"],
      },
      borderRadius: {
        premium: "16px",
        video: "12px",
      },
      boxShadow: {
        premium: "0 10px 30px rgba(17, 24, 39, 0.06)",
        premiumHover: "0 18px 45px rgba(17, 24, 39, 0.10)",
      },
    },
  },
};
