import { describe, expect, it } from 'vitest';
import { formatiereExport } from '../../src/w2/export.js';
import { GUTER_DRAFT, W2_INPUT_BASIS } from './fixtures.js';

describe('formatiereExport', () => {
  it('enthält alle fragen_woertlich 1:1 im Appendix', () => {
    const ergebnis = formatiereExport(W2_INPUT_BASIS, GUTER_DRAFT);

    for (const frage of W2_INPUT_BASIS.anfrage.fragen_woertlich) {
      expect(ergebnis.doc_end_appendix).toContain(frage);
    }
  });

  it('doc_titel_vorschlag enthält Medium und Thema, maximal 200 Zeichen', () => {
    const ergebnis = formatiereExport(W2_INPUT_BASIS, GUTER_DRAFT);

    expect(ergebnis.doc_titel_vorschlag).toContain(W2_INPUT_BASIS.anfrage.medium_name);
    expect(ergebnis.doc_titel_vorschlag).toContain(W2_INPUT_BASIS.anfrage.thema_beschreibung);
    expect(ergebnis.doc_titel_vorschlag.length).toBeLessThanOrEqual(200);
  });

  it('doc_kommentar_background fasst background_information zusammen', () => {
    const ergebnis = formatiereExport(W2_INPUT_BASIS, GUTER_DRAFT);

    expect(ergebnis.doc_kommentar_background).toContain(GUTER_DRAFT.background_information[0].topic_field);
    expect(ergebnis.doc_kommentar_background).toContain(GUTER_DRAFT.background_information[0].content);
  });

  it('doc_kommentar_background hat einen definierten Fallback-Text ohne Background', () => {
    const draftOhneBackground = { ...GUTER_DRAFT, background_information: [] };
    const ergebnis = formatiereExport(W2_INPUT_BASIS, draftOhneBackground);

    expect(ergebnis.doc_kommentar_background).toBe('Kein Background hinterlegt.');
  });

  it('Appendix enthält Medium, Frist und Format als Kontext-Zeilen', () => {
    const ergebnis = formatiereExport(W2_INPUT_BASIS, GUTER_DRAFT);

    expect(ergebnis.doc_end_appendix).toContain(W2_INPUT_BASIS.anfrage.medium_name);
    expect(ergebnis.doc_end_appendix).toContain(W2_INPUT_BASIS.anfrage.frist_at as string);
    expect(ergebnis.doc_end_appendix).toContain(W2_INPUT_BASIS.anfrage.format_gewuenscht);
  });
});
