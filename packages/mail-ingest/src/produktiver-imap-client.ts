// Produktive ImapClient-Implementierung über imapflow (IDLE, TLS
// out-of-the-box, siehe docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md,
// Entscheidung 3). MIME-Parsing über mailparser, weil imapflow selbst nur
// den Roh-Envelope liefert, nicht die vollständige Body-/Anhang-Struktur.
//
// Ungetestet gegen einen echten IMAP-Server (siehe Issue #52, Abschnitt
// "Vorgehen": "die echte IMAP-Verbindung testen Bastian und ich zusammen
// nach dem Merge, wenn ein Postfach steht") -- die IDLE-Schleife folgt dem
// in der imapflow-Dokumentation beschriebenen Muster (client.idle() blockiert
// bis zum nächsten Server-Event oder Timeout, in einer Schleife erneut
// aufgerufen, bis gestoppt wird).

import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import type { ImapClient } from './imap-client.js';
import { klassifiziereImapFehler } from './imap-fehler.js';
import type { Anhang, ImapNachricht } from './types.js';

export interface ProduktiverImapClientOptionen {
  host: string;
  port: number;
  benutzername: string;
  passwort: string;
  ordner?: string;
  /** TLS explizit erzwingen/verweigern, default: Port 993 -> TLS, sonst STARTTLS. */
  secure?: boolean;
}

export class ProduktiverImapClient implements ImapClient {
  private readonly client: ImapFlow;
  private readonly ordner: string;
  private idleGestoppt = false;

  constructor(optionen: ProduktiverImapClientOptionen) {
    this.ordner = optionen.ordner ?? 'INBOX';
    this.client = new ImapFlow({
      host: optionen.host,
      port: optionen.port,
      secure: optionen.secure ?? optionen.port === 993,
      auth: { user: optionen.benutzername, pass: optionen.passwort },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.mailboxOpen(this.ordner);
    } catch (fehler) {
      throw klassifiziereImapFehler(fehler);
    }
  }

  async disconnect(): Promise<void> {
    this.idleGestoppt = true;
    try {
      await this.client.logout();
    } catch {
      this.client.close();
    }
  }

  async holeUngeleseneNachrichten(): Promise<ImapNachricht[]> {
    try {
      const nachrichten: ImapNachricht[] = [];
      for await (const rohNachricht of this.client.fetch({ seen: false }, { source: true, uid: true })) {
        if (!rohNachricht.source) continue;
        nachrichten.push(await parseNachricht(rohNachricht));
      }
      return nachrichten;
    } catch (fehler) {
      throw klassifiziereImapFehler(fehler);
    }
  }

  async starteIdle(callback: () => void): Promise<() => void> {
    this.idleGestoppt = false;
    this.client.on('exists', () => callback());

    void (async () => {
      while (!this.idleGestoppt) {
        try {
          if (!this.client.usable) break;
          await this.client.idle();
        } catch {
          break;
        }
      }
    })();

    return () => {
      this.idleGestoppt = true;
    };
  }

  async verschiebeNachricht(uid: number, zielOrdner: string): Promise<void> {
    try {
      await this.client.messageMove(uid, zielOrdner, { uid: true });
    } catch (fehler) {
      throw klassifiziereImapFehler(fehler);
    }
  }

  async markiereAlsGelesen(uid: number): Promise<void> {
    try {
      await this.client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    } catch (fehler) {
      throw klassifiziereImapFehler(fehler);
    }
  }
}

async function parseNachricht(rohNachricht: FetchMessageObject): Promise<ImapNachricht> {
  const geparst = await simpleParser(rohNachricht.source as Buffer);
  const anhaenge: Anhang[] = (geparst.attachments ?? []).map((anhang) => ({
    dateiname: anhang.filename ?? 'unbenannt',
    contentType: anhang.contentType,
    groesseBytes: anhang.size,
    inhalt: anhang.content,
  }));

  return {
    uid: rohNachricht.uid,
    messageId: geparst.messageId ?? `<ohne-message-id-${rohNachricht.uid}@unbekannt>`,
    von: geparst.from?.value[0]?.address ?? '',
    an: adressListe(geparst.to),
    cc: adressListe(geparst.cc),
    bcc: adressListe(geparst.bcc),
    betreff: geparst.subject ?? null,
    textBody: geparst.text ?? null,
    htmlBody: typeof geparst.html === 'string' ? geparst.html : null,
    datum: (geparst.date ?? new Date()).toISOString(),
    anhaenge,
  };
}

function adressListe(feld: AddressObject | AddressObject[] | undefined): string[] {
  if (!feld) return [];
  const objekte = Array.isArray(feld) ? feld : [feld];
  return objekte.flatMap((objekt) => objekt.value.map((eintrag) => eintrag.address).filter((a): a is string => Boolean(a)));
}
