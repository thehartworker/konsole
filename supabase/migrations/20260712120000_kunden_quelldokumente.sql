-- kunden_quelldokumente: Referenz auf ein hochgeladenes Kundendokument (PDF,
-- Word, Text, HTML), Grundlage für die KI-Befüllung des Kundenprofils
-- (Ebene 3, Issue #37). Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
-- Abschnitt "Datei-Storage".
--
-- Die eigentliche Datei liegt in Supabase Storage (Bucket-Setup bewusst NICHT
-- Teil dieser Migration, siehe supabase/storage/kunden_quelldokumente_bucket.sql
-- und die Decision -- das storage-Schema existiert im nackten Postgres-
-- Container der rls-tests-CI nicht). Diese Tabelle hält nur die Referenz
-- (bucket_pfad, Dateiname, Upload-Zeitpunkt, kunde_id, agentur_id), gleiches
-- Options-3-Muster (denormalisierte agentur_id) und SELECT-only-RLS wie
-- kunden_profil/pruefregeln/llm_nutzung.
--
-- DSGVO-Löschfrist (12 Monate nach Upload ODER Onboarding-Ende, je später,
-- siehe Decision): harte Löschung (Bucket-Objekt UND diese Zeile), nicht nur
-- Soft-Delete -- das ist die im Auftrag benannte explizite Ausnahme zu
-- AGENTS.md §4 ("kein Direct-Delete", DSGVO-Löschungsprozess ausgenommen).
-- deleted_at existiert hier trotzdem für den Zeitraum VOR der harten
-- Löschung (z. B. wenn ein Kunde ein falsch hochgeladenes Dokument sofort
-- widerruft, ohne dass die DSGVO-Frist schon erreicht ist).

CREATE TYPE kunden_quelldokument_extraktion_status AS ENUM (
  'ausstehend',
  'verarbeitet',
  'fehlgeschlagen'
);

CREATE TABLE kunden_quelldokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  bucket_pfad text NOT NULL,
  dateiname text NOT NULL,
  mime_typ text,
  groesse_bytes bigint CHECK (groesse_bytes IS NULL OR groesse_bytes >= 0),
  hochgeladen_von uuid REFERENCES nutzer (id),
  extraktion_status kunden_quelldokument_extraktion_status NOT NULL DEFAULT 'ausstehend',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- agentur_id aus kunden (kunde_id) übernehmen, gleiches Muster wie
-- kunden_profil/pruefregeln/llm_nutzung.
-- ============================================================

CREATE FUNCTION kunden_quelldokumente_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_quelldokumente_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_quelldokumente
  FOR EACH ROW EXECUTE FUNCTION kunden_quelldokumente_agentur_id_setzen();

CREATE FUNCTION kunden_quelldokumente_updated_at_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_quelldokumente_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_quelldokumente
  FOR EACH ROW EXECUTE FUNCTION kunden_quelldokumente_updated_at_setzen();

-- ============================================================
-- Row-Level-Security: nur eigene Agentur sichtbar, gleiches Muster wie
-- kunden_profil_lesen/pruefregeln_lesen. Bewusst keine INSERT/UPDATE/DELETE-
-- Policy für Endnutzer-Rollen: Upload läuft über eine Server-Route mit der
-- Service-Role (RLS-Bypass), kein direkter Endnutzer-Schreibzugriff auf
-- diese Tabelle oder den zugehörigen Storage-Bucket.
-- ============================================================

ALTER TABLE kunden_quelldokumente ENABLE ROW LEVEL SECURITY;

CREATE POLICY kunden_quelldokumente_lesen ON kunden_quelldokumente FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX kunden_quelldokumente_agentur_id_idx ON kunden_quelldokumente (agentur_id);
CREATE INDEX kunden_quelldokumente_kunde_id_idx ON kunden_quelldokumente (kunde_id);
-- Ladepfad des künftigen DSGVO-Lösch-Jobs (Decision, "Datei-Storage").
CREATE INDEX kunden_quelldokumente_created_at_idx ON kunden_quelldokumente (created_at)
  WHERE deleted_at IS NULL;
