-- Test-Fall 12 (Issue #32, Architektur-Nachschärfung): pruefregeln ist
-- RLS-konform, gleiches Muster wie llm_nutzung (Test 11): Mandanten-Trennung
-- über current_agentur_id(), Kunden-Zuweisungs-Grenze für nicht-chef-Rollen,
-- keine Schreibrechte für authentifizierte Sessions (nur Service-Role).
--
-- Läuft zunächst als Tabellen-Owner (postgres, RLS-Bypass) für die
-- Fixture-Inserts, analog zu 003_fixtures.sql / 11_llm_nutzung_rls.test.sql.
-- Drei Regel-Zeilen: je eine für Kunde A1 und Kunde A2 (beide Agentur A,
-- editor_a1 nur A1 zugewiesen), eine für Kunde B1 (Agentur B).

BEGIN;
SELECT plan(9);

INSERT INTO pruefregeln (id, kunde_id, handler_slug, typ, baustein_name, parameter, aktiv, reihenfolge) VALUES
  ('a0000000-0000-0000-0000-000000012001', 'a0000000-0000-0000-0000-000000000011', 'W2_presseanfragen_drafter', 'code_baustein', 'keine_tier_nennung', '{}'::jsonb, true, 1),
  ('a0000000-0000-0000-0000-000000012002', 'a0000000-0000-0000-0000-000000000012', 'W2_presseanfragen_drafter', 'code_baustein', 'background_mit_quellenangabe', '{}'::jsonb, true, 1),
  ('a0000000-0000-0000-0000-000000012003', 'a0000000-0000-0000-0000-000000000021', 'W2_presseanfragen_drafter', 'code_baustein', 'keine_tier_nennung', '{}'::jsonb, true, 1);

-- agentur_id wird vom Konsistenz-Trigger aus kunde_id übernommen, nicht aus
-- diesem INSERT -- geprüft implizit über die folgenden RLS-Assertions.

SELECT is(
  (SELECT agentur_id FROM pruefregeln WHERE id = 'a0000000-0000-0000-0000-000000012001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'agentur_id wird vom Konsistenz-Trigger korrekt aus kunde_id (Kunde A1) übernommen'
);

-- ============================================================
-- Mandanten-Trennung: chef sieht nur die eigene Agentur
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT count(*) FROM pruefregeln)::int, 2,
  'chef_a sieht genau die 2 pruefregeln-Zeilen der eigenen Agentur A (Kunde A1 + A2), keine aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM pruefregeln WHERE id = 'a0000000-0000-0000-0000-000000012003')::int, 0,
  'chef_a kann die pruefregeln-Zeile von Agentur B (Kunde B1) nicht per direkter id lesen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is(
  (SELECT count(*) FROM pruefregeln)::int, 1,
  'chef_b sieht genau die 1 pruefregeln-Zeile der eigenen Agentur B, keine aus Agentur A'
);

-- ============================================================
-- Kunden-Zuweisung: editor sieht nur zugewiesene Kunden (wie kunden_kontakte)
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, nur Kunde A1 zugewiesen

SELECT is(
  (SELECT count(*) FROM pruefregeln)::int, 1,
  'editor_a1 sieht genau die 1 pruefregeln-Zeile des ihm zugewiesenen Kunden A1'
);

SELECT is(
  (SELECT count(*) FROM pruefregeln WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'editor_a1 sieht keine pruefregeln-Zeile von Kunde A2 (nicht zugewiesen, gleiche Agentur)'
);

-- ============================================================
-- Die Regel-Konfiguration ist tatsächlich pro Kunde unterschiedlich
-- (Kern-Beweis der Kundenagnostik: A1 und A2 haben unterschiedliche aktive
-- Bausteine, kein geteilter fest verdrahteter Regelsatz)
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT baustein_name FROM pruefregeln WHERE kunde_id = 'a0000000-0000-0000-0000-000000000011'),
  'keine_tier_nennung',
  'Kunde A1 hat den Baustein "keine_tier_nennung" aktiv konfiguriert'
);

SELECT is(
  (SELECT baustein_name FROM pruefregeln WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012'),
  'background_mit_quellenangabe',
  'Kunde A2 hat einen ANDEREN Baustein ("background_mit_quellenangabe") aktiv konfiguriert, keine geteilte feste Regel'
);

-- ============================================================
-- Nur Service-Role schreibt: keine INSERT-Policy für Endnutzer-Rollen
-- ============================================================

SELECT throws_like(
  $$ INSERT INTO pruefregeln (kunde_id, handler_slug, typ, baustein_name)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'W2_presseanfragen_drafter', 'code_baustein', 'test') $$,
  '%row-level security policy%',
  'chef_a kann KEINE pruefregeln-Zeile per authentifizierter Session anlegen (nur Service-Role schreibt, kein Editier-UI in v1)'
);

SELECT * FROM finish();
ROLLBACK;
