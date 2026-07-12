// Retry-Wrapper Pflicht für jeden LLM-Call (AGENTS.md §4, §7.4).
// Kanonisches Muster, wörtlich aus AGENTS.md §7.4 übernommen: respektiert
// Retry-After, prüft auf 429-in-500-Body (bridgebound-Lehre).

export async function callLLMWithRetry<T>(
  fn: () => Promise<Response>,
  maxRetries = 6,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fn();
    const text = await res.text();
    if (isRateLimitResponse(res.status, text)) {
      if (attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 60000)
            : Math.min(3000 * Math.pow(2, attempt), 60000);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      // Letzter Versuch ausgeschöpft: hier explizit die klare "persistent"-
      // Meldung werfen, statt in den generischen "!res.ok"-Zweig
      // durchzufallen (der rohe Fehlertext ist bei einem Rate-Limit
      // irreführend, siehe AGENTS.md §7.4 und Issue #30 Aufgabe E).
      throw new Error(`Rate-Limit persistent nach ${maxRetries} Retries`);
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }
  // Strukturell unerreichbar (jeder Schleifendurchlauf gibt zurück oder
  // wirft), aber nötig, damit TypeScript den Rückgabetyp der Funktion
  // exhaustiv beweisen kann.
  throw new Error(`Rate-Limit persistent nach ${maxRetries} Retries`);
}

export function isRateLimitResponse(status: number, text: string): boolean {
  if (status === 429) return true;
  if (status === 500 && /API error:\s*429|rate_limited|Rate limit exceeded/i.test(text)) return true;
  return false;
}
