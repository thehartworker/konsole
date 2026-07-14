# Demo-/Entwicklungs-Seeds

Enthaelt Fixtures, die ueber `supabase/seed/seed.sql` (generische RLS-Testdaten,
siehe dortiger Kommentarkopf) hinausgehen: realistische, schema-konforme
Handler-Ergebnisse fuer manuelles Durchklicken der Konsole und Demos.

**NUR fuer lokale Entwicklung und Demos. NIEMALS gegen ein produktives
Supabase-Projekt einspielen** -- jede Datei hier legt Test-Auth-User mit
fest verdrahteten Passwoertern per direktem SQL-Insert in `auth.users` an
(siehe Kommentar in `supabase/seed/seed.sql` zu diesem Muster).

## Dateien

- `01_pilot_mensch_neurabin.sql` -- MENSCH Kreativagentur (Pilot-Agentur,
  siehe `GESELLSCHAFT_UND_PILOT_v1.0.md` Teil B) mit einem Pharma-Kunden
  ("Neurabin Pharma GmbH") und einem vollstaendigen W1-Handler-Ergebnis
  (Pressemitteilungs-Entwurf inklusive Kritiker-Findings und
  Grenzpruefung), passend zur Pharma-Compliance-Erweiterung aus
  `AGENTS.md` §9.

## Einspielen (lokal, nach den Migrations)

Voraussetzung: eine laufende lokale Postgres-Instanz mit bereits
angewendeten Migrations (`supabase/migrations/*.sql`) und aktivierter
`pgcrypto`-Extension (Teil der Standard-Supabase-Lokalumgebung).

```bash
# Mit der Supabase-CLI (empfohlen, wendet Migrations automatisch mit an):
supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  -v ON_ERROR_STOP=1 -f supabase/seeds/01_pilot_mensch_neurabin.sql

# Oder direkt per psql gegen eine bereits laufende lokale Instanz:
export PGHOST=localhost PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -f supabase/seeds/01_pilot_mensch_neurabin.sql
```

Jede Datei ist idempotent (feste UUIDs, `ON CONFLICT (id) DO NOTHING`) --
mehrfaches Einspielen legt keine Duplikate an und schlaegt nicht fehl.

Login fuer die Demo-Beraterin: `julia.reiter@mensch-kreativagentur.example`
/ `lokal-pilot-passwort-nur-fuer-demo` (nur in dieser lokalen Fixture
gueltig, kein echtes Secret).
