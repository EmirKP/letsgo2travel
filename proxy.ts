import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";

// Uçuş arama/karşılaştırma ürünü kalıcı olarak kaldırıldı; eski URL'ler
// kontrollü 410 (Gone) döner ve hiçbir job/sağlayıcı çağrısı üretmez.
// Bağımsız FİYAT ALARMI korunan bir üründür (01.09.2026 hotfix) ve bu
// listede YER ALMAZ. (/api/fiyat-alarmi eski newsletter alias'ıdır; 410 kalır.)
const GONE_PAGE_PREFIXES = [
  "/ucak-bileti-ara",
  "/ucak-bileti",
  "/canli-ucus",
  "/flights",
  "/kampanyalar",
  "/admin/ucus-kaynaklari",
];

const GONE_API_PREFIXES = [
  "/api/flights",
  "/api/internal/flights",
  "/api/travelpayouts-search",
  "/api/canli-ucuslar",
  "/api/fiyat-alarmi",
  "/api/firsatlar",
  "/api/one-cikan-rotalar",
  "/api/ucak-bileti",
  "/api/admin/flight-sources",
  "/api/admin/biletler",
  "/api/cron/update-prices",
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const GONE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bu sayfa kaldırıldı — LetsGo2Travel</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#F8F5EE;color:#172033;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;}
  .card{background:#fff;border-radius:24px;max-width:520px;padding:40px;box-shadow:0 10px 40px rgba(7,27,51,.08);text-align:center;}
  h1{color:#071B33;font-size:1.5rem;margin:0 0 12px;}
  p{color:#667085;line-height:1.6;margin:0 0 24px;}
  a{display:inline-block;background:#071B33;color:#F6C445;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;}
</style>
</head>
<body>
<main class="card">
<h1>Bu sayfa kaldırıldı</h1>
<p>LetsGo2Travel artık uçak bileti arama veya fiyat karşılaştırma hizmeti sunmuyor. Etkinlikleri ve destinasyonları keşfedebilir, uçuş hariç bütçenle seyahat planı oluşturabilir ve satın aldığın bileti Seyahat Kokpiti'ne ekleyebilirsin.</p>
<a href="/">Keşfetmeye başla</a>
</main>
</body>
</html>`;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (GONE_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return NextResponse.json(
      {
        error: "gone",
        message:
          "Bu uç kalıcı olarak kaldırıldı. LetsGo2Travel uçuş arama veya fiyat karşılaştırma hizmeti sunmuyor.",
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (GONE_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return new NextResponse(GONE_HTML, {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    const session = await verifyAdminSessionToken(
      request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    );
    if (!session) {
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete(ADMIN_SESSION_COOKIE);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/ucak-bileti-ara/:path*",
    "/ucak-bileti-ara",
    "/ucak-bileti/:path*",
    "/ucak-bileti",
    "/canli-ucus/:path*",
    "/canli-ucus",
    "/flights/:path*",
    "/flights",
    "/kampanyalar/:path*",
    "/kampanyalar",
    "/api/flights/:path*",
    "/api/internal/flights/:path*",
    "/api/travelpayouts-search",
    "/api/canli-ucuslar",
    "/api/fiyat-alarmi",
    "/api/firsatlar",
    "/api/one-cikan-rotalar",
    "/api/ucak-bileti/:path*",
    "/api/ucak-bileti",
    "/api/admin/flight-sources/:path*",
    "/api/admin/flight-sources",
    "/api/admin/biletler/:path*",
    "/api/admin/biletler",
    "/api/cron/update-prices",
  ],
};
