// OrdneNachrichtZuKundenAnbindung (Issue #52, Aufgabe B).

import { parsePlusAdresse } from './plus-adresse.js';
import type { ImapNachricht, KundenMailAnbindung } from './types.js';

export interface OrdneNachrichtZuKundenAnbindungOptionen {
  /**
   * Nur für Modus B relevant: die IMAP-Verbindung, aus der die Nachricht
   * gelesen wurde, ist bereits eindeutig einer Anbindung zugeordnet
   * (dieselben Zugangsdaten = dieselbe Anbindung) -- keine Header-Analyse
   * nötig, siehe Issue #52, Aufgabe B.
   */
  modusBAnbindungId?: string;
}

/**
 * Findet die zu einer eingegangenen Nachricht passende
 * kunden_mail_anbindungen-Zeile.
 *
 * Modus A: die Empfänger-Adressen (To/Cc/Bcc) werden gegen konsolen_adresse
 * der aktiven weiterleitung-Anbindungen geprüft (case-insensitiv, weil
 * E-Mail-Adressen im Local-Part zwar theoretisch case-sensitiv sind, in der
 * Praxis aber nie so behandelt werden).
 *
 * Modus B: siehe modusBAnbindungId oben.
 *
 * Gibt null zurück, wenn keine Anbindung passt (verarbeitungs_status
 * 'kein_kunde_zugeordnet' beim Aufrufer, siehe apps/mail-ingest).
 */
export function ordneNachrichtZuKundenAnbindung(
  nachricht: ImapNachricht,
  alleAnbindungen: KundenMailAnbindung[],
  optionen: OrdneNachrichtZuKundenAnbindungOptionen = {},
): KundenMailAnbindung | null {
  if (optionen.modusBAnbindungId) {
    return alleAnbindungen.find((a) => a.id === optionen.modusBAnbindungId && a.aktiv) ?? null;
  }

  const empfaenger = [...nachricht.an, ...nachricht.cc, ...nachricht.bcc];
  const weiterleitungsAnbindungen = alleAnbindungen.filter(
    (a) => a.aktiv && a.anbindungsTyp === 'weiterleitung' && a.konsolenAdresse,
  );

  for (const adresse of empfaenger) {
    // parsePlusAdresse dient hier als Formvalidierung (nur Adressen, die
    // überhaupt wie eine Plus-Adresse aussehen, kommen als Kandidat infrage)
    // -- der eigentliche Abgleich läuft über den vollständigen, in
    // konsolen_adresse hinterlegten String, nicht über die einzelnen
    // Slug-Teile, weil konsolen_adresse bereits die vollständige erwartete
    // Adresse ist.
    if (!parsePlusAdresse(adresse)) continue;
    const treffer = weiterleitungsAnbindungen.find(
      (a) => a.konsolenAdresse!.toLowerCase() === adresse.toLowerCase(),
    );
    if (treffer) return treffer;
  }

  return null;
}
