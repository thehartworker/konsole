// Reine Merge-Logik für das Inline-Editing der W1-Pressemitteilung (Issue
// #45). Bewusst ohne Laufzeit-Abhängigkeit auf @konsole/handlers (nur
// `import type`, wird vom Compiler entfernt) -- diese Datei wird sowohl von
// der Server-Action (actions.ts) als auch vom Client-Editor
// (pressemitteilung-editor.tsx, "use client") importiert. Ein Laufzeit-
// Import von @konsole/handlers würde pdfkit/docx (Node-only) in den
// Browser-Bundle ziehen, siehe docs/decisions/2026-07-13_konsole-block2-editing-und-export.md.

import type { PressemitteilungDraft, W1Output } from "@konsole/handlers";

/** Patch-Felder, die der Editor pro Segment (oder pro Zitat-Gruppe) sendet -- ein Teil-Update, kein volles Dokument. */
export interface PressemitteilungPatch {
  headline?: string;
  sub_headline?: string | null;
  ort_datum?: string;
  lead_absatz?: string;
  ausfuehrung_absaetze?: string[];
  zitat?: { text: string; sprecher_name: string; sprecher_rolle: string } | null;
  boilerplate?: string;
  kontakt_fusszeile?: string;
}

/** "laenge_worte" ist Audit-Metadatum, nicht editierbar -- wird nach jedem Patch, der lead_absatz/ausfuehrung_absaetze betrifft, neu berechnet. Gleiche Definition wie im W1-Drafter-Prompt: "Wortzahl von lead_absatz plus ausfuehrung_absaetze zusammen". */
export function berechneLaengeWorte(lead_absatz: string, ausfuehrung_absaetze: string[]): number {
  const text = [lead_absatz, ...ausfuehrung_absaetze].join(" ");
  return text.split(/\s+/).filter((wort) => wort.length > 0).length;
}

/**
 * Führt einen Patch in `basis.pressemitteilung` zusammen. Alle anderen
 * Top-Level-Felder von W1Output (kritiker_findings, grenz_pruefung_ergebnis,
 * audit_metadaten, ...) bleiben unverändert -- siehe Decision, Abschnitt 2.
 * Reines Merge, KEINE Validierung -- die serverseitige Zod-Prüfung (Aufgabe
 * B) läuft danach, im Repository.
 */
export function pressemitteilungPatchAnwenden(basis: W1Output, patch: PressemitteilungPatch): W1Output {
  const pressemitteilung: PressemitteilungDraft = {
    ...basis.pressemitteilung,
    ...patch,
  };

  if (patch.lead_absatz !== undefined || patch.ausfuehrung_absaetze !== undefined) {
    pressemitteilung.laenge_worte = berechneLaengeWorte(pressemitteilung.lead_absatz, pressemitteilung.ausfuehrung_absaetze);
  }

  return { ...basis, pressemitteilung };
}
