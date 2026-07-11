-- Test-Fall 5 (Issue #20): Ein reader kann Vorgänge sehen, aber nichts
-- freigeben (keine Schreibrechte). vorgaenge_schreiben hat laut
-- docs/decisions/2026-07-10_rls-policies.md bewusst keinen reader-Zweig
-- ("Kann Vorgänge sehen, aber nicht freigeben").

BEGIN;
SELECT plan(3);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a

SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001'),
  'reader_a kann den Vorgang seines zugewiesenen Kunden lesen'
);

-- Postgres verbietet einen data-modifying CTE als verschachteltes Argument
-- ("WITH clause containing a data-modifying statement must be at the top
-- level"), daher laeuft der Update-Versuch hier als eigene, oberste
-- Anweisung, deren betroffene Zeilenzahl in einer TEMP-Tabelle landet.
WITH versuch AS (
  UPDATE vorgaenge SET betreff = 'von reader manipuliert'
  WHERE id = 'a0000000-0000-0000-0000-000000001001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test05_update_versuch FROM versuch;

SELECT is(
  (SELECT c FROM t_test05_update_versuch)::int,
  0,
  'ein UPDATE-Versuch von reader_a auf einen sichtbaren Vorgang betrifft 0 Zeilen (keine Schreib-Policy)'
);

SELECT tests.clear_authentication(); -- zurück auf Owner-Ebene, um den Originalzustand zu prüfen

-- Der Fixture-betreff dieses Vorgangs ist bewusst nicht-leer gesetzt
-- (siehe 003_fixtures.sql), damit dieser Vergleich beweist, dass der
-- ORIGINALWERT erhalten blieb, statt zufällig gegen ein NULL zu prüfen.
SELECT is(
  (SELECT betreff FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001'),
  'Rückfrage zur letzten Rechnung',
  'der Vorgang bleibt nach dem UPDATE-Versuch von reader_a unverändert (Original-Betreff, nicht der manipulierte Wert)'
);

SELECT * FROM finish();
ROLLBACK;
