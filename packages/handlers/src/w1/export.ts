// Multi-Format-Export der W1-Pressemitteilung (Issue #45, Konsole Block 2).
// Eine gemeinsame Segment-Liste (pressemitteilungSegmente) ist die einzige
// Stelle, die weiß, welche Felder von PressemitteilungDraft in welcher
// Reihenfolge ins Dokument gehören -- alle drei Renderer konsumieren sie,
// keine dreifache Duplikation der Feld-Auswahl. Siehe
// docs/decisions/2026-07-13_konsole-block2-editing-und-export.md, Abschnitte
// 4-6 für die Begründung von Paket-Ort und Bibliotheken-Wahl.
//
// Bewusst schlichte Typografie ohne Farb-Akzente, ohne Logo/Kopfzeile (v1,
// Corporate-Design kommt mit Block 4 White-Label). Serif-Schriften sind die
// PDF-Standard-Fonts (Times-*), kein Font-Embedding nötig.
//
// pdfkit/docx werden bewusst per dynamischem `await import(...)` geladen,
// nicht statisch am Datei-Anfang: apps/web transpiliert @konsole/handlers
// (rohes TypeScript, kein Vorab-Build), ein statischer Import würde pdfkit/
// docx damit in Next.js' Webpack-Bundling-Pfad ziehen. pdfkit bringt eigene
// Font-Metriken-Dateien mit (z. B. Helvetica.afm), die Next.js beim
// Bundling nicht mitkopiert -- Laufzeitfehler "ENOENT ... Helvetica.afm" im
// ersten produktiven `next build`. Ein lazy Import lädt beide Pakete erst
// zur Aufrufzeit im Node-Serverprozess, unabhängig von Next.js-Bundling-
// Konfiguration. Siehe docs/decisions/2026-07-14_konsolen-setup-haertung.md,
// Baustein A.

import type { PressemitteilungDraft } from './schema.js';

type DocxParagraph = import('docx').Paragraph;
type DocxTextRun = import('docx').TextRun;
type DocxTextRunKlasse = typeof import('docx').TextRun;

export type PressemitteilungSegment =
  | { typ: 'headline'; text: string }
  | { typ: 'sub_headline'; text: string }
  | { typ: 'ort_datum'; text: string }
  | { typ: 'lead_absatz'; text: string }
  | { typ: 'ausfuehrung_absatz'; text: string; index: number }
  | { typ: 'zitat'; text: string; sprecher_name: string; sprecher_rolle: string }
  | { typ: 'boilerplate'; text: string }
  | { typ: 'kontakt_fusszeile'; text: string };

/**
 * Baut die Segment-Liste aus einem PressemitteilungDraft. sub_headline und
 * zitat sind nullable (siehe schema.ts) und werden übersprungen, wenn nicht
 * vorhanden -- entspricht dem Verhalten von pressemitteilung-ansicht.tsx.
 */
export function pressemitteilungSegmente(draft: PressemitteilungDraft): PressemitteilungSegment[] {
  const segmente: PressemitteilungSegment[] = [];

  segmente.push({ typ: 'headline', text: draft.headline });
  if (draft.sub_headline) {
    segmente.push({ typ: 'sub_headline', text: draft.sub_headline });
  }
  segmente.push({ typ: 'ort_datum', text: draft.ort_datum });
  segmente.push({ typ: 'lead_absatz', text: draft.lead_absatz });
  draft.ausfuehrung_absaetze.forEach((text, index) => {
    segmente.push({ typ: 'ausfuehrung_absatz', text, index });
  });
  if (draft.zitat) {
    segmente.push({
      typ: 'zitat',
      text: draft.zitat.text,
      sprecher_name: draft.zitat.sprecher_name,
      sprecher_rolle: draft.zitat.sprecher_rolle,
    });
  }
  segmente.push({ typ: 'boilerplate', text: draft.boilerplate });
  segmente.push({ typ: 'kontakt_fusszeile', text: draft.kontakt_fusszeile });

  return segmente;
}

// ============================================================
// Plain-Text: reine String-Konkatenation mit doppelten Umbrüchen zwischen
// Segmenten, für Copy-Paste in E-Mail-Programme.
// ============================================================

export function renderPressemitteilungText(draft: PressemitteilungDraft): string {
  const teile = pressemitteilungSegmente(draft).map((segment) =>
    segment.typ === 'zitat' ? `„${segment.text}“\n${segment.sprecher_name}, ${segment.sprecher_rolle}` : segment.text,
  );
  return teile.join('\n\n');
}

// ============================================================
// PDF: ruhige, professionelle Typografie -- Serif für Fließtext, A4,
// keine Farb-Akzente außer dezentem Grau für Meta-Informationen
// (Ort/Datum, Boilerplate, Kontakt), kein Logo/keine Kopfzeile (v1).
// ============================================================

const PDF_GRAU = '#555555';
const PDF_SCHWARZ = '#000000';

