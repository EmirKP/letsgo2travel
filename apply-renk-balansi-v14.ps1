$ErrorActionPreference = "Stop"

$cssPath = Join-Path (Get-Location) "app\globals.css"
if (!(Test-Path $cssPath)) {
  throw "app\globals.css bulunamadı. Bu scripti proje ana klasöründe çalıştır."
}

$start = "/* === L2T RENK BALANSI V14 START === */"
$end = "/* === L2T RENK BALANSI V14 END === */"

$css = [System.IO.File]::ReadAllText($cssPath)
$pattern = [regex]::Escape($start) + "[\s\S]*?" + [regex]::Escape($end)
$css = [regex]::Replace($css, $pattern, "")

$block = @'

/* === L2T RENK BALANSI V14 START === */
/* Sadece renk/kontrast düzeltmesi. Layout, font, hero yerleşimi ve component yapısına dokunmaz. */
:root {
  --l2t-night: #07182D !important;
  --l2t-navy: #0B1D35 !important;
  --l2t-deep: #102A4C !important;
  --l2t-ink: #172033 !important;
  --l2t-text: #172033 !important;
  --l2t-soft: #64748B !important;
  --l2t-muted: #64748B !important;
  --l2t-border: #E2E8F0 !important;
  --l2t-surface: #FFFFFF !important;
  --l2t-bg: #F5F8FC !important;

  /* Neon sarı yerine premium bal/gold tonu */
  --l2t-gold: #E9B949 !important;
  --l2t-gold-deep: #C99724 !important;
  --l2t-gold-hover: #D6A633 !important;
  --l2t-gold-soft: rgba(233, 185, 73, 0.15) !important;
  --l2t-yellow: #E9B949 !important;

  /* Ana aksiyon rengi: güven veren uçuş mavisi */
  --l2t-blue: #2563EB !important;
  --l2t-blue-2: #1D4ED8 !important;
  --l2t-primary: #2563EB !important;
  --l2t-primary-hover: #1D4ED8 !important;

  /* Turuncu patlamaları kapatmak için yumuşak destek tonu */
  --l2t-coral: #D6A633 !important;
  --l2t-success: #10B981 !important;

  --l2t-shadow: 0 10px 28px rgba(15, 23, 42, 0.08) !important;
  --l2t-shadow-lg: 0 18px 48px rgba(15, 23, 42, 0.12) !important;
}

html,
body {
  background: var(--l2t-bg) !important;
  color: var(--l2t-text) !important;
}

/* Header koyu ve temiz kalsın */
.l2t-header {
  background: linear-gradient(180deg, #0B1D35 0%, #07182D 100%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 10px 28px rgba(7, 24, 45, 0.18) !important;
}

.l2t-logo-two,
.l2t-logo-plane {
  color: var(--l2t-gold) !important;
}

.l2t-nav-link,
.l2t-nav a {
  color: rgba(255, 255, 255, 0.82) !important;
}

.l2t-nav-link:hover,
.l2t-nav a:hover,
.l2t-nav-active {
  color: #FFFFFF !important;
}

.l2t-nav a.l2t-nav-active::after,
.l2t-nav-active::after {
  background: var(--l2t-gold) !important;
}

/* Ana butonlar: sarı değil mavi. Daha güvenli ve daha premium. */
.l2t-btn:not(.l2t-btn-outline):not(.l2t-btn-ghost),
.l2t-header-cta,
.hp-hero-buttons .l2t-btn:not(.l2t-btn-outline),
.l2t-mobile-cta {
  background: linear-gradient(135deg, var(--l2t-blue), var(--l2t-blue-2)) !important;
  color: #FFFFFF !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.24) !important;
}

.l2t-btn:not(.l2t-btn-outline):not(.l2t-btn-ghost):hover,
.l2t-header-cta:hover,
.hp-hero-buttons .l2t-btn:not(.l2t-btn-outline):hover {
  background: linear-gradient(135deg, var(--l2t-blue-2), #1E40AF) !important;
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.30) !important;
}

/* Profil / ikincil buton: beyaz, okunur, premium */
.l2t-btn-outline,
.hp-hero-buttons .l2t-btn-outline {
  background: rgba(255, 255, 255, 0.94) !important;
  color: var(--l2t-navy) !important;
  border: 1px solid rgba(255, 255, 255, 0.55) !important;
  box-shadow: 0 12px 26px rgba(7, 24, 45, 0.12) !important;
}

.l2t-btn-outline:hover,
.hp-hero-buttons .l2t-btn-outline:hover {
  background: #FFFFFF !important;
  color: var(--l2t-blue) !important;
}

.l2t-btn-ghost {
  background: rgba(255, 255, 255, 0.07) !important;
  color: rgba(255, 255, 255, 0.92) !important;
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  box-shadow: none !important;
}

/* Başlıktaki neon sarıyı bal/gold tonuna çeker. */
.hp-hero-copy h1 em,
.hp-qr-price,
.l2t-logo-two,
.l2t-logo-plane,
.l2t-kicker,
.l2t-text-link,
.score-card .bento-value {
  color: var(--l2t-gold) !important;
}

/* Hero badge daha az bağırır. */
.hp-badge,
.l2t-ai-badge {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.88) !important;
  border: 1px solid rgba(233, 185, 73, 0.42) !important;
  box-shadow: none !important;
}

