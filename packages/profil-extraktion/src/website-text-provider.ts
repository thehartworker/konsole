// Produktive WebsiteTextProvider-Implementierung (Teil 1, PR 2): echter
// fetch() der Kunden-Website, ausschließlich innerhalb der in
// website-regeln.ts festgelegten Rechtslage (PR 1, unverändert übernommen,
// nicht neu erfunden) -- siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Website-Scraping-Rechtslage":
//   - NUR die eigene Kunden-Domain (kein Crawling zu fremden Domains).
//   - robots.txt wird respektiert (parseRobotsTxt/istPfadErlaubt).
//   - feste, kleine Seiten-Allowlist statt rekursivem Link-Folgen.
//   - Rate-Limit (1 Request/Sekunde) und eindeutige User-Agent-Kennzeichnung.

import { htmlZuText } from './html-text.js';
import { istGleicheKundenDomain, parseRobotsTxt, waehleRelevanteSeiten } from './website-regeln.js';
import type { ExtrahierterText, KundenWebsiteQuelle, WebsiteTextProvider } from './types.js';

export const KONSOLE_PROFIL_BOT_USER_AGENT = 'Konsole-Profil-Bot/1.0 (+https://konsole.example/ueber-den-profil-bot)';

// Fester Kandidaten-Pfad-Versuch, GENAU EINE Variante pro Allowlist-Kategorie
// aus website-regeln.ts (deutsch zuerst, DACH-Zielmarkt, plus eine englische
// Variante je Kategorie) -- KEIN Crawling/Link-Folgen (Auftrag, verbindlich),
// nur dieser feste Versuch pro Domain, danach filtert waehleRelevanteSeiten
// zusätzlich gegen robots.txt. Bewusst genau 6 Kandidaten (= MAX_SEITEN in
// website-regeln.ts): mehr Varianten pro Kategorie (z. B. zusätzlich
// "/unternehmen", "/newsroom") würden bei mehr als 6 Treffern andere
// Kategorien aus der gedeckelten Auswahl verdrängen, ohne dass wir vorher
// wissen können, welche Variante die jeweilige Kunden-Website tatsächlich
// verwendet.
const KANDIDATEN_PFADE = ['/', '/ueber-uns', '/about', '/impressum', '/presse', '/news'];

const RATE_LIMIT_MS = 1000;

export interface ProduktiverWebsiteTextProviderOptionen {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Wartezeit zwischen zwei Seiten-Requests derselben Domain (Rate-Limit, Default 1 Request/Sekunde). */
  wartenZwischenRequestsMs?: number;
}

function domainOhneProtokollUndSlash(erlaubteDomain: string): string {
  return erlaubteDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function warten(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ProduktiverWebsiteTextProvider implements WebsiteTextProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly wartenZwischenRequestsMs: number;

  /**
   * robots.txt-Produkt-Token für den "User-agent:"-Zeilenabgleich in
   * website-regeln.ts, z. B. "Konsole-Profil-Bot" -- bewusst NICHT der volle
   * HTTP-User-Agent-Header (der trägt zusätzlich Version und Kontakt-URL,
   * siehe KONSOLE_PROFIL_BOT_USER_AGENT). Websites tragen in robots.txt
   * üblicherweise nur das kurze Produkt-Token ein (Konvention, z. B.
   * "User-agent: Googlebot"), ein Abgleich gegen den vollen Header-String
   * würde jede robots.txt-Regel verfehlen, die gezielt für diesen Bot gilt.
   */
  private readonly robotsProduktToken: string;

  constructor(optionen: ProduktiverWebsiteTextProviderOptionen = {}) {
    this.fetchImpl = optionen.fetchImpl ?? fetch;
    this.userAgent = optionen.userAgent ?? KONSOLE_PROFIL_BOT_USER_AGENT;
    this.robotsProduktToken = this.userAgent.split('/')[0].trim();
    this.wartenZwischenRequestsMs = optionen.wartenZwischenRequestsMs ?? RATE_LIMIT_MS;
  }

  private async robotsTxtLaden(domain: string): Promise<string> {
    try {
      const antwort = await this.fetchImpl(`https://${domain}/robots.txt`, {
        headers: { 'user-agent': this.userAgent },
      });
      if (!antwort.ok) return '';
      return await antwort.text();
    } catch {
      // robots.txt nicht erreichbar: Fail-Open (siehe website-regeln.ts,
      // istPfadErlaubt) -- die Domain-/Allowlist-Beschränkung greift trotzdem.
      return '';
    }
  }

  async textDerRelevantenSeitenLaden(website: KundenWebsiteQuelle): Promise<ExtrahierterText[]> {
    const domain = domainOhneProtokollUndSlash(website.erlaubteDomain);
    const robotsTxtInhalt = await this.robotsTxtLaden(domain);
    const regelwerk = parseRobotsTxt(robotsTxtInhalt, this.robotsProduktToken);
    const seiten = waehleRelevanteSeiten(KANDIDATEN_PFADE, regelwerk, this.robotsProduktToken);

    const ergebnisse: ExtrahierterText[] = [];

    for (let i = 0; i < seiten.length; i++) {
      if (i > 0) await warten(this.wartenZwischenRequestsMs);

      const pfad = seiten[i];
      const url = `https://${domain}${pfad}`;

      try {
        const antwort = await this.fetchImpl(url, {
          headers: { 'user-agent': this.userAgent },
          redirect: 'follow',
        });
        if (!antwort.ok) continue;

        // Doppelte Absicherung zusätzlich zum bereits domain-gebundenen
        // URL-Aufbau oben: fetch() folgt Redirects standardmäßig, ein
        // Redirect auf eine fremde Domain darf trotzdem nicht gelesen werden
        // (Rechtslage: NUR die eigene Kunden-Domain).
        const tatsaechlicheUrl = antwort.url || url;
        if (!istGleicheKundenDomain(tatsaechlicheUrl, domain)) continue;

        const html = await antwort.text();
        const text = htmlZuText(html);
        if (!text) continue;

        ergebnisse.push({ bezeichnung: `${domain}${pfad}`, text });
      } catch {
        // einzelne Seite nicht erreichbar (Netzwerkfehler, Timeout): die
        // übrigen Kandidaten-Seiten trotzdem versuchen, kein Abbruch der
        // gesamten Beschaffung wegen einer einzelnen Seite.
        continue;
      }
    }

    return ergebnisse;
  }
}
