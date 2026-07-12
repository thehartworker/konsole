-- llm_nutzung: eine Zeile pro LLM-Call, für Token-Verbrauch-Zuordnung und
-- spätere Abrechnung/Limits. Quelle: docs/decisions/2026-07-12_klassifikations-layer.md,
-- "Zu 4" (Option 4b, dort als offene Frage markiert) plus Issue #30 Aufgabe B,
-- in der Bastian die offene Frage entscheidet: Spaltenname "handler_slug"
-- statt "zweck" (konsistent zur Domänen-Sprache aus handler_aufrufe.handler_slug),
-- nullable statt NOT NULL, und bewusst text statt des handler_slug-Enums aus
-- 20260711130000_enums_und_basistabellen.sql -- 'klassifikation' ist kein
-- gültiger Wert dieses Enums (das Enum listet nur W1-W6-Handler), ein
-- zusätzlicher Enum-Wert würde jeden künftigen Klassifikations-Vorgang mit
-- Backend-Handler-Semantik vermischen. Damit ist "Zu 4" aus der Decision mit
-- dieser Migration final entschieden, siehe Nachtrag am Ende der Decision.

CREATE TABLE llm_nutzung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  vorgang_id uuid REFERENCES vorgaenge (id),
  handler_slug text,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  modell text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- agentur_id aus kunden (kunde_id) übernehmen, gleiches Muster wie
-- 20260711130300_agentur_id_konsistenz_trigger.sql für die übrigen
-- mandanten-relevanten Tabellen mit denormalisierter agentur_id.
-- ============================================================

CREATE FUNCTION llm_nutzung_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER llm_nutzung_agentur_id_setzen_trg
  BEFORE INSERT ON llm_nutzung
  FOR EACH ROW EXECUTE FUNCTION llm_nutzung_agentur_id_setzen();

-- ============================================================
-- Row-Level-Security: nur eigene Agentur sichtbar, gleiches Muster wie
-- kunden_kontakte_lesen (chef sieht alles, sonst nur zugewiesene Kunden).
-- Bewusst keine INSERT/UPDATE/DELETE-Policy für Endnutzer-Rollen: laut
-- Auftrag schreibt ausschließlich die Service-Role (RLS-Bypass), analog zu
-- agenturen/vorgaenge-INSERT (siehe docs/decisions/2026-07-10_rls-policies.md).
-- ============================================================

ALTER TABLE llm_nutzung ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_nutzung_lesen ON llm_nutzung FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX llm_nutzung_agentur_id_idx ON llm_nutzung (agentur_id);
CREATE INDEX llm_nutzung_kunde_id_idx ON llm_nutzung (kunde_id);
CREATE INDEX llm_nutzung_vorgang_id_idx ON llm_nutzung (vorgang_id);
