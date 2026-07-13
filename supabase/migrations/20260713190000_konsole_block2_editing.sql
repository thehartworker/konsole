-- Konsole Block 2 (Issue #45): Inline-Editing der W1-Pressemitteilung.
-- Quelle: docs/decisions/2026-07-13_konsole-block2-editing-und-export.md.
--
-- Zwei neue Spalten auf handler_aufrufe (der bearbeitete Zustand relativ
-- zum KI-Original in `ergebnis`, plus ein Bearbeitet-Zeitstempel für den
-- Audit-Trail) und ein Trigger, der eine bestehende Freigabe automatisch
-- erlöschen lässt, sobald sich der bearbeitete Zustand ändert. Idempotent
-- geschrieben (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS),
-- weil diese Migration zusätzlich extern gegen ein echtes Postgres
-- verifiziert wird, siehe Issue-Vorgabe "Vorgehen".

-- ============================================================
-- Neue Spalten
-- ============================================================

ALTER TABLE handler_aufrufe
  ADD COLUMN IF NOT EXISTS ergebnis_bearbeitet jsonb,
  ADD COLUMN IF NOT EXISTS bearbeitet_at timestamptz;

COMMENT ON COLUMN handler_aufrufe.ergebnis_bearbeitet IS
  'Der Editing-Zustand relativ zu `ergebnis`; NULL heißt unveraendert. '
  'Hat dieselbe Form wie `ergebnis` (voller Handler-Output, W1: W1Output), '
  'nicht nur das editierbare Teil-Dokument -- siehe docs/decisions/'
  '2026-07-13_konsole-block2-editing-und-export.md, Abschnitt 2. Anzeige/'
  'Export lesen immer `ergebnis_bearbeitet ?? ergebnis`. Das KI-Original in '
  '`ergebnis` bleibt bei jedem Edit unveraendert (Audit-Nachvollziehbarkeit).';

COMMENT ON COLUMN handler_aufrufe.bearbeitet_at IS
  'Zeitpunkt der letzten Bearbeitung (wird vom Trigger '
  'handler_aufrufe_freigabe_erlischt_trg gesetzt, nicht von der Anwendung). '
  'NULL heißt: noch nie bearbeitet.';

-- ============================================================
-- Trigger: sobald ergebnis_bearbeitet in einem UPDATE gesetzt oder
-- veraendert wird, erlischt eine bestehende Freigabe automatisch. Bewusst
-- auf DB-Ebene statt in der Server-Action, weil handler_aufrufe_aktualisieren
-- (RLS-Policy aus Block 1, siehe 20260713140000_konsole_block1_freigabe.sql)
-- JEDEM berechtigten Schreibpfad ein UPDATE erlaubt, nicht nur der einen
-- Server-Action dieses Blocks -- ein Trigger ist die einzige Stelle, die
-- jedes UPDATE sieht und nicht umgangen werden kann. Siehe Decision,
-- Abschnitt 3.
-- ============================================================

CREATE OR REPLACE FUNCTION handler_aufrufe_freigabe_erlischt() RETURNS trigger
  LANGUAGE plpgsql AS
  $$
  BEGIN
    IF NEW.ergebnis_bearbeitet IS DISTINCT FROM OLD.ergebnis_bearbeitet THEN
      NEW.freigegeben_at := NULL;
      NEW.freigegeben_durch := NULL;
      NEW.bearbeitet_at := now();
    END IF;
    RETURN NEW;
  END;
  $$;

COMMENT ON FUNCTION handler_aufrufe_freigabe_erlischt() IS
  'BEFORE-UPDATE-Trigger-Funktion: setzt freigegeben_at/freigegeben_durch '
  'auf NULL und bearbeitet_at auf now(), sobald sich ergebnis_bearbeitet in '
  'diesem UPDATE aendert (gesetzt, veraendert oder wieder auf NULL '
  'zurueckgesetzt). Deterministisch, kann von keinem Schreibpfad vergessen '
  'werden.';

DROP TRIGGER IF EXISTS handler_aufrufe_freigabe_erlischt_trg ON handler_aufrufe;

CREATE TRIGGER handler_aufrufe_freigabe_erlischt_trg
  BEFORE UPDATE ON handler_aufrufe
  FOR EACH ROW
  EXECUTE FUNCTION handler_aufrufe_freigabe_erlischt();

-- ============================================================
-- RLS: keine neue Policy nötig. handler_aufrufe_aktualisieren (siehe
-- 20260713140000_konsole_block1_freigabe.sql) ist eine zeilenbasierte
-- Policy (USING/WITH CHECK auf agentur_id + darf_vorgang_bearbeiten()),
-- Postgres-RLS kennt keine spaltenweise Allowlist -- eine berechtigte
-- Nutzerin, die die Zeile ueberhaupt aktualisieren darf, darf jede Spalte
-- inklusive ergebnis_bearbeitet setzen. Siehe pgTAP-Test
-- 18_ergebnis_bearbeitet_freigabe_erlischt.test.sql für den expliziten
-- Beweis (analog Test 17).
-- ============================================================
