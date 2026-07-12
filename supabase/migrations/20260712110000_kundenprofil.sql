-- kunden_profil: die Kern-Attribute des Kundenprofils (1:1 zu kunden), der
-- zentrale Wissenskern, aus dem ALLE Handler (W1, W2, später W3-W6) ihr
-- kundenspezifisches Wissen schöpfen. Quelle: Issue #35, siehe
-- docs/decisions/2026-07-12_kundenprofil.md für die volle Begründung.
--
-- Status-Modell (Quer-Prinzip 1 aus der Decision): ein einziges
-- feld_status-jsonb pro Zeile, das pro Feldname { status, stand, quelle }
-- hält, statt 33 einzelner <feld>_status/_stand/_quelle-Spalten. Listen-
-- Tabellen (kunden_boilerplate etc., separate Migration) bekommen dagegen
-- eine echte status-Spalte pro Zeile, siehe Decision, Abschnitt
-- "Status-Modell".
--
-- Gestuft befüllbar (Quer-Prinzip 2): fast alle Inhaltsfelder sind nullable.

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE kunden_profil_element_status AS ENUM (
  'freigegeben',
  'vorlaeufig',
  'abgeleitet'
);

-- Start-Enum, bewusst erweiterbar per künftigem ALTER TYPE ... ADD VALUE,
-- siehe Decision, Abschnitt "Abweichungen".
CREATE TYPE kunden_profil_grundton AS ENUM (
  'sachlich',
  'warm_handwerklich',
  'technisch_praezise',
  'aktivistisch'
);

CREATE TYPE kunden_profil_anrede_konvention AS ENUM (
  'du',
  'sie'
);

-- ============================================================
-- kunden_profil
-- ============================================================

CREATE TABLE kunden_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL UNIQUE REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),

  -- Schicht Fakten
  rechtsform text,
  sitz text,
  geschaeftsbeschreibung text,
  corporate_design_ref text,

  -- Schicht Stimme/Tonalität
  grundton kunden_profil_grundton,
  anrede_konvention kunden_profil_anrede_konvention,
  gendering_konvention text,
  stil_parameter jsonb NOT NULL DEFAULT '{}'::jsonb,
  zielsprache_absender_texte text,

  -- Schicht Strategie
  positionierung text,
  usp text,

  -- Status pro Feldname, siehe Kommentar oben und Decision.
  feld_status jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Betrieb
  aktive_handler handler_slug[] NOT NULL DEFAULT '{}'::handler_slug[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- agentur_id aus kunden (kunde_id) übernehmen, gleiches Muster wie
-- pruefregeln/llm_nutzung.
-- ============================================================

CREATE FUNCTION kunden_profil_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_profil_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_profil
  FOR EACH ROW EXECUTE FUNCTION kunden_profil_agentur_id_setzen();

CREATE FUNCTION kunden_profil_updated_at_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_profil_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_profil
  FOR EACH ROW EXECUTE FUNCTION kunden_profil_updated_at_setzen();

-- ============================================================
-- Row-Level-Security: nur eigene Agentur sichtbar, gleiches Muster wie
-- kunden_kontakte_lesen/pruefregeln_lesen (chef sieht alle Kunden der
-- Agentur, sonst nur zugewiesene Kunden). Bewusst keine INSERT/UPDATE/
-- DELETE-Policy für Endnutzer-Rollen: in Ebene 1+2 gibt es kein Editier-UI
-- (das ist Ebene 4, Folge-Auftrag), Pflege läuft über die Service-Role
-- (KundenProfilRepository, packages/persistence).
-- ============================================================

ALTER TABLE kunden_profil ENABLE ROW LEVEL SECURITY;

CREATE POLICY kunden_profil_lesen ON kunden_profil FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX kunden_profil_agentur_id_idx ON kunden_profil (agentur_id);
-- kunde_id hat bereits einen impliziten Unique-Index (UNIQUE-Constraint oben).
