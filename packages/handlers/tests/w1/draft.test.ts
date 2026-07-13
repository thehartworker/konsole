import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { erzeugePressemitteilungDraft } from '../../src/w1/draft.js';
import { sammleKontext } from '../../src/w1/kontext.js';
import { GUTER_DRAFT, W1_INPUT_BASIS } from './fixtures.js';

describe('erzeugePressemitteilungDraft', () => {
  it('gültige LLM-Antwort: erfolgreicher Draft mit Token-Verbrauch', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS);
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 400, output_tokens: 250 } }],
    });

    const resultat = await erzeugePressemitteilungDraft(W1_INPUT_BASIS, kontext, provider);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.draft.headline).toBe(GUTER_DRAFT.headline);
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 400, output_tokens: 250 });
    }
  });

  it('ungültiges JSON: fehlgeschlagen mit Token-Verbrauch (bereits abgerechnet)', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS);
    const provider = new MockLLMProvider({
      antworten: [{ text: 'kein json', tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await erzeugePressemitteilungDraft(W1_INPUT_BASIS, kontext, provider);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('kein valides JSON');
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 10, output_tokens: 5 });
    }
  });

  it('Zod-Validierungsfehler: fehlgeschlagen mit konkreter Fehlermeldung', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS);
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ unsinn: true }), tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await erzeugePressemitteilungDraft(W1_INPUT_BASIS, kontext, provider);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Zod-Validierung fehlgeschlagen');
    }
  });

  it('LLM-Aufruf-Fehler: fehlgeschlagen ohne Token-Verbrauch', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS);
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Netzwerkfehler');
      },
    };

    const resultat = await erzeugePressemitteilungDraft(W1_INPUT_BASIS, kontext, provider);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('LLM-Aufruf fehlgeschlagen');
      expect(resultat.tokenVerbrauch).toBeUndefined();
    }
  });
});
