import { describe, expect, it } from 'vitest';
import { formatiereFuerExport } from '../../src/w2/export.js';
import { GUTER_DRAFT, W2_INPUT_STANDARD } from './fixtures.js';

describe('formatiereFuerExport', () => {
  it('übernimmt die Originalanfrage 1:1 in doc_end_appendix, inklusive der wörtlichen Fragen', () => {
    const exportVorbereitung = formatiereFuerExport(W2_INPUT_STANDARD, GUTER_DRAFT);

    expect(exportVorbereitung.doc_end_appendix).toContain(W2_INPUT_STANDARD.anfrage.medium_name);
    for (const frage of W2_INPUT_STANDARD.anfrage.fragen_woertlich) {
      expect(exportVorbereitung.doc_end_appendix).toContain(frage);
    }
  });

  it('baut einen Titel-Vorschlag aus Medium und Thema', () => {
    const exportVorbereitung = formatiereFuerExport(W2_INPUT_STANDARD, GUTER_DRAFT);

    expect(exportVorbereitung.doc_titel_vorschlag).toContain(W2_INPUT_STANDARD.anfrage.medium_name);
    expect(exportVorbereitung.doc_titel_vorschlag).toContain(W2_INPUT_STANDARD.anfrage.thema_beschreibung);
  });

  it('fasst background_information mit Quellenangabe im Kommentar zusammen', () => {
    const exportVorbereitung = formatiereFuerExport(W2_INPUT_STANDARD, GUTER_DRAFT);

    expect(exportVorbereitung.doc_kommentar_background).toContain(
      GUTER_DRAFT.background_information[0]!.topic_field,
    );
    expect(exportVorbereitung.doc_kommentar_background).toContain(
      GUTER_DRAFT.background_information[0]!.sources[0]!,
    );
  });
});
