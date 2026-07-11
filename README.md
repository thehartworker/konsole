# konsole

Ein SaaS, der die eingehende Kommunikation zwischen Agentur-Kunden und Agentur strukturiert übernimmt, jeden Vorgang klassifiziert, die richtige Rolle in der Agentur informiert, und für alles Sensible einen konsequenten Menschen-Abzweig einbaut. Zielgruppe: kleine bis mittlere Kommunikations- und PR-Agenturen im DACH-Raum. Details siehe `SAAS_SPEC_v0.1_CONSOLE.md`.

## Grundinstruktion

Bevor hier etwas Substanzielles gebaut wird: `AGENTS.md` und die vier Spec-Dateien im Root lesen (`SAAS_SPEC_v0.1_CONSOLE.md`, `WORKFLOW_HANDLERS_v0.1.md`, `BUILD_PLAN_v0.1.md`, `GESELLSCHAFT_UND_PILOT_v0.1.md`). Sie sind die verbindliche Grundlage.

## Struktur

```
/
├── AGENTS.md                    # Grundinstruktion für AI-Coding-Agenten
├── SAAS_SPEC_v0.1_CONSOLE.md    # Kern-Produkt-Spec
├── WORKFLOW_HANDLERS_v0.1.md    # Handler-Kurz-Specs
├── BUILD_PLAN_v0.1.md           # 8-Wochen-Bauplan
├── GESELLSCHAFT_UND_PILOT_v0.1.md
├── docs/
│   ├── decisions/               # Design-Decisions (siehe AGENTS.md §3.2)
│   ├── handlers/                # Detail-Specs pro Handler
│   └── ops/                     # Betriebs-Runbooks
├── apps/
│   └── web/                     # Next.js-App
├── packages/
│   ├── shared/                  # geteilte Types, Utils
│   ├── classifier/               # Klassifikations-Layer
│   └── handlers/                 # die sechs Backend-Handler
├── supabase/
│   ├── migrations/              # DB-Schema-Migrations
│   ├── functions/                # Edge Functions
│   └── seed/                     # Test-Daten
├── .github/
│   └── workflows/                # GitHub Actions CI/CD
└── infra/
    ├── caddy/                    # Caddy-Config-Vorlage
    └── deploy/                   # Deployment-Skripte für Hetzner
```

## Stack

Next.js 15 App Router, TypeScript strict, Supabase (Postgres, Auth, Storage, pgvector), Anthropic Claude als LLM-Provider. Details und Begründung siehe `docs/decisions/`.

## Lokal starten

Voraussetzung: [Supabase CLI](https://supabase.com/docs/guides/cli) und Node/pnpm (Versionen siehe `.tool-versions`).

```bash
# Lokale Supabase-Instanz starten (Postgres, Auth, ...) und Migrations anwenden
supabase start

# Demo-Datensatz laden (Test-Agentur, Test-Nutzer, Test-Vorgänge; klar als
# Testdaten markiert, siehe supabase/seed/seed.sql)
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/seed/seed.sql

# Next.js-App-Umgebungsvariablen setzen (Werte kommen aus `supabase status`)
cp apps/web/.env.example apps/web/.env.local

# App starten
pnpm install
pnpm --filter web dev
```

Danach unter `http://localhost:3000/login` mit einem der Seed-Logins anmelden (Passwort für alle: `test-passwort-nur-lokal`):

| Rolle (UI-Label) | E-Mail |
|---|---|
| Chef | `chef@test-agentur.example` |
| Etatdirektor:in (manager) | `manager@test-agentur.example` |
| Berater:in (editor) | `editor@test-agentur.example` |

Nach dem Login zeigt `/vorgaenge` die Test-Vorgänge, gefiltert über RLS entsprechend der Rolle des jeweiligen Nutzers.
