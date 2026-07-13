import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { erzeugeKritikerBefund } from '../../src/w1/kritiker.js';
import { GUTER_DRAFT } from './fixtures.js';

describe('erzeugeKritikerBefund', () => {
  it('gültige LLM-Antwort ohne Findings', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ kritiker_findings: [] }), tokenVerbrauch: { input_tokens: 300, output_tokens: 100 } }],
    });

    const resultat = await erzeugeKritikerBefund(GUTER_DRAFT, provider);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.findings).toHaveLength(0);
    }
  });

  it('gültige LLM-Antwort mit einem "hoch"-Finding', async () => {
    const findings = [{ schweregrad: 'hoch', finding: 'Zitat wirkt gestellt.', empfehlung: 'Zitat mit dem Sprecher abstimmen.' }];
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ kritiker_findings: findings }), tokenVerbrauch: { input_tokens: 300, output_tokens: 120 } }],
    });

    const resultat = await erzeugeKritikerBefund(GUTER_DRAFT, provider);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.findings).toEqual(findings);
    }
  });

  it('ungültiges JSON: fehlgeschlagen mit Token-Verbrauch', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: 'kein json', tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await erzeugeKritikerBefund(GUTER_DRAFT, provider);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('kein valides JSON');
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 10, output_tokens: 5 });
    }
  });

  it('LLM-Aufruf-Fehler (Timeout-Simulation): fehlgeschlagen ohne Token-Verbrauch', async () => {
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Timeout');
      },
    };

    const resultat = await erzeugeKritikerBefund(GUTER_DRAFT, provider);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Kritiker-Pass-Aufruf fehlgeschlagen');
    }
  });
});
