# RLS-Test-Suite

Automatisierte Beweise, dass die Row-Level-Security-Policies aus
`docs/decisions/2026-07-10_rls-policies.md` tatsächlich halten. Kein
Behaupten, sondern Testen: jeder Testfall lässt einen simulierten Nutzer
(chef/manager/editor/reader/guest, über zwei Agenturen verteilt) echte
Queries gegen eine echte Postgres-Instanz mit aktivierter RLS laufen und
prüft das Ergebnis.

## Warum pgTAP statt TypeScript-Test-Client

Diese Entscheidung ist in der PR-Beschreibung von PR 1 (Woche 2, Issue #20)
ausführlich begründet, hier die Kurzfassung:

1. **pgTAP läuft direkt in Postgres.** Jeder Test simuliert eine Nutzer-
   Session per `SET LOCAL ROLE authenticated` plus JWT-Claim-GUCs (siehe
   `helpers/002_test_helpers.sql`), läuft in einer eigenen Transaktion, die
   am Ende zurückgerollt wird. Keine Anwendungsschicht, kein Netzwerk-Hop,
   keine Race-Conditions zwischen Tests.
2. **Ein TypeScript-Client bräuchte echte JWTs für fünf Rollen.** Das
   Ausstellen echter Supabase-JWTs mit korrekten `agentur_id`/`rolle`-Claims
   ist exakt der Gegenstand von PR 2 (Basis-Auth) aus Issue #20, die zum
   Zeitpunkt von PR 1 noch nicht existiert. pgTAP braucht dafür keine
   Auth-Schicht: die Test-Helfer setzen die Session-GUCs, die `auth.uid()`
   ausliest, direkt.
3. **pgTAP prüft exakt die Ebene, um die es geht.** Die Policies selbst sind
   SQL, der Beweis ihrer Korrektheit gehört auf dieselbe Ebene, nicht hinter
   eine zusätzliche REST-/PostgREST-Schicht, die zufällig auch andere
   Fehlerquellen einführen oder verdecken könnte.

## Struktur

```
supabase/tests/
├── helpers/
│   ├── 000_auth_roles_and_uid.sql   -- Minimal-Stub für auth.users/auth.uid(), VOR den Migrations
│   ├── 001_grants.sql               -- Tabellen-Grants für anon/authenticated/service_role, NACH Migrations + pgtap-Extension
│   ├── 002_test_helpers.sql         -- tests.authenticate_as() / tests.clear_authentication()
│   └── 003_fixtures.sql             -- feste Test-Fixtures (zwei Agenturen, fünf Rollen, sensitive/normale Vorgänge)
└── database/
    ├── 01_mandanten_trennung.test.sql
    ├── 02_editor_kunden_zuweisung.test.sql
    ├── 03_sensitive_vorgang_nur_zustaendige.test.sql
    ├── 04_anliegen_handler_aufrufe_kein_leck.test.sql
    ├── 05_reader_keine_schreibrechte.test.sql
    ├── 06_guest_nur_freigegebene_vorgaenge.test.sql
    ├── 07_editor_keine_guest_freigabe.test.sql
    ├── 08_audit_log_append_only.test.sql
    ├── 09_agentur_id_konsistenz_trigger.test.sql
    ├── 10_auth_signup_nutzer_verknuepfung.test.sql
    ├── 11_llm_nutzung_rls.test.sql
    ├── 12_pruefregeln_rls.test.sql
    ├── 13_kundenprofil_rls.test.sql
    └── 14_kundenprofil_status_uebergang.test.sql
```

`helpers/000_auth_roles_and_uid.sql` bildet NUR das nach, was die RLS-
Policies wirklich von `auth.*` brauchen (siehe Kommentar in der Datei). Es
ist bewusst kein Ersatz für die echte GoTrue-Auth-Schicht und darf nie gegen
eine produktive Instanz laufen.

## Ausführen (lokal, mit Docker)

```bash
# 1. Test-Image bauen (Postgres 16 + pgTAP-Extension)
cat > /tmp/Dockerfile.pgtap <<'EOF'
FROM postgres:16
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-pgtap \
  && rm -rf /var/lib/apt/lists/*
EOF
docker build -f /tmp/Dockerfile.pgtap -t konsole-pgtap:local .

# 2. Container starten
docker run -d --name konsole-pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 konsole-pgtap:local
until docker exec konsole-pg-test pg_isready -U postgres; do sleep 1; done

# 3. Schema, Migrations, Extension, Grants, Helfer, Fixtures anwenden (Reihenfolge wichtig!)
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -f supabase/tests/helpers/000_auth_roles_and_uid.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgtap;"
psql -v ON_ERROR_STOP=1 -f supabase/tests/helpers/001_grants.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/helpers/002_test_helpers.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/helpers/003_fixtures.sql

# 4. Suite ausführen (pg_prove aus dem Perl-Paket libtap-parser-sourcehandler-pgtap-perl)
pg_prove --ext .test.sql -v supabase/tests/database/

# 5. Aufräumen
docker rm -f konsole-pg-test
```

## CI

Der fertige `.github/workflows/ci.yml`-Inhalt für genau diesen Ablauf liegt
in der PR-Beschreibung von PR 1 (Issue #20), weil Agent-Läufe laut Scope
keine Dateien unter `.github/workflows/` selbst anlegen dürfen.
