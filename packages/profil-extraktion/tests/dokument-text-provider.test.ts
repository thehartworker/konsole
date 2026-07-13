// Tests für die produktive DokumentTextProvider-Implementierung. text/html
// laufen mit dem ECHTEN Extraktor (keine Bibliothek, keine Binärdatei nötig).
// pdf/docx nutzen einen injizierten Fake-Extraktor statt echter PDF-/Word-
// Bytes -- die eigentliche Byte-Extraktion delegiert an pdf-parse/mammoth
// (etablierte Bibliotheken), diese Tests decken die PROVIDER-Logik ab
// (Dispatch, Whitespace-Normalisierung, Fehlerbehandlung bei leerem/
// fehlerhaftem Ergebnis), analog dazu, wie AnthropicProvider-Tests fetchImpl
// mocken statt HTTP-Bytes von Hand nachzubauen.

import { describe, expect, it } from 'vitest';
import { ProduktiverDokumentTextProvider } from '../src/dokument-text-provider.js';
import type { HochgeladeneDatei } from '../src/types.js';

function datei(teil: Partial<HochgeladeneDatei>): HochgeladeneDatei {
  return {
    quelldokumentId: 'doc-1',
    dateiname: 'test.txt',
    typ: 'text',
    inhalt: new Uint8Array(),
    ...teil,
  };
}

describe('ProduktiverDokumentTextProvider', () => {
  it('extrahiert reinen Text-Dateiinhalt unverändert (bis auf Whitespace-Normalisierung)', async () => {
    const provider = new ProduktiverDokumentTextProvider();
    const inhalt = new TextEncoder().encode('Erste Zeile   mit Leerraum.\n\nZweite Zeile.\n');

    const ergebnis = await provider.textExtrahieren(datei({ typ: 'text', dateiname: 'notiz.txt', inhalt }));

    expect(ergebnis.bezeichnung).toBe('notiz.txt');
    expect(ergebnis.text).toBe('Erste Zeile mit Leerraum.\nZweite Zeile.');
  });

  it('extrahiert HTML-Dateiinhalt über htmlZuText', async () => {
    const provider = new ProduktiverDokumentTextProvider();
    const inhalt = new TextEncoder().encode('<html><body><h1>Titel</h1><p>Absatz.</p></body></html>');

    const ergebnis = await provider.textExtrahieren(datei({ typ: 'html', dateiname: 'seite.html', inhalt }));

    expect(ergebnis.text).toBe('Titel\nAbsatz.');
  });

  it('dispatcht auf den injizierten pdf-Extraktor und normalisiert dessen Ausgabe', async () => {
    const provider = new ProduktiverDokumentTextProvider({
      extraktoren: { pdf: async () => '  Geschäftsbericht 2025  \n\n  Umsatz gestiegen.  ' },
    });

    const ergebnis = await provider.textExtrahieren(datei({ typ: 'pdf', dateiname: 'bericht.pdf' }));

    expect(ergebnis.text).toBe('Geschäftsbericht 2025\nUmsatz gestiegen.');
  });

  it('dispatcht auf den injizierten docx-Extraktor', async () => {
    const provider = new ProduktiverDokumentTextProvider({
      extraktoren: { docx: async () => 'Sprachregelungen laut Word-Dokument.' },
    });

    const ergebnis = await provider.textExtrahieren(datei({ typ: 'docx', dateiname: 'sprachregeln.docx' }));

    expect(ergebnis.text).toBe('Sprachregelungen laut Word-Dokument.');
  });

  it('wirft einen sprechenden Fehler, wenn der zugrundeliegende Extraktor fehlschlägt', async () => {
    const provider = new ProduktiverDokumentTextProvider({
      extraktoren: {
        pdf: async () => {
          throw new Error('beschädigte PDF-Struktur');
        },
      },
    });

    await expect(provider.textExtrahieren(datei({ typ: 'pdf', dateiname: 'defekt.pdf' }))).rejects.toThrow(
      'Parsing fehlgeschlagen',
    );
  });

  it('wirft einen sprechenden Fehler, wenn nach der Extraktion kein Text übrig bleibt', async () => {
    const provider = new ProduktiverDokumentTextProvider({
      extraktoren: { pdf: async () => '   \n  \n  ' },
    });

    await expect(provider.textExtrahieren(datei({ typ: 'pdf', dateiname: 'leer.pdf' }))).rejects.toThrow(
      'kein Text extrahierbar',
    );
  });
});
