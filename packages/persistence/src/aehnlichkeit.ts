// Einfache Dubletten-Vorfilterung für abgeleitete Kundenprofil-Listen-
// Elemente (Issue #37, PR 2, Auftrag: "simple Ähnlichkeit, nichts
// Ausgeklügeltes"). Bewusst KEIN LLM-Vergleich (siehe
// docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md, "Offene Fragen":
// ein LLM-basierter "ist das dasselbe?"-Vergleich wäre selbst wieder eine
// fehleranfällige KI-Entscheidung mit Kosten pro Vergleich) -- stattdessen
// ein deterministischer Dice-Koeffizient auf Zeichen-Bigrammen, ein
// gängiges, simples String-Ähnlichkeitsmaß ohne externe Abhängigkeit.

const AEHNLICHKEITS_SCHWELLE = 0.82;

function normalisieren(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?"'()]/g, '');
}

function bigramme(text: string): Set<string> {
  const bereinigt = normalisieren(text);
  if (bereinigt.length < 2) return new Set(bereinigt ? [bereinigt] : []);
  const menge = new Set<string>();
  for (let i = 0; i < bereinigt.length - 1; i++) {
    menge.add(bereinigt.slice(i, i + 2));
  }
  return menge;
}

function diceKoeffizient(a: string, b: string): number {
  const bigrammeA = bigramme(a);
  const bigrammeB = bigramme(b);
  if (bigrammeA.size === 0 && bigrammeB.size === 0) return 1;
  if (bigrammeA.size === 0 || bigrammeB.size === 0) return 0;

  let ueberschneidung = 0;
  for (const bigramm of bigrammeA) {
    if (bigrammeB.has(bigramm)) ueberschneidung += 1;
  }
  return (2 * ueberschneidung) / (bigrammeA.size + bigrammeB.size);
}

/** Exportiert für Tests, die die Schwelle direkt gegen einzelne Fälle prüfen wollen. */
export function istInhaltlichAehnlich(a: string, b: string): boolean {
  if (normalisieren(a) === normalisieren(b)) return true;
  return diceKoeffizient(a, b) >= AEHNLICHKEITS_SCHWELLE;
}

export interface FilterDublettenErgebnis<T> {
  einzufuegen: T[];
  dublettenUebersprungen: number;
}

/**
 * Filtert Kandidaten gegen bereits bestehende Vergleichs-Schlüssel (z. B.
 * Texte bereits vorhandener Listen-Zeilen) UND gegen bereits akzeptierte
 * Kandidaten aus demselben Aufruf (ein Extraktions-Lauf soll sich nicht
 * selbst duplizieren). Reihenfolge-stabil: der erste Kandidat einer
 * Ähnlichkeits-Gruppe gewinnt, spätere werden übersprungen.
 */
export function filterDubletten<T>(
  kandidaten: T[],
  bestehendeSchluessel: string[],
  vergleichsSchluessel: (kandidat: T) => string,
): FilterDublettenErgebnis<T> {
  const gesehen = [...bestehendeSchluessel];
  const einzufuegen: T[] = [];
  let dublettenUebersprungen = 0;

  for (const kandidat of kandidaten) {
    const schluessel = vergleichsSchluessel(kandidat);
    if (gesehen.some((bestehend) => istInhaltlichAehnlich(bestehend, schluessel))) {
      dublettenUebersprungen += 1;
      continue;
    }
    gesehen.push(schluessel);
    einzufuegen.push(kandidat);
  }

  return { einzufuegen, dublettenUebersprungen };
}
