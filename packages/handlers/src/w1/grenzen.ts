// Deterministische Grenz-Prüfung (verbotene_aussage, pflichtbaustein) aus
// dem Kundenprofil, unabhängig vom Kritiker-Pass -- siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md, Abschnitt 4.
// Eigene, kleine Implementierung statt Wiederverwendung von
// w2/regel-engine/bausteine.ts, weil dessen BausteinFn-Signatur auf
// CommsPlanDraft/BausteinKontext zugeschnitten ist. Pruefregel/
// PruefungsErgebnis/RegelVerstoss sind bereits handler-agnostische
// Werte-Typen (siehe w2/regel-engine/types.ts) und werden hier unverändert
// wiederverwendet.

import type { PruefungsErgebnis, Pruefregel, RegelVerstoss } from '../w2/regel-engine/types.js';
import type { PressemitteilungDraft } from './schema.js';

function alleTextfelder(pressemitteilung: PressemitteilungDraft): string {
  return [
    pressemitteilung.headline,
    pressemitteilung.sub_headline ?? '',
    pressemitteilung.lead_absatz,
    ...pressemitteilung.ausfuehrung_absaetze,
    pressemitteilung.zitat?.text ?? '',
    pressemitteilung.boilerplate,
    pressemitteilung.kontakt_fusszeile,
  ].join('\n');
}

function pruefeEineGrenze(pressemitteilung: PressemitteilungDraft, grenze: Pruefregel): RegelVerstoss | null {
  const text = alleTextfelder(pressemitteilung).toLowerCase();

  if (grenze.baustein_name === 'kundengrenze_verbotene_aussage') {
    const phrase = typeof grenze.parameter.phrase === 'string' ? grenze.parameter.phrase.trim() : '';
    if (!phrase) return null; // defensiv, durch die Aufrufer-Seite ausgeschlossen
    if (!text.includes(phrase.toLowerCase())) return null;
    return {
      regel_id: grenze.id,
      baustein_name: grenze.baustein_name,
      quelle: 'code',
      begruendung: `Verbotene Aussage laut Kundenprofil-Grenze gefunden: "${phrase}".`,
    };
  }

  if (grenze.baustein_name === 'kundengrenze_pflichtbaustein') {
    const pflichttext = typeof grenze.parameter.text === 'string' ? grenze.parameter.text.trim() : '';
    if (!pflichttext) return null; // defensiv, durch die Aufrufer-Seite ausgeschlossen
    if (text.includes(pflichttext.toLowerCase())) return null;
    return {
      regel_id: grenze.id,
      baustein_name: grenze.baustein_name,
      quelle: 'code',
      begruendung: `Pflichtbaustein laut Kundenprofil-Grenze fehlt im Draft: "${pflichttext}".`,
    };
  }

  // fail-closed: ein unbekannter Baustein-Name zählt als Verstoß statt
  // stillschweigend übersprungen zu werden, gleiches Prinzip wie in
  // w2/regel-engine/pruefung.ts.
  return {
    regel_id: grenze.id,
    baustein_name: grenze.baustein_name,
    quelle: 'code',
    begruendung: `Unbekannter Grenz-Baustein "${grenze.baustein_name}", Regel wird fail-closed als Verstoß gewertet.`,
  };
}

/**
 * Prüft die deterministisch erzwungenen kunden_grenzen (verbotene_aussage,
 * pflichtbaustein) gegen den Pressemitteilungs-Draft. Ein fehlender
 * Pflichtbaustein wird NUR markiert, nicht automatisch eingefügt (siehe
 * Decision, Abschnitt 4).
 */
export function pruefeDeterministischeGrenzen(
  pressemitteilung: PressemitteilungDraft,
  grenzen: Pruefregel[],
): PruefungsErgebnis {
  const verstoesse = grenzen
    .map((grenze) => pruefeEineGrenze(pressemitteilung, grenze))
    .filter((verstoss): verstoss is RegelVerstoss => verstoss !== null);

  return { bestanden: verstoesse.length === 0, verstoesse };
}
