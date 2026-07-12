// Shadow-Mode-Durchsetzung (SAAS_SPEC_v1.0_CONSOLE.md §5.1, Issue #30 Aufgabe C).
// Quelle: docs/decisions/2026-07-12_klassifikations-layer.md, Abschnitt
// "Shadow-Mode-Durchsetzung": Stufe 1 ist Default, Persistenz ist in v1 das
// Ende der Kette (kein automatischer Handler-Aufruf, kein automatischer
// Versand). Diese Funktion ist der Vertrag, den jeder künftige
// Versand-/Handler-Trigger vor seiner Ausführung aufrufen MUSS -- in v1
// existiert kein solcher Trigger, `persistiere-klassifikation.ts` ruft diese
// Funktion trotzdem auf und protokolliert das Ergebnis im audit_log-Eintrag,
// damit die Durchsetzung nicht nur strukturell (kein Code-Pfad vorhanden),
// sondern auch nachweisbar ist (siehe Test in tests/autonomie.test.ts).

import type { AutonomieLevel } from './types.js';

/**
 * true nur ab Stufe 2. Stufe 1 (Shadow-Mode, Default aus kunden.autonomie_level)
 * blockiert jeden automatischen Versand/Handler-Aufruf hart. AGENTS.md §4
 * verlangt genau das ("keine Fake-Antworten ohne Menschen-Abzweig" gilt
 * analog für jede Automatisierung, solange der Kunde nicht explizit auf
 * Stufe 2/3 steht).
 */
export function autonomieErlaubtAutomatischenVersand(autonomieLevel: AutonomieLevel): boolean {
  return autonomieLevel >= 2;
}
