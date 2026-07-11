BEGIN;

-- Test-Fall 4 (Issue #20): Über anliegen und handler_aufrufe kann ein editor
-- NICHT die Inhalte eines sensitiven Vorgangs lesen, den er nicht sehen darf.
-- Das war das kritische RLS-Loch, das mit darf_vorgang_sehen() geschlossen
-- wurde (siehe docs/decisions/2026-07-10_rls-policies.md, Abschnitt
-- "Korrektur gegenüber der vorigen Fassung"): die vorige Policy prüfte nur
-- EXISTS gegen vorgaenge (= Existenz der Zeile), nicht darf_vorgang_sehen()
-- (= Sichtbarkeits-Entscheidung). Editor A2 ist Kunde A1 zugewiesen (die
-- EXISTS-Variante hätte ihm die Zeile also fälschlich gezeigt), ist aber
-- nicht zuständig für den sensitiven Vorgang.

SELECT plan(6);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig
SELECT is(
  (SELECT count(*) FROM anliegen WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 1,
  'editor_a1 (zuständig) sieht das anliegen des sensitiven Vorgangs'
);
SELECT is(
  (SELECT count(*) FROM handler_aufrufe WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 1,
  'editor_a1 (zuständig) sieht den handler_aufruf des sensitiven Vorgangs'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, gleicher Kunde, NICHT zuständig
SELECT is(
  (SELECT count(*) FROM anliegen WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 0,
  'editor_a2 (gleicher Kunde, NICHT zuständig) sieht das anliegen des sensitiven Vorgangs NICHT: kein Leck über anliegen'
);
SELECT is(
  (SELECT count(*) FROM handler_aufrufe WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 0,
  'editor_a2 (gleicher Kunde, NICHT zuständig) sieht den handler_aufruf des sensitiven Vorgangs NICHT: kein Leck über handler_aufrufe'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a, gleicher Kunde, NICHT zuständig
SELECT is(
  (SELECT count(*) FROM anliegen WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 0,
  'reader_a (gleicher Kunde, NICHT zuständig) sieht das anliegen des sensitiven Vorgangs NICHT'
);
SELECT is(
  (SELECT count(*) FROM handler_aufrufe WHERE vorgang_id = 'a0000000-0000-0000-0000-000000001002')::int, 0,
  'reader_a (gleicher Kunde, NICHT zuständig) sieht den handler_aufruf des sensitiven Vorgangs NICHT'
);

SELECT * FROM finish();
ROLLBACK;
