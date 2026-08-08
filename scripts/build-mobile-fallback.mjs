import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const mobileDir = path.join(rootDir, "mobile");
const srcDir = path.join(mobileDir, "src");
const distDir = path.join(mobileDir, "dist");
const requireFromMobile = createRequire(path.join(mobileDir, "package.json"));
const ts = requireFromMobile("typescript");

function parseEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const env = parseEnv(path.join(rootDir, ".env.local"));
const publicConfig = {
  apiBaseUrl: (env.VITE_API_BASE_URL || "https://www.letsgo2travel.com.tr").replace(/\/$/, ""),
  supabaseUrl: env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supportEmail: env.VITE_SUPPORT_EMAIL || env.NEXT_PUBLIC_SUPPORT_EMAIL || env.SUPPORT_EMAIL || "hello@letsgo2travel.com.tr",
  appVersion: env.VITE_APP_VERSION || "1.4.0",
  appleAuthEnabled: (env.VITE_APPLE_AUTH_ENABLED || "").trim().toLowerCase() !== "false",
};

const extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];
const moduleByFile = new Map();
const modules = [];

function resolveLocal(baseFile, specifier) {
  const base = path.resolve(path.dirname(baseFile), specifier);
  const candidates = [base, ...extensions.map((ext) => `${base}${ext}`), ...extensions.map((ext) => path.join(base, `index${ext}`))];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Yerel modül çözümlenemedi: ${specifier} (${baseFile})`);
}

function resolveDependency(baseFile, specifier) {
  if (specifier.endsWith(".css")) return `virtual:css:${path.resolve(path.dirname(baseFile), specifier)}`;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return resolveLocal(baseFile, specifier);
  const scopedRequire = createRequire(baseFile);
  return scopedRequire.resolve(specifier, { paths: [path.join(mobileDir, "node_modules")] });
}

function transpile(file, source) {
  if (!/\.(tsx?|jsx)$/.test(file)) return source;
  return ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      isolatedModules: true,
      removeComments: false,
    },
  }).outputText;
}

function addModule(file) {
  if (moduleByFile.has(file)) return moduleByFile.get(file);
  const id = modules.length;
  moduleByFile.set(file, id);
  modules.push(null);

  if (file.startsWith("virtual:css:")) {
    modules[id] = { id, file, code: "module.exports = {};", mapping: {} };
    return id;
  }

  let source = fs.readFileSync(file, "utf8");
  if (file.endsWith(".json")) source = `module.exports = ${source.trim()};`;
  const code = transpile(file, source).replace(/^#!.*\n/, "");
  const mapping = {};
  const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = requirePattern.exec(code))) {
    const specifier = match[1];
    if (!(specifier in mapping)) {
      const resolved = resolveDependency(file, specifier);
      mapping[specifier] = addModule(resolved);
    }
  }
  modules[id] = { id, file, code, mapping };
  return id;
}

const entryId = addModule(path.join(srcDir, "main.tsx"));
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, "assets"), { recursive: true });

const moduleEntries = modules.map((item) => {
  const safeFile = item.file.replace(rootDir, "").replaceAll("\\", "/");
  return `${item.id}:[function(require,module,exports){\n${item.code}\n},${JSON.stringify(item.mapping)},${JSON.stringify(safeFile)}]`;
}).join(",\n");

const bundle = `/* LetsGo2Travel mobile fallback bundle - production test build */\n(function(){\n"use strict";\nvar process={env:{NODE_ENV:"production"}};\nvar __L2T_CONFIG__=${JSON.stringify(publicConfig)};\nvar __modules={\n${moduleEntries}\n};\nvar __cache={};\nfunction __require(id){\n if(__cache[id]) return __cache[id].exports;\n var record=__modules[id];\n if(!record) throw new Error("Module not found: "+id);\n var module={exports:{}}; __cache[id]=module;\n var map=record[1];\n function localRequire(name){ if(!(name in map)) throw new Error("Dependency not found: "+name+" from "+record[2]); return __require(map[name]); }\n record[0](localRequire,module,module.exports);\n return module.exports;\n}\n__require(${entryId});\n})();\n`;
fs.writeFileSync(path.join(distDir, "assets", "app.js"), bundle);

const css = [path.join(srcDir, "index.css"), path.join(srcDir, "App.css")]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
fs.writeFileSync(path.join(distDir, "assets", "app.css"), css);

const html = `<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no" />\n<meta name="theme-color" content="#071B33" />\n<title>LetsGo2Travel</title>\n<link rel="stylesheet" href="./assets/app.css" />\n</head>\n<body><div id="root"></div><script src="./assets/app.js"></script></body>\n</html>\n`;
fs.writeFileSync(path.join(distDir, "index.html"), html);

const errorHtml = path.join(mobileDir, "public", "error.html");
if (fs.existsSync(errorHtml)) fs.copyFileSync(errorHtml, path.join(distDir, "error.html"));
console.log(`Fallback mobil paket oluşturuldu: ${distDir}`);
console.log(`Modül sayısı: ${modules.length}, JS: ${(bundle.length / 1024).toFixed(1)} KB`);
