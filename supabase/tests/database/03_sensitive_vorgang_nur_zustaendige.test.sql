BEGIN;

-- Test-Fall 3 (Issue #20): Ein editor sieht einen sensitiven Vorgang
-- (sensitivity != normal) NUR, wenn er die zuständige Person ist.
-- Vorgang a0000000-...-001002 ist 'vertraulich', zuständig ist Editor A1.
-- Editor A2 ist demselben Kunden (A1) zugewiesen, aber NICHT zuständig.

SELECT plan(5);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig
SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'die zuständige Person (editor_a1) sieht den sensitiven Vorgang'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, NICHT zuständig, gleicher Kunde
SELECT ok(
  NOT EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'ein editor desselben Kunden, aber NICHT zuständig, sieht den sensitiven Vorgang NICHT'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a, NICHT zuständig
SELECT ok(
  NOT EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'ein reader desselben Kunden, aber NICHT zuständig, sieht den sensitiven Vorgang NICHT'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000102'); -- manager_a
SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'manager_a sieht den sensitiven Vorgang unabhängig von der Zuständigkeit (§9.3)'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a
SELECT ok(
  EXISTS (SELECT 1 FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001002'),
  'chef_a sieht den sensitiven Vorgang unabhängig von der Zuständigkeit (§9.3)'
);

SELECT * FROM finish();
ROLLBACK;
