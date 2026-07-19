-- Schreibrechte für kunden_profil und die neun Kundenprofil-Listen-Tabellen
-- (Issue #50, Konsole Block 3 -- Kundenprofil-Editor). Siehe
-- docs/decisions/2026-07-17_konsole-block3-profil-editor.md, Abschnitt
-- "Fünfte Entscheidung": beide Migrationen (20260712110000/20260712110100)
-- setzten bewusst nur SELECT-Policies, weil es "kein Editier-UI in Ebene 1+2"
-- gab -- dieser Block IST das Editier-UI, die Prämisse entfällt.
--
-- Muster identisch zu vorgaenge_schreiben (20260711130200_helper_funktionen_und_rls.sql):
-- chef schreibt jede Zeile der eigenen Agentur, manager/editor nur für
-- zugewiesene Kunden, reader/guest bleiben ohne Schreibrecht. Keine eigene
-- DELETE-Policy: Entfernen läuft wie überall im Repository über Soft-Delete
-- (UPDATE deleted_at), von derselben UPDATE-Policy abgedeckt.
--
-- kunden_quelldokumente bekommt bewusst KEINE Nutzer-Policy: Datei-Upload
-- läuft weiterhin über eine Server-Route mit der Service-Role (unverändert
-- gegenüber 20260712120000_kunden_quelldokumente.sql).
--
-- Jede _aktualisieren-Policy prüft dieselbe Rollen-/Zuweisungs-Bedingung
-- sowohl in USING als auch in WITH CHECK (nicht nur agentur_id): ohne die
-- Wiederholung in WITH CHECK könnte ein manager/editor mit Schreibrecht auf
-- eine zugewiesene Zeile per UPDATE kunde_id auf einen NICHT zugewiesenen
-- Kunden derselben Agentur umbiegen (USING prüft nur die ALTE Zeile, WITH
-- CHECK ohne Zuweisungs-Bedingung hätte die NEUE Zeile nicht erneut geprüft).

-- ============================================================
-- kunden_profil
-- ============================================================

CREATE POLICY kunden_profil_schreiben ON kunden_profil FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_profil_aktualisieren ON kunden_profil FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

-- ============================================================
-- Listen-Tabellen: gleiches Muster für alle neun Tabellen.
-- ============================================================

CREATE POLICY kunden_boilerplate_schreiben ON kunden_boilerplate FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_boilerplate_aktualisieren ON kunden_boilerplate FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_kennzahlen_schreiben ON kunden_kennzahlen FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_kennzahlen_aktualisieren ON kunden_kennzahlen FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_sprecher_schreiben ON kunden_sprecher FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_sprecher_aktualisieren ON kunden_sprecher FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_kernbotschaften_schreiben ON kunden_kernbotschaften FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_kernbotschaften_aktualisieren ON kunden_kernbotschaften FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_themen_schreiben ON kunden_themen FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_themen_aktualisieren ON kunden_themen FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_grenzen_schreiben ON kunden_grenzen FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_grenzen_aktualisieren ON kunden_grenzen FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_freigabekette_schreiben ON kunden_freigabekette FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_freigabekette_aktualisieren ON kunden_freigabekette FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_praezedenzfaelle_schreiben ON kunden_praezedenzfaelle FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_praezedenzfaelle_aktualisieren ON kunden_praezedenzfaelle FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );

CREATE POLICY kunden_medien_kontext_schreiben ON kunden_medien_kontext FOR INSERT
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
CREATE POLICY kunden_medien_kontext_aktualisieren ON kunden_medien_kontext FOR UPDATE
  USING (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  )
  WITH CHECK (
    agentur_id = current_agentur_id()
    AND (current_rolle() = 'chef' OR (current_rolle() IN ('manager', 'editor') AND ist_kunde_zugewiesen(kunde_id)))
  );
