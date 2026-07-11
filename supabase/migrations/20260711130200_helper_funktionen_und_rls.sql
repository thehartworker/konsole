-- Helper-Funktionen und Row-Level-Security für die Intake-Konsole.
-- Quelle: docs/decisions/2026-07-10_rls-policies.md, korrigierte Fassung
-- (darf_vorgang_sehen in vorgaenge_lesen/anliegen_lesen/handler_aufrufe_lesen,
-- vorgaenge_schreiben in Rollen-Zweigen, freigaben_anlegen nur chef/manager).
--
-- Abweichung von der Decision: alle vier SECURITY DEFINER-Funktionen setzen
-- zusätzlich "SET search_path = public, pg_temp". Das steht nicht im
-- Decision-Text, ist aber notwendiges Postgres-Security-Pattern für
-- SECURITY DEFINER-Funktionen (verhindert, dass ein Aufrufer über eine
-- manipulierte search_path-Reihenfolge eigene gleichnamige Objekte
-- unterschiebt, die dann mit den Rechten des Funktions-Owners liefen). Ohne
-- diese Pinning-Klausel wäre die im Decision-Text behauptete Sicherheit
-- ("kein Parameter-Durchgriff") lückenhaft. Siehe PR-Beschreibung.

-- ============================================================
-- Helper-Funktionen (SECURITY DEFINER)
-- ============================================================

CREATE FUNCTION current_agentur_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT agentur_id FROM nutzer WHERE id = auth.uid() AND deleted_at IS NULL $$;

COMMENT ON FUNCTION current_agentur_id() IS
  'SECURITY DEFINER, weil eine RLS-Policy auf nutzer, die wieder nutzer abfragt, '
  'um die eigene agentur_id zu bestimmen, zirkulär wäre. Sicher, weil die Funktion '
  'keinen Parameter entgegennimmt und ausschließlich an auth.uid() (session-gebunden, '
  'vom Aufrufer nicht überschreibbar) hängt.';

CREATE FUNCTION current_rolle() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT rolle::text FROM nutzer WHERE id = auth.uid() AND deleted_at IS NULL $$;

COMMENT ON FUNCTION current_rolle() IS
  'SECURITY DEFINER aus demselben Grund wie current_agentur_id(): vermeidet '
  'rekursive RLS-Auswertung auf nutzer. Keinen Parameter, hängt ausschließlich an auth.uid().';

CREATE FUNCTION ist_kunde_zugewiesen(p_kunde_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT EXISTS (
       SELECT 1 FROM nutzer_kunden_zuweisungen
       WHERE nutzer_id = auth.uid() AND kunde_id = p_kunde_id AND deleted_at IS NULL
     ) $$;

COMMENT ON FUNCTION ist_kunde_zugewiesen(uuid) IS
  'SECURITY DEFINER, um Zuweisungs-Lookups unabhängig von der RLS-Policy auf '
  'nutzer_kunden_zuweisungen selbst auszuwerten. Sicher, weil der einzige Parameter '
  'eine kunde_id ist, die nur gegen "nutzer_id = auth.uid()" geprüft wird, nicht gegen '
  'einen aufrufer-gesteuerten Nutzer.';

CREATE FUNCTION darf_vorgang_sehen(p_vorgang_id uuid) RETURNS boolean
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
            current_rolle() IN ('editor', 'reader')
            AND ist_kunde_zugewiesen(v.kunde_id)
            AND (v.sensitivity = 'normal' OR v.zustaendige_nutzer_id = auth.uid())
          )
          OR (
            current_rolle() = 'guest'
            AND EXISTS (
              SELECT 1 FROM nutzer_vorgang_freigaben f
              WHERE f.vorgang_id = v.id
                AND f.nutzer_id = auth.uid()
                AND f.ablauf_at > now()
            )
          )
        )
    )
  $$;

COMMENT ON FUNCTION darf_vorgang_sehen(uuid) IS
  'SECURITY DEFINER. Kapselt die vollständige Sichtbarkeits-Logik aus vorgaenge_lesen '
  '(Agentur-Check, Rollen-Check, Kunden-Zuweisung, Sensitivity-Regel, Guest-Freigabe) an '
  'einer Stelle, damit anliegen_lesen und handler_aufrufe_lesen dieselbe Prüfung '
  'wiederverwenden statt nur die Existenz der referenzierten Zeile zu prüfen (siehe '
  'Korrektur in docs/decisions/2026-07-10_rls-policies.md). Sicher, weil der einzige '
  'Parameter eine vorgang_id ist und jede interne Prüfung an auth.uid() sowie '
  'v.agentur_id = current_agentur_id() hängt: ein Aufrufer kann höchstens eine beliebige '
  'vorgang_id übergeben, bekommt für Vorgänge fremder Agenturen oder nicht zugewiesener '
  'Kunden aber false zurück.';

-- ============================================================
-- Row-Level-Security aktivieren
-- ============================================================

ALTER TABLE agenturen ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden_kontakte ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutzer ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutzer_kunden_zuweisungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutzer_vorgang_freigaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE vorgaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE anliegen ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_aufrufe ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- agenturen
-- ============================================================

CREATE POLICY agentur_lesen ON agenturen FOR SELECT
  USING (id = current_agentur_id());

-- Bewusst keine INSERT/UPDATE/DELETE-Policy: Agentur-Anlage läuft über einen
-- privilegierten Onboarding-Prozess außerhalb von RLS (Service-Role).

