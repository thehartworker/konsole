-- Test-Fall 15 (Issue #37, Kundenprofil Ebene 3 KI-Befüllung):
-- kunden_quelldokumente ist RLS-konform, gleiches Muster wie
-- kunden_profil/pruefregeln (Test 12/13): Mandanten-Trennung über
-- current_agentur_id(), Kunden-Zuweisungs-Grenze für nicht-chef-Rollen,
-- keine Schreibrechte für authentifizierte Sessions (nur Service-Role, der
-- Upload läuft über eine Server-Route mit Service-Role).
--
-- Läuft zunächst als Tabellen-Owner (postgres, RLS-Bypass) für die
-- Fixture-Inserts, analog zu 003_fixtures.sql/13_kundenprofil_rls.test.sql.
-- Je eine Zeile für Kunde A1, Kunde A2 (beide Agentur A, editor_a1 nur A1
-- zugewiesen) und Kunde B1 (Agentur B).

BEGIN;
SELECT plan(10);

INSERT INTO kunden_quelldokumente (id, kunde_id, bucket_pfad, dateiname, mime_typ, groesse_bytes, extraktion_status) VALUES
  ('a0000000-0000-0000-0000-000000015001', 'a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000011/doc-a1.pdf', 'geschaeftsbericht-a1.pdf', 'application/pdf', 102400, 'ausstehend'),
  ('a0000000-0000-0000-0000-000000015002', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000012/doc-a2.pdf', 'geschaeftsbericht-a2.pdf', 'application/pdf', 51200, 'verarbeitet'),
  ('a0000000-0000-0000-0000-000000015003', 'a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000021/doc-b1.pdf', 'geschaeftsbericht-b1.pdf', 'application/pdf', 20480, 'ausstehend');

-- agentur_id wird vom Konsistenz-Trigger aus kunde_id übernommen, nicht aus
-- diesem INSERT.
SELECT is(
  (SELECT agentur_id FROM kunden_quelldokumente WHERE id = 'a0000000-0000-0000-0000-000000015001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'agentur_id wird vom Konsistenz-Trigger korrekt aus kunde_id (Kunde A1) übernommen'
);

SELECT is(
  (SELECT extraktion_status::text FROM kunden_quelldokumente WHERE id = 'a0000000-0000-0000-0000-000000015001'),
  'ausstehend',
  'extraktion_status defaultet korrekt auf "ausstehend"'
);

-- ============================================================
-- Mandanten-Trennung: chef sieht nur die eigene Agentur
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT is(
  (SELECT count(*) FROM kunden_quelldokumente)::int, 2,
  'chef_a sieht genau die 2 kunden_quelldokumente-Zeilen der eigenen Agentur A (Kunde A1 + A2), keine aus Agentur B'
);

SELECT is(
  (SELECT count(*) FROM kunden_quelldokumente WHERE id = 'a0000000-0000-0000-0000-000000015003')::int, 0,
  'chef_a kann die kunden_quelldokumente-Zeile von Agentur B (Kunde B1) nicht per direkter id lesen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000201'); -- chef_b

SELECT is(
  (SELECT count(*) FROM kunden_quelldokumente)::int, 1,
  'chef_b sieht genau die 1 kunden_quelldokumente-Zeile der eigenen Agentur B, keine aus Agentur A'
);

SELECT is(
  (SELECT dateiname FROM kunden_quelldokumente), 'geschaeftsbericht-b1.pdf',
  'chef_b sieht den Dateinamen der eigenen Agentur, nicht den von Kunde A1/A2'
);

-- ============================================================
-- Kunden-Zuweisung: editor sieht nur zugewiesene Kunden
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, nur Kunde A1 zugewiesen

SELECT is(
  (SELECT count(*) FROM kunden_quelldokumente)::int, 1,
  'editor_a1 sieht genau die 1 kunden_quelldokumente-Zeile des ihm zugewiesenen Kunden A1'
);

SELECT is(
  (SELECT count(*) FROM kunden_quelldokumente WHERE kunde_id = 'a0000000-0000-0000-0000-000000000012')::int, 0,
  'editor_a1 sieht keine kunden_quelldokumente-Zeile von Kunde A2 (nicht zugewiesen, gleiche Agentur)'
);

-- ============================================================
-- Nur Service-Role schreibt: keine INSERT/UPDATE-Policy für Endnutzer-Rollen
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000101'); -- chef_a

SELECT throws_like(
  $$ INSERT INTO kunden_quelldokumente (kunde_id, bucket_pfad, dateiname)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'manipuliert/pfad.pdf', 'manipuliert.pdf') $$,
  '%row-level security policy%',
  'chef_a kann KEINE kunden_quelldokumente-Zeile per authentifizierter Session anlegen (nur Service-Role schreibt, Upload läuft über Server-Route)'
);

WITH versuch AS (
  UPDATE kunden_quelldokumente SET dateiname = 'manipuliert.pdf'
  WHERE id = 'a0000000-0000-0000-0000-000000015001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test15_update_versuch FROM versuch;

SELECT is(
  (SELECT c FROM t_test15_update_versuch)::int,
  0,
  'ein UPDATE-Versuch von chef_a auf kunden_quelldokumente betrifft 0 Zeilen (keine Schreib-Policy, nur Service-Role schreibt)'
);

SELECT * FROM finish();
ROLLBACK;
