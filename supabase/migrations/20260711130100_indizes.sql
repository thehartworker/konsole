-- Indizes für die Intake-Konsole.
-- Quelle: docs/decisions/2026-07-10_datenmodell.md
--
-- Der Picking-Index (vorgaenge_picking_idx) ist wörtlich aus der Decision
-- übernommen. Alle übrigen Indizes sind aus der Decision hergeleitet, nicht
-- als CREATE INDEX-Statement dort ausformuliert: die Decision selbst
-- begründet ausführlich, warum agentur_id auf jeder mandanten-relevanten
-- Tabelle liegt, damit RLS-Policies "ein einzeiliger Vergleich" bleiben statt
-- Sub-Selects über mehrere Tabellen (siehe "Begründung für Option 3" dort).
-- Ein einzeiliger Vergleich ist nur dann tatsächlich schnell, wenn die
-- verglichene Spalte indiziert ist. Die Indizes unten setzen diese in der
-- Decision beschriebene Performance-Annahme um; siehe PR-Beschreibung für
-- die explizite Einordnung als Ableitung statt Wortlaut-Zitat.

-- Picking-Query (§12.1): Klassifikations-Worker picken atomar aus der
-- Queue einer Agentur, sortiert nach SLA-Frist und Eingang. Partieller Index
-- nur auf 'queued'-Zeilen, weil erledigte/gescheiterte Vorgänge nie wieder
-- gepickt werden.
CREATE INDEX vorgaenge_picking_idx ON vorgaenge (agentur_id, sla_frist_at ASC NULLS LAST, eingang_at ASC)
  WHERE klassifikation_status = 'queued';

-- kunden_lesen / kunden_kontakte_lesen: ist_kunde_zugewiesen(kunde_id) prüft
-- "WHERE nutzer_id = auth.uid() AND kunde_id = p_kunde_id", auf jeder
-- RLS-Auswertung für editor/manager aufgerufen.
CREATE INDEX nutzer_kunden_zuweisungen_nutzer_kunde_idx ON nutzer_kunden_zuweisungen (nutzer_id, kunde_id)
  WHERE deleted_at IS NULL;

-- zuweisungen_lesen (chef/manager-Zweig): alle Zuweisungen der eigenen Agentur auflisten.
CREATE INDEX nutzer_kunden_zuweisungen_agentur_id_idx ON nutzer_kunden_zuweisungen (agentur_id);

-- kunden_kontakte_lesen und allgemeiner Kontakt-Abruf pro Kunde (§11.2).
CREATE INDEX kunden_kontakte_kunde_id_idx ON kunden_kontakte (kunde_id);
CREATE INDEX kunden_kontakte_agentur_id_idx ON kunden_kontakte (agentur_id);

-- nutzer_lesen: Team-Liste der eigenen Agentur.
CREATE INDEX nutzer_agentur_id_idx ON nutzer (agentur_id);

-- vorgaenge_schreiben WITH CHECK und allgemeine Agentur-Scoping-Abfragen
-- außerhalb des Picking-Pfads (der Picking-Index oben deckt nur
-- klassifikation_status = 'queued' ab).
CREATE INDEX vorgaenge_agentur_id_idx ON vorgaenge (agentur_id);

-- Kunden-Ansicht der Konsole (alle Vorgänge eines zugewiesenen Kunden) und
-- ist_kunde_zugewiesen(kunde_id)-Filterung in vorgaenge_lesen/schreiben.
CREATE INDEX vorgaenge_kunde_id_idx ON vorgaenge (kunde_id);

-- darf_vorgang_sehen(): Guest-Freigabe-Check "WHERE vorgang_id = ... AND
-- nutzer_id = auth.uid() AND ablauf_at > now()".
CREATE INDEX nutzer_vorgang_freigaben_vorgang_nutzer_idx ON nutzer_vorgang_freigaben (vorgang_id, nutzer_id);

-- freigaben_lesen (chef/manager-Zweig): alle Freigaben der eigenen Agentur.
CREATE INDEX nutzer_vorgang_freigaben_agentur_id_idx ON nutzer_vorgang_freigaben (agentur_id);

-- anliegen_lesen: agentur_id-Vorfilter plus Join auf vorgang_id für
-- darf_vorgang_sehen(vorgang_id).
CREATE INDEX anliegen_vorgang_id_idx ON anliegen (vorgang_id);
CREATE INDEX anliegen_agentur_id_idx ON anliegen (agentur_id);

-- handler_aufrufe_lesen: analog zu anliegen_lesen.
CREATE INDEX handler_aufrufe_vorgang_id_idx ON handler_aufrufe (vorgang_id);
CREATE INDEX handler_aufrufe_agentur_id_idx ON handler_aufrufe (agentur_id);

-- audit_log_lesen (manager-Zweig): EXISTS-Join gegen vorgaenge über vorgang_id.
CREATE INDEX audit_log_vorgang_id_idx ON audit_log (vorgang_id);

-- audit_log_lesen (editor/reader-Zweig): "nur eigene Aktionen", nutzer_id = auth.uid().
CREATE INDEX audit_log_nutzer_id_idx ON audit_log (nutzer_id);

-- audit_log_lesen (chef-Zweig) und allgemeines Agentur-Scoping.
CREATE INDEX audit_log_agentur_id_idx ON audit_log (agentur_id);