-- ============================================================
-- kunden
-- ============================================================

CREATE POLICY kunden_lesen ON kunden FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() IN ('chef') OR ist_kunde_zugewiesen(id))
  );

CREATE POLICY kunden_schreiben ON kunden FOR UPDATE
  USING (agentur_id = current_agentur_id() AND current_rolle() IN ('chef', 'manager'))
  WITH CHECK (agentur_id = current_agentur_id());

-- Bewusst keine INSERT-Policy für "Kunde anlegen": die Decision beschreibt
-- diese Berechtigung nur in Prosa (chef "kann Kunden anlegen"), liefert aber
-- kein SQL. Ohne Policy gilt der von der Decision selbst benannte sichere
-- Default (RLS aktiv, keine Policy = kein Zugriff). Siehe PR-Beschreibung,
-- Abschnitt Lücken.

-- ============================================================
-- kunden_kontakte
-- ============================================================

CREATE POLICY kunden_kontakte_lesen ON kunden_kontakte FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR ist_kunde_zugewiesen(kunde_id))
  );

-- Bewusst keine INSERT/UPDATE/DELETE-Policy: rls-policies.md äußert sich zu
-- Schreibrechten auf kunden_kontakte gar nicht. Sicherer Default greift.

-- ============================================================
-- nutzer
-- ============================================================

CREATE POLICY nutzer_lesen ON nutzer FOR SELECT
  USING (agentur_id = current_agentur_id());

-- Bewusst keine INSERT/UPDATE-Policy für "Beraterinnen einladen,
-- Berechtigungen setzen": nur in Prosa beschrieben ("nur chef"), kein SQL in
-- der Decision. Sicherer Default greift. Siehe PR-Beschreibung.

-- ============================================================
-- nutzer_kunden_zuweisungen
-- ============================================================

CREATE POLICY zuweisungen_lesen ON nutzer_kunden_zuweisungen FOR SELECT
  USING (agentur_id = current_agentur_id() AND (current_rolle() IN ('chef', 'manager') OR nutzer_id = auth.uid()));

-- Bewusst keine INSERT/UPDATE/DELETE-Policy für "Zuweisen/Entziehen": nur in
-- Prosa beschrieben, kein SQL in der Decision. Sicherer Default greift.

-- ============================================================
-- vorgaenge
-- ============================================================

CREATE POLICY vorgaenge_lesen ON vorgaenge FOR SELECT
  USING (darf_vorgang_sehen(id));

CREATE POLICY vorgaenge_schreiben ON vorgaenge FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (
      -- chef: alle Vorgänge der Agentur bearbeiten
      current_rolle() = 'chef'
      -- manager: Vorgänge zugewiesener Kunden bearbeiten, inklusive sensitive
      OR (current_rolle() = 'manager' AND ist_kunde_zugewiesen(kunde_id))
      -- editor: Vorgänge zugewiesener Kunden, sensitive nur wenn zuständige Person
      OR (
        current_rolle() = 'editor'
        AND ist_kunde_zugewiesen(kunde_id)
        AND (sensitivity = 'normal' OR zustaendige_nutzer_id = auth.uid())
      )
      -- reader, guest: kein Zweig hier, siehe Decision
    )
  )
  WITH CHECK (agentur_id = current_agentur_id());

-- Bewusst keine INSERT-Policy: Vorgänge entstehen über den
-- Klassifikations-Ingest-Pfad, der laut Decision mit der Supabase
-- Service-Role läuft (RLS-Bypass), nicht über authentifizierte
-- Nutzer-Sessions.

-- ============================================================
-- anliegen und handler_aufrufe
-- ============================================================

CREATE POLICY anliegen_lesen ON anliegen FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND darf_vorgang_sehen(vorgang_id)
  );

CREATE POLICY handler_aufrufe_lesen ON handler_aufrufe FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND darf_vorgang_sehen(vorgang_id)
  );

-- ============================================================
-- nutzer_vorgang_freigaben
-- ============================================================

CREATE POLICY freigaben_lesen ON nutzer_vorgang_freigaben FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() IN ('chef', 'manager') OR nutzer_id = auth.uid())
  );

CREATE POLICY freigaben_anlegen ON nutzer_vorgang_freigaben FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND current_rolle() IN ('chef', 'manager')
    AND freigegeben_durch = auth.uid()
  );

-- ============================================================
-- audit_log (strikt append-only, siehe §10.2)
-- ============================================================

CREATE POLICY audit_log_lesen ON audit_log FOR SELECT
  USING (
    agentur_id = current_agentur_id()
    AND (
      current_rolle() IN ('chef')
      OR (current_rolle() = 'manager' AND (vorgang_id IS NULL OR EXISTS (
            SELECT 1 FROM vorgaenge v WHERE v.id = audit_log.vorgang_id AND ist_kunde_zugewiesen(v.kunde_id)
          )))
      OR (current_rolle() IN ('editor', 'reader') AND nutzer_id = auth.uid())
    )
  );

-- guest bekommt keine audit_log-Policy (kein Zugriff, siehe Decision).
-- Kein UPDATE/DELETE für irgendeine Rolle: audit_log ist strikt append-only.
-- Anonymisierung bei DSGVO-Löschung läuft über eine privilegierte
-- Service-Funktion außerhalb der normalen Nutzer-RLS.
