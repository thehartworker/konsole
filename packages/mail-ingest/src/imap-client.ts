// ImapClient-Interface (Issue #52, Aufgabe B). Interface-Pattern wie
// LLMProvider (packages/llm) / KlassifikationsRepository
// (packages/persistence): Geschäftslogik hängt nur vom Interface ab, die
// produktive Implementierung (ProduktiverImapClient, produktiver-imap-client.ts)
// nutzt imapflow, Tests nutzen FakeImapClient (src/testing/).

import type { ImapNachricht } from './types.js';

export interface ImapClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Alle noch nicht als gelesen markierten Nachrichten im konfigurierten Ordner. */
  holeUngeleseneNachrichten(): Promise<ImapNachricht[]>;

  /**
   * Startet IMAP-IDLE (RFC 2177): callback wird bei jeder Server-Push-
   * Benachrichtigung über neue Nachrichten aufgerufen (der Aufrufer holt die
   * Nachrichten danach selbst über holeUngeleseneNachrichten()). Gibt eine
   * Stop-Funktion zurück, die IDLE beendet (für Graceful Shutdown, Aufgabe C).
   */
  starteIdle(callback: () => void): Promise<() => void>;

  verschiebeNachricht(uid: number, zielOrdner: string): Promise<void>;
  markiereAlsGelesen(uid: number): Promise<void>;
}
