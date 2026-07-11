BEGIN;

-- Test-Fall 8 (Issue #20): Das audit_log kann von niemandem per UPDATE oder
-- DELETE verändert werden (append-only), außer über den DSGVO-Löschpfad
-- (der laut docs/decisions/2026-07-10_rls-policies.md außerhalb der
-- normalen Nutzer-RLS über eine privilegierte Service-Funktion läuft, nicht
-- über eine reguläre UPDATE-Policy). Geprüft mit chef_a, der höchsten
-- Lese-Rolle auf audit_log, um zu zeigen, dass selbst die privilegierteste
-- Endnutzer-Rolle keinen Schreibzugriff hat.

SELECT plan(4);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (WITH versuch AS (
    UPDATE audit_log SET aktion_payload = '{"manipuliert": true}'::jsonb
    WHERE id = 'a0000000-0000-0000-0000-000000005001'
    RETURNING 1
  ) SELECT count(*) FROM versuch)::int,
  0,
  'ein UPDATE-Versuch von chef_a auf audit_log betrifft 0 Zeilen (keine UPDATE-Policy)'
);

SELECT is(
  (WITH versuch AS (
    DELETE FROM audit_log
    WHERE id = 'a0000000-0000-0000-0000-000000005001'
    RETURNING 1
  ) SELECT count(*) FROM versuch)::int,
  0,
  'ein DELETE-Versuch von chef_a auf audit_log betrifft 0 Zeilen (keine DELETE-Policy)'
);

SELECT tests.clear_authentication();

SELECT is(
  (SELECT aktion_payload FROM audit_log WHERE id = 'a0000000-0000-0000-0000-000000005001')::text,
  '{}'::jsonb::text,
  'der audit_log-Eintrag bleibt nach den UPDATE/DELETE-Versuchen unverändert erhalten'
);

SELECT is(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' AND cmd IN ('UPDATE', 'DELETE'))::int,
  0,
  'strukturell existiert für audit_log gar keine UPDATE- oder DELETE-Policy (append-only per Design, nicht nur zufällig durch Testdaten gedeckt)'
);

SELECT * FROM finish();
ROLLBACK;
