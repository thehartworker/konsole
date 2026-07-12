import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../src/anthropic-provider.js';

function fakeFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe('AnthropicProvider', () => {
  it('akzeptiert einen explizit übergebenen apiKey ohne Env-Variable', () => {
    expect(() => new AnthropicProvider({ apiKey: 'sk-test' })).not.toThrow();
  });

  it('wirft, wenn weder Env-Variable noch Options.apiKey gesetzt sind', () => {
    const zuvor = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicProvider()).toThrow('ANTHROPIC_API_KEY fehlt');
    } finally {
      if (zuvor !== undefined) process.env.ANTHROPIC_API_KEY = zuvor;
    }
  });

  it('sendet Modell, max_tokens, system und Prompt korrekt an die Messages-API', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'text', text: '"typ": "test"}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-test',
    });
    const provider = new AnthropicProvider({ apiKey: 'sk-zentral', fetchImpl });

    await provider.strukturierteCompletion({
      system: 'Du bist ein Klassifikations-Assistent.',
      prompt: 'Nachricht: Hallo',
      model: 'claude-sonnet-test',
      max_tokens: 16000,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-zentral');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-sonnet-test');
    expect(body.max_tokens).toBe(16000);
    expect(body.system).toBe('Du bist ein Klassifikations-Assistent.');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Nachricht: Hallo' });
    expect(body.messages[1]).toEqual({ role: 'assistant', content: '{' });
  });

  it('rekonstruiert den Text mit dem Assistant-Prefill "{" davor', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'text', text: '"vorgang_id": "abc"}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude-sonnet-test',
    });
    const provider = new AnthropicProvider({ apiKey: 'sk-zentral', fetchImpl });

    const ergebnis = await provider.strukturierteCompletion({
      system: 'sys',
      prompt: 'user',
      model: 'claude-sonnet-test',
      max_tokens: 100,
    });

    expect(ergebnis.text).toBe('{"vorgang_id": "abc"}');
    expect(JSON.parse(ergebnis.text)).toEqual({ vorgang_id: 'abc' });
  });

  it('gibt den Token-Verbrauch aus der usage der Antwort zurück', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'text', text: '}' }],
      usage: { input_tokens: 1234, output_tokens: 567 },
      model: 'claude-sonnet-test',
    });
    const provider = new AnthropicProvider({ apiKey: 'sk-zentral', fetchImpl });

    const ergebnis = await provider.strukturierteCompletion({
      system: 'sys',
      prompt: 'user',
      model: 'claude-sonnet-test',
      max_tokens: 100,
    });

    expect(ergebnis.tokenVerbrauch).toEqual({ input_tokens: 1234, output_tokens: 567 });
    expect(ergebnis.modell).toBe('claude-sonnet-test');
  });

  it('nutzt den agentur-spezifischen Key aus der Anfrage statt des zentralen Keys, falls gesetzt', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'text', text: '}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude-sonnet-test',
    });
    const provider = new AnthropicProvider({ apiKey: 'sk-zentral', fetchImpl });

    await provider.strukturierteCompletion({
      system: 'sys',
      prompt: 'user',
      model: 'claude-sonnet-test',
      max_tokens: 100,
      apiKey: 'sk-agentur-spezifisch',
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['x-api-key']).toBe('sk-agentur-spezifisch');
  });

  it('wirft, wenn die Antwort keinen Text-Block enthält', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'tool_use' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude-sonnet-test',
    });
    const provider = new AnthropicProvider({ apiKey: 'sk-zentral', fetchImpl });

    await expect(
      provider.strukturierteCompletion({
        system: 'sys',
        prompt: 'user',
        model: 'claude-sonnet-test',
        max_tokens: 100,
      }),
    ).rejects.toThrow('enthält keinen Text-Block');
  });
});
