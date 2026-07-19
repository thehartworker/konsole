// Verbindungsmanagement: IDLE-Loop plus Fallback-Poll für EINE IMAP-
// Verbindung (Issue #52, Aufgabe C). Eine Verbindung bedient entweder das
// geteilte Konsolen-Postfach (Modus A, alle weiterleitung-Anbindungen) oder
// genau ein Kunden-Postfach (Modus B).

import type { ImapClient, KundenMailAnbindung, OrdneNachrichtZuKundenAnbindungOptionen } from '@konsole/mail-ingest';
import { verarbeiteNachricht, type VerarbeiteNachrichtAbhaengigkeiten } from './verarbeite-nachricht.js';

export interface VerbindungsStatus {
  bezeichnung: string;
  letzteMailAt: string | null;
}

export interface StarteVerbindungOptionen {
  bezeichnung: string;
  imapClient: ImapClient;
  verarbeitetOrdner: string;
  anbindungenLaden: () => Promise<KundenMailAnbindung[]>;
  zuordnungsOptionen?: OrdneNachrichtZuKundenAnbindungOptionen;
  abhaengigkeiten: VerarbeiteNachrichtAbhaengigkeiten;
  fallbackPollIntervallMs: number;
  status: VerbindungsStatus;
}

export interface AktiveVerbindung {
  stoppen(): Promise<void>;
}

export async function starteVerbindung(optionen: StarteVerbindungOptionen): Promise<AktiveVerbindung> {
  const { imapClient, abhaengigkeiten, status } = optionen;
  const logger = abhaengigkeiten.logger.child({ verbindung: optionen.bezeichnung });

  await imapClient.connect();
  logger.info('IMAP-Verbindung hergestellt');

  // Verhindert überlappende Läufe, wenn IDLE-Push und Fallback-Poll fast
  // gleichzeitig feuern (Issue #52, Aufgabe C, Schritt 2).
  let laeuftGerade = false;

  const verarbeiteNeueMails = async () => {
    if (laeuftGerade) return;
    laeuftGerade = true;
    try {
      const nachrichten = await imapClient.holeUngeleseneNachrichten();
      if (nachrichten.length === 0) return;

      const anbindungen = await optionen.anbindungenLaden();

      for (const nachricht of nachrichten) {
        const ergebnis = await verarbeiteNachricht(nachricht, anbindungen, abhaengigkeiten, optionen.zuordnungsOptionen);
        status.letzteMailAt = new Date().toISOString();

        if (ergebnis.sollVerschobenWerden) {
          await imapClient.verschiebeNachricht(nachricht.uid, optionen.verarbeitetOrdner);
        }

        logger.info({ messageId: nachricht.messageId, status: ergebnis.status }, 'Nachricht verarbeitet');
      }
    } catch (fehler) {
      logger.error(
        { fehler: fehler instanceof Error ? fehler.message : String(fehler) },
        'Fehler beim Abholen neuer Nachrichten -- Verbindung bleibt bestehen, nächster Versuch beim nächsten Push/Poll',
      );
    } finally {
      laeuftGerade = false;
    }
  };

  const stoppeIdle = await imapClient.starteIdle(() => {
    void verarbeiteNeueMails();
  });

  const pollTimer = setInterval(() => void verarbeiteNeueMails(), optionen.fallbackPollIntervallMs);

  // Erstlauf direkt nach Verbindungsaufbau, nicht erst beim ersten Push/Poll.
  void verarbeiteNeueMails();

  return {
    async stoppen() {
      clearInterval(pollTimer);
      stoppeIdle();
      await imapClient.disconnect();
      logger.info('IMAP-Verbindung geschlossen');
    },
  };
}
