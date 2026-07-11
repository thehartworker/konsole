BEGIN;

-- Test-Fall 5 (Issue #20): Ein reader kann Vorgänge sehen, aber nichts
-- freigeben (keine Schreibrechte). vorgaenge_schreiben hat laut
-- docs/decisions/2026-07-10_rls-policies.md bewusst keinen reader-Zweig
-- ("Kann Vorgänge sehen, aber nicht freigeben").

SELECT plan(3);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a

SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001'),
  'reader_a kann den Vorgang seines zugewiesenen Kunden lesen'
);

SELECT is(
  (WITH versuch AS (
    UPDATE vorgaenge SET betreff = 'von reader manipuliert'
    WHERE id = 'a0000000-0000-0000-0000-000000001001'
    RETURNING 1
  ) SELECT count(*) FROM versuch)::int,
  0,
  'ein UPDATE-Versuch von reader_a auf einen sichtbaren Vorgang betrifft 0 Zeilen (keine Schreib-Policy)'
);

SELECT tests.clear_authentication(); -- zurück auf Owner-Ebene, um den Originalzustand zu prüfen

SELECT ok(
  (SELECT betreff FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001') IS NULL,
  'der Vorgang bleibt nach dem UPDATE-Versuch von reader_a unverändert'
);

SELECT * FROM finish();
ROLLBACK;
