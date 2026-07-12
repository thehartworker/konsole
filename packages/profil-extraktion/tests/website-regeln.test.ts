import { describe, expect, it } from 'vitest';
import { istGleicheKundenDomain, istPfadErlaubt, parseRobotsTxt, waehleRelevanteSeiten } from '../src/website-regeln.js';

describe('istGleicheKundenDomain', () => {
  it('erkennt eine exakte Domain-Übereinstimmung', () => {
    expect(istGleicheKundenDomain('https://kunde-beispiel.de/impressum', 'kunde-beispiel.de')).toBe(true);
  });

  it('toleriert ein "www."-Präfix in beide Richtungen', () => {
    expect(istGleicheKundenDomain('https://www.kunde-beispiel.de/', 'kunde-beispiel.de')).toBe(true);
    expect(istGleicheKundenDomain('https://kunde-beispiel.de/', 'www.kunde-beispiel.de')).toBe(true);
  });

  it('lehnt eine fremde Domain ab', () => {
    expect(istGleicheKundenDomain('https://konkurrent.example/', 'kunde-beispiel.de')).toBe(false);
  });

  it('lehnt eine Subdomain OHNE Wildcard-Erlaubnis ab (Rechtslage: kein Subdomain-Crawling)', () => {
    expect(istGleicheKundenDomain('https://blog.kunde-beispiel.de/', 'kunde-beispiel.de')).toBe(false);
  });

  it('lehnt eine Domain ab, die den erlaubten Namen nur als Suffix enthält', () => {
    expect(istGleicheKundenDomain('https://nicht-kunde-beispiel.de/', 'kunde-beispiel.de')).toBe(false);
  });

  it('gibt false bei einer nicht-parsbaren URL zurück, statt zu werfen', () => {
    expect(istGleicheKundenDomain('das ist keine URL', 'kunde-beispiel.de')).toBe(false);
  });
});

describe('parseRobotsTxt / istPfadErlaubt', () => {
  it('erlaubt alles, wenn robots.txt leer ist (Fail-Open, Domain-/Allowlist-Beschränkung greift unabhängig)', () => {
    const regelwerk = parseRobotsTxt('', 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/presse', 'Konsole-Profil-Bot')).toBe(true);
  });

  it('respektiert ein Disallow für "*"', () => {
    const robotsTxt = ['User-agent: *', 'Disallow: /intern'].join('\n');
    const regelwerk = parseRobotsTxt(robotsTxt, 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/intern/geheim', 'Konsole-Profil-Bot')).toBe(false);
    expect(istPfadErlaubt(regelwerk, '/presse', 'Konsole-Profil-Bot')).toBe(true);
  });

  it('respektiert ein Disallow für den eigenen User-Agent, auch wenn "*" es erlauben würde', () => {
    const robotsTxt = ['User-agent: *', 'Allow: /', '', 'User-agent: Konsole-Profil-Bot', 'Disallow: /presse'].join('\n');
    const regelwerk = parseRobotsTxt(robotsTxt, 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/presse', 'Konsole-Profil-Bot')).toBe(false);
  });

  it('ignoriert Blöcke für andere User-Agents', () => {
    const robotsTxt = ['User-agent: EinAndererBot', 'Disallow: /presse'].join('\n');
    const regelwerk = parseRobotsTxt(robotsTxt, 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/presse', 'Konsole-Profil-Bot')).toBe(true);
  });

  it('eine Allow-Regel gewinnt gegen ein kürzeres Disallow-Präfix (robots.txt-Standardregel: längstes Präfix gewinnt)', () => {
    const robotsTxt = ['User-agent: *', 'Disallow: /presse', 'Allow: /presse/aktuell'].join('\n');
    const regelwerk = parseRobotsTxt(robotsTxt, 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/presse/aktuell', 'Konsole-Profil-Bot')).toBe(true);
    expect(istPfadErlaubt(regelwerk, '/presse/archiv', 'Konsole-Profil-Bot')).toBe(false);
  });

  it('ignoriert Kommentarzeilen', () => {
    const robotsTxt = ['# Kommentar', 'User-agent: *', '# noch ein Kommentar', 'Disallow: /intern'].join('\n');
    const regelwerk = parseRobotsTxt(robotsTxt, 'Konsole-Profil-Bot');
    expect(istPfadErlaubt(regelwerk, '/intern', 'Konsole-Profil-Bot')).toBe(false);
  });
});

describe('waehleRelevanteSeiten', () => {
  it('wählt nur Seiten aus der festen Allowlist (Startseite, Über-uns, Impressum, Presse)', () => {
    const kandidaten = ['/', '/ueber-uns', '/impressum', '/presse', '/produkte', '/karriere', '/shop/checkout'];
    const ausgewaehlt = waehleRelevanteSeiten(kandidaten);
    expect(ausgewaehlt).toEqual(['/', '/ueber-uns', '/impressum', '/presse']);
  });

  it('respektiert robots.txt beim Auswählen (kein aggressives Crawling verbotener Pfade)', () => {
    const regelwerk = parseRobotsTxt(['User-agent: *', 'Disallow: /presse'].join('\n'), 'Konsole-Profil-Bot');
    const ausgewaehlt = waehleRelevanteSeiten(['/', '/presse'], regelwerk);
    expect(ausgewaehlt).toEqual(['/']);
  });

  it('deckelt auf maximal 6 Seiten, auch bei mehr Allowlist-Treffern', () => {
    const kandidaten = ['/', '/ueber-uns', '/about', '/impressum', '/presse', '/news', '/aktuelles'];
    const ausgewaehlt = waehleRelevanteSeiten(kandidaten);
    expect(ausgewaehlt.length).toBeLessThanOrEqual(6);
  });

  it('gibt eine leere Liste zurück, wenn keine Kandidaten zur Allowlist passen', () => {
    expect(waehleRelevanteSeiten(['/produkte', '/karriere'])).toEqual([]);
  });

  it('dedupliziert normalisierte Pfade', () => {
    expect(waehleRelevanteSeiten(['/impressum', 'impressum'])).toEqual(['/impressum']);
  });
});
