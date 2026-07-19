-- E-Mail-Kanal: Datenmodell für Mail-Anbindungen und Ingest-Metadaten
-- (Issue #52, Aufgabe A). Siehe
-- docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md für die volle
-- Begründung der zwei Anbindungs-Modi.
--
-- Enum "kanal" hat 'email' bereits seit
-- 20260711130000_enums_und_basistabellen.sql -- kein ALTER TYPE nötig.
--
-- pgcrypto ist eine Standard-Postgres-Contrib-Extension (läuft auch im
-- nackten postgres:16-Container der rls-tests-CI, kein zusätzlicher
-- Infrastruktur-Bedarf), Grundlage für die Passwort-Verschlüsselung
-- (imap_passwort_verschluesselt, siehe unten und docs/ops/imap-verschluesselung.md).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE mail_anbindungs_typ AS ENUM (
  'weiterleitung',
  'imap_kundenpostfach'
);

CREATE TYPE mail_verarbeitungs_status AS ENUM (
  'angenommen',
  'duplikat',
  'kein_kunde_zugeordnet',
  'fehler'
);

-- ============================================================
-- kunden_mail_anbindungen
-- ============================================================

-- Spaltenname "angelegt_at" statt des sonst üblichen "created_at" ist eine
-- bewusste Vorgabe aus Issue #52, Aufgabe A (keine Abweichung durch diesen
-- PR selbst) -- alle übrigen Tabellen dieser Migration bleiben beim
-- Standard-Gerüst-Namen "created_at" (AGENTS.md §3.4).
CREATE TABLE kunden_mail_anbindungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES kunden (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  anbindungs_typ mail_anbindungs_typ NOT NULL,

  -- Modus A (Weiterleitung)
  konsolen_adresse text,

  -- Modus B (direkter Kunden-Postfach-Zugriff)
  imap_host text,
  imap_port integer,
  imap_benutzername text,
  imap_passwort_verschluesselt bytea,
  imap_ordner text NOT NULL DEFAULT 'INBOX',
  verarbeitet_ordner text NOT NULL DEFAULT 'Verarbeitet',

  aktiv boolean NOT NULL DEFAULT true,

  angelegt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT kunden_mail_anbindungen_modus_felder CHECK (
    (anbindungs_typ = 'weiterleitung' AND konsolen_adresse IS NOT NULL)
    OR
    (
      anbindungs_typ = 'imap_kundenpostfach'
      AND imap_host IS NOT NULL
      AND imap_port IS NOT NULL
      AND imap_benutzername IS NOT NULL
      AND imap_passwort_verschluesselt IS NOT NULL
    )
  )
);

CREATE FUNCTION kunden_mail_anbindungen_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden WHERE id = NEW.kunde_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_mail_anbindungen_agentur_id_setzen_trg
  BEFORE INSERT ON kunden_mail_anbindungen
  FOR EACH ROW EXECUTE FUNCTION kunden_mail_anbindungen_agentur_id_setzen();

CREATE FUNCTION kunden_mail_anbindungen_updated_at_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kunden_mail_anbindungen_updated_at_setzen_trg
  BEFORE UPDATE ON kunden_mail_anbindungen
  FOR EACH ROW EXECUTE FUNCTION kunden_mail_anbindungen_updated_at_setzen();

-- ============================================================
-- Passwort-Verschlüsselung: RPC-Funktionen statt Inline-SQL im Aufrufer.
--
-- Der Verschlüsselungs-Schlüssel (IMAP_PASSWORT_VERSCHLUESSELUNGS_SCHLUESSEL)
-- lebt ausschließlich als Env-Var im Node-Prozess (Web-App-Server-Action
-- bzw. apps/mail-ingest), NIE in der Datenbank selbst (kein Postgres-GUC,
-- kein Vault-Secret) -- siehe docs/ops/imap-verschluesselung.md. Beide
-- Funktionen nehmen ihn deshalb als expliziten Parameter entgegen, den der
-- Node-Prozess aus seiner eigenen Umgebung liest und pro Aufruf mitgibt.
--
-- Bewusst SECURITY INVOKER (kein SECURITY DEFINER): die Verschlüsseln-
-- Funktion führt ein normales INSERT aus, das weiterhin der
-- kunden_mail_anbindungen_schreiben-Policy des Aufrufers unterliegt (kein
-- RLS-Bypass über den Umweg einer Funktion). Die Entschlüsseln-Funktion
-- liest imap_passwort_verschluesselt für den AUFRUFER -- da diese Spalte für
-- "authenticated" unten per Spalten-Grant ausgeschlossen wird, bleibt sie
-- auch über diese Funktion für normale Nutzer-Rollen leer/fehlschlagend.
-- Nur der Ingest-Dienst (Service-Role, umgeht RLS und Spalten-Grants
-- ohnehin) kann sie sinnvoll nutzen.
-- ============================================================

