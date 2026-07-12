import { describe, expect, it } from 'vitest';
import { loeseNutzerIdAusPersonSlug, slugifiziereName } from '../src/slug.js';

describe('slugifiziereName', () => {
  it('erzeugt aus "Julia Schmidt" den erwarteten Slug aus dem §3.4-Beispiel', () => {
    expect(slugifiziereName('Julia Schmidt')).toBe('julia_schmidt');
  });

  it('transliteriert Umlaute konsistent zu bestehenden Slugs im Datenmodell (z. B. "baeckerei-hoffmann")', () => {
    expect(slugifiziereName('Björn Müller')).toBe('bjoern_mueller');
    expect(slugifiziereName('Weißmann')).toBe('weissmann');
  });

  it('normalisiert mehrere Leerzeichen und Sonderzeichen zu einem einzigen Unterstrich', () => {
    expect(slugifiziereName('  Klaus  Hoffmann-Meyer ')).toBe('klaus_hoffmann_meyer');
  });
});

describe('loeseNutzerIdAusPersonSlug', () => {
  const nutzerListe = [
    { id: 'n1', name: 'Julia Schmidt' },
    { id: 'n2', name: 'Klaus Hoffmann' },
  ];

  it('löst einen bekannten Slug zur korrekten nutzer.id auf', () => {
    expect(loeseNutzerIdAusPersonSlug('julia_schmidt', nutzerListe)).toBe('n1');
  });

  it('gibt null zurück, wenn kein Nutzer zum Slug passt', () => {
    expect(loeseNutzerIdAusPersonSlug('unbekannte_person', nutzerListe)).toBeNull();
  });

  it('gibt null zurück, wenn person_slug selbst null ist', () => {
    expect(loeseNutzerIdAusPersonSlug(null, nutzerListe)).toBeNull();
  });
});
