-- Konsole Block 1 (Issue #43): Freigabe-Felder für Handler-Ergebnisse und
-- Rückfragen, plus die dafür nötigen RLS-Schreibrechte. Quelle:
-- docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
-- Abschnitte 8 und 9.
--
-- Bisher konnten NUR privilegierte Service-Role-Pfade (Klassifikations-
-- Ingest, Hintergrund-Worker) in handler_aufrufe/audit_log/llm_nutzung
-- schreiben. Ab dieser Migration löst die Konsole zum ERSTEN MAL einen
-- Handler direkt aus einer Nutzer-Session heraus aus (Server-Action, kein
-- Hintergrund-Job) -- die neuen Policies sind bewusst eng auf
-- darf_vorgang_bearbeiten() gescoped, RLS bleibt die einzige
-- Durchsetzungsinstanz (AGENTS.md §4: "Keine Umgehung der Row-Level-
-- Security").

-- ============================================================
-- Neue Spalten: Freigabe auf handler_aufrufe (Ausführungsstatus bleibt
-- unverändert, Freigabe ist eine zweite, unabhängige Dimension)
-- ============================================================

ALTER TABLE handler_aufrufe
  ADD COLUMN freigegeben_at timestamptz,
  ADD COLUMN freigegeben_durch uuid REFERENCES nutzer (id);

COMMENT ON COLUMN handler_aufrufe.freigegeben_at IS
  'NULL = noch nicht freigegeben. Gesetzt = "freigegeben, bereit zum Versand -- '
  'Versand-Anbindung folgt" (SCOPE-GRENZE Issue #43, kein echter Versand in v1).';

-- ============================================================
-- Neue Spalten: Rückfrage-Text und -Freigabe auf vorgaenge. Der Text war
-- bisher ein reiner Klassifikations-Laufzeit-Wert (KlassifikationsErgebnis.
-- rueckfrage_nachricht), nirgends gespeichert -- siehe Decision, Abschnitt 8.
-- ============================================================

ALTER TABLE vorgaenge
  ADD COLUMN rueckfrage_nachricht text,
  ADD COLUMN rueckfrage_bereit_am timestamptz,
  ADD COLUMN rueckfrage_freigegeben_durch uuid REFERENCES nutzer (id);

-- ============================================================
-- darf_vorgang_bearbeiten(): DRY-Extraktion der Rollen-Logik, die bisher
-- inline in vorgaenge_schreiben stand (analog darf_vorgang_sehen(), siehe
-- docs/decisions/2026-07-10_rls-policies.md). Sicher aus demselben Grund wie
-- darf_vorgang_sehen(): einziger Parameter ist eine vorgang_id, jede interne
-- Prüfung hängt an auth.uid() und v.agentur_id = current_agentur_id().
-- ============================================================

CREATE FUNCTION darf_vorgang_bearbeiten(p_vorgang_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$
    SELECT EXISTS (
      SELECT 1 FROM vorgaenge v
      WHERE v.id = p_vorgang_id
        AND v.agentur_id = current_agentur_id()
        AND (
          current_rolle() = 'chef'
          OR (current_rolle() = 'manager' AND ist_kunde_zugewiesen(v.kunde_id))
          OR (
            current_rolle() = 'editor'
            AND ist_kunde_zugewiesen(v.kunde_id)
            AND (v.sensitivity = 'normal' OR v.zustaendige_nutzer_id = auth.uid())
          )
          -- reader, guest: keine Verzweigung, konsistent mit SAAS_SPEC §9.2
          -- ("Assistenz kann sehen, aber nicht freigeben").
        )
    )
  $$;

COMMENT ON FUNCTION darf_vorgang_bearbeiten(uuid) IS
  'SECURITY DEFINER, kapselt die Bearbeiten-Berechtigung (bisher inline in '
  'vorgaenge_schreiben) an einer Stelle, damit handler_aufrufe/audit_log/ '
  'die gleiche Prüfung wiederverwenden statt sie zu duplizieren.';

-- vorgaenge_schreiben auf die neue Funktion umstellen (gleiche Semantik wie
-- zuvor, jetzt an einer Stelle definiert).
DROP POLICY vorgaenge_schreiben ON vorgaenge;

CREATE POLICY vorgaenge_schreiben ON vorgaenge FOR UPDATE
  USING (darf_vorgang_bearbeiten(id))
  WITH CHECK (agentur_id = current_agentur_id());

-- ============================================================
-- handler_aufrufe: INSERT ("Handler auslösen") und UPDATE (Status nach
-- Handler-Lauf setzen, Freigabe erteilen).
-- ============================================================

CREATE POLICY handler_aufrufe_schreiben ON handler_aufrufe FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND darf_vorgang_bearbeiten(vorgang_id)
  );

CREATE POLICY handler_aufrufe_aktualisieren ON handler_aufrufe FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND darf_vorgang_bearbeiten(vorgang_id)
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND darf_vorgang_bearbeiten(vorgang_id)
  );

-- ============================================================
-- audit_log: bisher strikt Service-Role-INSERT-only (siehe
-- 20260711130200_helper_funktionen_und_rls.sql). Ab jetzt können Nutzer-
-- Sessions eigene Aktionen protokollieren (Handler ausgelöst, Freigabe
-- erteilt) -- nutzer_id MUSS die eigene auth.uid() sein, niemand kann im
-- Namen einer anderen Person protokollieren. Kein UPDATE/DELETE für
-- Endnutzer-Rollen (§10.2, strikt append-only, unverändert).
-- ============================================================

CREATE POLICY audit_log_schreiben ON audit_log FOR INSERT
  WITH CHECK (
    nutzer_id = auth.uid()
    AND agentur_id = current_agentur_id()
    AND (vorgang_id IS NULL OR darf_vorgang_bearbeiten(vorgang_id))
  );

-- ============================================================
-- llm_nutzung: bisher strikt Service-Role-INSERT-only (siehe
-- 20260712080000_llm_nutzung.sql, "ausschließlich Service-Role schreibt").
-- Ab jetzt schreibt auch der Konsolen-Handler-Trigger-Pfad hierher (jeder
-- tatsächliche LLM-Aufruf während "Handler auslösen"). Kein Bezug auf
-- NEW.agentur_id im Check: die Spalte wird per BEFORE-INSERT-Trigger aus
-- kunde_id abgeleitet (llm_nutzung_agentur_id_setzen_trg), der Check prüft
-- stattdessen direkt die Kunden-Zuweisung.
-- ============================================================

CREATE POLICY llm_nutzung_schreiben ON llm_nutzung FOR INSERT
  WITH CHECK (
    current_rolle() = 'chef'
    OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id))
  );
