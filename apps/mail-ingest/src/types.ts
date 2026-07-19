// Persistenz-Schnittstelle für apps/mail-ingest (Issue #52, Aufgabe C).
// Interface-Pattern wie KlassifikationsRepository (packages/persistence):
// die Ingest-Schleife hängt nur vom Interface ab, SupabaseMailIngestRepository
// ist die produktive Implementierung (Service-Role-Client), Tests nutzen
// FakeMailIngestRepository (tests/fixtures.ts).

import type { AnhangMetadaten, KundenMailAnbindung } from '@konsole/mail-ingest';

export type MailVerarbeitungsStatus = 'angenommen' | 'duplikat' | 'kein_kunde_zugeordnet' | 'fehler';

export interface VorgangAnlegenEingabe {
  agenturId: string;
  kundeId: string;
  absenderIdentifikator: string;
  eingangAt: string;
  betreff: string | null;
  inhaltText: string;
  metadatenKanalspezifisch: Record<string, unknown>;
}

export interface MailEingangLogEintrag {
  messageId: string;
  kundenMailAnbindungId: string;
  vorgangId: string | null;
  verarbeitungsStatus: MailVerarbeitungsStatus;
  fehlerMeldung?: string | null;
}

export interface ModusBVerbindungsdaten {
  imapHost: string;
  imapPort: number;
  imapBenutzername: string;
  imapOrdner: string;
  verarbeitetOrdner: string;
}

export interface MailIngestRepository {
  aktiveAnbindungenLaden(): Promise<KundenMailAnbindung[]>;
  istDuplikat(messageId: string): Promise<boolean>;
  /** Für KlassifikationsKontext.kunde_slug, siehe @konsole/classifier. */
  kundeSlugLaden(kundeId: string): Promise<string | null>;
  vorgangAnlegen(eingabe: VorgangAnlegenEingabe): Promise<string>;
  vorgangAnhaengeAktualisieren(vorgangId: string, anhaenge: AnhangMetadaten[]): Promise<void>;
  mailEingangLogSchreiben(eintrag: MailEingangLogEintrag): Promise<void>;
  /** Modus B: Host/Port/Benutzername/Ordner für den Verbindungsaufbau (kein Passwort, siehe unten). */
  modusBVerbindungsdatenLaden(anbindungId: string): Promise<ModusBVerbindungsdaten | null>;
  /** Modus B: entschlüsselt das IMAP-Passwort einer Anbindung für den Verbindungsaufbau. */
  passwortEntschluesseln(anbindungId: string, schluessel: string): Promise<string | null>;
}
