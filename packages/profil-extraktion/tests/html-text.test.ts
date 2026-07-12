import { describe, expect, it } from 'vitest';
import { htmlZuText } from '../src/html-text.js';

describe('htmlZuText', () => {
  it('extrahiert Fließtext aus einfachen Block-Elementen mit Zeilenumbrüchen', () => {
    const html = '<html><body><h1>Über uns</h1><p>Wir sind eine Agentur.</p><p>Zweiter Absatz.</p></body></html>';
    expect(htmlZuText(html)).toBe('Über uns\nWir sind eine Agentur.\nZweiter Absatz.');
  });

  it('entfernt script- und style-Blöcke vollständig', () => {
    const html = '<p>Sichtbar</p><script>alert("boese");</script><style>.x{color:red}</style><p>Auch sichtbar</p>';
    expect(htmlZuText(html)).toBe('Sichtbar\nAuch sichtbar');
  });

  it('entfernt HTML-Kommentare', () => {
    const html = '<p>Vor</p><!-- versteckter Kommentar --><p>Nach</p>';
    expect(htmlZuText(html)).toBe('Vor\nNach');
  });

  it('dekodiert deutsche Umlaut-Entities und Standard-Entities', () => {
    const html = '<p>Gr&ouml;&szlig;e &amp; Qualit&auml;t &lt;garantiert&gt;</p>';
    expect(htmlZuText(html)).toBe('Größe & Qualität <garantiert>');
  });

  it('wandelt <br> in einen Zeilenumbruch statt in ein Leerzeichen', () => {
    const html = '<p>Zeile eins<br>Zeile zwei</p>';
    expect(htmlZuText(html)).toBe('Zeile eins\nZeile zwei');
  });

  it('kollabiert überschüssigen Whitespace innerhalb einer Zeile', () => {
    const html = '<p>Viel     Leerraum\n\t  hier</p>';
    expect(htmlZuText(html)).toBe('Viel Leerraum hier');
  });

  it('gibt einen leeren String für reinen Markup-Text ohne Inhalt zurück', () => {
    expect(htmlZuText('<div><span></span></div>')).toBe('');
  });
});
