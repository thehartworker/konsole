import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { fuehreRegelEngineAus } from '../../../src/w2/regel-engine/pruefung.js';
import type { Pruefregel } from '../../../src/w2/regel-engine/types.js';
import { GUTER_DRAFT, SCHLECHTER_DRAFT } from '../fixtures.js';

const KONTEXT = { sprachregelungVorhanden: true, fristAt: null };

function regel(overrides: Partial<Pruefregel>): Pruefregel {
  return {
    id: 'regel-test',
    handler_slug: 'W2_presseanfragen_drafter',
    typ: 'code_baustein',
    baustein_name: null,
    parameter: {},
    prompt_text: null,
    aktiv: true,
    reihenfolge: 1,
    ...overrides,
  };
}

describe('fuehreRegelEngineAus', () => {
  it('Kern-Beweis der Kundenagnostik: derselbe Draft besteht bei Kunde A, fällt bei Kunde B durch (unterschiedliche aktive Regeln)', async () => {
    // Draft ohne Tier-Nennung (besteht Kunde-A-Regel), aber mit einem
    // background_information-Eintrag ohne Quelle (fällt bei Kunde-B-Regel durch).
    const gemeinsamerDraft = {
      ...GUTER_DRAFT,
      background_information: [{ ...GUTER_DRAFT.background_information[0], sources: [] }],
    };

    const regelnKundeA: Pruefregel[] = [regel({ id: 'a1', baustein_name: 'keine_tier_nennung', reihenfolge: 1 })];
    const regelnKundeB: Pruefregel[] = [
      regel({ id: 'b1', baustein_name: 'background_mit_quellenangabe', reihenfolge: 1 }),
    ];

    const providerA = new MockLLMProvider({ antworten: [] });
    const providerB = new MockLLMProvider({ antworten: [] });

    const ergebnisA = await fuehreRegelEngineAus(gemeinsamerDraft, regelnKundeA, KONTEXT, providerA);
    const ergebnisB = await fuehreRegelEngineAus(gemeinsamerDraft, regelnKundeB, KONTEXT, providerB);

    expect(ergebnisA.ergebnis.bestanden).toBe(true);
    expect(ergebnisB.ergebnis.bestanden).toBe(false);
    expect(ergebnisB.ergebnis.verstoesse[0]?.baustein_name).toBe('background_mit_quellenangabe');
  });

  it('inaktive Regeln werden ignoriert', async () => {
    const regeln: Pruefregel[] = [
      regel({ id: 'inaktiv', baustein_name: 'keine_tier_nennung', aktiv: false, reihenfolge: 1 }),
    ];
    const provider = new MockLLMProvider({ antworten: [] });

    const ergebnis = await fuehreRegelEngineAus(SCHLECHTER_DRAFT, regeln, KONTEXT, provider);

    expect(ergebnis.ergebnis.bestanden).toBe(true);
  });

  it('unbekannter baustein_name wird fail-closed als Verstoß gewertet', async () => {
    const regeln: Pruefregel[] = [regel({ id: 'x', baustein_name: 'nicht_existierender_baustein', reihenfolge: 1 })];
    const provider = new MockLLMProvider({ antworten: [] });

    const ergebnis = await fuehreRegelEngineAus(GUTER_DRAFT, regeln, KONTEXT, provider);

    expect(ergebnis.ergebnis.bestanden).toBe(false);
    expect(ergebnis.ergebnis.verstoesse[0]?.begruendung).toContain('Unbekannter Baustein');
  });

  it('llm_prompt-Regeln lösen genau EINEN gebündelten Review-Call aus, unabhängig von der Regel-Anzahl', async () => {
    const regeln: Pruefregel[] = [
      regel({ id: 'l1', typ: 'llm_prompt', baustein_name: null, prompt_text: 'Regel eins', reihenfolge: 1 }),
      regel({ id: 'l2', typ: 'llm_prompt', baustein_name: null, prompt_text: 'Regel zwei', reihenfolge: 2 }),
    ];
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ verstoesse: [] }), tokenVerbrauch: { input_tokens: 50, output_tokens: 20 } }],
    });

    const ergebnis = await fuehreRegelEngineAus(GUTER_DRAFT, regeln, KONTEXT, provider);

    expect(provider.aufrufe).toHaveLength(1);
    expect(ergebnis.ergebnis.bestanden).toBe(true);
    expect(ergebnis.tokenVerbrauch).toEqual({ input_tokens: 50, output_tokens: 20 });
  });

  it('ordnet einen LLM-Review-Befund per regel_index der richtigen Regel zu', async () => {
    const regeln: Pruefregel[] = [
      regel({ id: 'l1', typ: 'llm_prompt', baustein_name: null, prompt_text: 'Keine Vermutungen', reihenfolge: 1 }),
      regel({ id: 'l2', typ: 'llm_prompt', baustein_name: null, prompt_text: 'Keine Framing-Risiken', reihenfolge: 2 }),
    ];
    const provider = new MockLLMProvider({
      antworten: [
        {
          text: JSON.stringify({ verstoesse: [{ regel_index: 1, begruendung: 'Framing-Risiko gefunden.' }] }),
          tokenVerbrauch: { input_tokens: 50, output_tokens: 20 },
        },
      ],
    });

    const ergebnis = await fuehreRegelEngineAus(GUTER_DRAFT, regeln, KONTEXT, provider);

    expect(ergebnis.ergebnis.bestanden).toBe(false);
    expect(ergebnis.ergebnis.verstoesse).toHaveLength(1);
    expect(ergebnis.ergebnis.verstoesse[0]).toMatchObject({ regel_id: 'l2', quelle: 'llm' });
  });

  it('kein LLM-Call, wenn keine llm_prompt-Regel aktiv ist', async () => {
    const regeln: Pruefregel[] = [regel({ id: 'c1', baustein_name: 'keine_tier_nennung', reihenfolge: 1 })];
    const provider = new MockLLMProvider({ antworten: [] });

    await fuehreRegelEngineAus(GUTER_DRAFT, regeln, KONTEXT, provider);

    expect(provider.aufrufe).toHaveLength(0);
  });

  it('nicht-valides JSON im Review-Pass wird als eigener Verstoß gemeldet statt zu werfen', async () => {
    const regeln: Pruefregel[] = [
      regel({ id: 'l1', typ: 'llm_prompt', baustein_name: null, prompt_text: 'Regel eins', reihenfolge: 1 }),
    ];
    const provider = new MockLLMProvider({
      antworten: [{ text: 'kein JSON', tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const ergebnis = await fuehreRegelEngineAus(GUTER_DRAFT, regeln, KONTEXT, provider);

    expect(ergebnis.ergebnis.bestanden).toBe(false);
    expect(ergebnis.ergebnis.verstoesse[0]?.begruendung).toContain('kein valides');
  });
});
