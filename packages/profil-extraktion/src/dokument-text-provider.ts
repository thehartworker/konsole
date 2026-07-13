// Produktive DokumentTextProvider-Implementierung (Teil 1, PR 2): echtes
// Text-Parsing aus PDF (pdf-parse), Word/.docx (mammoth), Text und HTML,
// hinter dem in PR 1 festgelegten Interface (types.ts). Siehe
// docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md, Abschnitt "Vorgehen".
//
// pdf-parse/mammoth werden bewusst per node:module createRequire geladen,
// nicht per statischem `import ... from`: beide Pakete liefern keine
// verlässlichen eigenen TypeScript-Typen, ein statischer Import würde den
// Typecheck an fremde/fehlende Declaration-Files koppeln. Die eigentliche
// "schmutzige" Infrastruktur (Byte-Parsing) ist außerdem hinter
// RohTextExtraktoren injizierbar (analog zu AnthropicProviderOptions.fetchImpl),
// damit Tests die Dispatch-/Normalisierungs-/Fehlerbehandlungs-Logik dieses
// Providers ohne handgebaute PDF-/Word-Binärdateien abdecken können.

import { createRequire } from 'node:module';
import { htmlZuText } from './html-text.js';
import type { DokumentTextProvider, ExtrahierterText, HochgeladeneDatei, HochgeladeneDateiTyp } from './types.js';

const require = createRequire(import.meta.url);

interface PdfParseErgebnis {
  text: string;
}
type PdfParseFn = (daten: Buffer) => Promise<PdfParseErgebnis>;

interface MammothErgebnis {
  value: string;
}
interface MammothModul {
  extractRawText(input: { buffer: Buffer }): Promise<MammothErgebnis>;
}

export type RohTextExtraktor = (inhalt: Uint8Array) => Promise<string>;
export type RohTextExtraktoren = Record<HochgeladeneDateiTyp, RohTextExtraktor>;

async function pdfExtrahieren(inhalt: Uint8Array): Promise<string> {
  const pdfParse = require('pdf-parse') as PdfParseFn;
  const ergebnis = await pdfParse(Buffer.from(inhalt));
  return ergebnis.text;
}

async function docxExtrahieren(inhalt: Uint8Array): Promise<string> {
  const mammoth = require('mammoth') as MammothModul;
  const ergebnis = await mammoth.extractRawText({ buffer: Buffer.from(inhalt) });
  return ergebnis.value;
}

async function textExtrahieren(inhalt: Uint8Array): Promise<string> {
  return Buffer.from(inhalt).toString('utf-8');
}

async function htmlExtrahieren(inhalt: Uint8Array): Promise<string> {
  return htmlZuText(Buffer.from(inhalt).toString('utf-8'));
}

const PRODUKTIVE_EXTRAKTOREN: RohTextExtraktoren = {
  pdf: pdfExtrahieren,
  docx: docxExtrahieren,
  text: textExtrahieren,
  html: htmlExtrahieren,
};

export interface ProduktiverDokumentTextProviderOptionen {
  /** Für Tests: einzelne Extraktoren überschreiben (kein echtes PDF-/Word-Parsing nötig). */
  extraktoren?: Partial<RohTextExtraktoren>;
}

/**
 * Normalisiert das rohe Extraktions-Ergebnis: Whitespace pro Zeile
 * kollabieren, leere Zeilen verwerfen -- PDF-/Word-Parser liefern häufig
 * unregelmäßige Leerzeichen-/Zeilenumbruch-Reste aus dem Layout, die für die
 * nachgelagerte KI-Extraktion nur Rauschen wären.
 */
function normalisiereText(roh: string): string {
  return roh
    .split(/\r?\n/)
    .map((zeile) => zeile.replace(/[ \t]+/g, ' ').trim())
    .filter((zeile) => zeile.length > 0)
    .join('\n')
    .trim();
}

export class ProduktiverDokumentTextProvider implements DokumentTextProvider {
  private readonly extraktoren: RohTextExtraktoren;

  constructor(optionen: ProduktiverDokumentTextProviderOptionen = {}) {
    this.extraktoren = { ...PRODUKTIVE_EXTRAKTOREN, ...optionen.extraktoren };
  }

  async textExtrahieren(datei: HochgeladeneDatei): Promise<ExtrahierterText> {
    let roh: string;
    try {
      roh = await this.extraktoren[datei.typ](datei.inhalt);
    } catch (fehler) {
      throw new Error(
        `ProduktiverDokumentTextProvider.textExtrahieren("${datei.dateiname}"): Parsing fehlgeschlagen -- ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );
    }

    const bereinigt = normalisiereText(roh);
    if (!bereinigt) {
      throw new Error(
        `ProduktiverDokumentTextProvider.textExtrahieren("${datei.dateiname}"): kein Text extrahierbar (leere oder nicht lesbare Datei).`,
      );
    }

    return { bezeichnung: datei.dateiname, text: bereinigt };
  }
}
