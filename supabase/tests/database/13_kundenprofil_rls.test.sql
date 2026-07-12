-- Test-Fall 13 (Issue #35, Kundenprofil-Fundament): kunden_profil und alle
-- neun Listen-Tabellen sind RLS-konform, gleiches Muster wie pruefregeln
-- (Test 12)/llm_nutzung (Test 11): Mandanten-Trennung über
-- current_agentur_id(), Kunden-Zuweisungs-Grenze für nicht-chef-Rollen,
-- keine Schreibrechte für authentifizierte Sessions (nur Service-Role).
--
-- Läuft zunächst als Tabellen-Owner (postgres, RLS-Bypass) für die
-- Fixture-Inserts, analog zu 003_fixtures.sql/12_pruefregeln_rls.test.sql.
-- Je eine Zeile pro Tabelle für Kunde A1, Kunde A2 (beide Agentur A,
-- editor_a1 nur A1 zugewiesen) und Kunde B1 (Agentur B).

BEGIN;
SELECT plan(30);

-- ============================================================
-- kunden_profil (Kern-Tabelle, 1:1). Bewusst NUR für Kunde A1 und Kunde B1
-- angelegt (nicht für A2): kunde_id ist UNIQUE, der Blocked-INSERT-Test
-- unten braucht einen kunde_id-Wert OHNE bestehende Profil-Zeile, damit der
-- erwartete Fehler eindeutig die RLS-Policy ist, nicht ein Unique-Conflict.
-- ============================================================

INSERT INTO kunden_profil (id, kunde_id, positionierung, feld_status) VALUES
  ('a0000000-0000-0000-0000-000000013001', 'a0000000-0000-0000-0000-000000000011', 'Positionierung Kunde A1', '{"positionierung": {"status": "freigegeben"}}'::jsonb),
  ('a0000000-0000-0000-0000-000000013003', 'a0000000-0000-0000-0000-000000000021', 'Positionierung Kunde B1', '{"positionierung": {"status": "abgeleitet"}}'::jsonb);

SELECT is(
  (SELECT agentur_id FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000013001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'agentur_id wird vom Konsistenz-Trigger korrekt aus kunde_id (Kunde A1) übernommen'
);

-- ============================================================
-- Listen-Tabellen: je eine Zeile pro Kunde, mit unterschiedlichem Inhalt
-- (Beweis, dass die Daten tatsächlich pro Kunde getrennt sind, nicht
-- geteilt).
-- ============================================================

INSERT INTO kunden_boilerplate (kunde_id, typ, text) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'kurz', 'Boilerplate A1'),
  ('a0000000-0000-0000-0000-000000000012', 'kurz', 'Boilerplate A2'),
  ('a0000000-0000-0000-0000-000000000021', 'kurz', 'Boilerplate B1');

INSERT INTO kunden_kennzahlen (kunde_id, bezeichnung, wert, stichtag, quelle) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Mitarbeitende', '42', '2026-01-01', 'HR-System'),
  ('a0000000-0000-0000-0000-000000000012', 'Mitarbeitende', '17', '2026-01-01', 'HR-System'),
  ('a0000000-0000-0000-0000-000000000021', 'Mitarbeitende', '99', '2026-01-01', 'HR-System');

INSERT INTO kunden_sprecher (kunde_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Sprecher A1'),
  ('a0000000-0000-0000-0000-000000000012', 'Sprecher A2'),
  ('a0000000-0000-0000-0000-000000000021', 'Sprecher B1');

INSERT INTO kunden_kernbotschaften (kunde_id, text, reihenfolge) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Kernbotschaft A1', 1),
  ('a0000000-0000-0000-0000-000000000012', 'Kernbotschaft A2', 1),
  ('a0000000-0000-0000-0000-000000000021', 'Kernbotschaft B1', 1);

INSERT INTO kunden_themen (kunde_id, thema, sprachregelung) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Thema A1', 'Sprachregelung A1'),
  ('a0000000-0000-0000-0000-000000000012', 'Thema A2', 'Sprachregelung A2'),
  ('a0000000-0000-0000-0000-000000000021', 'Thema B1', 'Sprachregelung B1');

INSERT INTO kunden_grenzen (kunde_id, typ, inhalt, ist_deterministisch_erzwungen) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'verbotene_aussage', 'Grenze A1', true),
  ('a0000000-0000-0000-0000-000000000012', 'verbotene_aussage', 'Grenze A2', true),
  ('a0000000-0000-0000-0000-000000000021', 'verbotene_aussage', 'Grenze B1', true);

INSERT INTO kunden_freigabekette (kunde_id, rolle_oder_person, reihenfolge) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Freigabe A1', 1),
  ('a0000000-0000-0000-0000-000000000012', 'Freigabe A2', 1),
  ('a0000000-0000-0000-0000-000000000021', 'Freigabe B1', 1);

INSERT INTO kunden_praezedenzfaelle (kunde_id, handler_slug, titel, volltext, status) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'W2_presseanfragen_drafter', 'Fall A1', 'Volltext A1', 'freigegeben'),
  ('a0000000-0000-0000-0000-000000000012', 'W2_presseanfragen_drafter', 'Fall A2', 'Volltext A2', 'freigegeben'),
  ('a0000000-0000-0000-0000-000000000021', 'W2_presseanfragen_drafter', 'Fall B1', 'Volltext B1', 'freigegeben');

