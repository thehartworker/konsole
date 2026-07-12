-- Kundenprofil-Listen-Tabellen: die neun 1:n-Verzeichnisse zum Kern-Profil
-- aus 20260712110000_kundenprofil.sql, jede Zeile mit eigenem Status
-- (Quer-Prinzip 1). Quelle: Issue #35, siehe
-- docs/decisions/2026-07-12_kundenprofil.md.
--
-- Gemeinsames Muster für alle neun Tabellen: kunde_id + denormalisierte
-- agentur_id (Options-3-Muster, BEFORE INSERT-Trigger übernimmt agentur_id
-- aus kunden), eine status-Spalte (kunden_profil_element_status, Default
-- 'abgeleitet'), SELECT-only-RLS (Service-Role schreibt).

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE kunden_boilerplate_typ AS ENUM (
  'kurz',
  'lang'
);

CREATE TYPE kunden_grenzen_typ AS ENUM (
  'no_go_thema',
  'nicht_nennbarer_wettbewerber',
  'nicht_nennbare_person',
  'verbotene_aussage',
  'pflichtbaustein'
);

-- ============================================================
-- kunden_boilerplate
-- ============================================================

CREATE TABLE kunden_boilerplate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  typ kunden_boilerplate_typ NOT NULL,
  sprache text NOT NULL DEFAULT 'de',
  text text NOT NULL,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  stand date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_kennzahlen
-- Panel-Punkt: Kennzahlen MÜSSEN Stichtag und Quelle haben, kein Raten --
-- deshalb stichtag/quelle bewusst NOT NULL (siehe Decision).
-- ============================================================

CREATE TABLE kunden_kennzahlen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  bezeichnung text NOT NULL,
  wert text NOT NULL,
  stichtag date NOT NULL,
  quelle text NOT NULL,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_sprecher
-- ============================================================

