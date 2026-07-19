// Kern der Ingest-Schleife pro Nachricht (Issue #52, Aufgabe C, Schritte
// a-e). Reine, testbare Funktion -- IMAP-Verbindungsmanagement (IDLE-Loop,
// Fallback-Poll, Reconnect) liegt in verbindung.ts, das diese Funktion pro
// Nachricht aufruft.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMProvider } from '@konsole/llm';
import {
  normalisiereZuKlassifikatorNachricht,
  ordneNachrichtZuKundenAnbindung,
  speichereAnhaenge,
  type ImapNachricht,
  type KundenMailAnbindung,
  type OrdneNachrichtZuKundenAnbindungOptionen,
} from '@konsole/mail-ingest';
import { klassifiziereUndPersistiere, type KlassifikationsRepository } from '@konsole/persistence';
import type { Logger } from './logger.js';
import type { MailIngestRepository } from './types.js';

export type VerarbeitungsErgebnis =
  | { status: 'angenommen'; vorgangId: string; sollVerschobenWerden: true }
  | { status: 'duplikat'; sollVerschobenWerden: true }
  | { status: 'kein_kunde_zugeordnet'; sollVerschobenWerden: false }
  | { status: 'fehler'; fehlerMeldung: string; sollVerschobenWerden: false };

export interface VerarbeiteNachrichtAbhaengigkeiten {
  repo: MailIngestRepository;
  klassifikationsRepo: KlassifikationsRepository;
  provider: LLMProvider;
  supabaseClient: SupabaseClient;
  logger: Logger;
}

export async function verarbeiteNachricht(
  nachricht: ImapNachricht,
  anbindungen: KundenMailAnbindung[],
  deps: VerarbeiteNachrichtAbhaengigkeiten,
  optionen: OrdneNachrichtZuKundenAnbindungOptionen = {},
): Promise<VerarbeitungsErgebnis> {
  try {
    if (await deps.repo.istDuplikat(nachricht.messageId)) {
      deps.logger.info({ messageId: nachricht.messageId }, 'Mail bereits verarbeitet, überspringe (Duplikat)');
      return { status: 'duplikat', sollVerschobenWerden: true };
    }

    const anbindung = ordneNachrichtZuKundenAnbindung(nachricht, anbindungen, optionen);
    if (!anbindung) {
      if (optionen.modusBAnbindungId) {
        // Modus B: die Anbindung existiert (id bekannt), ist aber gerade
        // deaktiviert worden -- kunden_mail_anbindung_id bleibt gültig
        // referenzierbar, ein Log-Eintrag ist möglich.
        await deps.repo.mailEingangLogSchreiben({
          messageId: nachricht.messageId,
          kundenMailAnbindungId: optionen.modusBAnbindungId,
          vorgangId: null,
          verarbeitungsStatus: 'kein_kunde_zugeordnet',
        });
      } else {
        // Modus A: das Konsolen-Postfach wird von allen Agenturen geteilt
        // (siehe Design-Decision) -- ohne Treffer gibt es keine gültige
        // kunden_mail_anbindung_id (NOT NULL, siehe Migration) und keine
        // eindeutige agentur_id für die RLS-Policy auf mail_eingang_log.
        // Ops-Sichtbarkeit läuft für diesen Fall bewusst ausschließlich über
        // strukturiertes Logging, nicht über die Tabelle.
        deps.logger.warn(
          { messageId: nachricht.messageId, an: nachricht.an, cc: nachricht.cc },
          'Mail im Konsolen-Postfach ohne zuordenbare Anbindung -- kein DB-Log-Eintrag möglich (geteiltes Postfach, siehe Kommentar)',
        );
      }
      return { status: 'kein_kunde_zugeordnet', sollVerschobenWerden: false };
    }

    const normalisiert = normalisiereZuKlassifikatorNachricht(nachricht, anbindung);

    const kundeSlug = await deps.repo.kundeSlugLaden(anbindung.kundeId);
    if (!kundeSlug) {
      throw new Error(`Kunde ${anbindung.kundeId} nicht gefunden oder gelöscht.`);
    }

    const vorgangId = await deps.repo.vorgangAnlegen({
      agenturId: anbindung.agenturId,
      kundeId: anbindung.kundeId,
      absenderIdentifikator: normalisiert.absender.identifikator,
      eingangAt: normalisiert.eingang_at,
      betreff: normalisiert.betreff,
      inhaltText: normalisiert.inhalt_text,
      metadatenKanalspezifisch: normalisiert.metadaten_kanalspezifisch,
    });

    if (nachricht.anhaenge.length > 0) {
      const anhaengeMetadaten = await speichereAnhaenge(
        nachricht.anhaenge,
        { agenturId: anbindung.agenturId, kundeId: anbindung.kundeId, vorgangId },
        deps.supabaseClient,
      );
      await deps.repo.vorgangAnhaengeAktualisieren(vorgangId, anhaengeMetadaten);
    }

    await klassifiziereUndPersistiere({
      nachricht: {
        vorgang_id: vorgangId,
        agentur_id: anbindung.agenturId,
        kunde_id: anbindung.kundeId,
        kanal: normalisiert.kanal,
        absender: normalisiert.absender,
        eingang_at: normalisiert.eingang_at,
        betreff: normalisiert.betreff,
        inhalt_text: normalisiert.inhalt_text,
        metadaten_kanalspezifisch: normalisiert.metadaten_kanalspezifisch,
        anhaenge: nachricht.anhaenge.map((anhang) => ({
          dateiname: anhang.dateiname,
          typ: anhang.contentType,
          groesse_bytes: anhang.groesseBytes,
        })),
      },
      kontext: { kunde_slug: kundeSlug },
      provider: deps.provider,
      repo: deps.klassifikationsRepo,
    });

    await deps.repo.mailEingangLogSchreiben({
      messageId: nachricht.messageId,
      kundenMailAnbindungId: anbindung.id,
      vorgangId,
      verarbeitungsStatus: 'angenommen',
    });

    return { status: 'angenommen', vorgangId, sollVerschobenWerden: true };
  } catch (fehler) {
    const fehlerMeldung = fehler instanceof Error ? fehler.message : String(fehler);
    deps.logger.error({ messageId: nachricht.messageId, fehler: fehlerMeldung }, 'Verarbeitung der Mail fehlgeschlagen');

    try {
      const anbindung = ordneNachrichtZuKundenAnbindung(nachricht, anbindungen, optionen);
      if (anbindung) {
        await deps.repo.mailEingangLogSchreiben({
          messageId: nachricht.messageId,
          kundenMailAnbindungId: anbindung.id,
          vorgangId: null,
          verarbeitungsStatus: 'fehler',
          fehlerMeldung,
        });
      }
    } catch (logFehler) {
      deps.logger.error({ messageId: nachricht.messageId, logFehler }, 'Konnte fehler-Status auch nicht mehr loggen');
    }

    return { status: 'fehler', fehlerMeldung, sollVerschobenWerden: false };
  }
}
