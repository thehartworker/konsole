// Stage 4: Formatierung für Export. Kein echter Google-Docs-Push in v1 (siehe
// WORKFLOW_HANDLERS_v1.0.md "W2" Stage 4 und "v1-Umfang"), nur die
// vorbereitete Struktur. Rein deterministisch, kein LLM-Aufruf -- damit ist
// die "Originalanfrage 1:1"-Anforderung für doc_end_appendix automatisch
// erfüllt (keine Paraphrasierungsgefahr durch ein Modell).

import type { CommsPlanLlmAusgabe } from './schema.js';
import type { ExportVorbereitung, W2Input } from './types.js';

function formatiereBackgroundKommentar(commsPlan: CommsPlanLlmAusgabe): string {
  if (commsPlan.background_information.length === 0) {
    return 'Kein Background-Material hinterlegt.';
  }
  return commsPlan.background_information
    .map(
      (eintrag) =>
        `${eintrag.topic_field}: ${eintrag.content} (Quellen: ${eintrag.sources.join(', ') || 'keine'})`,
    )
    .join('\n\n');
}

function formatiereOriginalanfrage(input: W2Input): string {
  const { anfrage } = input;
  const fragenBlock =
    anfrage.fragen_woertlich.length > 0
      ? anfrage.fragen_woertlich.map((frage, index) => `${index + 1}. ${frage}`).join('\n')
      : 'keine wörtlichen Fragen übermittelt';

  return [
    `Medium: ${anfrage.medium_name}`,
    `Journalist:in: ${anfrage.journalist_name ?? 'unbekannt'}${anfrage.journalist_kontakt ? ` (${anfrage.journalist_kontakt})` : ''}`,
    anfrage.ressort ? `Ressort: ${anfrage.ressort}` : null,
    `Thema: ${anfrage.thema_beschreibung}`,
    anfrage.frist_at ? `Frist: ${anfrage.frist_at}` : null,
    `Gewünschtes Format: ${anfrage.format_gewuenscht}`,
    '',
    'Fragen (wörtlich, 1:1):',
    fragenBlock,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join('\n');
}

export function formatiereFuerExport(input: W2Input, commsPlan: CommsPlanLlmAusgabe): ExportVorbereitung {
  return {
    doc_titel_vorschlag: `Comms-Plan: ${input.anfrage.medium_name} – ${input.anfrage.thema_beschreibung}`,
    doc_kommentar_background: formatiereBackgroundKommentar(commsPlan),
    doc_end_appendix: formatiereOriginalanfrage(input),
  };
}
