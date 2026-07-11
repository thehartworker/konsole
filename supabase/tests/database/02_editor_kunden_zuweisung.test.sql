-- Test-Fall 2 (Issue #20): Ein editor sieht nur Vorgänge seiner zugewiesenen
-- Kunden, nicht die anderer Kunden derselben Agentur. Editor A1 ist Kunde A1
-- zugewiesen, NICHT Kunde A2 (Fixtures: 003_fixtures.sql).

BEGIN;
SELECT plan(5);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1

SELECT is(
  (SELECT count(*) FROM vorgaenge WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'editor_a1 sieht keinen Vorgang von Kunde A2, obwohl Kunde A2 in derselben Agentur liegt'
);

SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001'),
  'editor_a1 sieht den normalen Vorgang seines zugewiesenen Kunden A1'
);

SELECT is(
  (SELECT count(*) FROM vorgaenge)::int, 2,
  'editor_a1 sieht insgesamt nur die 2 Vorgänge des zugewiesenen Kunden A1 (normal + zuständiger sensitiver), nichts von Kunde A2 oder Agentur B'
);

SELECT is(
  (SELECT count(*) FROM kunden WHERE id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'editor_a1 sieht den Kunden-Datensatz von Kunde A2 selbst nicht (nicht zugewiesen)'
);

SELECT ok(
  EXISTS (SELECT 1 FROM kunden WHERE id = 'a0000000-0000-0000-0000-000000000011'),
  'editor_a1 sieht den Kunden-Datensatz seines zugewiesenen Kunden A1'
);

SELECT * FROM finish();
ROLLBACK;
