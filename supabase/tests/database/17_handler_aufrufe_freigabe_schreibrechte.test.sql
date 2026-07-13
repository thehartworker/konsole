-- Konsole Block 1 (Issue #43): Beweist die neuen Schreibrechte aus
-- docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md
-- (Abschnitt 9) -- "Handler auslösen" (INSERT handler_aufrufe), Handler-
-- Ergebnis freigeben (UPDATE handler_aufrufe), audit_log-Eintrag der
-- eigenen Aktion (INSERT audit_log), llm_nutzung-Zeile pro LLM-Aufruf
-- (INSERT llm_nutzung). Alle vier hingen bisher ausschließlich am
-- Service-Role-Pfad (Klassifikations-Ingest/Hintergrund-Worker).
--
-- Fixtures (siehe helpers/003_fixtures.sql): Vorgang 1001 (Kunde A1,
-- normal, niemand explizit zuständig), Vorgang 1002 (Kunde A1, vertraulich,
-- Editor A1 zuständig), Anliegen 2001 (zu 1002), Anliegen 2002 (zu 1001),
-- handler_aufrufe-Zeile 3001 (zu 1002, W2, Editor A1 zuständig).

BEGIN;
SELECT plan(13);

-- ============================================================
-- handler_aufrufe INSERT ("Handler auslösen")
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig für den vertraulichen Vorgang 1002
SELECT lives_ok(
  $$ INSERT INTO handler_aufrufe (vorgang_id, anliegen_id, agentur_id, kunde_id, handler_slug, zustaendige_nutzer_id, prioritaet)
     VALUES ('a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000002001',
             'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
             'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000103', 'hoch') $$,
  'editor_a1 (zuständig) kann für Vorgang 1002 einen handler_aufrufe-Eintrag anlegen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, gleicher Kunde, NICHT zuständig für 1002
-- throws_ok statt throws_like: editor_a2 sieht Vorgang 1002 selbst nicht
-- (darf_vorgang_sehen), deshalb schlägt schon die interne "SELECT ... INTO
-- STRICT"-Abfrage von handler_aufrufe_agentur_id_setzen_trg (siehe
-- 20260711130300_agentur_id_konsistenz_trigger.sql) mit "query returned no
-- rows" fehl, BEVOR die WITH-CHECK-Klausel der neuen Policy überhaupt
-- ausgewertet wird -- nicht mit der RLS-Policy-Fehlermeldung. Der Schreib-
-- Versuch scheitert so oder so, nur der exakte Fehlertext unterscheidet
-- sich je nachdem, ob die Zeile für den Aufrufer überhaupt sichtbar ist.
SELECT throws_ok(
  $$ INSERT INTO handler_aufrufe (vorgang_id, anliegen_id, agentur_id, kunde_id, handler_slug, zustaendige_nutzer_id, prioritaet)
     VALUES ('a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000002001',
             'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
             'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000104', 'hoch') $$,
  'editor_a2 (gleicher Kunde, NICHT zuständig) kann für den sensitiven Vorgang 1002 KEINEN handler_aufrufe-Eintrag anlegen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a, zugewiesen, aber keine Schreibrechte
SELECT throws_like(
  $$ INSERT INTO handler_aufrufe (vorgang_id, anliegen_id, agentur_id, kunde_id, handler_slug, zustaendige_nutzer_id, prioritaet)
     VALUES ('a0000000-0000-0000-0000-000000001001', 'a0000000-0000-0000-0000-000000002002',
             'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
             'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000105', 'mittel') $$,
  '%row-level security policy%',
  'reader_a (kann sehen, aber nicht freigeben) kann KEINEN handler_aufrufe-Eintrag anlegen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000202'); -- editor_b, andere Agentur
-- throws_ok statt throws_like: editor_b sieht Vorgang 1001 (andere Agentur)
-- gar nicht, gleiche Begründung wie beim editor_a2-Fall oben.
SELECT throws_ok(
  $$ INSERT INTO handler_aufrufe (vorgang_id, anliegen_id, agentur_id, kunde_id, handler_slug, zustaendige_nutzer_id, prioritaet)
     VALUES ('a0000000-0000-0000-0000-000000001001', 'a0000000-0000-0000-0000-000000002002',
             'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
             'W2_presseanfragen_drafter', 'a0000000-0000-0000-0000-000000000202', 'mittel') $$,
  'editor_b (andere Agentur) kann für einen fremden Vorgang KEINEN handler_aufrufe-Eintrag anlegen'
);

-- ============================================================
-- handler_aufrufe UPDATE (Status nach Handler-Lauf, Freigabe)
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig
WITH versuch AS (
  UPDATE handler_aufrufe SET freigegeben_at = now(), freigegeben_durch = 'a0000000-0000-0000-0000-000000000103'
  WHERE id = 'a0000000-0000-0000-0000-000000003001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test17_update_editor_a1 FROM versuch;

SELECT is(
  (SELECT c FROM t_test17_update_editor_a1)::int, 1,
  'editor_a1 (zuständig) kann den bestehenden handler_aufrufe-Eintrag von Vorgang 1002 freigeben'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, NICHT zuständig
WITH versuch AS (
  UPDATE handler_aufrufe SET freigegeben_at = now(), freigegeben_durch = 'a0000000-0000-0000-0000-000000000104'
  WHERE id = 'a0000000-0000-0000-0000-000000003001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test17_update_editor_a2 FROM versuch;

SELECT is(
  (SELECT c FROM t_test17_update_editor_a2)::int, 0,
  'editor_a2 (NICHT zuständig) kann den handler_aufrufe-Eintrag von Vorgang 1002 NICHT freigeben (0 betroffene Zeilen)'
);

-- ============================================================
-- vorgaenge_schreiben: Regressions-Kontrolle nach der Umstellung auf
-- darf_vorgang_bearbeiten() (siehe Migration, DROP+CREATE POLICY).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig
WITH versuch AS (
  UPDATE vorgaenge SET rueckfrage_nachricht = 'Testtext'
  WHERE id = 'a0000000-0000-0000-0000-000000001002'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test17_vorgaenge_schreiben FROM versuch;

SELECT is(
  (SELECT c FROM t_test17_vorgaenge_schreiben)::int, 1,
  'editor_a1 (zuständig) kann rueckfrage_nachricht auf Vorgang 1002 setzen (vorgaenge_schreiben funktioniert nach der Umstellung auf darf_vorgang_bearbeiten() weiterhin)'
);

-- ============================================================
-- audit_log INSERT (eigene Aktion protokollieren)
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1
SELECT lives_ok(
  $$ INSERT INTO audit_log (agentur_id, vorgang_id, nutzer_id, aktion, aktion_payload)
     VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001002',
             'a0000000-0000-0000-0000-000000000103', 'freigabe_erteilt', jsonb_build_object('typ', 'handler_ergebnis')) $$,
  'editor_a1 kann die eigene Freigabe-Aktion im audit_log protokollieren'
);

SELECT throws_like(
  $$ INSERT INTO audit_log (agentur_id, vorgang_id, nutzer_id, aktion, aktion_payload)
     VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001002',
             'a0000000-0000-0000-0000-000000000104', 'freigabe_erteilt', jsonb_build_object('typ', 'handler_ergebnis')) $$,
  '%row-level security policy%',
  'editor_a1 kann KEINEN audit_log-Eintrag im Namen von editor_a2 anlegen (nutzer_id muss auth.uid() sein)'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, NICHT zuständig für 1002
-- throws_ok statt throws_like: editor_a2 sieht Vorgang 1002 nicht, deshalb
-- schlägt schon audit_log_agentur_id_setzen_trg (gleiches STRICT-Muster)
-- fehl, bevor die WITH-CHECK-Klausel ausgewertet wird.
SELECT throws_ok(
  $$ INSERT INTO audit_log (agentur_id, vorgang_id, nutzer_id, aktion, aktion_payload)
     VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001002',
             'a0000000-0000-0000-0000-000000000104', 'freigabe_erteilt', jsonb_build_object('typ', 'handler_ergebnis')) $$,
  'editor_a2 (NICHT zuständig für den sensitiven Vorgang 1002) kann dort auch keinen eigenen audit_log-Eintrag anlegen'
);

-- ============================================================
-- llm_nutzung INSERT (pro tatsächlichem LLM-Aufruf während "Handler auslösen")
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, Kunde A1 zugewiesen
SELECT lives_ok(
  $$ INSERT INTO llm_nutzung (kunde_id, vorgang_id, handler_slug, input_tokens, output_tokens, modell)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000001002',
             'W2_presseanfragen_drafter', 100, 50, 'claude-test') $$,
  'editor_a1 kann für seinen zugewiesenen Kunden eine llm_nutzung-Zeile anlegen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000105'); -- reader_a, keine Schreibrechte
SELECT throws_like(
  $$ INSERT INTO llm_nutzung (kunde_id, vorgang_id, handler_slug, input_tokens, output_tokens, modell)
     VALUES ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000001001',
             'W2_presseanfragen_drafter', 100, 50, 'claude-test') $$,
  '%row-level security policy%',
  'reader_a kann KEINE llm_nutzung-Zeile anlegen'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000102'); -- manager_a, NICHT zugewiesen zu Kunde A2
-- throws_ok statt throws_like: manager_a sieht die kunden-Zeile A2 selbst
-- nicht (kunden_lesen), deshalb schlägt schon
-- llm_nutzung_agentur_id_setzen_trg (gleiches STRICT-Muster, Quelle
-- 20260712080000_llm_nutzung.sql) fehl, bevor die neue WITH-CHECK-Klausel
-- ausgewertet wird.
SELECT throws_ok(
  $$ INSERT INTO llm_nutzung (kunde_id, vorgang_id, handler_slug, input_tokens, output_tokens, modell)
     VALUES ('a0000000-0000-0000-0000-000000000012', NULL, 'W2_presseanfragen_drafter', 100, 50, 'claude-test') $$,
  'manager_a (NICHT zugewiesen zu Kunde A2) kann dort keine llm_nutzung-Zeile anlegen'
);

SELECT * FROM finish();
ROLLBACK;
