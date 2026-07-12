import { W2_DEFAULT_PRUEFREGELN } from '../../src/w2/regel-engine/default-template.js';
import type { Pruefregel, PruefregelDefinition } from '../../src/w2/regel-engine/types.js';
import type { CommsPlanDraft } from '../../src/w2/schema.js';
import type { W2AnfrageInput, W2Input, W2KundeKontextInput } from '../../src/w2/types.js';

export function pruefregelnAusDefinitionen(definitionen: PruefregelDefinition[]): Pruefregel[] {
  return definitionen.map((def, index) => ({ id: `regel-${index}`, ...def }));
}

export const DEFAULT_PRUEFREGELN: Pruefregel[] = pruefregelnAusDefinitionen(W2_DEFAULT_PRUEFREGELN);

export const ANFRAGE_BASIS: W2AnfrageInput = {
  medium_name: 'Süddeutsche Zeitung',
  journalist_name: 'Anna Journalistin',
  journalist_kontakt: 'anna@sz.example',
  ressort: 'Wirtschaft',
  thema_beschreibung: 'Rückruf eines Produkts',
  frist_at: '2026-07-15T15:00:00.000Z',
  fragen_woertlich: ['Wie viele Einheiten sind betroffen?', 'Wann wurde das Problem entdeckt?'],
  format_gewuenscht: 'schriftliche_antworten',
  sprecher_vorgeschlagen: 'Dr. Mara Beispiel',
  sprecher_rolle: 'Geschäftsführung',
};

export const KUNDE_KONTEXT_BASIS: W2KundeKontextInput = {
  kunde_slug: 'kunde-test',
  sprachregelungen_slug: 'kunde-test-sprachregelungen',
  thema_positionierung: 'Der Kunde positioniert sich transparent zu Produktrückrufen.',
};

export const W2_INPUT_BASIS: W2Input = { anfrage: ANFRAGE_BASIS, kunde_kontext: KUNDE_KONTEXT_BASIS };

export const ANFRAGE_ENGLISCH: W2AnfrageInput = {
  ...ANFRAGE_BASIS,
  thema_beschreibung: 'Product recall situation, need comment by Friday.',
  fragen_woertlich: ['How many units are affected?', 'When was the issue discovered?'],
};

export const W2_INPUT_ENGLISCH: W2Input = { anfrage: ANFRAGE_ENGLISCH, kunde_kontext: KUNDE_KONTEXT_BASIS };

export const GUTER_DRAFT: CommsPlanDraft = {
  what_were_doing: 'Wir bereiten eine schriftliche Antwort für die Süddeutsche Zeitung zum Produktrückruf vor.',
  strategic_objectives: {
    reputation: 'Transparenz wahren und Vertrauen der Öffentlichkeit erhalten.',
    risk: 'Vermeidung einer Eskalation durch unklare Kommunikation.',
  },
  reactive_statement: 'Wir nehmen die Situation ernst und informieren transparent bis 15.07.2026.',
  background_information: [
    {
      topic_field: 'Produktrückruf',
      content: 'Der Rückruf betrifft eine begrenzte Charge des Produkts X.',
      sources: ['Interne Qualitätssicherung, Bericht vom 10.07.2026'],
      strategy_note: 'Fokus auf Transparenz und schnelles Handeln.',
    },
  ],
  open_questions: [
    'Soll die Geschäftsführung persönlich zitiert werden? (Decide)',
    'Ist die Anzahl betroffener Einheiten bereits final? (Confirm)',
  ],
  key_messages: [],
};

/** Wie GUTER_DRAFT, aber ohne reactive_statement -- korrekt, wenn keine Sprachregelung vorhanden ist. */
export const GUTER_DRAFT_OHNE_REACTIVE_STATEMENT: CommsPlanDraft = {
  ...GUTER_DRAFT,
  reactive_statement: null,
};

/** Verletzt was_wir_tun_zielsprache (englischer Text in what_were_doing). */
export const ENGLISCHER_DRAFT: CommsPlanDraft = {
  ...GUTER_DRAFT,
  what_were_doing: 'We are preparing a written response for the Süddeutsche Zeitung regarding the product recall.',
};

/** Verletzt mehrere Bausteine gleichzeitig: Tier-Nennung, fehlende Quelle, Action-Item außerhalb open_questions, Agentur-Vermittlungsbezug. */
export const SCHLECHTER_DRAFT: CommsPlanDraft = {
  what_were_doing: 'Unsere Agentur hat die Anfrage an die Geschäftsführung weitergeleitet. TODO: Rückmeldung einholen.',
  strategic_objectives: {
    reputation: 'Tier-1-Medien sollen positiv berichten.',
    risk: 'Gering.',
  },
  reactive_statement: null,
  background_information: [
    {
      topic_field: 'Produktrückruf',
      content: 'Der Rückruf betrifft eine begrenzte Charge.',
      sources: [],
      strategy_note: 'Keine besondere Strategie.',
    },
  ],
  open_questions: ['Ist die Anzahl final?'],
  key_messages: [],
};
