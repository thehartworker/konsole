// Sprach-Regel-Heuristik (AGENTS.md §3.4, WORKFLOW_HANDLERS_v1.0.md "W2" §
// "Wichtig zur Sprach-Regel", docs/decisions/2026-07-12_w2-presseanfragen-drafter.md
// "Zu 4"). Bei DACH-Agenturen sind die internen comms_plan-Felder IMMER
// Deutsch, unabhängig von der Sprache der eingegangenen Presseanfrage.
//
// istWahrscheinlichDeutsch() ist eine Stopwort-Scoring-Heuristik, kein
// vollständiger Sprach-Detektor. Sie ist bewusst konservativ: bei
// Uneindeutigkeit (kurzer Text, wenige eindeutige Funktionswörter) meldet
// sie "wahrscheinlich Deutsch", um keine False-Positive-Retry-Schleife zu
// erzeugen (ein Retry ist teuer, ein einzelnes übersehenes Fremdwort in
// einem sonst deutschen Text ist unkritisch).

const DEUTSCHE_FUNKTIONSWOERTER = [
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'für', 'mit', 'werden', 'wird',
  'wurde', 'wir', 'sich', 'auf', 'ein', 'eine', 'einer', 'den', 'dem', 'des',
  'sind', 'hat', 'haben', 'kann', 'muss', 'soll', 'bei', 'nach', 'über',
  'auch', 'oder', 'wenn', 'als', 'wie', 'im', 'zum', 'zur', 'von',
] as const;

const ENGLISCHE_FUNKTIONSWOERTER = [
  'the', 'and', 'is', 'not', 'for', 'with', 'will', 'be', 'we', 'on', 'a',
  'an', 'are', 'has', 'have', 'can', 'must', 'should', 'at', 'after', 'over',
  'also', 'or', 'if', 'as', 'in', 'to', 'of', 'this', 'that', 'was', 'were',
] as const;

function zaehleTreffer(worte: string[], liste: readonly string[]): number {
  const listenSet = new Set(liste);
  return worte.filter((wort) => listenSet.has(wort)).length;
}

/**
 * `true`, wenn der Text wahrscheinlich Deutsch ist (oder die Sprache nicht
 * eindeutig bestimmbar ist -- konservativer Default, siehe Modul-Kommentar).
 * `false` nur, wenn die englischen Funktionswort-Treffer die deutschen klar
 * überwiegen.
 */
export function istWahrscheinlichDeutsch(text: string): boolean {
  const worte = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (worte.length < 8) {
    // Zu kurz für eine verlässliche Aussage, konservativ kein Verstoß.
    return true;
  }

  const deutscheTreffer = zaehleTreffer(worte, DEUTSCHE_FUNKTIONSWOERTER);
  const englischeTreffer = zaehleTreffer(worte, ENGLISCHE_FUNKTIONSWOERTER);

  if (deutscheTreffer === 0 && englischeTreffer === 0) {
    // Keine eindeutigen Funktionswörter erkannt (z. B. reine Eigennamen-Liste).
    return true;
  }

  // Deutlicher Überhang englischer Funktionswörter nötig, damit ein
  // einzelner englischer Fachbegriff in einem sonst deutschen Satz nicht
  // sofort einen Verstoß auslöst.
  return englischeTreffer <= deutscheTreffer;
}
