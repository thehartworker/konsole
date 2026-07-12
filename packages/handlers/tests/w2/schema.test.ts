import { describe, expect, it } from 'vitest';
import { W2OutputSchema } from '../../src/w2/schema.js';
import { W2_FREIGABE_GRUND } from '../../src/w2/types.js';
import { GUTER_DRAFT } from './fixtures.js';

function gueltigerW2Output() {
  return {
    comms_plan: { ...GUTER_DRAFT, key_messages: [] },
    export_vorbereitung: {
      doc_titel_vorschlag: 'Comms-Plan: Wirtschafts-Rundschau – Marktentwicklung',
      doc_kommentar_background: 'Marktposition: ...',
      doc_end_appendix: 'Medium: Wirtschafts-Rundschau\n...',
    },
    benoetigt_menschliche_freigabe: true,
    freigabe_grund: W2_FREIGABE_GRUND,
    pruefung: { verstoesse: [], versuche: 1, alle_regeln_bestanden: true },
    audit_metadaten: {
      verwendete_quellen: ['externes_wissen'],
      modell: 'mock-model',
      dauer_ms: 42,
      tokens_input: 500,
      tokens_output: 300,
    },
  };
}

describe('W2OutputSchema', () => {
  it('validiert einen vollständigen, korrekten W2Output', () => {
    const ergebnis = W2OutputSchema.safeParse(gueltigerW2Output());
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt benoetigt_menschliche_freigabe = false ab (harte Shadow-Mode-Regel)', () => {
    const output = { ...gueltigerW2Output(), benoetigt_menschliche_freigabe: false };
    const ergebnis = W2OutputSchema.safeParse(output);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt einen abweichenden freigabe_grund-Text ab', () => {
    const output = { ...gueltigerW2Output(), freigabe_grund: 'Ein anderer Grund' };
    const ergebnis = W2OutputSchema.safeParse(output);
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt background_information ohne sources nicht direkt ab (Zod prüft nur Struktur, sources: [] ist strukturell valide)', () => {
    const output = gueltigerW2Output();
    output.comms_plan.background_information = [
      { topic_field: 'X', content: 'Y', sources: [], strategy_note: 'Z' },
    ];
    const ergebnis = W2OutputSchema.safeParse(output);
    // Bewusst: die Quellenangabe-Pflicht ist eine 19-Punkte-Check-Regel
    // (pruefung.ts), keine Zod-Struktur-Regel -- Zod prüft nur den Typ.
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt einen fehlenden Pflicht-Feld (what_were_doing) ab', () => {
    const output = gueltigerW2Output();
    // @ts-expect-error -- absichtlich ungültig für den Test
    delete output.comms_plan.what_were_doing;
    const ergebnis = W2OutputSchema.safeParse(output);
    expect(ergebnis.success).toBe(false);
  });

  it('akzeptiert reactive_statement = null', () => {
    const output = gueltigerW2Output();
    output.comms_plan.reactive_statement = null;
    const ergebnis = W2OutputSchema.safeParse(output);
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt ein unbekanntes pruefung.verstoesse[].regel ab', () => {
    const output = gueltigerW2Output();
    output.pruefung.verstoesse = [
      // @ts-expect-error -- absichtlich ungültiger Regel-Slug für den Test
      { regel: 'nicht_existierende_regel', quelle: 'code_check', begruendung: 'x' },
    ];
    const ergebnis = W2OutputSchema.safeParse(output);
    expect(ergebnis.success).toBe(false);
  });
});