INSERT INTO kunden_medien_kontext (kunde_id, medium_name) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'Medium A1'),
  ('a0000000-0000-0000-0000-000000000012', 'Medium A2'),
  ('a0000000-0000-0000-0000-000000000021', 'Medium B1');

-- ============================================================
-- chef_a: sieht alle Zeilen der eigenen Agentur A (Kunde A1 + A2), keine
-- aus Agentur B.
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is((SELECT count(*) FROM kunden_profil)::int, 1, 'chef_a sieht genau die 1 kunden_profil-Zeile der eigenen Agentur A (nur Kunde A1 hat eine Profil-Zeile)');
SELECT is((SELECT count(*) FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000013003')::int, 0, 'chef_a kann die kunden_profil-Zeile von Kunde B1 nicht per direkter id lesen');
SELECT is((SELECT count(*) FROM kunden_boilerplate)::int, 2, 'chef_a sieht genau die 2 kunden_boilerplate-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_kennzahlen)::int, 2, 'chef_a sieht genau die 2 kunden_kennzahlen-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_sprecher)::int, 2, 'chef_a sieht genau die 2 kunden_sprecher-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_kernbotschaften)::int, 2, 'chef_a sieht genau die 2 kunden_kernbotschaften-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_themen)::int, 2, 'chef_a sieht genau die 2 kunden_themen-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_grenzen)::int, 2, 'chef_a sieht genau die 2 kunden_grenzen-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_freigabekette)::int, 2, 'chef_a sieht genau die 2 kunden_freigabekette-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_praezedenzfaelle)::int, 2, 'chef_a sieht genau die 2 kunden_praezedenzfaelle-Zeilen der eigenen Agentur A');
SELECT is((SELECT count(*) FROM kunden_medien_kontext)::int, 2, 'chef_a sieht genau die 2 kunden_medien_kontext-Zeilen der eigenen Agentur A');

-- ============================================================
-- chef_b: sieht nur die eigene Agentur B (Mandanten-Trennung).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is((SELECT count(*) FROM kunden_profil)::int, 1, 'chef_b sieht genau die 1 kunden_profil-Zeile der eigenen Agentur B');
SELECT is((SELECT bezeichnung FROM kunden_kennzahlen), 'Mitarbeitende', 'chef_b sieht die kunden_kennzahlen-Zeile von Kunde B1');
SELECT is((SELECT wert FROM kunden_kennzahlen), '99', 'chef_b sieht den WERT der eigenen Agentur (99), nicht den von Kunde A1/A2');

-- ============================================================
-- editor_a1: sieht nur den ihm zugewiesenen Kunden A1, nicht Kunde A2
-- (gleiche Agentur, aber nicht zugewiesen).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, nur Kunde A1 zugewiesen

