import type { NextConfig } from "next";

// Issue #43: apps/web importiert erstmals @konsole/persistence (und
// transitiv @konsole/handlers/@konsole/llm/@konsole/classifier/
// @konsole/profil-extraktion/@konsole/shared) für die Server-Actions der
// Detailansicht. Diese Pakete liefern rohes TypeScript aus src/ (kein
// Vorab-Build, siehe package.json "exports"), Next.js muss sie deshalb
// explizit transpilieren.
//
// Issue #47 (Konsolen-Setup-Härtung, siehe docs/decisions/
// 2026-07-14_konsolen-setup-haertung.md, Baustein A): der erste lokale
// `pnpm dev`-Lauf zeigte zwei weitere Bundling-Probleme.
//
// 1. Modul-Auflösung: die Workspace-Pakete importieren untereinander mit
//    `.js`-Suffix (TS-Bundler-Konvention, packages/handlers/src/index.ts
//    bleibt bewusst dabei). Webpack löst `./w2/index.js` ohne
//    `resolve.extensionAlias` nicht gegen die tatsächliche `.ts`-Datei auf.
// 2. `pdfkit`/`docx`/`pdf-parse`/`mammoth` bringen eigene Ressourcen
//    (Font-Metriken, native Bytes) mit, die Next.js beim Bundling nicht
//    zuverlässig mitkopiert, sobald sie über ein transpiliertes Paket
//    laufen. `serverExternalPackages` hilft dort, wo diese Pakete direkt
//    genutzt werden -- die eigentliche Absicherung für pdfkit/docx ist der
//    lazy Import in packages/handlers/src/w1/export.ts (siehe Decision).
const nextConfig: NextConfig = {
  transpilePackages: [
    "@konsole/classifier",
    "@konsole/handlers",
    "@konsole/llm",
    "@konsole/persistence",
    "@konsole/profil-extraktion",
    "@konsole/shared",
  ],
  serverExternalPackages: ["pdfkit", "docx", "pdf-parse", "mammoth"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
