// Test-Fixtures für die Profil-Extraktion (Issue #37). Ein vollständig
// belegter Positiv-Output plus ein Output mit einer unbelegten Kennzahl
// (Konservativ-Prinzip-Test) und ein schema-verletzender Output.

import type { ProfilExtraktionsVorschlag } from '../src/schema.js';

export const TEXT_GESCHAEFTSBERICHT = [
  'Musterfirma GmbH, Sitz in München. Wir sind ein technisches Beratungsunternehmen für nachhaltige Energie.',
  'Unser Sprecher für Presseanfragen ist Dr. Anna Beispiel, Leiterin Kommunikation. Zitate dürfen frei verwendet werden.',
  'Zum Stichtag 31.12.2025 beschäftigten wir 128 Mitarbeitende (Quelle: Jahresabschluss 2025).',
  'Wir kommentieren grundsätzlich keine laufenden Rechtsstreitigkeiten.',
].join('\n');

export const VOLLSTAENDIGER_OUTPUT: ProfilExtraktionsVorschlag = {
  fakten: {
    rechtsform: 'GmbH',
    sitz: 'München',
    geschaeftsbeschreibung: 'Technisches Beratungsunternehmen für nachhaltige Energie',
  },
  stimme: {
    grundton: 'technisch_praezise',
    anrede_konvention: 'sie',
    gendering_konvention: null,
    zielsprache_absender_texte: 'de',
  },
  strategie: {
    positionierung: null,
    usp: null,
  },
  boilerplate: [],
  kennzahlen: [
    { bezeichnung: 'Mitarbeitende', wert: '128', stichtag: '2025-12-31', quelle: 'Jahresabschluss 2025' },
  ],
  sprecher: [
    { name: 'Dr. Anna Beispiel', rolle: 'Leiterin Kommunikation', exakte_schreibweise: 'Dr. Anna Beispiel', zitat_freigabe: true },
  ],
  kernbotschaften: [],
  themen: [],
  grenzen: [
    { typ: 'no_go_thema', inhalt: 'laufende Rechtsstreitigkeiten', textart_geltungsbereich: null },
  ],
  medien_kontext: [],
  unklare_hinweise: [],
};

// Enthält eine Kennzahl OHNE Stichtag/Quelle (Modell hat trotz Prompt
// geraten) -- muss vom Konservativ-Filter verworfen werden, siehe
// tests/konservativ.test.ts / tests/extrahiere.test.ts.
export const OUTPUT_MIT_UNBELEGTER_KENNZAHL: ProfilExtraktionsVorschlag = {
  ...VOLLSTAENDIGER_OUTPUT,
  kennzahlen: [
    { bezeichnung: 'Mitarbeitende', wert: '128', stichtag: '2025-12-31', quelle: 'Jahresabschluss 2025' },
    { bezeichnung: 'Umsatz', wert: '50 Mio. EUR', stichtag: null, quelle: null },
  ],
};

// Verletzt das Schema: grundton ist kein gültiger Enum-Wert.
export const SCHLECHTER_OUTPUT: unknown = {
  ...VOLLSTAENDIGER_OUTPUT,
  stimme: { ...VOLLSTAENDIGER_OUTPUT.stimme, grundton: 'lustig' },
};
