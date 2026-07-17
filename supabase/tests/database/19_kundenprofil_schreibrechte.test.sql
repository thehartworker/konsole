-- Test-Fall 19 (Issue #50, Konsole Block 3 -- Kundenprofil-Editor):
-- INSERT/UPDATE-RLS-Policies aus 20260717120000_kundenprofil_schreibrechte.sql.
-- Ergänzt Test 13 (der nur noch Lese-Mandantentrennung prüft) um das
-- Schreibverhalten: chef schreibt jede Zeile der eigenen Agentur,
-- manager/editor nur für zugewiesene Kunden, reader bleibt ohne
-- Schreibrecht, keine agenturfremden Schreibzugriffe. Das ist der von der
-- Issue-Aufgabe "Tests" geforderte RLS-Test für "das Übernehmen von
-- Vorschlägen in das Kundenprofil nur für den zuständigen Nutzer" (ein
-- Vorschlag übernehmen heißt technisch: eine Listen-Zeile mit status =
-- 'abgeleitet' einfügen bzw. per Freigeben-Aktion auf 'freigegeben' setzen,
-- siehe docs/decisions/2026-07-17_konsole-block3-profil-editor.md).
--
-- Fixtures aus 003_fixtures.sql: editor_a1 (103) ist Kunde A1 zugewiesen,
-- NICHT Kunde A2 (beide Agentur A). manager_a (102) ist ebenfalls nur Kunde
-- A1 zugewiesen. reader_a (105) ist Kunde A1 zugewiesen, hat aber laut
-- RLS-Policy keinen Schreib-Zweig. chef_b (201)/editor_b (202) sind Agentur
-- B, editor_b ist Kunde B1 zugewiesen.

BEGIN;
SELECT plan(12);

-- ============================================================
-- editor_a1: darf für den zugewiesenen Kunden A1 schreiben (Kern-Tabelle).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1

SELECT lives_ok(
  $$ INSERT INTO kunden_profil (id, kunde_id, positionierung) VALUES ('a0000000-0000-0000-0000-000000019001', 'a0000000-0000-0000-0000-000000000011', 'Erstfassung editor_a1') $$,
  'editor_a1 kann eine kunden_profil-Zeile für den zugewiesenen Kunden A1 anlegen'
);

SELECT lives_ok(
  $$ UPDATE kunden_profil SET positionierung = 'Aktualisiert von editor_a1' WHERE id = 'a0000000-0000-0000-0000-000000019001' $$,
  'editor_a1 kann dieselbe Zeile anschließend aktualisieren'
);

