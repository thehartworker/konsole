-- Test-Fall 14 (Issue #35, Kundenprofil-Fundament): Status-Mechanismus.
-- Beweist, dass ein Element von "abgeleitet" auf "freigegeben" wechseln
-- kann (sowohl über die status-Spalte der Listen-Tabellen als auch über das
-- feld_status-jsonb der Kern-Tabelle, siehe docs/decisions/2026-07-12_kundenprofil.md,
-- Abschnitt "Status-Modell"), dass der Enum nur die drei erlaubten Werte
-- zulässt, und dass ist_deterministisch_erzwungen unabhängig vom Status
-- erhalten bleibt (siehe Decision, Abschnitt "Deterministisch erzwungene
-- Grenzen").
--
-- Läuft als Tabellen-Owner (postgres, RLS-Bypass), analog zu
-- 09_agentur_id_konsistenz_trigger.test.sql: dieser Test prüft
-- Status-Übergänge auf Datenebene, nicht RLS-Sichtbarkeit (das ist Test 13).

BEGIN;
SELECT plan(8);

-- ============================================================
-- Listen-Tabelle: kunden_grenzen, status-Spalte
-- ============================================================

INSERT INTO kunden_grenzen (id, kunde_id, typ, inhalt, ist_deterministisch_erzwungen, status) VALUES
  ('a0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000011', 'verbotene_aussage', 'Wir garantieren Heilung', true, 'abgeleitet');

SELECT is(
  (SELECT status::text FROM kunden_grenzen WHERE id = 'a0000000-0000-0000-0000-000000014001'),
  'abgeleitet',
  'kunden_grenzen-Zeile startet mit status = abgeleitet (Default, KI-vorgeschlagen)'
);

UPDATE kunden_grenzen SET status = 'freigegeben' WHERE id = 'a0000000-0000-0000-0000-000000014001';

SELECT is(
  (SELECT status::text FROM kunden_grenzen WHERE id = 'a0000000-0000-0000-0000-000000014001'),
  'freigegeben',
  'kunden_grenzen-Zeile wechselt erfolgreich von abgeleitet auf freigegeben (menschliche Bestätigung)'
);

SELECT is(
  (SELECT ist_deterministisch_erzwungen FROM kunden_grenzen WHERE id = 'a0000000-0000-0000-0000-000000014001'),
  true,
  'ist_deterministisch_erzwungen bleibt beim Status-Übergang unverändert true (Enforcement hängt nicht am Status, siehe Decision)'
);

SELECT throws_like(
  $$ INSERT INTO kunden_grenzen (kunde_id, typ, inhalt, status) VALUES ('a0000000-0000-0000-0000-000000000011', 'no_go_thema', 'x', 'sonstige') $$,
  '%invalid input value for enum%',
  'kunden_profil_element_status lässt nur die drei definierten Werte zu, ein unbekannter Wert wird abgelehnt'
);

-- ============================================================
-- Kern-Tabelle: kunden_profil, feld_status-jsonb (Quer-Prinzip 1, pro
-- Feldname, nicht pro Zeile/Schicht)
-- ============================================================

INSERT INTO kunden_profil (id, kunde_id, positionierung, grundton, feld_status) VALUES (
  'a0000000-0000-0000-0000-000000014002',
  'a0000000-0000-0000-0000-000000000012',
  'Erschlossene Positionierung',
  'sachlich',
  '{"positionierung": {"status": "abgeleitet", "quelle": "website-scraping"}, "grundton": {"status": "freigegeben"}}'::jsonb
);

SELECT is(
  (SELECT feld_status -> 'positionierung' ->> 'status' FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000014002'),
  'abgeleitet',
  'feld_status für "positionierung" startet als abgeleitet'
);

UPDATE kunden_profil
  SET feld_status = jsonb_set(feld_status, '{positionierung,status}', '"freigegeben"'::jsonb)
  WHERE id = 'a0000000-0000-0000-0000-000000014002';

SELECT is(
  (SELECT feld_status -> 'positionierung' ->> 'status' FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000014002'),
  'freigegeben',
  'feld_status für "positionierung" wechselt per gezieltem jsonb_set auf freigegeben'
);

SELECT is(
  (SELECT feld_status -> 'grundton' ->> 'status' FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000014002'),
  'freigegeben',
  'feld_status für "grundton" bleibt vom Update auf "positionierung" unberührt (partielles Update, kein Feld überschreibt ein anderes)'
);

SELECT is(
  (SELECT grundton::text FROM kunden_profil WHERE id = 'a0000000-0000-0000-0000-000000014002'),
  'sachlich',
  'grundton-Wert selbst bleibt vom feld_status-Update unberührt (Inhalt und Status sind getrennte Spalten)'
);

SELECT * FROM finish();
ROLLBACK;
