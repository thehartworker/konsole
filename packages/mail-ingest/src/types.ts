// Kanal-Kern-Typen für den E-Mail-Ingest (Issue #52, Aufgabe B). Reine
// Business-Logik-Typen -- kein Supabase-Bezug hier (siehe apps/mail-ingest
// für die Verdrahtung mit der Datenbank).

export interface Anhang {
  dateiname: string;
  contentType: string;
  groesseBytes: number;
  inhalt: Uint8Array;
}

/** Normalisierte Repräsentation einer eingegangenen IMAP-Nachricht. */
export interface ImapNachricht {
  uid: number;
  messageId: string;
  von: string;
  an: string[];
  cc: string[];
  bcc: string[];
  betreff: string | null;
  textBody: string | null;
  htmlBody: string | null;
  /** ISO-8601, aus dem Date-Header der Nachricht. */
  datum: string;
  anhaenge: Anhang[];
}

export type MailAnbindungsTyp = 'weiterleitung' | 'imap_kundenpostfach';

/**
 * Projektion von kunden_mail_anbindungen auf das, was die Zuordnungs- und
 * Normalisierungs-Logik dieses Pakets braucht -- bewusst kein 1:1-Abbild der
 * DB-Zeile (kein imap_passwort_verschluesselt hier, das bleibt ausschließlich
 * Sache von apps/mail-ingest beim Verbindungsaufbau).
 */
export interface KundenMailAnbindung {
  id: string;
  kundeId: string;
  agenturId: string;
  anbindungsTyp: MailAnbindungsTyp;
  konsolenAdresse: string | null;
  aktiv: boolean;
}