CREATE FUNCTION mail_anbindung_imap_anlegen(
  p_kunde_id uuid,
  p_imap_host text,
  p_imap_port integer,
  p_imap_benutzername text,
  p_imap_passwort_klartext text,
  p_schluessel text,
  p_imap_ordner text DEFAULT 'INBOX',
  p_verarbeitet_ordner text DEFAULT 'Verarbeitet'
) RETURNS uuid
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS
$$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO kunden_mail_anbindungen (
    kunde_id, anbindungs_typ, imap_host, imap_port, imap_benutzername,
    imap_passwort_verschluesselt, imap_ordner, verarbeitet_ordner
  ) VALUES (
    p_kunde_id, 'imap_kundenpostfach', p_imap_host, p_imap_port, p_imap_benutzername,
    pgp_sym_encrypt(p_imap_passwort_klartext, p_schluessel), p_imap_ordner, p_verarbeitet_ordner
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION mail_anbindung_imap_anlegen(uuid, text, integer, text, text, text, text, text) IS
  'Verschlüsselt das Klartext-Passwort serverseitig (pgp_sym_encrypt) und legt in derselben '
  'Anweisung die Modus-B-Anbindung an. Gibt nur die id zurück -- das Passwort wird nach dem '
  'Verschlüsseln nie mehr an Client-Code geliefert (Issue #52, Aufgabe E).';

CREATE FUNCTION mail_anbindung_passwort_entschluesseln(p_anbindung_id uuid, p_schluessel text) RETURNS text
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS
$$
  SELECT pgp_sym_decrypt(imap_passwort_verschluesselt, p_schluessel)
  FROM kunden_mail_anbindungen
  WHERE id = p_anbindung_id AND anbindungs_typ = 'imap_kundenpostfach'
$$;

COMMENT ON FUNCTION mail_anbindung_passwort_entschluesseln(uuid, text) IS
  'Nur für apps/mail-ingest (Service-Role) gedacht: entschlüsselt das IMAP-Passwort einer '
  'Modus-B-Anbindung für die eigene Verbindung. Für die Rolle "authenticated" faktisch nutzlos, '
  'weil imap_passwort_verschluesselt für diese Rolle per Spalten-Grant nicht lesbar ist (siehe unten).';

-- ============================================================
-- mail_eingang_log
-- ============================================================

CREATE TABLE mail_eingang_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  kunden_mail_anbindung_id uuid NOT NULL REFERENCES kunden_mail_anbindungen (id),
  agentur_id uuid NOT NULL REFERENCES agenturen (id),
  vorgang_id uuid REFERENCES vorgaenge (id),
  empfangen_at timestamptz NOT NULL DEFAULT now(),
  verarbeitungs_status mail_verarbeitungs_status NOT NULL,
  fehler_meldung text
);

-- agentur_id denormalisiert aus kunden_mail_anbindungen (Options-3-Muster wie
-- kunden_quelldokumente/kunden_profil), Grundlage für die RLS-Policy unten.
CREATE FUNCTION mail_eingang_log_agentur_id_setzen() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  SELECT agentur_id INTO STRICT NEW.agentur_id FROM kunden_mail_anbindungen WHERE id = NEW.kunden_mail_anbindung_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mail_eingang_log_agentur_id_setzen_trg
  BEFORE INSERT ON mail_eingang_log
  FOR EACH ROW EXECUTE FUNCTION mail_eingang_log_agentur_id_setzen();

-- ============================================================
-- Row-Level-Security
-- ============================================================

ALTER TABLE kunden_mail_anbindungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_eingang_log ENABLE ROW LEVEL SECURITY;

