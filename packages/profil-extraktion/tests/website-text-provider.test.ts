// Tests für die produktive WebsiteTextProvider-Implementierung: kein echter
// Netzwerk-Zugriff, fetch() wird injiziert (analog zu AnthropicProvider-
// Tests, die fetchImpl mocken statt echte HTTP-Bytes zu senden).

import { describe, expect, it, vi } from 'vitest';
import { ProduktiverWebsiteTextProvider, KONSOLE_PROFIL_BOT_USER_AGENT } from '../src/website-text-provider.js';

function antwort(body: string, optionen: { ok?: boolean; url?: string } = {}) {
  return {
    ok: optionen.ok ?? true,
    url: optionen.url ?? '',
    text: async () => body,
  } as unknown as Response;
}

const ROBOTS_TXT_LEER = '';

describe('ProduktiverWebsiteTextProvider', () => {
  it('lädt robots.txt und die Allowlist-Seiten der Domain, mit korrektem User-Agent-Header', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(ROBOTS_TXT_LEER);
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('<html><body><h1>Willkommen</h1></body></html>');
      if (urlStr === 'https://kunde-beispiel.de/impressum') return antwort('<p>Impressum-Inhalt</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse.map((e) => e.text)).toEqual(['Willkommen', 'Impressum-Inhalt']);
    expect(ergebnisse.map((e) => e.bezeichnung)).toEqual(['kunde-beispiel.de/', 'kunde-beispiel.de/impressum']);

    const robotsAufruf = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/robots.txt'));
    expect(robotsAufruf).toBeDefined();
    const init = robotsAufruf?.[1];
    expect((init?.headers as Record<string, string>)['user-agent']).toBe(KONSOLE_PROFIL_BOT_USER_AGENT);
  });

  it('respektiert ein robots.txt-Disallow: die betroffene Seite wird übersprungen', async () => {
    const robotsTxt = ['User-agent: *', 'Disallow: /impressum'].join('\n');
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(robotsTxt);
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('<p>Start</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toHaveLength(1);
    expect(ergebnisse[0].bezeichnung).toBe('kunde-beispiel.de/');
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/impressum'))).toBe(false);
  });

  it('verwirft eine Seite, deren tatsächliche (Redirect-)URL auf eine fremde Domain zeigt', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(ROBOTS_TXT_LEER);
      if (urlStr === 'https://kunde-beispiel.de/') {
        return antwort('<p>Umgeleiteter Inhalt</p>', { url: 'https://fremde-domain.example/' });
      }
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toEqual([]);
  });

  it('überspringt eine Seite mit Nicht-OK-Antwort, ohne die übrigen Seiten abzubrechen', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(ROBOTS_TXT_LEER);
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('', { ok: false });
      if (urlStr === 'https://kunde-beispiel.de/impressum') return antwort('<p>Impressum</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toEqual([{ bezeichnung: 'kunde-beispiel.de/impressum', text: 'Impressum' }]);
  });

  it('fängt einen Netzwerkfehler bei einer einzelnen Seite ab und macht mit den übrigen weiter', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(ROBOTS_TXT_LEER);
      if (urlStr === 'https://kunde-beispiel.de/') throw new Error('ECONNRESET');
      if (urlStr === 'https://kunde-beispiel.de/impressum') return antwort('<p>Impressum</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toEqual([{ bezeichnung: 'kunde-beispiel.de/impressum', text: 'Impressum' }]);
  });

  it('gibt kein Ergebnis für eine Seite ohne extrahierbaren Text zurück', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(ROBOTS_TXT_LEER);
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('<div><span></span></div>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toEqual([]);
  });

  it('gleicht robots.txt-Regeln gegen das kurze Produkt-Token ab, nicht gegen den vollen User-Agent-Header', async () => {
    // Websites tragen in robots.txt üblicherweise nur "Konsole-Profil-Bot"
    // ein (Produkt-Token), nicht den vollen Header-String mit Version/URL
    // (KONSOLE_PROFIL_BOT_USER_AGENT) -- ein Abgleich gegen den vollen String
    // würde diese Regel verfehlen.
    const robotsTxt = ['User-agent: Konsole-Profil-Bot', 'Disallow: /impressum'].join('\n');
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) return antwort(robotsTxt);
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('<p>Start</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/impressum'))).toBe(false);
    expect(ergebnisse).toEqual([{ bezeichnung: 'kunde-beispiel.de/', text: 'Start' }]);
  });

  it('behandelt eine nicht erreichbare robots.txt als Fail-Open (leeres Regelwerk), kein Absturz', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/robots.txt')) throw new Error('Timeout');
      if (urlStr === 'https://kunde-beispiel.de/') return antwort('<p>Start</p>');
      return antwort('', { ok: false });
    });

    const provider = new ProduktiverWebsiteTextProvider({ fetchImpl, wartenZwischenRequestsMs: 0 });
    const ergebnisse = await provider.textDerRelevantenSeitenLaden({
      kundeId: 'kunde-a',
      erlaubteDomain: 'kunde-beispiel.de',
    });

    expect(ergebnisse).toEqual([{ bezeichnung: 'kunde-beispiel.de/', text: 'Start' }]);
  });
});
