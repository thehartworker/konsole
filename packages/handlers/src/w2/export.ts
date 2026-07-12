// Stage 4: Formatierung für Export. Kein echter Google-Docs-Push in v1
// (WORKFLOW_HANDLERS_v1.0.md "W2": "analog zum Drive-Push-v1.7"), nur die
// vorbereitete Struktur. doc_end_appendix enthält die Originalanfrage 1:1,
// inklusive aller fragen_woertlich im Original-Wortlaut.

import type { CommsPlanDraft, ExportVorbereitung } from './schema.js';
import type { W2Input } from './types.js';

const TITEL_MAX_LAENGE = 200;

export function formatiereExport(input: W2Input, draft: CommsPlanDraft): ExportVorbereitung {
  const { anfrage } = input;

  const journalistTeil = anfrage.journalist_name ? ` (${anfrage.journalist_name})` : '';
  const titel = `Comms-Plan: ${anfrage.medium_name}${journalistTeil} - ${anfrage.thema_beschreibung}`.slice(
    0,
    TITEL_MAX_LAENGE,
  );

  const kommentar =
    draft.background_information.length > 0
      ? draft.background_information.map((eintrag) => `${eintrag.topic_field}: ${eintrag.content}`).join('\n\n')
      : 'Kein Background hinterlegt.';

  const appendixZeilen: string[] = [
    `Medium: ${anfrage.medium_name}`,
    anfrage.journalist_name ? `Journalist:in: ${anfrage.journalist_name}` : null,
    anfrage.journalist_kontakt ? `Kontakt: ${anfrage.journalist_kontakt}` : null,
    anfrage.ressort ? `Ressort: ${anfrage.ressort}` : null,
    anfrage.frist_at ? `Frist: ${anfrage.frist_at}` : null,
    `Format gewünscht: ${anfrage.format_gewuenscht}`,
    anfrage.sprecher_vorgeschlagen ? `Sprecher:in vorgeschlagen: ${anfrage.sprecher_vorgeschlagen}` : null,
    '',
    `Themenbeschreibung: ${anfrage.thema_beschreibung}`,
    '',
    'Fragen im Original-Wortlaut:',
    ...(anfrage.fragen_woertlich.length > 0
      ? anfrage.fragen_woertlich.map((frage, index) => `${index + 1}. ${frage}`)
      : ['(keine wörtlichen Fragen übermittelt)']),
  ].filter((zeile): zeile is string => zeile !== null);

  return {
    doc_titel_vorschlag: titel,
    doc_kommentar_background: kommentar,
    doc_end_appendix: appendixZeilen.join('\n'),
  };
}
