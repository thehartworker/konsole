import type { PressemitteilungDraft } from '../../src/w1/schema.js';
import type { W1BriefingInput, W1Input, W1KundeKontextInput } from '../../src/w1/types.js';

export const BRIEFING_BASIS: W1BriefingInput = {
  anlass: 'Neue Produktlinie',
  kernbotschaft: 'Der Kunde bringt eine nachhaltigere Verpackung auf den Markt.',
  fakten: ['Marktstart zum 01.09.2026', 'Reduktion des Plastikanteils um 40 Prozent'],
  zitat_sprecher: 'Dr. Mara Beispiel',
  zitat_kernaussage: 'Wir übernehmen Verantwortung für die Umwelt.',
  ziel_medien_gruppe: 'Fachpresse Handel',
  boilerplate_referenz: null,
  laenge_ziel: 'standard',
  sperrfrist_at: null,
  zusatz_hinweis: null,
};

export const KUNDE_KONTEXT_BASIS: W1KundeKontextInput = {
  kunde_slug: 'kunde-test',
  tonalitaet: {
    grundton: 'sachlich',
    stil_parameter: { satzlaenge: 'kurz' },
    anrede_konvention: 'sie',
    gendering_konvention: 'gender-doppelpunkt',
  },
};

export const W1_INPUT_BASIS: W1Input = { briefing: BRIEFING_BASIS, kunde_kontext: KUNDE_KONTEXT_BASIS };

export const GUTER_DRAFT: PressemitteilungDraft = {
  headline: 'Kunde X reduziert Plastikanteil neuer Verpackung um 40 Prozent',
  sub_headline: 'Marktstart der neuen Produktlinie zum 1. September 2026',
  ort_datum: 'München, 13. Juli 2026',
  lead_absatz:
    'Kunde X bringt zum 1. September 2026 eine neue Produktlinie mit reduziertem Plastikanteil auf den Markt, um die eigene Umweltbilanz zu verbessern.',
  ausfuehrung_absaetze: [
    'Die neue Verpackung reduziert den Plastikanteil um 40 Prozent gegenüber der Vorgängerversion.',
    'Der Marktstart erfolgt zunächst im deutschsprachigen Raum, eine europaweite Einführung ist für 2027 geplant.',
  ],
  zitat: {
    text: 'Wir übernehmen Verantwortung für die Umwelt.',
    sprecher_name: 'Dr. Mara Beispiel',
    sprecher_rolle: 'Geschäftsführung',
  },
  boilerplate: 'Kunde X ist ein führender Anbieter nachhaltiger Konsumgüter.',
  kontakt_fusszeile: 'Kontakt: Kommunikationsabteilung, presse@kunde-x.example',
  laenge_worte: 120,
};

export const GUTER_DRAFT_OHNE_ZITAT: PressemitteilungDraft = {
  ...GUTER_DRAFT,
  zitat: null,
};