-- kunden_mail_anbindungen: SELECT/INSERT/UPDATE analog zu
-- kunden_profil_lesen/kunden_profil_schreiben (20260717120000), weil Aufgabe
-- D (Konsolen-UI) Beraterinnen die Anbindung direkt über den Session-Client
-- einrichten/deaktivieren lässt -- anders als kunden_quelldokumente gibt es
-- hier ab Tag 1 ein Editier-UI, deshalb sofort volle Schreibrechte statt
-- eines späteren Nachtrags. Kein DELETE: "Anbindung löschen" ist
-- Soft-Delete (UPDATE deleted_at), von derselben UPDATE-Policy abgedeckt.

CREATE POLICY kunden_mail_anbindungen_lesen ON kunden_mail_anbindungen FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

CREATE POLICY kunden_mail_anbindungen_schreiben ON kunden_mail_anbindungen FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_mail_anbindungen_aktualisieren ON kunden_mail_anbindungen FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

-- Spalten-Schutz für imap_passwort_verschluesselt (RLS filtert Zeilen, nicht
-- Spalten): "authenticated" verliert die pauschale Tabellen-SELECT-Grant und
-- bekommt sie gezielt für alle Spalten AUSSER dem Passwort zurück. Ohne
-- dieses REVOKE+GRANT-Paar würde eine reine Zeilen-Policy die Spalte für
-- jede Rolle sichtbar lassen, die die Zeile überhaupt sehen darf.
--
-- WICHTIG für die rls-tests-CI: supabase/tests/helpers/001_grants.sql
-- vergibt NACH allen Migrations eine pauschale
-- "GRANT SELECT ON ALL TABLES ... TO authenticated" -- dort ist diese
-- Tabelle deshalb explizit nachträglich wieder eingeschränkt, sonst würde
-- der Blanket-Grant dieses REVOKE in der Test-Umgebung sofort wieder
-- aufheben (in einer echten Supabase-Instanz existiert dieser pauschale
-- Blanket-Grant-Schritt nicht, dort gilt nur diese Migration).
REVOKE SELECT ON kunden_mail_anbindungen FROM authenticated;
GRANT SELECT (
  id, kunde_id, agentur_id, anbindungs_typ, konsolen_adresse,
  imap_host, imap_port, imap_benutzername, imap_ordner, verarbeitet_ordner,
  aktiv, angelegt_at, updated_at, deleted_at
) ON kunden_mail_anbindungen TO authenticated;

-- mail_eingang_log: chef sieht alle Zeilen der Agentur (Ops-Sicht,
-- /ops/mail-eingang, Aufgabe D, zusätzlich auf Routen-Ebene auf die
-- chef-Rolle beschränkt). manager/editor sehen zusätzlich die Zeilen der
-- EIGENEN zugewiesenen Kunden (für "letzter Mail-Empfang" auf der
-- Mail-Anbindungs-Detailseite des jeweiligen Kunden, Aufgabe D) -- dafür
-- über kunden_mail_anbindung_id auf die zugehörige kunde_id zurückschließen,
-- weil mail_eingang_log selbst keine kunde_id-Spalte hat. Bewusst keine
-- INSERT/UPDATE-Policy: Zeilen entstehen ausschließlich über den
-- Ingest-Dienst (Service-Role, RLS-Bypass), analog zu vorgaenge.

CREATE POLICY mail_eingang_log_lesen ON mail_eingang_log FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (
      current_rolle() = 'chef'
      OR EXISTS (
        SELECT 1 FROM kunden_mail_anbindungen a
        WHERE a.id = mail_eingang_log.kunden_mail_anbindung_id AND ist_kunde_zugewiesen(a.kunde_id)
      )
    )
  );

-- ============================================================
-- Indizes
-- ============================================================

CREATE INDEX kunden_mail_anbindungen_agentur_id_idx ON kunden_mail_anbindungen (agentur_id);
CREATE INDEX kunden_mail_anbindungen_kunde_id_idx ON kunden_mail_anbindungen (kunde_id);

CREATE INDEX mail_eingang_log_agentur_id_idx ON mail_eingang_log (agentur_id);
CREATE INDEX mail_eingang_log_kunden_mail_anbindung_id_idx ON mail_eingang_log (kunden_mail_anbindung_id);
-- message_id hat bereits einen impliziten Unique-Index (UNIQUE-Constraint
-- oben) -- das ist der von der Ingest-Schleife genutzte Duplikat-Check-Pfad.
