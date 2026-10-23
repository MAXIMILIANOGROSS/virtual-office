#!/usr/bin/env node
// Instala la Oficina Virtual en OTRO proyecto Next.js (App Router, carpeta src/).
// Uso: node scripts/instalar.mjs /ruta/a/tu-proyecto [--forzar]
// No sobrescribe archivos existentes salvo con --forzar.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destino = process.argv[2] ? resolve(process.argv[2]) : null;
const forzar = process.argv.includes("--forzar");
if (!destino || !existsSync(join(destino, "package.json"))) {
  console.error("Uso: node scripts/instalar.mjs /ruta/a/tu-proyecto [--forzar]\n(la ruta debe contener un package.json)");
  process.exit(1);
}
if (!existsSync(join(destino, "src"))) { console.error("Tu proyecto debe usar la carpeta src/."); process.exit(1); }

const MANIFIESTO = [
  "src/oficina.config.ts", "src/lib", "src/components", "src/app/oficina", "src/app/oficinapublica",
  "src/app/video-studio", "src/app/youtube-studio", "src/app/api/oficina", "src/app/api/studio",
  "src/app/api/office-observatory", "src/app/login",
  "public/oficina", "public/models", "supabase/oficina.sql", ".github/workflows/oficina-ciclo.yml",
  ".env.example", "THIRD_PARTY",
];
let copiados = 0, saltados = 0;
for (const rel of MANIFIESTO) {
  const o = join(aqui, rel), d = join(destino, rel === ".env.example" ? ".env.oficina.example" : rel);
  if (!existsSync(o)) continue;
  mkdirSync(dirname(d), { recursive: true });
  cpSync(o, d, { recursive: true, force: forzar, errorOnExist: false,
    filter: (src) => { const ex = existsSync(src.replace(o, d)) && statSync(src).isFile(); if (ex && !forzar) { saltados++; return false; } if (statSync(src).isFile()) copiados++; return true; } });
}
// Dependencias necesarias
const pj = join(destino, "package.json");
const p = JSON.parse(readFileSync(pj, "utf8"));
const mio = JSON.parse(readFileSync(join(aqui, "package.json"), "utf8"));
p.dependencies = p.dependencies || {};
for (const k of ["three", "@supabase/supabase-js"]) if (!p.dependencies[k]) p.dependencies[k] = mio.dependencies[k];
writeFileSync(pj, JSON.stringify(p, null, 2) + "\n");
console.log(`Listo: ${copiados} archivos copiados, ${saltados} ya existían.`);
console.log(`
Siguientes pasos:
  1. cd ${destino} && npm install
  2. Copia .env.oficina.example a .env.local y rellénalo
  3. Ejecuta supabase/oficina.sql en el SQL Editor de Supabase y añade tu correo a oficina_admins
  4. Edita src/oficina.config.ts con los datos de tu proyecto
  5. npm run dev  ->  /oficina
Nota: añade el alias "@/*" -> "./src/*" en tu tsconfig y allowImportingTsExtensions si no los tienes.`);
