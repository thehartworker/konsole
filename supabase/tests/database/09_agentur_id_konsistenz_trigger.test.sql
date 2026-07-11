BEGIN;

-- Test-Fall 9 (Issue #20): Die agentur_id-Konsistenz-Trigger verhindern das
-- Einschmuggeln einer fremden agentur_id beim Insert (Migration
-- 20260711130300_agentur_id_konsistenz_trigger.sql). Jeder Trigger
-- überschreibt NEW.agentur_id (und bei handler_aufrufe zusätzlich
-- NEW.kunde_id) unconditional aus der Parent-Zeile, unabhängig davon, was
-- der Aufrufer mitschickt. Läuft absichtlich OHNE tests.authenticate_as():
-- der Trigger schützt genau den Service-Role-Ingest-Pfad (siehe
-- docs/decisions/2026-07-10_rls-policies.md, "Konsequenzen"), für den es
-- gar keine INSERT-RLS-Policy gibt; dieser Test prüft den Trigger-Mechanismus
-- selbst, nicht RLS.

SELECT plan(5);

-- vorgaenge: kunde_id gehört zu Agentur A, agentur_id wird explizit auf
-- Agentur B gefälscht.
INSERT INTO vorgaenge (id, kunde_id, agentur_id, kanal, absender_identifikator, eingang_at, inhalt_text)
VALUES (
  'a0000000-0000-0000-0000-000000009001',
  'a0000000-0000-0000-0000-000000000011', -- Kunde A1, Agentur A
  'a0000000-0000-0000-0000-000000000002', -- gefälscht: Agentur B
  'email', 'trigger-test@example.com', now(), 'Trigger-Test vorgaenge'
);
SELECT is(
  (SELECT agentur_id FROM vorgaenge WHERE id = 'a0000000-0000-0000-0000-000000009001'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'vorgaenge: der Trigger überschreibt eine gefälschte agentur_id mit der echten agentur_id aus kunde_id'
);

-- kunden_kontakte: gleiches Muster.
INSERT INTO kunden_kontakte (id, kunde_id, agentur_id, name, rolle)
VALUES (
  'a0000000-0000-0000-0000-000000009002',
  'a0000000-0000-0000-0000-000000000011', -- Kunde A1, Agentur A
  'a0000000-0000-0000-0000-000000000002', -- gefälscht: Agentur B
  'Trigger-Test Kontakt', 'sonstige'
);
SELECT is(
  (SELECT agentur_id FROM kunden_kontakte WHERE id = 'a0000000-0000-0000-0000-000000009002'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'kunden_kontakte: der Trigger überschreibt eine gefälschte agentur_id mit der echten agentur_id aus kunde_id'
);

-- anliegen: gleiches Muster, Parent ist vorgaenge.
INSERT INTO anliegen (id, vorgang_id, agentur_id, beschreibung, prioritaet)
VALUES (
  'a0000000-0000-0000-0000-000000009003',
  'a0000000-0000-0000-0000-000000001001', -- Vorgang bei Kunde A1, Agentur A
  'a0000000-0000-0000-0000-000000000002', -- gefälscht: Agentur B
  'Trigger-Test Anliegen', 'niedrig'
);
SELECT is(
  (SELECT agentur_id FROM anliegen WHERE id = 'a0000000-0000-0000-0000-000000009003'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'anliegen: der Trigger überschreibt eine gefälschte agentur_id mit der echten agentur_id aus vorgang_id'
);

-- handler_aufrufe: schützt zwei Spalten gleichzeitig (agentur_id UND kunde_id).
INSERT INTO handler_aufrufe (id, vorgang_id, anliegen_id, agentur_id, kunde_id, handler_slug, zustaendige_nutzer_id, prioritaet)
VALUES (
  'a0000000-0000-0000-0000-000000009004',
  'a0000000-0000-0000-0000-000000001001', -- Vorgang bei Kunde A1, Agentur A
  'a0000000-0000-0000-0000-000000002002',
  'a0000000-0000-0000-0000-000000000002', -- gefälscht: Agentur B
  'a0000000-0000-0000-0000-000000000021', -- gefälscht: Kunde B1
  'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000103', 'mittel'
);
SELECT is(
  (SELECT agentur_id FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000009004'),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'handler_aufrufe: der Trigger überschreibt eine gefälschte agentur_id mit der echten agentur_id aus vorgang_id'
);
SELECT is(
  (SELECT kunde_id FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000009004'),
  'a0000000-0000-0000-0000-000000000011'::uuid,
  'handler_aufrufe: der Trigger überschreibt eine gefälschte kunde_id mit der echten kunde_id aus vorgang_id'
);

SELECT * FROM finish();
ROLLBACK;
