import { describe, expect, it } from 'vitest';
import { CommsPlanSchema, W2OutputSchema } from '../../src/w2/schema.js';
import { formatiereExport } from '../../src/w2/export.js';
import { GUTER_DRAFT, W2_INPUT_BASIS } from './fixtures.js';

describe('CommsPlanSchema', () => {
  it('akzeptiert einen gültigen Draft', () => {
    expect(CommsPlanSchema.safeParse(GUTER_DRAFT).success).toBe(true);
  });

  it('lehnt ein befülltes key_messages-Array ab (v1 pausiert)', () => {
    const ungueltig = { ...GUTER_DRAFT, key_messages: ['Etwas'] };
    const ergebnis = CommsPlanSchema.safeParse(ungueltig);

    expect(ergebnis.success).toBe(false);
  });

  it('lehnt background_information ohne sources-Array ab', () => {
    const ungueltig = {
      ...GUTER_DRAFT,
      background_information: [{ topic_field: 'x', content: 'y', strategy_note: 'z' }],
    };
    expect(CommsPlanSchema.safeParse(ungueltig).success).toBe(false);
  });
});

describe('W2OutputSchema', () => {
  function validerOutput() {
    return {
      comms_plan: GUTER_DRAFT,
      export_vorbereitung: formatiereExport(W2_INPUT_BASIS, GUTER_DRAFT),
      benoetigt_menschliche_freigabe: true as const,
      freigabe_grund: 'Standard: jeder Comms Plan muss vor Kunden-Weiterleitung Beraterin-freigegeben werden.',
      pruefung: { bestanden: true, versuche: 1, verstoesse: [] },
      hinweise: [],
      audit_metadaten: {
        verwendete_quellen: ['externes_wissen'],
        modell: 'mock-model',
        tokens_input: 100,
        tokens_output: 50,
      },
    };
  }

  it('akzeptiert einen vollständig gültigen W2Output', () => {
    expect(W2OutputSchema.safeParse(validerOutput()).success).toBe(true);
  });

  it('lehnt benoetigt_menschliche_freigabe = false ab (Shadow-Mode strukturell erzwungen)', () => {
    const ungueltig = { ...validerOutput(), benoetigt_menschliche_freigabe: false };
    expect(W2OutputSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt negative Token-Zahlen ab', () => {
    const ungueltig = { ...validerOutput(), audit_metadaten: { ...validerOutput().audit_metadaten, tokens_input: -1 } };
    expect(W2OutputSchema.safeParse(ungueltig).success).toBe(false);
  });

  it('lehnt einen fehlenden freigabe_grund ab', () => {
    const { freigabe_grund, ...ohneFreigabeGrund } = validerOutput();
    expect(W2OutputSchema.safeParse(ohneFreigabeGrund).success).toBe(false);
  });
});
