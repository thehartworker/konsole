// Rechtslage-/Umfangs-Logik für das Website-Scraping (Teil 1, Auftrag
// verbindlich, siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Website-Scraping-Rechtslage"). Reine Funktionen, ohne echten
// Netzwerk-Call testbar -- entscheiden NUR ob/was gescraped werden dürfte,
// führen den Zugriff selbst nicht aus (das ist die produktive
// WebsiteTextProvider-Implementierung, PR 2).

export interface RobotsRegelwerk {
  /** Pfad-Präfixe, für die IRGENDEIN passender User-Agent-Block ein Disallow trägt. */
  disallowPraefixe: string[];
  /** Explizite Allow-Ausnahmen (gewinnen gegen ein längeres/gleich langes Disallow-Präfix, robots.txt-Standardregel). */
  allowPraefixe: string[];
}

const LEERES_REGELWERK: RobotsRegelwerk = { disallowPraefixe: [], allowPraefixe: [] };

/**
 * Minimaler robots.txt-Parser: deckt "User-agent: <name-oder-*>" gefolgt von
 * "Disallow: <pfad>"/"Allow: <pfad>"-Zeilen ab, bis zum nächsten
 * User-agent-Block oder Dateiende. Bewusst KEIN vollständiger RFC-9309-
 * Parser (kein Wildcard-Pfad-Matching mit "*"/"$", keine Sitemap-Zeilen) --
 * für die im Auftrag verlangte kleine, respektvolle Seiten-Allowlist reicht
 * Präfix-Matching, ein vollständiger Parser wäre Aufwand ohne Gegenwert für
 * v1. Case-insensitive bei Direktiven-Namen, wie im Standard vorgesehen.
 */
export function parseRobotsTxt(robotsTxtInhalt: string, userAgent: string): RobotsRegelwerk {
  const disallowPraefixe: string[] = [];
  const allowPraefixe: string[] = [];
  let aktiverBlockGiltFuerUns = false;
  let blockHatUserAgentZeileGesehen = false;

  for (const rohzeile of robotsTxtInhalt.split(/\r?\n/)) {
    const zeile = rohzeile.replace(/#.*$/, '').trim();
    if (!zeile) continue;

    const trenner = zeile.indexOf(':');
    if (trenner === -1) continue;

    const direktive = zeile.slice(0, trenner).trim().toLowerCase();
    const wert = zeile.slice(trenner + 1).trim();

    if (direktive === 'user-agent') {
      if (!blockHatUserAgentZeileGesehen) {
        // Erster User-agent-Zeile eines neuen Blocks: vorherigen Block schließen.
        aktiverBlockGiltFuerUns = false;
      }
      blockHatUserAgentZeileGesehen = true;
      if (wert === '*' || wert.toLowerCase() === userAgent.toLowerCase()) {
        aktiverBlockGiltFuerUns = true;
      }
      continue;
    }

    // Jede Nicht-User-agent-Direktive beendet die "Block startet gerade"-Phase.
    blockHatUserAgentZeileGesehen = false;

    if (!aktiverBlockGiltFuerUns) continue;

    if (direktive === 'disallow' && wert) {
      disallowPraefixe.push(wert);
    } else if (direktive === 'allow' && wert) {
      allowPraefixe.push(wert);
    }
  }

  return { disallowPraefixe, allowPraefixe };
}

/**
 * robots.txt-Standardregel: die LÄNGSTE passende Regel gewinnt. Kein Treffer
 * in disallowPraefixe heißt erlaubt (Fail-Open ist hier korrekt -- eine
 * fehlende/leere robots.txt bedeutet "kein Verbot ausgesprochen", nicht
 * "alles verboten"; die harte Beschränkung auf die eigene Domain plus die
 * feste Seiten-Allowlist in waehleRelevanteSeiten() begrenzt den Zugriff
 * ohnehin unabhängig von robots.txt).
 */
export function istPfadErlaubt(regelwerk: RobotsRegelwerk, pfad: string, userAgent: string): boolean {
  void userAgent; // bereits beim Parsen berücksichtigt, Parameter der Klarheit halber im Aufruf sichtbar

  let laengsteDisallow = -1;
  for (const praefix of regelwerk.disallowPraefixe) {
    if (pfad.startsWith(praefix) && praefix.length > laengsteDisallow) {
      laengsteDisallow = praefix.length;
    }
  }
  if (laengsteDisallow === -1) return true;

  let laengsteAllow = -1;
  for (const praefix of regelwerk.allowPraefixe) {
    if (pfad.startsWith(praefix) && praefix.length > laengsteAllow) {
      laengsteAllow = praefix.length;
    }
  }

  return laengsteAllow >= laengsteDisallow;
}

function hostnameAus(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * NUR die eigene Kunden-Domain, exakt oder mit "www."-Präfix-Toleranz.
 * Bewusst KEIN Subdomain-Wildcard: "blog.kunden-domain.example" wäre sonst
 * fälschlich als "eigene Domain" durchgegangen, obwohl es ein anderer
 * Verantwortungsbereich sein kann (siehe Decision).
 */
export function istGleicheKundenDomain(url: string, erlaubteDomain: string): boolean {
  const host = hostnameAus(url);
  if (!host) return false;

  const erlaubt = erlaubteDomain.toLowerCase().replace(/^www\./, '');
  const hostOhneWww = host.replace(/^www\./, '');
  return hostOhneWww === erlaubt;
}

const ALLOWLIST_PFAD_MUSTER: RegExp[] = [
  /^\/?$/i, // Startseite
  /^\/?(ueber-uns|ueber_uns|about|about-us|unternehmen|wir-ueber-uns)\/?$/i,
  /^\/?impressum\/?$/i,
  /^\/?(presse|news|aktuelles|newsroom)\/?$/i,
];

const MAX_SEITEN = 6;

/**
 * Kein aggressives Crawling (Auftrag, verbindlich): filtert Kandidaten-Pfade
 * gegen die feste, kleine Allowlist UND gegen robots.txt, gedeckelt auf
 * maximal MAX_SEITEN Treffer. Reine Auswahl-Funktion -- Rate-Limit
 * (Wartezeit zwischen tatsächlichen Requests) ist Sache der produktiven
 * WebsiteTextProvider-Implementierung (PR 2), keine reine Funktion.
 */
export function waehleRelevanteSeiten(
  kandidatenPfade: string[],
  regelwerk: RobotsRegelwerk = LEERES_REGELWERK,
  userAgent = 'Konsole-Profil-Bot',
): string[] {
  const ausgewaehlt: string[] = [];
  for (const pfad of kandidatenPfade) {
    if (ausgewaehlt.length >= MAX_SEITEN) break;
    const normalisiert = pfad.startsWith('/') ? pfad : `/${pfad}`;
    const passtZurAllowlist = ALLOWLIST_PFAD_MUSTER.some((muster) => muster.test(normalisiert));
    if (!passtZurAllowlist) continue;
    if (!istPfadErlaubt(regelwerk, normalisiert, userAgent)) continue;
    if (ausgewaehlt.includes(normalisiert)) continue;
    ausgewaehlt.push(normalisiert);
  }
  return ausgewaehlt;
}
