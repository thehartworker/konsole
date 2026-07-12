import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { callLLMWithRetry, isRateLimitResponse } from '../src/retry.js';

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response;
}

describe('isRateLimitResponse', () => {
  it('erkennt HTTP 429 direkt', () => {
    expect(isRateLimitResponse(429, '{}')).toBe(true);
  });

  it('erkennt 500 mit eingebettetem "API error: 429" (bridgebound-Lehre)', () => {
    expect(isRateLimitResponse(500, 'Upstream failed: API error: 429 Too Many Requests')).toBe(true);
  });

  it('erkennt 500 mit "rate_limited" im Body', () => {
    expect(isRateLimitResponse(500, '{"error":{"type":"rate_limited"}}')).toBe(true);
  });

  it('erkennt 500 mit "Rate limit exceeded" im Body', () => {
    expect(isRateLimitResponse(500, 'Rate limit exceeded, try later')).toBe(true);
  });

  it('behandelt einen normalen 500 nicht als Rate-Limit', () => {
    expect(isRateLimitResponse(500, 'Internal Server Error')).toBe(false);
  });

  it('behandelt 200 nicht als Rate-Limit', () => {
    expect(isRateLimitResponse(200, '{}')).toBe(false);
  });
});

describe('callLLMWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gibt beim ersten Erfolg sofort das geparste Ergebnis zurück', async () => {
    const fn = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    const ergebnis = await callLLMWithRetry(fn);
    expect(ergebnis).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respektiert den Retry-After-Header bei 429 und versucht danach erneut', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(429, 'rate limited', { 'retry-after': '2' }))
      .mockResolvedValueOnce(fakeResponse(200, { ok: true }));

    const promise = callLLMWithRetry(fn);
    await vi.advanceTimersByTimeAsync(2000);
    const ergebnis = await promise;

    expect(ergebnis).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('nutzt exponential backoff, wenn kein Retry-After-Header gesetzt ist', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(500, 'API error: 429 embedded'))
      .mockResolvedValueOnce(fakeResponse(200, { ok: true }));

    const promise = callLLMWithRetry(fn);
    await vi.advanceTimersByTimeAsync(3000);
    const ergebnis = await promise;

    expect(ergebnis).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wirft nach Ausschöpfen aller Retries die klare "persistent"-Meldung, nicht den rohen HTTP-Fehler (AGENTS.md §7.4, Issue #30 Aufgabe E)', async () => {
    // Fix gegenüber der vorigen Fassung: beim letzten Versuch (attempt ===
    // maxRetries) griff "attempt < maxRetries" nicht mehr, das Muster fiel
    // dann in den "!res.ok"-Zweig und warf den rohen, irreführenden
    // HTTP-Fehler statt der klaren "persistent"-Meldung. retry.ts wirft die
    // Meldung jetzt explizit im letzten Rate-Limit-Versuch.
    const fn = vi.fn().mockResolvedValue(fakeResponse(429, 'immer rate limited'));

    const promise = callLLMWithRetry(fn, 2);
    const erwartung = expect(promise).rejects.toThrow('Rate-Limit persistent nach 2 Retries');
    await vi.runAllTimersAsync();
    await erwartung;

    expect(fn).toHaveBeenCalledTimes(3); // attempt 0, 1, 2
  });

  it('wirft sofort bei einem nicht-retry-baren Fehlerstatus', async () => {
    const fn = vi.fn().mockResolvedValue(fakeResponse(400, 'Bad Request'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow('LLM 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
