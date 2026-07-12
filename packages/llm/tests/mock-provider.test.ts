import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '../src/testing/mock-provider.js';

describe('MockLLMProvider', () => {
  it('liefert konfigurierte Antworten der Reihe nach', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: 'erste', tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } },
        { text: 'zweite', tokenVerbrauch: { input_tokens: 2, output_tokens: 2 } },
      ],
    });

    const anfrage = { system: 'sys', prompt: 'p', model: 'mock', max_tokens: 10 };
    const erste = await provider.strukturierteCompletion(anfrage);
    const zweite = await provider.strukturierteCompletion(anfrage);

    expect(erste.text).toBe('erste');
    expect(zweite.text).toBe('zweite');
  });

  it('zeichnet alle Aufrufe auf', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: '{}', tokenVerbrauch: { input_tokens: 0, output_tokens: 0 } }],
    });
    const anfrage = { system: 'sys', prompt: 'meine Nachricht', model: 'mock', max_tokens: 10 };

    await provider.strukturierteCompletion(anfrage);

    expect(provider.aufrufe).toHaveLength(1);
    expect(provider.aufrufe[0].prompt).toBe('meine Nachricht');
  });

  it('wirft, wenn keine Antwort konfiguriert ist', async () => {
    const provider = new MockLLMProvider({ antworten: [] });
    await expect(
      provider.strukturierteCompletion({ system: 's', prompt: 'p', model: 'mock', max_tokens: 10 }),
    ).rejects.toThrow('keine Antwort konfiguriert');
  });
});
