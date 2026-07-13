-- Test-Fall 11 (Issue #30 Aufgabe B): llm_nutzung ist RLS-konform
-- (Mandanten-Trennung wie kunden_kontakte: chef sieht alle Kunden der
-- eigenen Agentur, editor nur zugewiesene Kunden, keine Agentur sieht eine
-- andere), und der Token-Verbrauch wird dem richtigen Kunden zugeordnet.
--
-- Läuft zunächst als Tabellen-Owner (postgres, RLS-Bypass) für die
-- Fixture-Inserts, analog zu 003_fixtures.sql. Drei Zeilen: Kunde A1 und
-- Kunde A2 (beide Agentur A, editor_a1 nur A1 zugewiesen), Kunde B1
-- (Agentur B), damit sowohl die Agentur- als auch die Kunden-Zuweisungs-
-- Grenze geprüft werden kann.

BEGIN;
SELECT plan(9);

INSERT INTO llm_nutzung (id, kunde_id, vorgang_id, handler_slug, input_tokens, output_tokens, modell) VALUES
  ('a0000000-0000-0000-0000-000000011001', 'a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000001001', 'klassifikation', 1200, 340, 'claude-sonnet-4-5-20250929'),
  ('a0000000-0000-0000-0000-000000011002', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000001003', 'klassifikation', 800, 210, 'claude-sonnet-4-5-20250929'),
  ('a0000000-0000-0000-0000-000000011003', 'a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000001004', 'klassifikation', 500, 150, 'claude-sonnet-4-5-20250929');

-- agentur_id wird vom Konsistenz-Trigger aus kunde_id übernommen, nicht aus
-- diesem INSERT -- geprüft implizit über die folgenden RLS-Assertions
-- (wäre agentur_id falsch/NULL, würde current_agentur_id()-Vergleich unten
-- nichts liefern).

SELECT is(
  (SELECT agentur_id FROM llm_nutzung WHERE id = 'a0000000-0000-0000-0000-000000011001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'agentur_id wird vom Konsistenz-Trigger korrekt aus kunde_id (Kunde A1) übernommen'
);

-- ============================================================
-- Mandanten-Trennung: chef sieht nur die eigene Agentur
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT count(*) FROM llm_nutzung)::int, 2,
  'chef_a sieht genau die 2 llm_nutzung-Zeilen der eigenen Agentur A (Kunde A1 + A2), keine aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM llm_nutzung WHERE id = 'a0000000-0000-0000-0000-000000011003')::int, 0,
  'chef_a kann die llm_nutzung-Zeile von Agentur B (Kunde B1) nicht per direkter id lesen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is(
  (SELECT count(*) FROM llm_nutzung)::int, 1,
  'chef_b sieht genau die 1 llm_nutzung-Zeile der eigenen Agentur B, keine aus Agentur A'
);

-- ============================================================
-- Kunden-Zuweisung: editor sieht nur zugewiesene Kunden (wie kunden_kontakte)
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, nur Kunde A1 zugewiesen

SELECT is(
  (SELECT count(*) FROM llm_nutzung)::int, 1,
  'editor_a1 sieht genau die 1 llm_nutzung-Zeile des ihm zugewiesenen Kunden A1'
);

SELECT is(
  (SELECT count(*) FROM llm_nutzung WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'editor_a1 sieht keine llm_nutzung-Zeile von Kunde A2 (nicht zugewiesen, gleiche Agentur)'
);

-- ============================================================
-- Token-Verbrauch wird dem richtigen Kunden zugeordnet
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT (input_tokens, output_tokens, modell) FROM llm_nutzung WHERE kunde_id = 'a0000000-0000-0000-0000-000000000011')::text,
  '(1200,340,claude-sonnet-4-5-20250929)',
  'der Token-Verbrauch (input_tokens, output_tokens, modell) ist exakt der Zeile von Kunde A1 zugeordnet, nicht vertauscht mit Kunde A2'
);

SELECT is(
  (SELECT (input_tokens, output_tokens, modell) FROM llm_nutzung WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::text,
  '(800,210,claude-sonnet-4-5-20250929)',
  'der Token-Verbrauch von Kunde A2 bleibt getrennt von dem von Kunde A1'
);

-- ============================================================
-- Seit Konsole Block 1 (Issue #43, Migration 20260713140000): berechtigte
-- Nutzer-Sessions duerfen llm_nutzung fuer IHRE zugewiesenen Kunden schreiben
-- (die Konsole loest Handler direkt aus der UI aus). chef_a ist Kunde A1
-- zugewiesen und darf daher schreiben; die Mandanten-/Zuweisungs-Grenze
-- bleibt durch die WITH-CHECK-Klausel gewahrt (siehe Test 17 fuer die
-- Negativ-Faelle).
-- ============================================================

SELECT lives_ok(
  $$ INSERT INTO llm_nutzung (kunde_id, handler_slug, input_tokens, output_tokens, modell)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'klassifikation', 1, 1, 'test') $$,
  'chef_a kann fuer seinen zugewiesenen Kunden A1 eine llm_nutzung-Zeile anlegen (berechtigte Session)'
);

SELECT * FROM finish();
ROLLBACK;
