// Technische Durchsetzung der Sprach-Regel (WORKFLOW_HANDLERS_v1.0.md "W2",
// AGENTS.md §3.4): interne Comms-Plan-Felder sind bei DACH-Agenturen IMMER
// Deutsch, unabhängig von der Sprache der eingegangenen Presseanfrage. Diese
// Heuristik ist das Code-Sicherheitsnetz hinter der Prompt-Anweisung (siehe
// Design-Decision, Abschnitt "Sprach-Regel: technische Durchsetzung"),
// analog zu findUmlautErsatz() in packages/classifier/src/schema.ts: eine
// kuratierte Stopwort-Liste statt eines generischen Sprach-Erkennungs-Modells,
// bewusst als Heuristik markiert und erweiterbar.

const DEUTSCHE_STOPWOERTER = [
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'für', 'mit', 'wir', 'sie',
  'ein', 'eine', 'auf', 'zu', 'den', 'dem', 'des', 'wird', 'sind', 'werden',
  'haben', 'hat', 'auch', 'als', 'bei', 'über', 'unser', 'unsere', 'wurde',
  'diese', 'dieser', 'dieses', 'sich', 'kann', 'muss', 'soll', 'aber',
] as const;

const ENGLISCHE_STOPWOERTER = [
  'the', 'and', 'is', 'for', 'with', 'we', 'you', 'this', 'that', 'are',
  'have', 'has', 'will', 'be', 'of', 'to', 'in', 'on', 'our', 'was', 'were',
  'from', 'they', 'their', 'not', 'but', 'can', 'should', 'would',
] as const;

/**
 * true, wenn der Text wahrscheinlich Deutsch ist. Leerer Text gilt als
 * unverdächtig (kein Verstoß), weil Stage-3-Bausteine leere/optionale Felder
 * separat behandeln. Umlaute/ß sind ein starkes Deutsch-Signal, das auch bei
 * wenigen Stopwort-Treffern greift.
 */
export function istWahrscheinlichDeutsch(text: string): boolean {
  const bereinigt = text.trim();
  if (bereinigt.length === 0) return true;

  if (/[äöüß]/i.test(bereinigt)) return true;

  const woerter = bereinigt.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  if (woerter.length === 0) return true;

  let deutscheTreffer = 0;
  let englischeTreffer = 0;
  for (const wort of woerter) {
    if ((DEUTSCHE_STOPWOERTER as readonly string[]).includes(wort)) deutscheTreffer += 1;
    if ((ENGLISCHE_STOPWOERTER as readonly string[]).includes(wort)) englischeTreffer += 1;
  }

  if (deutscheTreffer === 0 && englischeTreffer === 0) return true; // kein Signal, kein Verstoß
  return deutscheTreffer >= englischeTreffer;
}
