// In-Memory-Fake für ImapClient (Issue #52, Aufgabe B). Für Tests in
// packages/mail-ingest UND apps/mail-ingest (End-to-End, siehe
// apps/mail-ingest/tests) -- kein echter Netzwerk-/TLS-Zugriff, kein
// externer IMAP-Server nötig.

import type { ImapClient } from '../imap-client.js';
import type { ImapNachricht } from '../types.js';

export class FakeImapClient implements ImapClient {
  verbunden = false;
  readonly verschobeneNachrichten: Array<{ uid: number; zielOrdner: string }> = [];
  readonly alsGelesenMarkiert: number[] = [];
  private posteingang: ImapNachricht[];
  private idleCallback: (() => void) | null = null;

  constructor(anfangsPosteingang: ImapNachricht[] = []) {
    this.posteingang = [...anfangsPosteingang];
  }

  async connect(): Promise<void> {
    this.verbunden = true;
  }

  async disconnect(): Promise<void> {
    this.verbunden = false;
    this.idleCallback = null;
  }

  async holeUngeleseneNachrichten(): Promise<ImapNachricht[]> {
    return [...this.posteingang];
  }

  async starteIdle(callback: () => void): Promise<() => void> {
    this.idleCallback = callback;
    return () => {
      this.idleCallback = null;
    };
  }

  async verschiebeNachricht(uid: number, zielOrdner: string): Promise<void> {
    this.verschobeneNachrichten.push({ uid, zielOrdner });
    this.posteingang = this.posteingang.filter((nachricht) => nachricht.uid !== uid);
  }

  async markiereAlsGelesen(uid: number): Promise<void> {
    this.alsGelesenMarkiert.push(uid);
  }

  /** Test-Hilfsmethode: simuliert eine neu eingegangene Mail und löst IDLE aus. */
  simuliereEingehendeMail(nachricht: ImapNachricht): void {
    this.posteingang.push(nachricht);
    this.idleCallback?.();
  }
}
