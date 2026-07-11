-- Enums und Basis-Tabellen für die Intake-Konsole.
-- Quelle: docs/decisions/2026-07-10_datenmodell.md
--
-- Sprachregel (AGENTS.md §3.4): Domänen-Bezeichner deutsch, technisches
-- Gerüst englisch (id, created_at, updated_at, deleted_at, status).

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE vorgang_typ AS ENUM (
  'Anfrage',
  'Projekt-Briefing',
  'To-Do',
  'FYI',
  'Freigabe',
  'Issue',
  'Krise',
  'Sonstiges'
);

CREATE TYPE sensitivity AS ENUM (
  'normal',
  'vertraulich',
  'krise',
  'besonders_geschuetzt',
  'regulatorisch_relevant'
);

CREATE TYPE rolle AS ENUM (
  'chef',
  'manager',
  'editor',
  'reader',
  'guest'
);

CREATE TYPE kanal AS ENUM (
  'email',
  'whatsapp_text',
  'whatsapp_audio',
  'dateiablage',
  'manuell'
);

CREATE TYPE kunden_kontakt_rolle AS ENUM (
  'geschaeftsfuehrung',
  'marketing_leitung',
  'presse_verantwortliche',
  'assistenz',
  'sonstige'
);

CREATE TYPE audio_transkript_qualitaet AS ENUM (
  'gut',
  'maessig',
  'schlecht',
  'n/a'
);

CREATE TYPE vorgang_prioritaet AS ENUM (
  'hoch',
  'mittel',
  'niedrig'
);

CREATE TYPE klassifikation_status AS ENUM (
  'queued',
  'in_progress',
  'done',
  'failed'
);

CREATE TYPE vorgang_status AS ENUM (
  'eingegangen',
  'klassifiziert',
  'in_bearbeitung',
  'uebernommen',
  'abgeschlossen',
  'abgelehnt'
);

CREATE TYPE handler_slug AS ENUM (
  'W1_pressemitteilung_drafter',
  'W2_presseanfragen_drafter',
  'W3_monitoring_digest',
  'W4_journalisten_intelligence',
  'W5_terminbriefing',
  'W6_multichannel_transformer'
);

CREATE TYPE handler_aufruf_status AS ENUM (
  'queued',
  'in_progress',
  'done',
  'failed',
  'escalated'
);

CREATE TYPE audit_aktion AS ENUM (
  'vorgang_empfangen',
  'vorgang_abgelehnt',
  'klassifikation_abgeschlossen',
  'handler_aufgerufen',
  'handler_status_geaendert',
  'freigabe_erteilt',
  'freigabe_editiert',
  'weiterleitung',
  'uebernahme',
  'antwort_versendet',
  'vorgang_zugriff',
  'dsgvo_anonymisierung'
);

-- ============================================================
-- agenturen (Mandantenfähigkeit Ebene 1, §9.1)
-- ============================================================

CREATE TABLE agenturen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- kunden (Mandantenfähigkeit Ebene 2, §9.1)
-- ============================================================

CREATE TABLE kunden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  name text NOT NULL,
  slug text NOT NULL,
  autonomie_level smallint NOT NULL DEFAULT 1 CHECK (autonomie_level IN (1, 2, 3)),
  retention_monate integer NOT NULL DEFAULT 24 CHECK (retention_monate >= 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (agentur_id, slug)
);

-- ============================================================
-- kunden_kontakte
-- ============================================================

CREATE TABLE kunden_kontakte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  name text NOT NULL,
  rolle kunden_kontakt_rolle NOT NULL,
  email text,
  telefon text,
  ist_hauptkontakt boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- nutzer (Mandantenfähigkeit Ebene 3, §9.1/§9.2; referenziert auth.users)
-- ============================================================

CREATE TABLE nutzer (
  id uuid PRIMARY KEY REFERENCES auth.users (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  name text NOT NULL,
  rolle rolle NOT NULL,
  guest_ablauf_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- nutzer_kunden_zuweisungen
-- ============================================================

CREATE TABLE nutzer_kunden_zuweisungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nutzer_id uuid NOT NULL REFERENCES nutzer (id),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- vorgaenge (Kern-Entität, §2.3 plus Klassifikations-Output §3.4)
-- ============================================================

CREATE TABLE vorgaenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  kanal kanal NOT NULL,
  absender_identifikator text NOT NULL,
  absender_name text,
  absender_rolle text,
  eingang_at timestamptz NOT NULL,
  betreff text,
  inhalt_text text NOT NULL,
  inhalt_originalsprache text,
  anhaenge jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadaten_kanalspezifisch jsonb NOT NULL DEFAULT '{}'::jsonb,
  audio_originaldauer_sekunden integer,
  audio_transkript_qualitaet audio_transkript_qualitaet,

  -- Klassifikations-Ergebnis (§3.4), null bis Klassifikation abgeschlossen
  sprache_ausgang text,
  typ_primaer vorgang_typ,
  typ_sekundaer text,
  confidence smallint CHECK (confidence BETWEEN 0 AND 100),
  sensitivity sensitivity NOT NULL DEFAULT 'normal',
  prioritaet vorgang_prioritaet,
  routing_rolle text,
  zustaendige_nutzer_id uuid REFERENCES nutzer (id),
  routing_verteiler uuid[],

  -- Betriebs-Semantik (§12.1, §2.4)
  klassifikation_status klassifikation_status NOT NULL DEFAULT 'queued',
  klassifikation_gestartet_at timestamptz,
  klassifikation_beendet_at timestamptz,
  sla_frist_at timestamptz,
  status vorgang_status NOT NULL DEFAULT 'eingegangen',
  abgelehnt_grund text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- nutzer_vorgang_freigaben (Guest-Zugriff auf einzelne Vorgänge, §9.2)
-- ============================================================

CREATE TABLE nutzer_vorgang_freigaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nutzer_id uuid NOT NULL REFERENCES nutzer (id),
  vorgang_id uuid NOT NULL REFERENCES vorgaenge (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  ablauf_at timestamptz NOT NULL,
  freigegeben_durch uuid NOT NULL REFERENCES nutzer (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- anliegen (Eins-zu-viele zu vorgaenge, §3.1)
-- ============================================================

CREATE TABLE anliegen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorgang_id uuid NOT NULL REFERENCES vorgaenge (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  beschreibung text NOT NULL,
  prioritaet vorgang_prioritaet NOT NULL,
  frist_erschlossen date,
  frist_annahme text,
  backend_handler_vorschlag handler_slug,
  backend_handler_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- handler_aufrufe (§4.2)
-- ============================================================

CREATE TABLE handler_aufrufe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorgang_id uuid NOT NULL REFERENCES vorgaenge (id),
  anliegen_id uuid NOT NULL REFERENCES anliegen (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  handler_slug handler_slug NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  zustaendige_nutzer_id uuid NOT NULL REFERENCES nutzer (id),
  prioritaet vorgang_prioritaet NOT NULL,
  sla_frist_at timestamptz,
  status handler_aufruf_status NOT NULL DEFAULT 'queued',
  ergebnis jsonb,
  fehler text,
  zombie_zyklen integer NOT NULL DEFAULT 0 CHECK (zombie_zyklen >= 0),
  gestartet_at timestamptz,
  beendet_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- audit_log (§10, append-only)
-- ============================================================

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  vorgang_id uuid REFERENCES vorgaenge (id),
  nutzer_id uuid REFERENCES nutzer (id),
  aktion audit_aktion NOT NULL,
  aktion_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  anonymisiert boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
