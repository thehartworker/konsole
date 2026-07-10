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
