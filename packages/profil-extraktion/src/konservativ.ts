// Konservativ-Prinzip, Code-Ebene (Teil 2, verbindlich). Vertraut NICHT
// darauf, dass der Prompt (prompt.ts) allein ausreicht -- eine reine
// Nachbearbeitungsfunktion, die nach erfolgreicher Zod-Validierung läuft und
// inhaltlich unbelegte Werte verwirft, statt die ganze Extraktion scheitern
// zu lassen. Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Konservativ-Prinzip".

import type { KennzahlVorschlag, ProfilExtraktionsVorschlag } from './schema.js';

export interface KonservativesErgebnis {
  vorschlag: ProfilExtraktionsVorschlag;
  /** Anzahl verworfener Kennzahlen (kein Stichtag und/oder keine Quelle belegbar), für Transparenz statt stillem Verlust. */
  verworfeneKennzahlen: number;
}

function istBelegbar(kennzahl: KennzahlVorschlag): boolean {
  return Boolean(kennzahl.stichtag && kennzahl.stichtag.trim()) && Boolean(kennzahl.quelle && kennzahl.quelle.trim());
}

/**
 * Panel-Prinzip "kein Raten bei Zahlen", wörtlich aus dem Auftrag: eine
 * Kennzahl OHNE Stichtag UND Quelle wird komplett verworfen (nicht nur
 * maskiert), unabhängig davon, wie plausibel der Wert klingt. Alle übrigen
 * Kategorien bleiben unangetastet -- ein einzelner unbelegter Zahlenwert
 * darf die restlichen, gültigen Vorschläge nicht mit zu Fall bringen (siehe
 * Decision, Abweichung von "ganze Extraktion verwerfen").
 */
export function wendeKonservativesPrinzipAn(vorschlag: ProfilExtraktionsVorschlag): KonservativesErgebnis {
  const belegbareKennzahlen = vorschlag.kennzahlen.filter(istBelegbar);
  const verworfeneKennzahlen = vorschlag.kennzahlen.length - belegbareKennzahlen.length;

  return {
    vorschlag: {
      ...vorschlag,
      kennzahlen: belegbareKennzahlen,
    },
    verworfeneKennzahlen,
  };
}
