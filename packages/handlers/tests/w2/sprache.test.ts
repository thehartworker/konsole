import { describe, expect, it } from 'vitest';
import { istWahrscheinlichDeutsch } from '../../src/w2/sprache.js';

describe('istWahrscheinlichDeutsch', () => {
  it('erkennt klar deutschen Text als Deutsch', () => {
    const text =
      'Die Redaktion hat eine Anfrage zum Thema Marktentwicklung gestellt, und wir bereiten eine sachliche und faktenbasierte Antwort vor, die sich auf die aktuelle Situation des Kunden bezieht.';
    expect(istWahrscheinlichDeutsch(text)).toBe(true);
  });

  it('erkennt klar englischen Text NICHT als Deutsch', () => {
    const text =
      'We are currently working on a response to the journalist and will follow up with more information soon regarding this topic and the current situation.';
    expect(istWahrscheinlichDeutsch(text)).toBe(false);
  });

  it('bewertet sehr kurzen Text konservativ als Deutsch (keine False-Positive-Retry-Schleife)', () => {
    expect(istWahrscheinlichDeutsch('Kurzer Text.')).toBe(true);
    expect(istWahrscheinlichDeutsch('Short text.')).toBe(true);
  });

  it('bewertet Text ohne eindeutige Funktionswörter (z. B. Eigennamen-Liste) konservativ als Deutsch', () => {
    const text = 'München Berlin Hamburg Frankfurt Köln Stuttgart Düsseldorf Leipzig';
    expect(istWahrscheinlichDeutsch(text)).toBe(true);
  });

  it('toleriert einzelne englische Fachbegriffe in einem sonst deutschen Satz', () => {
    const text =
      'Die Beraterin hat den Case Study Ansatz geprüft und wird die Ergebnisse in den kommenden Tagen mit dem Kunden besprechen, weil das Thema für die Positionierung wichtig ist.';
    expect(istWahrscheinlichDeutsch(text)).toBe(true);
  });
});
