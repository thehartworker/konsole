-- Test-Fall 8 (Issue #20): Das audit_log kann von niemandem per UPDATE oder
-- DELETE verändert werden (append-only), außer über den DSGVO-Löschpfad
-- (der laut docs/decisions/2026-07-10_rls-policies.md außerhalb der
-- normalen Nutzer-RLS über eine privilegierte Service-Funktion läuft, nicht
-- über eine reguläre UPDATE-Policy). Geprüft mit chef_a, der höchsten
-- Lese-Rolle auf audit_log, um zu zeigen, dass selbst die privilegierteste
-- Endnutzer-Rolle keinen Schreibzugriff hat.

BEGIN;
SELECT plan(4);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

-- Postgres verbietet einen data-modifying CTE als verschachteltes Argument
-- ("WITH clause containing a data-modifying statement must be at the top
-- level"), daher laufen UPDATE- und DELETE-Versuch hier je als eigene,
-- oberste Anweisung, deren betroffene Zeilenzahl in einer TEMP-Tabelle
-- landet.
WITH versuch AS (
  UPDATE audit_log SET aktion_payload = '{"manipuliert": true}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000005001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test08_update_versuch FROM versuch;

SELECT is(
  (SELECT c FROM t_test08_update_versuch)::int,
  0,
  'ein UPDATE-Versuch von chef_a auf audit_log betrifft 0 Zeilen (keine UPDATE-Policy)'
);

WITH versuch AS (
  DELETE FROM audit_log
  WHERE id = 'a0000000-0000-0000-0000-000000005001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test08_delete_versuch FROM versuch;

SELECT is(
  (SELECT c FROM t_test08_delete_versuch)::int,
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
