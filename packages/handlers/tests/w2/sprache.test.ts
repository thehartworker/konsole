import { describe, expect, it } from 'vitest';
import { istWahrscheinlichDeutsch } from '../../src/w2/sprache.js';

describe('istWahrscheinlichDeutsch', () => {
  it('erkennt deutschen Text an Stopwörtern', () => {
    expect(istWahrscheinlichDeutsch('Wir bereiten eine Antwort für die Redaktion vor und prüfen die Fakten.')).toBe(true);
  });

  it('erkennt deutschen Text an Umlauten, auch bei wenig Stopwort-Signal', () => {
    expect(istWahrscheinlichDeutsch('Rückruf betrifft größere Stückzahl.')).toBe(true);
  });

  it('erkennt englischen Text und liefert false', () => {
    expect(istWahrscheinlichDeutsch('We are preparing a written response for this journalist and the editorial team.')).toBe(
      false,
    );
  });

  it('leerer Text gilt als unverdächtig (kein Verstoß)', () => {
    expect(istWahrscheinlichDeutsch('')).toBe(true);
    expect(istWahrscheinlichDeutsch('   ')).toBe(true);
  });

  it('Text ohne Sprachsignal (z. B. reine Eigennamen) gilt als unverdächtig', () => {
    expect(istWahrscheinlichDeutsch('Acme Corp')).toBe(true);
  });
});