SELECT is((SELECT count(*) FROM kunden_profil)::int, 1, 'editor_a1 sieht genau die 1 kunden_profil-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT positionierung FROM kunden_profil), 'Positionierung Kunde A1', 'editor_a1 sieht den Inhalt von Kunde A1, nicht von Kunde A2');
SELECT is((SELECT count(*) FROM kunden_boilerplate)::int, 1, 'editor_a1 sieht genau die 1 kunden_boilerplate-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_kennzahlen)::int, 1, 'editor_a1 sieht genau die 1 kunden_kennzahlen-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_sprecher)::int, 1, 'editor_a1 sieht genau die 1 kunden_sprecher-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_kernbotschaften)::int, 1, 'editor_a1 sieht genau die 1 kunden_kernbotschaften-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_themen)::int, 1, 'editor_a1 sieht genau die 1 kunden_themen-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_grenzen)::int, 1, 'editor_a1 sieht genau die 1 kunden_grenzen-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_freigabekette)::int, 1, 'editor_a1 sieht genau die 1 kunden_freigabekette-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_praezedenzfaelle)::int, 1, 'editor_a1 sieht genau die 1 kunden_praezedenzfaelle-Zeile des zugewiesenen Kunden A1');
SELECT is((SELECT count(*) FROM kunden_medien_kontext)::int, 1, 'editor_a1 sieht genau die 1 kunden_medien_kontext-Zeile des zugewiesenen Kunden A1');

-- ============================================================
-- Nur Service-Role schreibt: keine INSERT/UPDATE-Policy für Endnutzer-Rollen
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

-- kunde_id = Kunde A2 (keine bestehende kunden_profil-Zeile, siehe oben),
-- damit der erwartete Fehler eindeutig die RLS-Policy ist, nicht ein
-- Unique-Conflict auf kunde_id.
SELECT throws_like(
  $$ INSERT INTO kunden_profil (kunde_id, positionierung) VALUES ('a0000000-0000-0000-0000-000000000012', 'Manipuliert') $$,
  '%row-level security policy%',
  'chef_a kann KEINE kunden_profil-Zeile per authentifizierter Session anlegen (nur Service-Role schreibt, kein Editier-UI in Ebene 1+2)'
);

-- Postgres wirft hier KEINEN Fehler (anders als beim INSERT oben): ohne
-- UPDATE-Policy gilt ein impliziter "USING (false)", die Zeile wird für das
-- UPDATE schlicht nicht ausgewählt (0 betroffene Zeilen), analog zu
-- 05_reader_keine_schreibrechte.test.sql. Data-modifying CTE als
-- Sub-Argument ist verboten, deshalb eigene oberste Anweisung mit
-- RETURNING in eine TEMP-Tabelle.
WITH versuch AS (
  UPDATE kunden_profil SET positionierung = 'Manipuliert'
  WHERE id = 'a0000000-0000-0000-0000-000000013001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test13_update_versuch FROM versuch;

SELECT is(
  (SELECT c FROM t_test13_update_versuch)::int,
  0,
  'ein UPDATE-Versuch von chef_a auf kunden_profil betrifft 0 Zeilen (keine Schreib-Policy, nur Service-Role schreibt)'
);

SELECT tests.clear_authentication(); -- zurück auf Owner-Ebene, um den Originalzustand zu prüfen

SELECT is(
  (SELECT positionierung FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000013001'),
  'Positionierung Kunde A1',
  'kunden_profil bleibt nach dem UPDATE-Versuch von chef_a unverändert (Original-Positionierung, nicht der manipulierte Wert)'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a, für den folgenden INSERT-Versuch

SELECT throws_like(
  $$ INSERT INTO kunden_grenzen (kunde_id, typ, inhalt) VALUES ('a0000000-0000-0000-0000-000000000011', 'no_go_thema', 'Manipuliert') $$,
  '%row-level security policy%',
  'chef_a kann KEINE kunden_grenzen-Zeile per authentifizierter Session anlegen (nur Service-Role schreibt)'
);

SELECT * FROM finish();
ROLLBACK;
