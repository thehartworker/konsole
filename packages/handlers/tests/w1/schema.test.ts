import { describe, expect, it } from 'vitest';
import { PressemitteilungSchema, W1OutputSchema } from '../../src/w1/schema.js';
import { GUTER_DRAFT } from './fixtures.js';

describe('PressemitteilungSchema', () => {
  it('akzeptiert einen gültigen Draft', () => {
    expect(PressemitteilungSchema.safeParse(GUTER_DRAFT).success).toBe(true);
  });

  it('akzeptiert einen Draft mit zitat=null und sub_headline=null', () => {
    const draft = { ...GUTER_DRAFT, zitat: null, sub_headline: null };
    expect(PressemitteilungSchema.safeParse(draft).success).toBe(true);
  });

  it('lehnt ein leeres ausfuehrung_absaetze-Array ab', () => {
    const ungueltig = { ...GUTER_DRAFT, ausfuehrung_absaetze: [] };
    expect(PressemitteilungSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt ein Zitat ohne sprecher_name ab', () => {
    const ungueltig = { ...GUTER_DRAFT, zitat: { text: 'x', sprecher_name: '', sprecher_rolle: 'y' } };
    expect(PressemitteilungSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt eine negative laenge_worte ab', () => {
    const ungueltig = { ...GUTER_DRAFT, laenge_worte: -1 };
    expect(PressemitteilungSchema.safeParse(ungueltig).success).toBe(false);
  });
});

describe('W1OutputSchema', () => {
  function validerOutput() {
    return {
      pressemitteilung: GUTER_DRAFT,
      kritiker_findings: [{ schweregrad: 'niedrig' as const, finding: 'x', empfehlung: 'y' }],
      grenz_pruefung_ergebnis: { bestanden: true, verstoesse: [] },
      ueberarbeitungsbeduerftig: false,
      benoetigt_menschliche_freigabe: true as const,
      freigabe_grund: 'Standard: jede Pressemitteilung muss vor Versand redaktionell freigegeben werden.',
      vorschlaege_fuer_naechste_schritte: ['Freigabe durch Beraterin'],
      hinweise: [],
      audit_metadaten: {
        verwendete_quellen: ['praezedenzen'],
        modell: 'mock-model',
        dauer_ms: 10,
        tokens_input: 100,
        tokens_output: 50,
      },
    };
  }

  it('akzeptiert einen vollständig gültigen W1Output', () => {
    expect(W1OutputSchema.safeParse(validerOutput()).success).toBe(true);
  });

  it('lehnt benoetigt_menschliche_freigabe = false ab (Shadow-Mode strukturell erzwungen)', () => {
    const ungueltig = { ...validerOutput(), benoetigt_menschliche_freigabe: false };
    expect(W1OutputSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt ein ungültiges schweregrad ab', () => {
    const ungueltig = { ...validerOutput(), kritiker_findings: [{ schweregrad: 'mega', finding: 'x', empfehlung: 'y' }] };
    expect(W1OutputSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt negative Token-Zahlen ab', () => {
    const ungueltig = { ...validerOutput(), audit_metadaten: { ...validerOutput().audit_metadaten, tokens_input: -1 } };
    expect(W1OutputSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt einen fehlenden freigabe_grund ab', () => {
    const { freigabe_grund, ...ohneFreigabeGrund } = validerOutput();
    expect(W1OutputSchema.safeParse(ohneFreigabeGrund).success).toBe(false);
  });

  it('lehnt eine negative dauer_ms ab', () => {
    const ungueltig = { ...validerOutput(), audit_metadaten: { ...validerOutput().audit_metadaten, dauer_ms: -1 } };
    expect(W1OutputSchema.safeParse(ungueltig).success).toBe(false);
  });
});
