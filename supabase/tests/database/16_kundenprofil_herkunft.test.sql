-- Test-Fall 16 (Issue #37, Kundenprofil Ebene 3 KI-Befüllung, PR 2):
-- herkunft-Spalte auf den Kundenprofil-Listen-Tabellen. Beweist, dass
-- 'dokument-upload'/'website-scraping' akzeptiert werden, NULL (manuell
-- erfasst) weiterhin der unveränderte Default ist, und ein beliebiger
-- anderer Wert von der CHECK-Constraint abgelehnt wird. Exemplarisch an
-- kunden_boilerplate (Text-Listen-Tabelle) und kunden_kennzahlen (Tabelle
-- mit eigener, inhaltlicher quelle-Spalte, um die Verwechslungsgefahr
-- herkunft/quelle mit abzudecken) geprüft, das Migrations-Muster ist für
-- alle neun Tabellen identisch.
--
-- Läuft als Tabellen-Owner (postgres, RLS-Bypass), analog zu Test 14: prüft
-- Spalten-/Constraint-Verhalten auf Datenebene, nicht RLS-Sichtbarkeit (das
-- ist Test 13/15).

BEGIN;
SELECT plan(6);

INSERT INTO kunden_boilerplate (id, kunde_id, typ, sprache, text, status, herkunft) VALUES
  ('a0000000-0000-0000-0000-000000016001', 'a0000000-0000-0000-0000-000000000011', 'kurz', 'de', 'KI-Vorschlag aus Dokument', 'abgeleitet', 'dokument-upload');

SELECT is(
  (SELECT herkunft FROM kunden_boilerplate WHERE id = 'a0000000-0000-0000-0000-000000016001'),
  'dokument-upload',
  'kunden_boilerplate.herkunft speichert "dokument-upload" korrekt'
);

INSERT INTO kunden_boilerplate (id, kunde_id, typ, sprache, text, status) VALUES
  ('a0000000-0000-0000-0000-000000016002', 'a0000000-0000-0000-0000-000000000011', 'kurz', 'de', 'Manuell erfasster Boilerplate-Text', 'freigegeben');

SELECT is(
  (SELECT herkunft FROM kunden_boilerplate WHERE id = 'a0000000-0000-0000-0000-000000016002'),
  NULL,
  'kunden_boilerplate.herkunft bleibt NULL (Default) für manuell erfasste Zeilen, kein Zwang zur Angabe'
);

SELECT throws_like(
  $$ INSERT INTO kunden_boilerplate (kunde_id, typ, sprache, text, herkunft)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'kurz', 'de', 'x', 'manuell-getippt') $$,
  '%violates check constraint%',
  'kunden_boilerplate.herkunft lehnt einen unbekannten Wert ab (nur dokument-upload/website-scraping/NULL erlaubt)'
);

-- kunden_kennzahlen: eigene, inhaltliche "quelle"-Spalte bleibt von der neuen
-- "herkunft"-Spalte unberührt (keine Verwechslung der beiden Konzepte).
INSERT INTO kunden_kennzahlen (id, kunde_id, bezeichnung, wert, stichtag, quelle, status, herkunft) VALUES
  ('a0000000-0000-0000-0000-000000016003', 'a0000000-0000-0000-0000-000000000011', 'Mitarbeitende', '42', '2026-01-01', 'Geschäftsbericht 2025', 'abgeleitet', 'website-scraping');

SELECT is(
  (SELECT herkunft FROM kunden_kennzahlen WHERE id = 'a0000000-0000-0000-0000-000000016003'),
  'website-scraping',
  'kunden_kennzahlen.herkunft speichert die technische Herkunft "website-scraping"'
);

SELECT is(
  (SELECT quelle FROM kunden_kennzahlen WHERE id = 'a0000000-0000-0000-0000-000000016003'),
  'Geschäftsbericht 2025',
  'kunden_kennzahlen.quelle (inhaltlicher Beleg der Zahl) bleibt von herkunft unabhängig erhalten'
);

SELECT throws_like(
  $$ INSERT INTO kunden_kennzahlen (kunde_id, bezeichnung, wert, stichtag, quelle, herkunft)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'x', 'y', '2026-01-01', 'z', 'per-post-zugeschickt') $$,
  '%violates check constraint%',
  'kunden_kennzahlen.herkunft lehnt ebenfalls einen unbekannten Wert ab'
);

SELECT * FROM finish();
ROLLBACK;
