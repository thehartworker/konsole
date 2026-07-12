import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { fuehreW2Aus } from '../../src/w2/handler.js';
import type { Pruefregel } from '../../src/w2/regel-engine/types.js';
import type { PraezedenzEintrag, SprachregelungsEintrag, W2KontextQuellenProvider } from '../../src/w2/types.js';
import {
  DEFAULT_PRUEFREGELN,
  ENGLISCHER_DRAFT,
  GUTER_DRAFT,
  GUTER_DRAFT_OHNE_REACTIVE_STATEMENT,
  SCHLECHTER_DRAFT,
  W2_INPUT_BASIS,
} from './fixtures.js';

class MitSprachregelungProvider implements W2KontextQuellenProvider {
  async sprachregelungenLaden(): Promise<SprachregelungsEintrag[]> {
    return [{ thema: 'Produktrückruf', position_text: 'Wir kommunizieren transparent.' }];
  }
  async praezedenzenLaden(): Promise<PraezedenzEintrag[]> {
    return [{ anfrage_thema: 'Rückruf', antwort_auszug: 'Frühere Antwort zu einem ähnlichen Fall.' }];
  }
}

function regel(baustein_name: string, reihenfolge = 1): Pruefregel {
  return {
    id: `regel-${baustein_name}`,
    handler_slug: 'W2_presseanfragen_drafter',
    typ: 'code_baustein',
    baustein_name,
    parameter: {},
    prompt_text: null,
    aktiv: true,
    reihenfolge,
  };
}

describe('fuehreW2Aus', () => {
  it('(a) erfolgreicher Lauf beim ersten Versuch: Draft besteht die Regel-Engine sofort', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } },
        { text: JSON.stringify({ verstoesse: [] }), tokenVerbrauch: { input_tokens: 200, output_tokens: 50 } },
      ],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, DEFAULT_PRUEFREGELN, provider, {}, new MitSprachregelungProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.pruefung.bestanden).toBe(true);
      expect(resultat.output.pruefung.versuche).toBe(1);
      expect(resultat.output.benoetigt_menschliche_freigabe).toBe(true);
    }
    expect(resultat.llmAufrufe).toHaveLength(2);
  });

  it('(b) Sprach-Regel technisch durchgesetzt: ein englischer Draft wird per Retry mit korrigierendem Prompt zu Deutsch korrigiert', async () => {
    const regeln = [regel('was_wir_tun_zielsprache', 1)];
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(ENGLISCHER_DRAFT), tokenVerbrauch: { input_tokens: 400, output_tokens: 200 } },
        { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 450, output_tokens: 220 } },
      ],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, regeln, provider, {}, new MitSprachregelungProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.pruefung.versuche).toBe(2);
      expect(resultat.output.pruefung.bestanden).toBe(true);
      expect(resultat.output.comms_plan.what_were_doing).toBe(GUTER_DRAFT.what_were_doing);
    }
    // zwei Draft-Aufrufe, kein Review-Call (regeln enthält keine llm_prompt-Regel)
    expect(resultat.llmAufrufe.filter((a) => a.zweck === 'draft')).toHaveLength(2);
    expect(resultat.llmAufrufe.filter((a) => a.zweck === 'review')).toHaveLength(0);

    // Der zweite Prompt muss den Korrektur-Hinweis aus der ersten Prüfung enthalten.
    expect(provider.aufrufe[1]?.prompt).toContain('NICHT bestanden');
  });

  it('(c) Fallback nach 3 gescheiterten Versuchen: der letzte Draft geht MIT Findings raus, kein Fehlschlag des Gesamtlaufs', async () => {
    const regeln = [regel('keine_tier_nennung', 1)];
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(SCHLECHTER_DRAFT), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } }],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, regeln, provider, {}, new MitSprachregelungProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.pruefung.bestanden).toBe(false);
      expect(resultat.output.pruefung.versuche).toBe(3);
      expect(resultat.output.pruefung.verstoesse.length).toBeGreaterThan(0);
      expect(resultat.output.comms_plan.what_were_doing).toBe(SCHLECHTER_DRAFT.what_were_doing);
    }
    expect(resultat.llmAufrufe).toHaveLength(3);
  });

  it('(d) Shadow-Mode: löst nichts aus, keine unerklärten Zusatz-Calls über die gezählten LLM-Aufrufe hinaus', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } },
        { text: JSON.stringify({ verstoesse: [] }), tokenVerbrauch: { input_tokens: 200, output_tokens: 50 } },
      ],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, DEFAULT_PRUEFREGELN, provider, {}, new MitSprachregelungProvider());

    expect(provider.aufrufe).toHaveLength(resultat.llmAufrufe.length);
    if (resultat.status === 'erfolg') {
      expect(resultat.output).not.toHaveProperty('versendet');
      expect(resultat.output).not.toHaveProperty('handler_ausgeloest');
    }
  });

  it('(e) Zod-Validierung: bei durchgehend ungültigen Draft-Antworten ist der Gesamtlauf fehlgeschlagen', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ unsinn: true }), tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, [], provider, {}, new MitSprachregelungProvider());

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Zod-Validierung fehlgeschlagen');
    }
    expect(resultat.llmAufrufe).toHaveLength(3); // jeder der 3 Versuche wurde abgerechnet
  });

  it('(f) Token-Verbrauch wird über alle LLM-Aufrufe korrekt aufsummiert', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } },
        { text: JSON.stringify({ verstoesse: [] }), tokenVerbrauch: { input_tokens: 200, output_tokens: 50 } },
      ],
    });

    const resultat = await fuehreW2Aus(W2_INPUT_BASIS, DEFAULT_PRUEFREGELN, provider, {}, new MitSprachregelungProvider());

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.audit_metadaten.tokens_input).toBe(700);
      expect(resultat.output.audit_metadaten.tokens_output).toBe(350);
    }
  });

  it('(g) Fallback-Hinweise aus Stage 1 (leere Sprachregelungen/Präzedenzen) landen im Output', async () => {
    const inputOhneFrist = { ...W2_INPUT_BASIS, anfrage: { ...W2_INPUT_BASIS.anfrage, frist_at: null } };
    const provider = new MockLLMProvider({
      antworten: [
        {
          text: JSON.stringify(GUTER_DRAFT_OHNE_REACTIVE_STATEMENT),
          tokenVerbrauch: { input_tokens: 300, output_tokens: 150 },
        },
        { text: JSON.stringify({ verstoesse: [] }), tokenVerbrauch: { input_tokens: 100, output_tokens: 30 } },
      ],
    });

    // kein kontextProvider übergeben -> LeererW2KontextQuellenProvider-Default.
    const resultat = await fuehreW2Aus(inputOhneFrist, DEFAULT_PRUEFREGELN, provider);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.hinweise.some((h) => h.includes('Sprachregelungen'))).toBe(true);
      expect(resultat.output.hinweise.some((h) => h.includes('Onboarding empfohlen'))).toBe(true);
    }
  });
});
