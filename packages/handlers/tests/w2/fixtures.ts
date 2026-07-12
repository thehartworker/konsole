import type { W2Input } from '../../src/w2/types.js';
import type { CommsPlanLlmAusgabe, ReviewLlmAusgabe } from '../../src/w2/schema.js';

export const W2_INPUT_STANDARD: W2Input = {
  anfrage: {
    medium_name: 'Wirtschafts-Rundschau',
    journalist_name: 'Petra Beispiel',
    journalist_kontakt: 'p.beispiel@wirtschafts-rundschau.example',
    ressort: 'Wirtschaft',
    thema_beschreibung: 'Marktentwicklung im Segment der Beispielbranche',
    frist_at: null,
    fragen_woertlich: ['Wie bewerten Sie die aktuelle Marktlage?'],
    format_gewuenscht: 'schriftliche_antworten',
    sprecher_vorgeschlagen: 'Max Mustermann',
    sprecher_rolle: 'Geschäftsführer',
  },
  kunde_kontext: {
    kunde_slug: 'beispiel-kunde',
    sprachregelungen_slug: 'beispiel-kunde-marktentwicklung',
    thema_positionierung: 'Der Kunde sieht sich als Marktführer mit stabiler Position.',
  },
};

export const W2_INPUT_MIT_FRIST: W2Input = {
  ...W2_INPUT_STANDARD,
  anfrage: {
    ...W2_INPUT_STANDARD.anfrage,
    frist_at: '2026-07-15T14:30:00.000Z',
  },
};

export const W2_INPUT_ENGLISCHE_ANFRAGE: W2Input = {
  ...W2_INPUT_STANDARD,
  anfrage: {
    ...W2_INPUT_STANDARD.anfrage,
    medium_name: 'Business Weekly',
    thema_beschreibung: 'How is the company handling the current market shift?',
    fragen_woertlich: ['How do you assess the current market situation?'],
  },
};

export const GUTER_DRAFT: CommsPlanLlmAusgabe = {
  what_were_doing: 'Die Redaktion hat eine Anfrage zum Thema Marktentwicklung gestellt, und wir bereiten eine sachliche und faktenbasierte Antwort vor, die sich auf die aktuelle Situation des Kunden bezieht.',
  strategic_objectives: {
    reputation: 'Die Position des Kunden als Marktführer ruhig und sachlich darstellen.',
    risk: 'Keine zusätzlichen Angriffsflächen durch unklare oder spekulative Aussagen schaffen.',
  },
  reactive_statement: null,
  background_information: [
    {
      topic_field: 'Marktposition',
      content: 'Der Kunde ist seit zehn Jahren Marktführer in diesem Segment.',
      sources: ['Kunden-Website'],
      strategy_note: 'Kann unverändert übernommen werden.',
    },
  ],
  open_questions: ['Wer soll als Sprecher benannt werden?'],
};

export const DRAFT_MIT_TIER_NENNUNG: CommsPlanLlmAusgabe = {
  what_were_doing: 'Die Anfrage kommt von einem Tier 1 Medium und wird entsprechend priorisiert bearbeitet.',
  strategic_objectives: {
    reputation: 'Die Position des Kunden ruhig darstellen.',
    risk: 'Keine zusätzlichen Angriffsflächen schaffen.',
  },
  reactive_statement: null,
  background_information: [
    {
      topic_field: 'Medium',
      content: 'Das Medium berichtet regelmäßig über die Branche.',
      sources: ['Redaktions-Website'],
      strategy_note: 'Neutral bleiben.',
    },
  ],
  open_questions: ['Wer antwortet?'],
};

export const DRAFT_ENGLISCH: CommsPlanLlmAusgabe = {
  what_were_doing:
    'We are currently working on a response to the journalist and will follow up with more information soon regarding this topic and the current situation.',
  strategic_objectives: {
    reputation: 'Present the client position calmly and factually to the outside world at all times.',
    risk: 'Avoid creating any additional attack surface through unclear or speculative statements here.',
  },
  reactive_statement: null,
  background_information: [
    {
      topic_field: 'Marktposition',
      content: 'Der Kunde ist seit zehn Jahren Marktführer in diesem Segment.',
      sources: ['Kunden-Website'],
      strategy_note: 'Kann unverändert übernommen werden.',
    },
  ],
  open_questions: ['Wer soll als Sprecher benannt werden?'],
};

export const DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG: CommsPlanLlmAusgabe = {
  ...GUTER_DRAFT,
  reactive_statement: 'Wir nehmen die aktuelle Entwicklung zur Kenntnis und äußern uns wie folgt dazu.',
};

export const LEERE_REVIEW_ANTWORT: ReviewLlmAusgabe = { verstoesse: [] };

export const TOKEN_VERBRAUCH_STANDARD = { input_tokens: 500, output_tokens: 300 };
