import { describe, expect, it } from 'vitest';
import { htmlZuText } from '../src/html-zu-text.js';

describe('htmlZuText', () => {
  it('entfernt Tags und wandelt Absätze in Zeilenumbrüche um', () => {
    expect(htmlZuText('<p>Erster Absatz.</p><p>Zweiter Absatz.</p>')).toBe('Erster Absatz.\nZweiter Absatz.');
  });

  it('wandelt <br> in Zeilenumbrüche um', () => {
    expect(htmlZuText('Zeile eins<br>Zeile zwei')).toBe('Zeile eins\nZeile zwei');
  });

  it('dekodiert HTML-Entities', () => {
    expect(htmlZuText('Tom &amp; Jerry &lt;info&gt;')).toBe('Tom & Jerry <info>');
  });

  it('entfernt script- und style-Blöcke vollständig', () => {
    expect(htmlZuText('<style>.a{color:red}</style><p>Text</p><script>alert(1)</script>')).toBe('Text');
  });

  it('bewahrt Umlaute', () => {
    expect(htmlZuText('<p>Rückfrage zur Verfügung stellen</p>')).toBe('Rückfrage zur Verfügung stellen');
  });
});
