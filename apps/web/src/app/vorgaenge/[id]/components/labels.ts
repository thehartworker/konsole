// Deutsche Anzeige-Labels für die Detailansicht. Getrennt von den DB-Enum-
// Werten (englisch/technisch im Schema, siehe AGENTS.md §3.4), damit die
// UI-Sprache unabhängig von Schema-Änderungen bleibt.

export const KANAL_LABEL: Record<string, string> = {
  email: "E-Mail",
  whatsapp_text: "WhatsApp (Text)",
  whatsapp_audio: "WhatsApp (Sprachnachricht)",
  dateiablage: "Dateiablage",
  manuell: "Manuell erfasst",
};

export const SENSITIVITY_LABEL: Record<string, string> = {
  normal: "Normal",
  vertraulich: "Vertraulich",
  krise: "Krise",
  besonders_geschuetzt: "Besonders geschützt",
  regulatorisch_relevant: "Regulatorisch relevant",
};

export const PRIORITAET_LABEL: Record<string, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

export const HANDLER_LABEL: Record<string, string> = {
  W1_pressemitteilung_drafter: "W1 · Pressemitteilungs-Drafter",
  W2_presseanfragen_drafter: "W2 · Presseanfragen-Drafter",
  W3_monitoring_digest: "W3 · Monitoring-Digest",
  W4_journalisten_intelligence: "W4 · Journalisten-Intelligence",
  W5_terminbriefing: "W5 · Terminbriefing",
  W6_multichannel_transformer: "W6 · Multi-Channel-Transformer",
};

/** SAAS_SPEC §6.2: "Kein Prozent-Wert, sondern Kategorie". Schwelle wie §5.4 (Default 65). */
export function konfidenzKategorie(confidence: number | null): string {
  if (confidence === null) return "unbekannt";
  if (confidence >= 85) return "eindeutig";
  if (confidence >= 65) return "plausibel";
  return "mehrdeutig";
}

export function istSensitiverVorgang(sensitivity: string): boolean {
  return sensitivity !== "normal";
}
