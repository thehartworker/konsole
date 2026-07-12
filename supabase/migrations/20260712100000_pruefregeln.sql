-- pruefregeln: pro-Kunde konfigurierbare Regel-Engine für den W2-Prüf-Check
-- (Stage 3, "19-Punkte-Check"). Ersetzt einen fest im Handler verdrahteten
-- Regelsatz, weil das Produkt kundenagnostisches Multi-Tenant-SaaS ist und
-- jeder Kunde jeder Agentur andere Kommunikationsregeln braucht (Pharma- vs.
-- Konsumgüter-Kunde derselben Agentur). Quelle: Issue #32, Kommentar
-- "Wichtige Architektur-Nachschärfung zu W2", siehe
-- docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, Abschnitt
-- "Regel-Engine" für die volle Begründung.
--
-- Zwei Regel-Typen: 'code_baustein' referenziert eine benannte, deterministische
-- Prüf-Funktion aus der Registry in packages/handlers/src/w2/regel-engine/bausteine.ts
-- (baustein_name plus optionale parameter), 'llm_prompt' ist ein reiner
-- Text-Prompt, der unverändert an den Review-LLM-Pass weitergereicht wird
-- (prompt_text). Genau eines der beiden Felder ist befüllt, abhängig von typ
-- (CHECK-Constraint unten).

CREATE TYPE pruefregel_typ AS ENUM (
  'code_baustein',
  'llm_prompt'
);

CREATE TABLE pruefregeln (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  handler_slug handler_slug NOT NULL,
  typ pruefregel_typ NOT NULL,
  baustein_name text,
  parameter jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_text text,
  aktiv boolean NOT NULL DEFAULT true,
  reihenfolge integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pruefregeln_typ_felder_konsistent CHECK (
    (typ = 'code_baustein' AND baustein_name IS NOT NULL AND prompt_text IS NULL)
    OR
    (typ = 'llm_prompt' AND prompt_text IS NOT NULL AND baustein_name IS NULL)
  )
);

-- ============================================================
-- agentur_id aus kunden (kunde_id) übernehmen, gleiches Muster wie
-- 20260712080000_llm_nutzung.sql / 20260711130300_agentur_id_konsistenz_trigger.sql.
-- ============================================================

CREATE FUNCTION pruefregeln_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pruefregeln_agentur_id_setzen_trg
  BEFORE INSERT ON pruefregeln
  FOR EACH ROW EXECUTE FUNCTION pruefregeln_agentur_id_setzen();

-- ============================================================
-- Row-Level-Security: nur eigene Agentur sichtbar, gleiches Muster wie
-- kunden_kontakte_lesen / llm_nutzung_lesen (chef sieht alle Kunden der
-- Agentur, sonst nur zugewiesene Kunden). Bewusst keine INSERT/UPDATE/
-- DELETE-Policy für Endnutzer-Rollen: in v1 gibt es kein Editier-UI (siehe
-- Design-Decision, "v1-Umfang"), Regeln werden ausschließlich über die
-- Service-Role beim Onboarding gesetzt (Seed/Admin-Funktion), analog zu
-- llm_nutzung.
-- ============================================================

ALTER TABLE pruefregeln ENABLE ROW LEVEL SECURITY;

CREATE POLICY pruefregeln_lesen ON pruefregeln FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX pruefregeln_agentur_id_idx ON pruefregeln (agentur_id);
CREATE INDEX pruefregeln_kunde_id_idx ON pruefregeln (kunde_id);

-- Laufzeit-Ladepfad des Handlers: aktive Regeln für (kunde_id, handler_slug),
-- sortiert nach reihenfolge (siehe packages/persistence/src/pruefregeln.ts).
CREATE INDEX pruefregeln_kunde_handler_aktiv_idx ON pruefregeln (kunde_id, handler_slug, reihenfolge)
  WHERE aktiv = true AND deleted_at IS NULL;
