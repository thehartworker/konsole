// Issue #45: die Export-Render-Funktion produziert für eine Test-
// Pressemitteilung erwartete PDF/DOCX/Plain-Text-Ausgaben. Snapshot für
// Plain-Text, für PDF/DOCX Inhalts-Assertion statt Byte-Vergleich (die
// erzeugten Bytes hängen von Bibliotheks-internen Details wie Zeitstempeln
// ab, siehe pdf-parse/jszip-Nutzung unten nur in Tests, nicht in
// Produktionscode).

import { describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse';
import JSZip from 'jszip';
import {
  pressemitteilungDateiname,
  pressemitteilungSegmente,
  renderPressemitteilungDocx,
  renderPressemitteilungPdf,
  renderPressemitteilungText,
} from '../../src/w1/export.js';
import { GUTER_DRAFT, GUTER_DRAFT_OHNE_ZITAT } from './fixtures.js';

describe('pressemitteilungSegmente', () => {
  it('enthält alle Pflicht-Segmente in Dokument-Reihenfolge', () => {
    const segmente = pressemitteilungSegmente(GUTER_DRAFT);
    expect(segmente.map((segment) => segment.typ)).toEqual([
      'headline',
      'sub_headline',
      'ort_datum',
      'lead_absatz',
      'ausfuehrung_absatz',
      'ausfuehrung_absatz',
      'zitat',
      'boilerplate',
      'kontakt_fusszeile',
    ]);
  });

  it('lässt sub_headline und zitat weg, wenn null', () => {
    const draft = { ...GUTER_DRAFT_OHNE_ZITAT, sub_headline: null };
    const segmente = pressemitteilungSegmente(draft);
    expect(segmente.some((segment) => segment.typ === 'sub_headline')).toBe(false);
    expect(segmente.some((segment) => segment.typ === 'zitat')).toBe(false);
  });

  it('nummeriert ausfuehrung_absaetze mit ihrem Array-Index', () => {
    const segmente = pressemitteilungSegmente(GUTER_DRAFT).filter((segment) => segment.typ === 'ausfuehrung_absatz');
    expect(segmente.map((segment) => (segment as { index: number }).index)).toEqual([0, 1]);
  });
});

describe('renderPressemitteilungText', () => {
  it('produziert den erwarteten Plain-Text (Snapshot)', () => {
    expect(renderPressemitteilungText(GUTER_DRAFT)).toMatchSnapshot();
  });

  it('lässt das Zitat-Segment weg, wenn zitat=null, ohne die übrigen Segmente zu verändern', () => {
    const text = renderPressemitteilungText(GUTER_DRAFT_OHNE_ZITAT);
    expect(text).not.toContain('Wir übernehmen Verantwortung');
    expect(text).toContain(GUTER_DRAFT.headline);
    expect(text).toContain(GUTER_DRAFT.boilerplate);
  });
});

describe('renderPressemitteilungPdf', () => {
  it('enthält headline, lead_absatz, Zitat-Text und Kontakt-Fußzeile als lesbaren Text', async () => {
    const buffer = await renderPressemitteilungPdf(GUTER_DRAFT);
    const { text } = await pdfParse(buffer);

    expect(text).toContain(GUTER_DRAFT.headline);
    expect(text).toContain(GUTER_DRAFT.lead_absatz);
    expect(text).toContain(GUTER_DRAFT.zitat!.text);
    expect(text).toContain(GUTER_DRAFT.zitat!.sprecher_name);
    expect(text).toContain(GUTER_DRAFT.kontakt_fusszeile);
  });

  it('erzeugt gültige PDF-Bytes (Magic Header %PDF)', async () => {
    const buffer = await renderPressemitteilungPdf(GUTER_DRAFT);
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });
});

describe('renderPressemitteilungDocx', () => {
  async function dokumentXmlText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const datei = zip.file('word/document.xml');
    if (!datei) throw new Error('word/document.xml fehlt im erzeugten .docx');
    return datei.async('text');
  }

  it('enthält headline, ausfuehrung_absaetze und Zitat-Sprecher im document.xml', async () => {
    const buffer = await renderPressemitteilungDocx(GUTER_DRAFT);
    const xml = await dokumentXmlText(buffer);

    expect(xml).toContain(GUTER_DRAFT.headline);
    for (const absatz of GUTER_DRAFT.ausfuehrung_absaetze) {
      expect(xml).toContain(absatz);
    }
    expect(xml).toContain(GUTER_DRAFT.zitat!.sprecher_name);
    expect(xml).toContain(GUTER_DRAFT.kontakt_fusszeile.split('\n')[0]);
  });

  it('lässt das Zitat weg, wenn zitat=null', async () => {
    const buffer = await renderPressemitteilungDocx(GUTER_DRAFT_OHNE_ZITAT);
    const xml = await dokumentXmlText(buffer);
    expect(xml).not.toContain(GUTER_DRAFT.zitat!.sprecher_name);
  });
});

describe('pressemitteilungDateiname', () => {
  it('baut "Pressemitteilung_Firmenname_YYYY-MM-DD.<ext>"', () => {
    const datum = new Date('2026-07-13T10:00:00Z');
    expect(pressemitteilungDateiname('Kunde X GmbH', datum, 'pdf')).toBe('Pressemitteilung_Kunde_X_GmbH_2026-07-13.pdf');
    expect(pressemitteilungDateiname('Kunde X GmbH', datum, 'docx')).toBe('Pressemitteilung_Kunde_X_GmbH_2026-07-13.docx');
    expect(pressemitteilungDateiname('Kunde X GmbH', datum, 'text')).toBe('Pressemitteilung_Kunde_X_GmbH_2026-07-13.txt');
  });

  it('entfernt Sonderzeichen aus dem Firmennamen', () => {
    const datum = new Date('2026-07-13T10:00:00Z');
    expect(pressemitteilungDateiname('Müller & Cie. AG', datum, 'pdf')).toBe('Pressemitteilung_Müller_Cie_AG_2026-07-13.pdf');
  });
});
