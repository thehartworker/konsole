import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { presseanfragenDrafter } from '../../src/w2/handler.js';
import { W2_FREIGABE_GRUND } from '../../src/w2/types.js';
import {
  DRAFT_ENGLISCH,
  DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG,
  DRAFT_MIT_TIER_NENNUNG,
  GUTER_DRAFT,
  LEERE_REVIEW_ANTWORT,
  W2_INPUT_ENGLISCHE_ANFRAGE,
  W2_INPUT_STANDARD,
} from './fixtures.js';

function antwort(objekt: unknown, tokenVerbrauch: { input_tokens: number; output_tokens: number }) {
  return { text: JSON.stringify(objekt), tokenVerbrauch };
}

describe('presseanfragenDrafter', () => {
  it('(Shadow-Mode) löst nichts aus und gibt nur den Plan zurück, benoetigt_menschliche_freigabe ist immer true', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(GUTER_DRAFT, { input_tokens: 500, output_tokens: 300 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 200, output_tokens: 100 }),
      ],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;

    expect(resultat.output.benoetigt_menschliche_freigabe).toBe(true);
    expect(resultat.output.freigabe_grund).toBe(W2_FREIGABE_GRUND);
    expect(resultat.output.pruefung.versuche).toBe(1);
    expect(resultat.output.pruefung.alle_regeln_bestanden).toBe(true);
    // Genau zwei LLM-Aufrufe (Draft + Review), kein dritter Aufruf für Versand
    // o.ä. -- der Handler hat keinen Code-Pfad, der etwas auslösen könnte.
    expect(provider.aufrufe).toHaveLength(2);
    expect(resultat.llmAufrufe.map((a) => a.zweck)).toEqual(['w2_draft', 'w2_review']);
  });

  it('(Sprach-Regel) interne Felder bleiben deutsch bei einer englischsprachigen Anfrage, wenn das LLM korrekt antwortet (kein Retry nötig)', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(GUTER_DRAFT, { input_tokens: 500, output_tokens: 300 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 200, output_tokens: 100 }),
      ],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_ENGLISCHE_ANFRAGE, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;
    expect(resultat.output.comms_plan.what_were_doing).toBe(GUTER_DRAFT.what_were_doing);
    expect(resultat.output.pruefung.versuche).toBe(1);
  });

  it('(19-Punkte-Check-Retry) ein englischsprachiger Draft wird als Verstoß erkannt und per Retry korrigiert', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(DRAFT_ENGLISCH, { input_tokens: 100, output_tokens: 50 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 80, output_tokens: 40 }),
        antwort(GUTER_DRAFT, { input_tokens: 120, output_tokens: 60 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 90, output_tokens: 45 }),
      ],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_ENGLISCHE_ANFRAGE, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;

    expect(resultat.output.pruefung.versuche).toBe(2);
    expect(resultat.output.pruefung.alle_regeln_bestanden).toBe(true);
    expect(resultat.output.comms_plan.what_were_doing).toBe(GUTER_DRAFT.what_were_doing);

    // Der korrigierende Prompt für den zweiten Draft-Versuch enthält die
    // vorherigen Verstöße.
    const zweiterDraftAufruf = provider.aufrufe[2]!;
    expect(zweiterDraftAufruf.prompt).toContain('KORREKTUR NÖTIG');
    expect(zweiterDraftAufruf.prompt).toContain('sprache_what_were_doing');

    // Token-Aggregation über alle vier Aufrufe hinweg.
    expect(resultat.output.audit_metadaten.tokens_input).toBe(100 + 80 + 120 + 90);
    expect(resultat.output.audit_metadaten.tokens_output).toBe(50 + 40 + 60 + 45);
    expect(resultat.llmAufrufe).toHaveLength(4);
  });

  it('(Fallback nach 3 Retries) ein dauerhaft verletzender Draft geht nach 4 Versuchen mit Findings raus, statt zu blockieren', async () => {
    const einAttempt = [
      antwort(DRAFT_MIT_TIER_NENNUNG, { input_tokens: 10, output_tokens: 5 }),
      antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 10, output_tokens: 5 }),
    ];
    const provider = new MockLLMProvider({
      antworten: [...einAttempt, ...einAttempt, ...einAttempt, ...einAttempt],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;

    expect(resultat.output.pruefung.versuche).toBe(4);
    expect(resultat.output.pruefung.alle_regeln_bestanden).toBe(false);
    expect(resultat.output.pruefung.verstoesse.map((v) => v.regel)).toContain('keine_tier_nennung');
    // Trotz ungelöster Verstöße: der Plan geht raus (mit Findings), nicht blockiert.
    expect(resultat.output.benoetigt_menschliche_freigabe).toBe(true);
    expect(resultat.llmAufrufe).toHaveLength(8);
  });

  it('(Fallback: keine Sprachregelung) ein fälschlich gesetztes reactive_statement wird per Retry auf null korrigiert, plus Hinweis in open_questions', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(DRAFT_MIT_REACTIVE_STATEMENT_OHNE_SPRACHREGELUNG, { input_tokens: 10, output_tokens: 5 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 10, output_tokens: 5 }),
        antwort(GUTER_DRAFT, { input_tokens: 10, output_tokens: 5 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 10, output_tokens: 5 }),
      ],
    });

    // W2_INPUT_STANDARD nutzt den Default-Stub-Kontext-Provider: keine
    // Sprachregelung hinterlegt (siehe fixtures.ts / kontext.ts-Default).
    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;

    expect(resultat.output.comms_plan.reactive_statement).toBeNull();
    expect(resultat.output.pruefung.versuche).toBe(2);
    expect(
      resultat.output.comms_plan.open_questions.some((frage) => frage.includes('Sprachregelung')),
    ).toBe(true);
  });

  it('(Fallback: keine Präzedenzen) fügt einen "Onboarding empfohlen"-Hinweis in open_questions ein', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(GUTER_DRAFT, { input_tokens: 500, output_tokens: 300 }),
        antwort(LEERE_REVIEW_ANTWORT, { input_tokens: 200, output_tokens: 100 }),
      ],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status !== 'erfolg') return;
    expect(
      resultat.output.comms_plan.open_questions.some((frage) => frage.includes('Onboarding empfohlen')),
    ).toBe(true);
  });

  it('gibt bei einem schema-verletzenden Draft-Output ein Fehlschlags-Resultat zurück, inklusive des bereits abgerechneten Token-Verbrauchs', async () => {
    const provider = new MockLLMProvider({
      antworten: [antwort({ foo: 'bar' }, { input_tokens: 111, output_tokens: 22 })],
    });

    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status !== 'fehlgeschlagen') return;
    expect(resultat.llmAufrufe).toHaveLength(1);
    expect(resultat.llmAufrufe[0]).toMatchObject({
      zweck: 'w2_draft',
      tokens_input: 111,
      tokens_output: 22,
    });
  });

  it('gibt bei einem reinen LLM-Aufruf-Fehler (kein Response) ein Fehlschlags-Resultat ohne llm-Aufruf-Eintrag zurück', async () => {
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Netzwerk-Timeout');
      },
    };

    const resultat = await presseanfragenDrafter(W2_INPUT_STANDARD, { llmProvider: provider });

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status !== 'fehlgeschlagen') return;
    expect(resultat.fehler).toContain('Netzwerk-Timeout');
    expect(resultat.llmAufrufe).toHaveLength(0);
  });
});