.hp-badge svg,
.l2t-ai-badge svg {
  color: var(--l2t-gold) !important;
}

/* Rota chipleri: sarı fiyatlar artık patlamaz. */
.hp-qr-card {
  background: rgba(255, 255, 255, 0.12) !important;
  border: 1px solid rgba(255, 255, 255, 0.20) !important;
  box-shadow: 0 10px 24px rgba(7, 24, 45, 0.16) !important;
}

.hp-qr-tag {
  background: rgba(255, 255, 255, 0.18) !important;
  color: rgba(255, 255, 255, 0.92) !important;
}

/* Kartlar ve arama alanı: temiz beyaz + yumuşak gölge */
.l2t-search-card,
.l2t-card,
.l2t-content-card,
.l2t-ai-box,
.l2t-cta-band,
.l2t-map-card,
.l2t-empty-state,
.l2t-conversion-panel,
.l2t-conversion-card {
  background: #FFFFFF !important;
  border: 1px solid var(--l2t-border) !important;
  box-shadow: var(--l2t-shadow) !important;
}

.l2t-card:hover,
.l2t-content-card:hover,
.l2t-conversion-card:hover {
  box-shadow: var(--l2t-shadow-lg) !important;
}

/* Aktif tab ve küçük vurgu alanları neon değil, sakin gold */
.l2t-tab-active,
.l2t-pill-active,
.l2t-nav-dropdown a:hover,
.l2t-dropdown-active {
  border-color: rgba(233, 185, 73, 0.45) !important;
}

.l2t-dropdown a:hover,
.l2t-dropdown-active {
  background: #F5F8FC !important;
  color: var(--l2t-blue) !important;
}

/* Form focus rengi mavi: daha ciddi ve güvenli. */
input:focus,
select:focus,
textarea:focus {
  outline-color: rgba(37, 99, 235, 0.38) !important;
  border-color: rgba(37, 99, 235, 0.45) !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.10) !important;
}

/* Eski sarı/turuncu gradientleri bağırmasın. */
.l2t-passport-cta-actions a:first-child,
.l2t-community-hero-actions a:first-child,
.l2t-country-forum-hero-actions a:first-child,
.l2t-passport-cta-card a,
.l2t-community-hero a,
.l2t-country-forum-hero a {
  background: linear-gradient(135deg, var(--l2t-blue), var(--l2t-blue-2)) !important;
  color: #FFFFFF !important;
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22) !important;
}

/* Fırsat ve uyarı etiketlerinde turuncu değil gold. */
[style*="var(--l2t-gold)"],
[style*="var(--l2t-gold-deep)"] {
  color: var(--l2t-gold);
}

@media (max-width: 760px) {
  .l2t-header {
    background: #0B1D35 !important;
  }

  .l2t-btn:not(.l2t-btn-outline):not(.l2t-btn-ghost),
  .l2t-header-cta {
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.20) !important;
  }
}
/* === L2T RENK BALANSI V14 END === */
'@

$newCss = $css.TrimEnd() + $block + [Environment]::NewLine
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[System.IO.File]::WriteAllText($cssPath, $newCss, $utf8NoBom)
Write-Host "Renk balansı V14 app/globals.css sonuna eklendi." -ForegroundColor Green
