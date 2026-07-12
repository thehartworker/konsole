// Teil 1 (Text-Beschaffung) und gemeinsame Typen für die Kundenprofil-KI-
// Befüllung (Ebene 3, Issue #37). Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md.
//
// DokumentTextProvider/WebsiteTextProvider sind injizierbare Interfaces,
// analog zu W2KontextQuellenProvider (packages/handlers/src/w2/types.ts):
// die Extraktions-Logik (Teil 2, extrahiere.ts) hängt nur vom Interface ab,
// nie von der konkreten Infrastruktur (PDF-/Word-Parsing, echter fetch()).
// Produktive Implementierungen kommen in PR 2 (siehe Decision, "Vorgehen"),
// hier gibt es nur die Interfaces plus Fakes (src/testing/).

/** Herkunft eines Extraktions-Vorschlags, wörtlich aus dem Auftrag übernommen. */
export type ProfilExtraktionsQuelle = 'dokument-upload' | 'website-scraping';

export type HochgeladeneDateiTyp = 'pdf' | 'docx' | 'text' | 'html';

export interface HochgeladeneDatei {
  /** Referenz auf kunden_quelldokumente.id (packages/persistence, PR 2). */
  quelldokumentId: string;
  dateiname: string;
  typ: HochgeladeneDateiTyp;
  /** Rohdaten der Datei. In der produktiven Implementierung aus Supabase Storage gelesen. */
  inhalt: Uint8Array;
}

export interface ExtrahierterText {
  /** Woher der Text stammt, für Prompt-Kontext und spätere Nachvollziehbarkeit. */
  bezeichnung: string;
  text: string;
}

/**
 * Kapselt die eigentliche Datei-Extraktion (PDF-/Word-Parsing ist die
 * "schmutzige" Infrastruktur, siehe Auftrag), sodass Tests mit einem Mock
 * arbeiten (definierter Text, keine echte Datei).
 */
export interface DokumentTextProvider {
  textExtrahieren(datei: HochgeladeneDatei): Promise<ExtrahierterText>;
}

export interface KundenWebsiteQuelle {
  kundeId: string;
  /** Vom Kunden/der Agentur explizit angegebene Domain, z. B. "kunde-beispiel.de". Kein Crawling zu anderen Domains. */
  erlaubteDomain: string;
}

/**
 * Liefert den Text der wenigen zulässigen Seiten (Startseite, Über-uns,
 * Impressum, Presse/News), siehe Decision "Website-Scraping-Rechtslage".
 * Die Legalitäts-/Umfangs-Entscheidung (robots.txt, Domain-Zugehörigkeit,
 * Seiten-Allowlist) liegt in website-regeln.ts als reine, ohne Netzwerk-Call
 * testbare Logik -- eine produktive Implementierung dieses Interfaces nutzt
 * diese Regeln, baut sie aber nicht selbst nach.
 */
export interface WebsiteTextProvider {
  textDerRelevantenSeitenLaden(website: KundenWebsiteQuelle): Promise<ExtrahierterText[]>;
}
