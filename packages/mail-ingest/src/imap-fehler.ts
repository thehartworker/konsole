// Fehler-Klassifikation für den IMAP-Client (Issue #52, Aufgabe B):
// transient (Netzwerk/Timeout, Reconnect lohnt sich) vs. permanent (falsche
// Zugangsdaten, TLS-Ablehnung, Ordner existiert nicht -- ein Retry ändert
// daran nichts). apps/mail-ingest nutzt das, um zu entscheiden, ob eine
// Verbindung erneut versucht wird oder die Anbindung als 'fehler' markiert
// bleibt, ohne die Ingest-Schleife zu crashen.

export type ImapFehlerTyp = 'transient' | 'permanent';

export class ImapFehler extends Error {
  readonly typ: ImapFehlerTyp;

  constructor(message: string, typ: ImapFehlerTyp, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImapFehler';
    this.typ = typ;
  }
}

const TRANSIENTE_FEHLERCODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EPIPE',
]);

const TRANSIENTES_MUSTER = /timeout|econn|network|temporarily unavailable/i;

export function klassifiziereImapFehler(fehler: unknown): ImapFehler {
  if (fehler instanceof ImapFehler) return fehler;

  const nachricht = fehler instanceof Error ? fehler.message : String(fehler);
  const code = (fehler as { code?: string } | undefined)?.code;
  const istTransient = (code && TRANSIENTE_FEHLERCODES.has(code)) || TRANSIENTES_MUSTER.test(nachricht);

  return new ImapFehler(nachricht, istTransient ? 'transient' : 'permanent', { cause: fehler });
}