SELECT is(
  (SELECT positionierung FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000019001'),
  'Aktualisiert von editor_a1',
  'die Aktualisierung von editor_a1 ist tatsächlich angekommen'
);

-- ============================================================
-- editor_a1: KEIN Schreibrecht für Kunde A2 (gleiche Agentur, aber nicht
-- zugewiesen) -- Kunden-Zuweisungs-Grenze gilt für Schreiben genauso wie
-- fürs Lesen.
-- ============================================================

SELECT throws_like(
  $$ INSERT INTO kunden_profil (kunde_id, positionierung) VALUES ('a0000000-0000-0000-0000-000000000012', 'Manipulationsversuch editor_a1') $$,
  '%row-level security policy%',
  'editor_a1 kann KEINE kunden_profil-Zeile für den NICHT zugewiesenen Kunden A2 anlegen'
);

-- ============================================================
-- reader_a: Kunde A1 zugewiesen, aber die Rolle "reader" hat keinen
-- Schreib-Zweig in der Policy -- Rollen-Grenze gilt zusätzlich zur
-- Zuweisungs-Grenze.
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a, Kunde A1 zugewiesen

-- kunde_id = Kunde A1 (reader_a IST zugewiesen), damit der Fehlschlag
-- eindeutig an der Rolle liegt, nicht zusätzlich an der Zuweisungs-Grenze
-- (die reader_a hier gar nicht verletzt).
SELECT throws_like(
  $$ INSERT INTO kunden_profil (kunde_id, positionierung) VALUES ('a0000000-0000-0000-0000-000000000011', 'Manipulationsversuch reader_a') $$,
  '%row-level security policy%',
  'reader_a kann trotz Kunden-Zuweisung KEINE kunden_profil-Zeile anlegen (Rolle "reader" ohne Schreib-Zweig)'
);

-- ============================================================
-- chef_b: fremde Agentur -- darf unter keinen Umständen in Agentur A
-- schreiben, unabhängig von Kunden-Zuweisung.
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

-- Postgres wirft hier KEINEN Fehler: die Zeile gehört nicht zur Agentur von
-- chef_b, USING schließt sie für das UPDATE schlicht aus (0 betroffene
-- Zeilen), analog zu 05_reader_keine_schreibrechte.test.sql und zum
-- editor_a1-Test weiter unten in dieser Datei.
WITH versuch AS (
  UPDATE kunden_profil SET positionierung = 'Manipulationsversuch chef_b'
  WHERE id = 'a0000000-0000-0000-0000-000000019001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test19_chef_b_cross_agentur_update FROM versuch;

SELECT is(
  (SELECT c FROM t_test19_chef_b_cross_agentur_update)::int,
  0,
  'ein UPDATE-Versuch von chef_b (fremde Agentur) auf die kunden_profil-Zeile von Kunde A1 betrifft 0 Zeilen'
);

SELECT tests.clear_authentication();

SELECT is(
  (SELECT positionierung FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000019001'),
  'Aktualisiert von editor_a1',
  'die Kunde-A1-Zeile bleibt nach dem Manipulationsversuch von chef_b unverändert'
);

-- ============================================================
-- manager_a: darf für den zugewiesenen Kunden A1 eine Listen-Zeile anlegen
-- UND per Freigeben-Aktion (elementStatusSetzen) auf 'freigegeben' setzen
-- -- das ist der Kern von "Vorschlag übernehmen"/"Feld freigeben".
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000102'); -- manager_a, Kunde A1 zugewiesen

SELECT lives_ok(
  $$ INSERT INTO kunden_kernbotschaften (id, kunde_id, text, reihenfolge, status) VALUES ('a0000000-0000-0000-0000-000000019002', 'a0000000-0000-0000-0000-000000000011', 'Kernbotschaft aus Extraktion', 1, 'abgeleitet') $$,
  'manager_a kann eine abgeleitete kunden_kernbotschaften-Zeile für den zugewiesenen Kunden A1 anlegen (Vorschlag übernehmen)'
);

SELECT lives_ok(
  $$ UPDATE kunden_kernbotschaften SET status = 'freigegeben' WHERE id = 'a0000000-0000-0000-0000-000000019002' $$,
  'manager_a kann dieselbe Zeile anschließend freigeben'
);

SELECT is(
  (SELECT status::text FROM kunden_kernbotschaften WHERE id = 'a0000000-0000-0000-0000-000000019002'),
  'freigegeben',
  'die Freigabe von manager_a ist tatsächlich angekommen'
);

-- ============================================================
-- editor_a1: KEIN Schreibzugriff auf eine Listen-Zeile von Kunde B1
-- (fremde Agentur) -- kein Fehler, aber 0 betroffene Zeilen (kein Fehler-
-- werfendes UPDATE ohne passende Policy-Zeile, analog zu
-- 05_reader_keine_schreibrechte.test.sql).
-- ============================================================

SELECT tests.clear_authentication(); -- zurück auf Owner-Ebene für den Fixture-Insert (RLS-Bypass)

INSERT INTO kunden_kernbotschaften (id, kunde_id, text, reihenfolge, status) VALUES
  ('a0000000-0000-0000-0000-000000019003', 'a0000000-0000-0000-0000-000000000021', 'Kernbotschaft Kunde B1', 1, 'freigegeben');

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, Agentur A

WITH versuch AS (
  UPDATE kunden_kernbotschaften SET text = 'Manipulationsversuch editor_a1'
  WHERE id = 'a0000000-0000-0000-0000-000000019003'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test19_cross_agentur_update FROM versuch;

SELECT is(
  (SELECT c FROM t_test19_cross_agentur_update)::int,
  0,
  'ein UPDATE-Versuch von editor_a1 auf eine kunden_kernbotschaften-Zeile von Kunde B1 (fremde Agentur) betrifft 0 Zeilen'
);

SELECT tests.clear_authentication();

SELECT is(
  (SELECT text FROM kunden_kernbotschaften WHERE id = 'a0000000-0000-0000-0000-000000019003'),
  'Kernbotschaft Kunde B1',
  'die Kunde-B1-Zeile bleibt nach dem Manipulationsversuch von editor_a1 unverändert'
);

SELECT * FROM finish();
ROLLBACK;
