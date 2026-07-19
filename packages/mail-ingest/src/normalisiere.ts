// NormalisiereZuKlassifikatorNachricht (Issue #52, Aufgabe B). Mappt eine
// ImapNachricht auf die vom Klassifikator erwartete Struktur
// (@konsole/classifier, EingehendeNachricht). vorgang_id/agentur_id/
// kunde_id/anhaenge fehlen hier bewusst -- die entstehen erst beim
// Vorgangs-Insert bzw. beim Anhänge-Upload in apps/mail-ingest, dieses Paket
// kennt keine Datenbank (siehe packages/mail-ingest/README bzw. Aufgabe B).

import type { Absender, Kanal } from '@konsole/classifier';
import { htmlZuText } from './html-zu-text.js';
import type { ImapNachricht, KundenMailAnbindung } from './types.js';

export interface NormalisierteNachricht {
  kanal: Kanal;
  absender: Absender;
  eingang_at: string;
  betreff: string | null;
  inhalt_text: string;
  metadaten_kanalspezifisch: Record<string, unknown>;
}

export function normalisiereZuKlassifikatorNachricht(
  nachricht: ImapNachricht,
  anbindung: KundenMailAnbindung,
): NormalisierteNachricht {
  const inhaltText = nachricht.textBody?.trim()
    ? nachricht.textBody.trim()
    : nachricht.htmlBody
      ? htmlZuText(nachricht.htmlBody)
      : '';

  return {
    kanal: 'email',
    absender: {
      identifikator: nachricht.von,
      aufgeloester_name: null,
      aufgeloeste_rolle: null,
    },
    eingang_at: nachricht.datum,
    betreff: nachricht.betreff,
    inhalt_text: inhaltText,
    metadaten_kanalspezifisch: {
      message_id: nachricht.messageId,
      an: nachricht.an,
      headers_ausgewaehlt: { cc: nachricht.cc, bcc: nachricht.bcc },
      anbindung_id: anbindung.id,
      anbindungs_typ: anbindung.anbindungsTyp,
    },
  };
}
