const fs = require('fs');
const path = require('path');

const cssPath = path.join(process.cwd(), 'app', 'globals.css');
if (!fs.existsSync(cssPath)) {
  console.error('HATA: app/globals.css bulunamadı. Bu dosyayı proje ana klasöründe çalıştır.');
  process.exit(1);
}

const start = '/* === L2T KONTRAST FIX V14D START === */';
const end = '/* === L2T KONTRAST FIX V14D END === */';
let css = fs.readFileSync(cssPath, 'utf8');
const pattern = new RegExp(start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
css = css.replace(pattern, '').trimEnd();

const block = `

${start}
/*
  Sadece ana sayfadaki hızlı aksiyon / conversion kartlarının kontrastını düzeltir.
  Layout, font, hero ve arama formu yerleşimine dokunmaz.
*/

.l2t-conversion-panel {
  background: linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 64%, #FFF7E4 100%) !important;
  color: #172033 !important;
  border: 1px solid #E2E8F0 !important;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08) !important;
}

.l2t-conversion-panel,
.l2t-conversion-panel * {
  opacity: 1 !important;
  text-shadow: none !important;
}

.l2t-conversion-panel *:not(svg):not(path) {
  color: #172033 !important;
  -webkit-text-fill-color: #172033 !important;
}

.l2t-conversion-panel h1,
.l2t-conversion-panel h2,
.l2t-conversion-panel h3,
.l2t-conversion-panel h4,
.l2t-conversion-panel h5,
.l2t-conversion-panel h6,
.l2t-conversion-panel strong,
.l2t-conversion-card strong,
.l2t-conversion-card h3,
.l2t-conversion-card h4 {
  color: #0B1D35 !important;
  -webkit-text-fill-color: #0B1D35 !important;
}

.l2t-conversion-panel p,
.l2t-conversion-panel small,
.l2t-conversion-card p,
.l2t-conversion-card .muted,
.l2t-conversion-card [class*="desc"],
.l2t-conversion-card [class*="text"] {
  color: #5B6C82 !important;
  -webkit-text-fill-color: #5B6C82 !important;
}

.l2t-conversion-panel a,
.l2t-conversion-panel a *,
.l2t-conversion-card a,
.l2t-conversion-card small:last-child {
  color: #2563EB !important;
  -webkit-text-fill-color: #2563EB !important;
}

.l2t-conversion-card {
  background: rgba(255, 255, 255, 0.96) !important;
  color: #172033 !important;
  border: 1px solid #E2E8F0 !important;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08) !important;
}

.l2t-conversion-card:hover {
  border-color: rgba(37, 99, 235, 0.24) !important;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.11) !important;
}

.l2t-conversion-icon {
  background: #E9B949 !important;
  color: #0B1D35 !important;
  border: 1px solid rgba(11, 29, 53, 0.08) !important;
}

.l2t-conversion-icon svg,
.l2t-conversion-icon path,
.l2t-conversion-panel svg,
.l2t-conversion-panel path {
  color: #0B1D35 !important;
  stroke: #0B1D35 !important;
}

/* Renk fixlerinden sonra beyaz kartta beyaz yazı kalmasın diye güvenlik katmanı. */
.l2t-card,
.l2t-content-card,
.l2t-search-card,
.l2t-ai-box {
  color: #172033 !important;
}

.l2t-card h2,
.l2t-card h3,
.l2t-card strong,
.l2t-content-card h2,
.l2t-content-card h3,
.l2t-content-card strong {
  color: #0B1D35 !important;
  -webkit-text-fill-color: #0B1D35 !important;
}

.l2t-card p,
.l2t-content-card p {
  color: #5B6C82 !important;
  -webkit-text-fill-color: #5B6C82 !important;
}
${end}
`;

fs.writeFileSync(cssPath, css + block + '\n', 'utf8');
console.log('OK: Kontrast fix V14D app/globals.css sonuna eklendi.');
