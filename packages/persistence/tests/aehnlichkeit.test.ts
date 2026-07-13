import { describe, expect, it } from 'vitest';
import { filterDubletten, istInhaltlichAehnlich } from '../src/aehnlichkeit.js';

describe('istInhaltlichAehnlich', () => {
  it('erkennt identische Texte als ähnlich', () => {
    expect(istInhaltlichAehnlich('Marktführer im Nischensegment', 'Marktführer im Nischensegment')).toBe(true);
  });

  it('erkennt Texte, die sich nur durch Groß-/Kleinschreibung und Satzzeichen unterscheiden, als ähnlich', () => {
    expect(istInhaltlichAehnlich('Marktführer im Nischensegment.', 'marktführer im nischensegment')).toBe(true);
  });

  it('erkennt zwei Texte mit fast identischem Wortlaut (ein abweichendes Zeichen) über die Bigramm-Überlappung als ähnlich, ohne exakt gleich zu sein', () => {
    const a = 'Wir beliefern Kunden in der gesamten DACH-Region mit hochwertigen Produkten seit 1998';
    const b = 'Wir beliefern Kunden in der gesamten DACH-Region mit hochwertigen Produkten seit 1999';
    expect(a).not.toBe(b);
    expect(istInhaltlichAehnlich(a, b)).toBe(true);
  });

  it('lehnt inhaltlich verschiedene Texte ab', () => {
    expect(istInhaltlichAehnlich('Marktführer im Nischensegment', 'Wir kommentieren laufende Verfahren nicht')).toBe(
      false,
    );
  });

  it('behandelt zwei leere Strings als ähnlich (beide inhaltsleer)', () => {
    expect(istInhaltlichAehnlich('', '')).toBe(true);
  });

  it('behandelt einen leeren gegen einen nicht-leeren String als unähnlich', () => {
    expect(istInhaltlichAehnlich('', 'Marktführer im Nischensegment')).toBe(false);
  });
});

describe('filterDubletten', () => {
  it('lässt einen Kandidaten ohne inhaltliche Überschneidung mit Bestehendem durch', () => {
    const ergebnis = filterDubletten(['Neue Kernbotschaft'], ['Marktführer im Nischensegment'], (x) => x);
    expect(ergebnis.einzufuegen).toEqual(['Neue Kernbotschaft']);
    expect(ergebnis.dublettenUebersprungen).toBe(0);
  });

  it('überspringt einen Kandidaten, der einem bestehenden Eintrag sehr ähnlich ist', () => {
    const ergebnis = filterDubletten(['Marktführer im Nischensegment.'], ['Marktführer im Nischensegment'], (x) => x);
    expect(ergebnis.einzufuegen).toEqual([]);
    expect(ergebnis.dublettenUebersprungen).toBe(1);
  });

  it('dedupliziert auch INNERHALB desselben Aufrufs (zwei fast identische Kandidaten im selben Extraktions-Lauf)', () => {
    const ergebnis = filterDubletten(
      ['Wir sind Marktführer im Nischensegment', 'Wir sind Marktführer im Nischensegment.'],
      [],
      (x) => x,
    );
    expect(ergebnis.einzufuegen).toEqual(['Wir sind Marktführer im Nischensegment']);
    expect(ergebnis.dublettenUebersprungen).toBe(1);
  });

  it('lässt mehrere inhaltlich unterschiedliche Kandidaten alle durch', () => {
    const ergebnis = filterDubletten(['Kernbotschaft A', 'Kernbotschaft B ganz anderer Art'], [], (x) => x);
    expect(ergebnis.einzufuegen).toHaveLength(2);
    expect(ergebnis.dublettenUebersprungen).toBe(0);
  });
});