export async function renderPressemitteilungPdf(draft: PressemitteilungDraft): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const segment of pressemitteilungSegmente(draft)) {
      switch (segment.typ) {
        case 'headline':
          doc.font('Times-Bold').fontSize(20).fillColor(PDF_SCHWARZ).text(segment.text);
          doc.moveDown(0.5);
          break;
        case 'sub_headline':
          doc.font('Times-Italic').fontSize(13).fillColor(PDF_GRAU).text(segment.text);
          doc.moveDown(1);
          break;
        case 'ort_datum':
          doc.font('Times-Roman').fontSize(9).fillColor(PDF_GRAU).text(segment.text);
          doc.moveDown(1);
          break;
        case 'lead_absatz':
          doc.font('Times-Bold').fontSize(11).fillColor(PDF_SCHWARZ).text(segment.text, { align: 'justify' });
          doc.moveDown(1);
          break;
        case 'ausfuehrung_absatz':
          doc.font('Times-Roman').fontSize(11).fillColor(PDF_SCHWARZ).text(segment.text, { align: 'justify' });
          doc.moveDown(1);
          break;
        case 'zitat':
          doc
            .font('Times-Italic')
            .fontSize(11)
            .fillColor(PDF_SCHWARZ)
            .text(`„${segment.text}“`, { align: 'justify', indent: 20 });
          doc.font('Times-Roman').fontSize(9).fillColor(PDF_GRAU).text(`${segment.sprecher_name}, ${segment.sprecher_rolle}`, { indent: 20 });
          doc.moveDown(1);
          break;
        case 'boilerplate':
          doc.font('Times-Roman').fontSize(9).fillColor(PDF_GRAU).text(segment.text);
          doc.moveDown(1);
          break;
        case 'kontakt_fusszeile':
          doc.font('Times-Roman').fontSize(9).fillColor(PDF_GRAU).text(segment.text);
          break;
      }
    }

    doc.end();
  });
}

// ============================================================
// Word (.docx): Standardformatierung, damit die Beraterin sofort in ihrem
// Word-Workflow weiterarbeiten kann. Headline als Heading 1, Absätze als
// echte Absätze, Zitat als eigener, eingerückter Absatz.
// ============================================================

const DOCX_GRAU = '666666';

/** Zerlegt Text an \n in mehrere TextRuns mit expliziten Zeilenumbrüchen (docx kennt kein automatisches \n-Handling). */
function zeilenTextRuns(
  TextRun: DocxTextRunKlasse,
  text: string,
  optionen: { italics?: boolean; bold?: boolean; size?: number; color?: string } = {},
): DocxTextRun[] {
  return text.split('\n').map((zeile, index) => new TextRun({ text: zeile, break: index > 0 ? 1 : undefined, ...optionen }));
}

export async function renderPressemitteilungDocx(draft: PressemitteilungDraft): Promise<Buffer> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const children: DocxParagraph[] = [];

  for (const segment of pressemitteilungSegmente(draft)) {
    switch (segment.typ) {
      case 'headline':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: zeilenTextRuns(TextRun, segment.text) }));
        break;
      case 'sub_headline':
        children.push(new Paragraph({ spacing: { after: 200 }, children: zeilenTextRuns(TextRun, segment.text, { italics: true, color: DOCX_GRAU }) }));
        break;
      case 'ort_datum':
        children.push(new Paragraph({ spacing: { after: 200 }, children: zeilenTextRuns(TextRun, segment.text, { size: 18, color: DOCX_GRAU }) }));
        break;
      case 'lead_absatz':
        children.push(new Paragraph({ spacing: { after: 200 }, children: zeilenTextRuns(TextRun, segment.text, { bold: true }) }));
        break;
      case 'ausfuehrung_absatz':
        children.push(new Paragraph({ spacing: { after: 200 }, children: zeilenTextRuns(TextRun, segment.text) }));
        break;
      case 'zitat':
        children.push(
          new Paragraph({ indent: { left: 400 }, children: zeilenTextRuns(TextRun, `„${segment.text}“`, { italics: true }) }),
        );
        children.push(
          new Paragraph({
            indent: { left: 400 },
            spacing: { after: 200 },
            children: zeilenTextRuns(TextRun, `${segment.sprecher_name}, ${segment.sprecher_rolle}`, { size: 18, color: DOCX_GRAU }),
          }),
        );
        break;
      case 'boilerplate':
        children.push(new Paragraph({ spacing: { after: 200 }, children: zeilenTextRuns(TextRun, segment.text, { size: 18, color: DOCX_GRAU }) }));
        break;
      case 'kontakt_fusszeile':
        children.push(new Paragraph({ children: zeilenTextRuns(TextRun, segment.text, { size: 18, color: DOCX_GRAU }) }));
        break;
    }
  }

  const dokument = new Document({ sections: [{ children }] });
  return Packer.toBuffer(dokument);
}

// ============================================================
// Dateinamen/MIME-Type: gemeinsam für die drei Export-Server-Actions.
// ============================================================

export type PressemitteilungExportFormat = 'pdf' | 'docx' | 'text';

export const PRESSEMITTEILUNG_EXPORT_MIME: Record<PressemitteilungExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain; charset=utf-8',
};

const PRESSEMITTEILUNG_EXPORT_EXTENSION: Record<PressemitteilungExportFormat, string> = {
  pdf: 'pdf',
  docx: 'docx',
  text: 'txt',
};

/** "Pressemitteilung_Firmenname_2026-07-13.pdf" -- Sonderzeichen im Firmennamen werden entfernt, damit der Dateiname überall gültig ist. */
export function pressemitteilungDateiname(firmenname: string, datum: Date, format: PressemitteilungExportFormat): string {
  const bereinigterName = firmenname.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  const isoDatum = datum.toISOString().slice(0, 10);
  return `Pressemitteilung_${bereinigterName || 'Kunde'}_${isoDatum}.${PRESSEMITTEILUNG_EXPORT_EXTENSION[format]}`;
}
