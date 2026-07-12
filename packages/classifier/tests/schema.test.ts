import { describe, expect, it } from 'vitest';
import { KlassifikationsErgebnisSchema, findUmlautErsatz } from '../src/schema.js';
import { GUTER_OUTPUT, SCHLECHTER_OUTPUT } from './fixtures.js';

describe('KlassifikationsErgebnisSchema', () => {
  it('akzeptiert den positiven Referenz-Output aus SAAS_SPEC §3.4', () => {
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(GUTER_OUTPUT);
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt einen Output ohne anliegen[] ab', () => {
    const ohneAnliegen = { ...GUTER_OUTPUT, anliegen: [] };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ohneAnliegen);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt einen ungültigen typ_primaer ab', () => {
    const ungueltig = { ...GUTER_OUTPUT, typ_primaer: 'Presseanfrage' };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ungueltig);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt confidence außerhalb 0-100 ab', () => {
    const ungueltig = { ...GUTER_OUTPUT, confidence: 145 };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ungueltig);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt eine verbotene Phrase in antwort_nachricht ab (§7.1)', () => {
    const ungueltig = { ...GUTER_OUTPUT, antwort_nachricht: 'Wir freuen uns über deine Nachricht.' };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ungueltig);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt Umlaut-Ersatzformen in antwort_nachricht ab (AGENTS.md §3.5)', () => {
    const ungueltig = { ...GUTER_OUTPUT, antwort_nachricht: 'Wir koennten uns morgen melden.' };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ungueltig);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt Selbst-Nummerierung in rueckfragen ab (§3.2)', () => {
    const ungueltig = {
      ...GUTER_OUTPUT,
      rueckfragen: ['1. Bis wann brauchst du den Text?'],
      rueckfrage_nachricht: 'Kurze Frage dazu.',
    };
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(ungueltig);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt den negativen Referenz-Output aus §7.4 wegen mehrerer Verletzungen ab', () => {
    const ergebnis = KlassifikationsErgebnisSchema.safeParse(SCHLECHTER_OUTPUT);
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) {
      const pfade = ergebnis.error.issues.map((issue) => issue.path.join('.'));
      expect(pfade).toContain('antwort_nachricht');
    }
  });
});

describe('findUmlautErsatz', () => {
  it('findet bekannte Ersatzformen case-insensitiv', () => {
    expect(findUmlautErsatz('Koennten Sie das bitte pruefen?')).toContain('koennten');
  });

  it('findet keine Treffer in einem sauberen Umlaut-Text', () => {
    expect(findUmlautErsatz('Könntest du das bitte prüfen? Wir würden uns freuen.')).toEqual([]);
  });
});
