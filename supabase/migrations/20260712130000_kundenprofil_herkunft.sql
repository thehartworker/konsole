-- herkunft-Spalte auf allen neun Kundenprofil-Listen-Tabellen: die
-- TECHNISCHE Herkunft eines Vorschlags ('dokument-upload'/'website-scraping'/
-- NULL für manuell erfasst), nicht zu verwechseln mit kunden_kennzahlen.quelle
-- (das ist die inhaltliche Beleg-Quelle der Zahl selbst, z. B.
-- "Geschäftsbericht 2025"). Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
-- Abschnitt "Persistenz" -- Issue #37, PR 2.
--
-- Auf allen neun Tabellen ergänzt (auch kunden_freigabekette/
-- kunden_praezedenzfaelle, die die KI-Extraktion aktuell nicht befüllt), für
-- ein konsistentes Schema über alle Kundenprofil-Listen-Tabellen hinweg --
-- keine der beiden schreibt aktuell einen Wert ungleich NULL hierher.
--
-- Bewusst KEIN eigener Enum-Typ: eine CHECK-Constraint mit denselben zwei
-- Werten reicht für zwei feste Strings, ein Enum wäre hier reine
-- Zusatz-Komplexität ohne Gegenwert (anders als bei den Status-Enums, die an
-- vielen Stellen im Code als Union-Typ wiederverwendet werden).

ALTER TABLE kunden_boilerplate ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_kennzahlen ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_sprecher ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_kernbotschaften ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_themen ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_grenzen ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_freigabekette ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_praezedenzfaelle ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
ALTER TABLE kunden_medien_kontext ADD COLUMN herkunft text
  CHECK (herkunft IS NULL OR herkunft IN ('dokument-upload', 'website-scraping'));
