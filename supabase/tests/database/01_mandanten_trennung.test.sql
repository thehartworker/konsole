-- Test-Fall 1 (Issue #20): Eine Agentur sieht NIEMALS Daten einer anderen
-- Agentur. Härteste Mandanten-Grenze, geprüft über agenturen, kunden,
-- nutzer und vorgaenge, für Agentur A UND Agentur B (beide Richtungen).

BEGIN;
SELECT plan(10);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT count(*) FROM vorgaenge)::int, 3,
  'chef_a sieht genau die 3 Vorgänge der eigenen Agentur A, keinen aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM kunden)::int, 2,
  'chef_a sieht genau die 2 Kunden der eigenen Agentur A, keinen aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM agenturen)::int, 1,
  'chef_a sieht genau 1 Agentur (die eigene), nicht Agentur B'
);

SELECT is(
  (SELECT count(*) FROM nutzer)::int, 6,
  'chef_a sieht genau die 6 Nutzer der eigenen Agentur A, keinen aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001004')::int, 0,
  'chef_a kann den Vorgang von Agentur B nicht per direkter id lesen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is(
  (SELECT count(*) FROM vorgaenge)::int, 1,
  'chef_b sieht genau den 1 Vorgang der eigenen Agentur B, keinen aus Agentur A'
);

SELECT is(
  (SELECT count(*) FROM kunden)::int, 1,
  'chef_b sieht genau den 1 Kunden der eigenen Agentur B, keinen aus Agentur A'
);

SELECT is(
  (SELECT id FROM agenturen LIMIT 1), 'a0000000-0000-0000-0000-000000000002'::uuid,
  'chef_b sieht ausschließlich Agentur B, nicht Agentur A'
);

SELECT is(
  (SELECT count(*) FROM nutzer)::int, 2,
  'chef_b sieht genau die 2 Nutzer der eigenen Agentur B, keinen aus Agentur A'
);

SELECT is(
  (SELECT count(*) FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000001001')::int, 0,
  'chef_b kann einen Vorgang von Agentur A nicht per direkter id lesen'
);

SELECT * FROM finish();
ROLLBACK;
