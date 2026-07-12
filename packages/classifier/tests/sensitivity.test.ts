import { describe, expect, it } from 'vitest';
import { erkenneSensitivitaetHardrules } from '../src/sensitivity.js';

describe('erkenneSensitivitaetHardrules', () => {
  it('erkennt ein Krisen-Signal im Inhalt', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: null,
      inhalt_text: 'Wir haben gerade einen Shitstorm auf Social Media, bitte dringend melden.',
    });
    expect(treffer?.sensitivity).toBe('krise');
  });

  it('erkennt ein Vertraulichkeits-Signal (Embargo)', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: 'Embargo bis Freitag',
      inhalt_text: 'Die Zahlen sind vertraulich, bitte noch nicht weitergeben.',
    });
    expect(treffer?.sensitivity).toBe('vertraulich');
  });

  it('erkennt ein Art.-9-DSGVO-Signal (Gesundheit)', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: null,
      inhalt_text: 'Der Mitarbeiter hat eine ernste Diagnose bekommen und möchte das intern klären.',
    });
    expect(treffer?.sensitivity).toBe('besonders_geschuetzt');
  });

  it('erkennt ein Pharma-Compliance-Signal (regulatorisch relevant)', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: null,
      inhalt_text: 'Die Studie zeigt eine neue Nebenwirkung des Wirkstoffs, wir brauchen ein Statement.',
    });
    expect(treffer?.sensitivity).toBe('regulatorisch_relevant');
  });

  it('gibt null für unauffälligen Text zurück', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: null,
      inhalt_text: 'Können wir bis Freitag den Website-Text für die neue Produktlinie bekommen?',
    });
    expect(treffer).toBeNull();
  });

  it('prüft auch den Betreff, nicht nur den Inhalt', () => {
    const treffer = erkenneSensitivitaetHardrules({
      betreff: 'Rückruf-Aktion notwendig',
      inhalt_text: 'Details folgen.',
    });
    expect(treffer?.sensitivity).toBe('krise');
  });
});
