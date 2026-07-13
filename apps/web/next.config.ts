import type { NextConfig } from "next";

// Issue #43: apps/web importiert erstmals @konsole/persistence (und
// transitiv @konsole/handlers/@konsole/llm/@konsole/classifier/
// @konsole/profil-extraktion/@konsole/shared) für die Server-Actions der
// Detailansicht. Diese Pakete liefern rohes TypeScript aus src/ (kein
// Vorab-Build, siehe package.json "exports"), Next.js muss sie deshalb
// explizit transpilieren.
const nextConfig: NextConfig = {
  transpilePackages: [
    "@konsole/classifier",
    "@konsole/handlers",
    "@konsole/llm",
    "@konsole/persistence",
    "@konsole/profil-extraktion",
    "@konsole/shared",
  ],
};

export default nextConfig;
