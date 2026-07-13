-- Konsole Block 2 (Issue #45): beweist den Freigabe-Erlöschen-Trigger
-- (handler_aufrufe_freigabe_erlischt_trg, siehe
-- 20260713190000_konsole_block2_editing.sql) und dass die bestehende
-- handler_aufrufe_aktualisieren-Policy (RLS, aus Block 1) das UPDATE von
-- ergebnis_bearbeitet für die berechtigte Nutzerin erlaubt und für die
-- unberechtigte verweigert -- analog zu Test 17.
--
-- Fixtures (siehe helpers/003_fixtures.sql): handler_aufrufe-Zeile 3001
-- gehört zu Vorgang 1002 (Kunde A1, vertraulich, editor_a1 zuständig).

BEGIN;
SELECT plan(9);

-- ============================================================
-- Ausgangslage: editor_a1 (zuständig) gibt 3001 frei (Setup für die
-- folgenden Schritte, nicht Gegenstand des Trigger-Tests selbst).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig für Vorgang 1002

UPDATE handler_aufrufe SET freigegeben_at = now(), freigegeben_durch = 'a0000000-0000-0000-0000-000000000103'
  WHERE id = 'a0000000-0000-0000-0000-000000003001';

SELECT isnt(
  (SELECT freigegeben_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'Setup: 3001 ist nach dem Freigeben tatsächlich freigegeben (freigegeben_at gesetzt)'
);

-- ============================================================
-- Trigger: ergebnis_bearbeitet setzen lässt die Freigabe erlöschen.
-- ============================================================

UPDATE handler_aufrufe SET ergebnis_bearbeitet = '{"pressemitteilung": {"headline": "Erste Bearbeitung"}}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000003001';

SELECT is(
  (SELECT freigegeben_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'Trigger: UPDATE mit ergebnis_bearbeitet setzt freigegeben_at auf NULL'
);

SELECT is(
  (SELECT freigegeben_durch FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'Trigger: UPDATE mit ergebnis_bearbeitet setzt freigegeben_durch auf NULL'
);

SELECT isnt(
  (SELECT bearbeitet_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'Trigger: UPDATE mit ergebnis_bearbeitet setzt bearbeitet_at'
);

-- ============================================================
-- RLS: handler_aufrufe_aktualisieren (Block 1) erlaubt der berechtigten
-- Nutzerin das UPDATE von ergebnis_bearbeitet, verweigert es der
-- unberechtigten -- Postgres-RLS kennt keine Spalten-Allowlist, die
-- bestehende zeilenbasierte Policy reicht (siehe Migrations-Kommentar).
-- ============================================================

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000104'); -- editor_a2, gleicher Kunde, NICHT zuständig für 1002
WITH versuch AS (
  UPDATE handler_aufrufe SET ergebnis_bearbeitet = '{"pressemitteilung": {"headline": "Fremde Bearbeitung"}}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000003001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test18_update_editor_a2 FROM versuch;

SELECT is(
  (SELECT c FROM t_test18_update_editor_a2)::int, 0,
  'editor_a2 (NICHT zuständig) kann ergebnis_bearbeitet auf 3001 NICHT setzen (0 betroffene Zeilen)'
);

SELECT tests.authenticate_as('a0000000-0000-0000-0000-000000000103'); -- editor_a1, zuständig
WITH versuch AS (
  UPDATE handler_aufrufe SET ergebnis_bearbeitet = '{"pressemitteilung": {"headline": "Zweite Bearbeitung"}}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000003001'
  RETURNING 1
)
SELECT count(*) AS c INTO TEMP t_test18_update_editor_a1 FROM versuch;

SELECT is(
  (SELECT c FROM t_test18_update_editor_a1)::int, 1,
  'editor_a1 (zuständig) kann ergebnis_bearbeitet auf 3001 setzen'
);

-- ============================================================
-- Regressions-Kontrolle: ein UPDATE, das ergebnis_bearbeitet NICHT
-- anfasst, lässt eine (erneute) Freigabe unangetastet.
-- ============================================================

UPDATE handler_aufrufe SET freigegeben_at = now(), freigegeben_durch = 'a0000000-0000-0000-0000-000000000103'
  WHERE id = 'a0000000-0000-0000-0000-000000003001';

UPDATE handler_aufrufe SET status = 'done' WHERE id = 'a0000000-0000-0000-0000-000000003001';

SELECT isnt(
  (SELECT freigegeben_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'UPDATE ohne ergebnis_bearbeitet (hier: status) ändert freigegeben_at NICHT'
);

-- Setzen auf denselben (unveränderten) Wert -- IS DISTINCT FROM ist false,
-- Trigger darf hier NICHT auslösen.
UPDATE handler_aufrufe SET ergebnis_bearbeitet = '{"pressemitteilung": {"headline": "Zweite Bearbeitung"}}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000003001';

SELECT isnt(
  (SELECT freigegeben_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'UPDATE von ergebnis_bearbeitet auf denselben Wert ändert freigegeben_at NICHT (IS DISTINCT FROM)'
);

-- Ein tatsächlich veränderter Wert löst den Trigger erneut aus.
UPDATE handler_aufrufe SET ergebnis_bearbeitet = '{"pressemitteilung": {"headline": "Dritte Bearbeitung"}}'::jsonb
  WHERE id = 'a0000000-0000-0000-0000-000000003001';

SELECT is(
  (SELECT freigegeben_at FROM handler_aufrufe WHERE id = 'a0000000-0000-0000-0000-000000003001'), NULL,
  'UPDATE von ergebnis_bearbeitet auf einen veränderten Wert lässt die (erneute) Freigabe wieder erlöschen'
);

SELECT * FROM finish();
ROLLBACK;