CREATE TABLE kunden_sprecher (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  name text NOT NULL,
  rolle text,
  exakte_schreibweise text,
  zitat_freigabe boolean NOT NULL DEFAULT false,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_kernbotschaften
-- ============================================================

CREATE TABLE kunden_kernbotschaften (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  text text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_themen (deckt die Sprachregelungen ab, die W2 schon braucht)
-- ============================================================

CREATE TABLE kunden_themen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  thema text NOT NULL,
  sprachregelung text,
  reaktives_statement text,
  positionierung_vorhanden boolean NOT NULL DEFAULT false,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_grenzen (das Ungesagte). ist_deterministisch_erzwungen = true bei
-- typ 'verbotene_aussage'/'pflichtbaustein' wird in der W2-Regel-Engine als
-- code_baustein-Pruefregel durchgesetzt, unabhängig vom LLM-Review-Pass und
-- unabhängig vom eigenen status-Wert dieser Zeile, siehe Decision, Abschnitt
-- "Deterministisch erzwungene Grenzen".
-- ============================================================

CREATE TABLE kunden_grenzen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  typ kunden_grenzen_typ NOT NULL,
  inhalt text NOT NULL,
  textart_geltungsbereich text,
  ist_deterministisch_erzwungen boolean NOT NULL DEFAULT false,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_freigabekette (reine Prozess-Konfiguration, siehe Decision
-- "Abweichungen" für die Begründung, warum status hier nicht ausgewertet
-- wird, obwohl die Spalte der Vollständigkeit halber existiert).
-- ============================================================

CREATE TABLE kunden_freigabekette (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  rolle_oder_person text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  bedingung text,
  status kunden_profil_element_status NOT NULL DEFAULT 'vorlaeufig',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_praezedenzfaelle (Referenz-Schicht, größter Qualitätshebel). Nur
-- status = 'freigegeben'-Zeilen werden von W2 als RAG-Quelle gelesen, siehe
-- Decision, Abschnitt "Handler-Anbindung".
-- ============================================================

CREATE TABLE kunden_praezedenzfaelle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  handler_slug handler_slug NOT NULL,
  titel text NOT NULL,
  volltext text NOT NULL,
  freigegeben_am date,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden_medien_kontext (relevante Medien/Journalisten-Beziehungen/
-- Medien-Prioritäts-Filter, aus W2). Spaltenwahl ist eine plausible, aber
-- nicht spec-wörtliche Ausprägung, siehe Decision, Abschnitt "Abweichungen".
-- ============================================================

CREATE TABLE kunden_medien_kontext (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  medium_name text NOT NULL,
  journalist_name text,
  beziehungsnotiz text,
  prioritaet vorgang_prioritaet,
  status kunden_profil_element_status NOT NULL DEFAULT 'abgeleitet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- agentur_id aus kunden (kunde_id) übernehmen, gleiches Muster wie
-- pruefregeln/kunden_profil. Eine gemeinsame Funktion für alle neun
-- Tabellen, weil das Trigger-Muster identisch ist (nur der Tabellenname im
-- Trigger selbst unterscheidet sich).
-- ============================================================

CREATE FUNCTION kundenprofil_listen_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_boilerplate_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_boilerplate
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_kennzahlen_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_kennzahlen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_sprecher_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_sprecher
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_kernbotschaften_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_kernbotschaften
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_themen_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_themen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_grenzen_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_grenzen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_freigabekette_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_freigabekette
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_praezedenzfaelle_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_praezedenzfaelle
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

CREATE TRIGGER kunden_medien_kontext_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_medien_kontext
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_agentur_id_setzen();

-- ============================================================
-- updated_at bei jedem UPDATE nachziehen (Status-Übergänge, siehe
-- KundenProfilRepository.elementStatusSetzen). Gemeinsame Funktion, gleiches
-- Muster wie die agentur_id-Trigger-Funktion oben.
-- ============================================================

CREATE FUNCTION kundenprofil_listen_updated_at_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_boilerplate_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_boilerplate
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_kennzahlen_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_kennzahlen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_sprecher_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_sprecher
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_kernbotschaften_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_kernbotschaften
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_themen_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_themen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_grenzen_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_grenzen
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_freigabekette_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_freigabekette
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_praezedenzfaelle_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_praezedenzfaelle
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

CREATE TRIGGER kunden_medien_kontext_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_medien_kontext
  FOR EACH ROW EXECUTE FUNCTION kundenprofil_listen_updated_at_setzen();

-- ============================================================
-- Row-Level-Security: nur eigene Agentur sichtbar, gleiches Muster wie
-- kunden_profil_lesen. Bewusst keine INSERT/UPDATE/DELETE-Policy für
-- Endnutzer-Rollen, nur Service-Role schreibt (siehe Decision).
-- ============================================================

ALTER TABLE kunden_boilerplate ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_kennzahlen ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_sprecher ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_kernbotschaften ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_themen ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_grenzen ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_freigabekette ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_praezedenzfaelle ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_medien_kontext ENABLE ROW LEVEL SECURITY;

CREATE POLICY kunden_boilerplate_lesen ON kunden_boilerplate FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_kennzahlen_lesen ON kunden_kennzahlen FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_sprecher_lesen ON kunden_sprecher FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_kernbotschaften_lesen ON kunden_kernbotschaften FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_themen_lesen ON kunden_themen FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_grenzen_lesen ON kunden_grenzen FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_freigabekette_lesen ON kunden_freigabekette FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_praezedenzfaelle_lesen ON kunden_praezedenzfaelle FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

CREATE POLICY kunden_medien_kontext_lesen ON kunden_medien_kontext FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id)));

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX kunden_boilerplate_agentur_id_idx ON kunden_boilerplate (agentur_id);
CREATE INDEX kunden_boilerplate_kunde_id_idx ON kunden_boilerplate (kunde_id);

CREATE INDEX kunden_kennzahlen_agentur_id_idx ON kunden_kennzahlen (agentur_id);
CREATE INDEX kunden_kennzahlen_kunde_id_idx ON kunden_kennzahlen (kunde_id);

CREATE INDEX kunden_sprecher_agentur_id_idx ON kunden_sprecher (agentur_id);
CREATE INDEX kunden_sprecher_kunde_id_idx ON kunden_sprecher (kunde_id);

CREATE INDEX kunden_kernbotschaften_agentur_id_idx ON kunden_kernbotschaften (agentur_id);
CREATE INDEX kunden_kernbotschaften_kunde_id_idx ON kunden_kernbotschaften (kunde_id, reihenfolge);

CREATE INDEX kunden_themen_agentur_id_idx ON kunden_themen (agentur_id);
CREATE INDEX kunden_themen_kunde_id_idx ON kunden_themen (kunde_id);

CREATE INDEX kunden_grenzen_agentur_id_idx ON kunden_grenzen (agentur_id);
CREATE INDEX kunden_grenzen_kunde_id_idx ON kunden_grenzen (kunde_id);
-- Ladepfad des deterministischen Enforcements (siehe Decision).
CREATE INDEX kunden_grenzen_deterministisch_idx ON kunden_grenzen (kunde_id, typ)
  WHERE ist_deterministisch_erzwungen = true AND deleted_at IS NULL;

CREATE INDEX kunden_freigabekette_agentur_id_idx ON kunden_freigabekette (agentur_id);
CREATE INDEX kunden_freigabekette_kunde_id_idx ON kunden_freigabekette (kunde_id, reihenfolge);

CREATE INDEX kunden_praezedenzfaelle_agentur_id_idx ON kunden_praezedenzfaelle (agentur_id);
-- Ladepfad von KundenProfilW2KontextQuellenProvider.praezedenzenLaden (siehe Decision).
CREATE INDEX kunden_praezedenzfaelle_kunde_handler_idx ON kunden_praezedenzfaelle (kunde_id, handler_slug, status)
  WHERE deleted_at IS NULL;

CREATE INDEX kunden_medien_kontext_agentur_id_idx ON kunden_medien_kontext (agentur_id);
CREATE INDEX kunden_medien_kontext_kunde_id_idx ON kunden_medien_kontext (kunde_id);
