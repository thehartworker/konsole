// Plus-Adressierung (RFC 5233) für Modus A: presse@kunde-domain.de wird beim
// Kunden auf {agentur-slug}+{kunde-slug}@intake.example.de weitergeleitet.
// Siehe docs/decisions/2026-07-19_email-kanal-imap-zwei-modi.md.

export interface GeparsteePlusAdresse {
  agenturSlug: string;
  kundeSlug: string;
  domain: string;
}

const PLUS_ADRESSE_MUSTER = /^([^+@\s]+)\+([^@\s]+)@([^\s@]+)$/;

/** Gibt null zurück, wenn die Adresse keine Plus-Adresse ist (kein "+" im Local-Part). */
export function parsePlusAdresse(adresse: string): GeparsteePlusAdresse | null {
  const treffer = PLUS_ADRESSE_MUSTER.exec(adresse.trim());
  if (!treffer) return null;
  const [, agenturSlug, kundeSlug, domain] = treffer;
  return { agenturSlug, kundeSlug, domain };
}

export function baueKonsolenAdresse(agenturSlug: string, kundeSlug: string, domain: string): string {
  return `${agenturSlug}+${kundeSlug}@${domain}`;
}
