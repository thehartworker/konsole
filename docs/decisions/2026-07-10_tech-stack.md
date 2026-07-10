# Tech-Stack für die Intake-Konsole

**Datum:** 2026-07-10
**Status:** vorgeschlagen

**Kontext:** Wir bauen ein SaaS für kleine bis mittlere Kommunikationsagenturen im DACH-Raum (siehe `SAAS_SPEC_v0.1_CONSOLE.md` §1.1), Multi-Tenant mit strikter Mandantentrennung zwischen Agenturen und deren Endkunden, DSGVO-konform mit Pflicht zu EU-Hosting. Das Team ist klein (Bastian plus Delegation an Claude Code), Reviewer-Zeit ist knapp (siehe `BUILD_PLAN_v0.1.md`), also muss der Stack Entwicklungsgeschwindigkeit und Betriebs-Einfachheit priorisieren.

**Optionen:**

1. Next.js 15 App Router + Supabase (Postgres, Auth, Storage, pgvector) + TypeScript strict, wie in `AGENTS.md` §2 vorgegeben.
2. Nuxt 3 (Vue) + eigenes Node-Backend + Postgres.
3. Remix + eigenes Backend + Postgres.
4. Django (Python) + Postgres.
5. Ruby on Rails + Postgres.
6. Astro + separates API-Backend.

**Entscheidung:** Option 1, Next.js 15 App Router mit Supabase und TypeScript strict mode, wie in `AGENTS.md` §2 als verbindlicher Stack festgelegt.

Ergänzende Begründung über die Vorgabe hinaus:

- Supabase liefert Row-Level-Security, Auth, Storage und pgvector als integriertes Paket. Das deckt die drei Mandantenfähigkeits-Ebenen aus `SAAS_SPEC_v0.1_CONSOLE.md` §9 und die RAG-Anforderungen der Backend-Handler ab, ohne dass diese Bausteine einzeln integriert und selbst betrieben werden müssen. Für ein Ein-Personen-Reviewer-Team ist das der entscheidende Vorteil.
- Next.js App Router vereint Frontend, API-Routen und Server-Components in einem Repository und einer Sprache. Das passt zur Ein-Sprache-Anforderung aus `AGENTS.md` §3.4 (Code englisch) und reduziert Kontext-Wechsel für Claude Code als bauenden Agenten.
- TypeScript strict mode erzwingt Typsicherheit an der Schnittstelle zu den Zod-Schema-Validierungen, die für jeden LLM-Output Pflicht sind (`AGENTS.md` §4).
- Nuxt/Vue (Option 2) wurde verworfen, weil das AI-SDK-Ökosystem (Anthropic-Client, Streaming-Helfer, RAG-Bibliotheken) stärker auf React/Next.js ausgerichtet ist und keine bestehende Team-Erfahrung mit Vue vorliegt.
- Remix (Option 3) wurde verworfen, weil es kein zu Supabase Edge Functions vergleichbares Backend-Function-Modell mitbringt und ein zusätzliches separates Backend nötig würde.
- Django und Rails (Optionen 4 und 5) wurden verworfen, weil sie einen zweiten Sprach-Stack (Python beziehungsweise Ruby) neben TypeScript einführen würden. Für ein kleines Team verdoppelt das den Wartungsaufwand ohne klaren Gegenwert.
- Astro (Option 6) wurde verworfen, weil es für content-lastige, überwiegend statische Seiten optimiert ist, nicht für eine hochinteraktive, auth-geschützte Multi-Tenant-Anwendung wie die Konsole.

**Konsequenzen:**

- Einheitlicher TypeScript-Stack über Frontend, API und geteilte Packages hinweg, das vereinfacht Tooling (ein Linter, ein Test-Runner, ein Package-Manager).
- Vendor-Bindung an Supabase für Auth, Storage und Datenbank-Ebene. Das Risiko ist begrenzt, weil Supabase auf Standard-Postgres basiert und ein Migrationspfad zu selbstgehostetem Postgres plus eigenem Auth grundsätzlich offen bleibt, falls das später nötig wird.
- Next.js App Router ist ein vergleichsweise junges Modell (Server Components, Caching-Semantik), Breaking Changes zwischen Major-Versionen sind möglich und müssen bei Upgrades beobachtet werden.
- Offener Punkt für Bastian: falls Anthropic eine EU-basierte Infrastruktur anbietet (siehe `SAAS_SPEC_v0.1_CONSOLE.md` §8.3), ändert das nichts am Stack, aber die AVV-Formulierung zum US-Datentransfer müsste dann angepasst werden.
