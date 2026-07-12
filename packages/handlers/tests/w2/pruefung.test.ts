import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { sammleW2Kontext } from '../../src/w2/kontext.js';
import { fuehreCodeChecksAus, fuehreReviewPromptAus, formatiereDeadline } from '../../src/w2/pruefung.js';
import {
  DRAFT_ENGLISCH,
  DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG,
  DRAFT_MIT_TIER_NENNUNG,
  GUTER_DRAFT,
  TOKEN_VERBRAUCH_STANDARD,
  W2_INPUT_MIT_FRIST,
  W2_INPUT_STANDARD,
} from './fixtures.js';

describe('fuehreCodeChecksAus', () => {
  it('meldet keinen Verstoß für einen sauberen deutschen Draft', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const verstoesse = fuehreCodeChecksAus(GUTER_DRAFT, W2_INPUT_STANDARD, kontext);
    expect(verstoesse).toEqual([]);
  });

  it('erkennt englischsprachigen what_were_doing-Text als Sprach-Regel-Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const verstoesse = fuehreCodeChecksAus(DRAFT_ENGLISCH, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('sprache_what_were_doing');
  });

  it('erkennt eine Tier-Nennung als Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const verstoesse = fuehreCodeChecksAus(DRAFT_MIT_TIER_NENNUNG, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('keine_tier_nennung');
  });

  it('erkennt reactive_statement ohne vorhandene Sprachregelung als Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD); // Default-Provider: keine Sprachregelung
    const verstoesse = fuehreCodeChecksAus(
      DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG,
      W2_INPUT_STANDARD,
      kontext,
    );
    expect(verstoesse.map((v) => v.regel)).toContain('reactive_statement_nur_bei_sprachregelung');
  });

  it('erlaubt reactive_statement, wenn eine Sprachregelung vorliegt', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD, {
      async sprachregelungLaden() {
        return { text: 'Offizielle Position des Kunden.' };
      },
      async ssotLaden() {
        return null;
      },
      async praezedenzenLaden() {
        return null;
      },
      async journalistenProfilLaden() {
        return null;
      },
    });
    const verstoesse = fuehreCodeChecksAus(
      DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG,
      W2_INPUT_STANDARD,
      kontext,
    );
    expect(verstoesse.map((v) => v.regel)).not.toContain('reactive_statement_nur_bei_sprachregelung');
  });

  it('meldet fehlende Quellenangabe in background_information als Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const draftOhneQuelle = {
      ...GUTER_DRAFT,
      background_information: [{ ...GUTER_DRAFT.background_information[0]!, sources: [] }],
    };
    const verstoesse = fuehreCodeChecksAus(draftOhneQuelle, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('background_mit_quellenangabe');
  });

  it('meldet einen Action-Item-Marker außerhalb von open_questions als Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const draftMitActionItem = {
      ...GUTER_DRAFT,
      what_were_doing: `${GUTER_DRAFT.what_were_doing} To-Do: Rückruf einplanen.`,
    };
    const verstoesse = fuehreCodeChecksAus(draftMitActionItem, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('action_items_nur_in_open_questions');
  });

  it('erwartet den standardisierten Deadline-Schlusssatz, wenn frist_at gesetzt ist', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_MIT_FRIST);
    const verstoesseOhneSchlusssatz = fuehreCodeChecksAus(GUTER_DRAFT, W2_INPUT_MIT_FRIST, kontext);
    expect(verstoesseOhneSchlusssatz.map((v) => v.regel)).toContain('deadline_schlusssatz_bei_frist');

    const kanonischeFrist = formatiereDeadline(W2_INPUT_MIT_FRIST.anfrage.frist_at!);
    const draftMitSchlusssatz = {
      ...GUTER_DRAFT,
      open_questions: [...GUTER_DRAFT.open_questions, `Frist beachten: ${kanonischeFrist}`],
    };
    const verstoesseMitSchlusssatz = fuehreCodeChecksAus(draftMitSchlusssatz, W2_INPUT_MIT_FRIST, kontext);
    expect(verstoesseMitSchlusssatz.map((v) => v.regel)).not.toContain('deadline_schlusssatz_bei_frist');
  });

  it('erkennt ein nicht-kanonisches Datumsformat als Verstoß', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const draftMitFalschemFormat = {
      ...GUTER_DRAFT,
      open_questions: [...GUTER_DRAFT.open_questions, 'Frist ist der 15.7.26, bitte beachten.'],
    };
    const verstoesse = fuehreCodeChecksAus(draftMitFalschemFormat, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('deadline_format_standardisiert');
  });

  it('erkennt eine Paraphrase einer wörtlichen Journalisten-Frage als Verstoß (questions_verbatim)', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const originalFrage = W2_INPUT_STANDARD.anfrage.fragen_woertlich[0]!;
    const paraphrasiert = originalFrage.toUpperCase(); // gleicher normalisierter Inhalt, nicht wortwörtlich
    const draftMitParaphrase = {
      ...GUTER_DRAFT,
      background_information: [
        {
          ...GUTER_DRAFT.background_information[0]!,
          content: `Zur Frage "${paraphrasiert}" liegt bereits eine Einschätzung vor.`,
        },
      ],
    };
    const verstoesse = fuehreCodeChecksAus(draftMitParaphrase, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).toContain('questions_verbatim');
  });

  it('akzeptiert eine wortwörtliche Übernahme der Journalisten-Frage', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const originalFrage = W2_INPUT_STANDARD.anfrage.fragen_woertlich[0]!;
    const draftMitWortwoertlicherFrage = {
      ...GUTER_DRAFT,
      background_information: [
        {
          ...GUTER_DRAFT.background_information[0]!,
          content: `Zur Frage "${originalFrage}" liegt bereits eine Einschätzung vor.`,
        },
      ],
    };
    const verstoesse = fuehreCodeChecksAus(draftMitWortwoertlicherFrage, W2_INPUT_STANDARD, kontext);
    expect(verstoesse.map((v) => v.regel)).not.toContain('questions_verbatim');
  });
});

describe('formatiereDeadline', () => {
  it('formatiert einen ISO-Zeitstempel im Standard-Format "TT.MM.JJJJ, HH:MM Uhr"', () => {
    expect(formatiereDeadline('2026-07-15T14:30:00.000Z')).toBe('15.07.2026, 14:30 Uhr');
  });
});

describe('fuehreReviewPromptAus', () => {
  it('parst eine valide Review-Antwort und markiert die Quelle als review_prompt', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        {
          text: JSON.stringify({
            verstoesse: [{ regel: 'keine_vermutungen', begruendung: 'Unbelegte Spekulation im Text.' }],
          }),
          tokenVerbrauch: TOKEN_VERBRAUCH_STANDARD,
        },
      ],
    });

    const resultat = await fuehreReviewPromptAus(GUTER_DRAFT, provider, { model: 'mock-model' });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.verstoesse).toEqual([
        { regel: 'keine_vermutungen', quelle: 'review_prompt', begruendung: 'Unbelegte Spekulation im Text.' },
      ]);
    }
  });

  it('markiert eine schema-verletzende Review-Antwort als fehlgeschlagen, gibt aber den Token-Verbrauch zurück', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ foo: 'bar' }), tokenVerbrauch: TOKEN_VERBRAUCH_STANDARD }],
    });

    const resultat = await fuehreReviewPromptAus(GUTER_DRAFT, provider, { model: 'mock-model' });

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.tokenVerbrauch).toEqual(TOKEN_VERBRAUCH_STANDARD);
    }
  });
});
