// Nachrichten-Input-Schema, aus SAAS_SPEC_v1.0_CONSOLE.md §2.3 übernommen.
// Die für die Klassifikations-Funktion zwingenden Felder laut Auftrag
// (kanal, absender, betreff, inhalt_text, kunde_id) sind non-optional, der
// Rest optional mit sinnvollen Defaults beim Prompt-Bau.

export type Kanal = 'email' | 'whatsapp_text' | 'whatsapp_audio' | 'dateiablage' | 'manuell';

export type AudioTranskriptQualitaet = 'gut' | 'maessig' | 'schlecht' | 'n/a';

export interface Anhang {
  dateiname: string;
  typ: string;
  groesse_bytes?: number;
}

export interface Absender {
  identifikator: string;
  aufgeloester_name: string | null;
  aufgeloeste_rolle: string | null;
}

export interface EingehendeNachricht {
  vorgang_id: string;
  agentur_id: string;
  kunde_id: string;
  kanal: Kanal;
  absender: Absender;
  eingang_at: string;
  betreff: string | null;
  inhalt_text: string;
  inhalt_originalsprache?: string | null;
  anhaenge?: Anhang[];
  metadaten_kanalspezifisch?: Record<string, unknown>;
  audio_originaldauer_sekunden?: number | null;
  audio_transkript_qualitaet?: AudioTranskriptQualitaet | null;
}

/** Kunden-Kontext für den Prompt, unabhängig von der DB-Schicht (Teil 2). */
export interface KlassifikationsKontext {
  kunde_slug: string;
  /** Kurzliste bekannter Ansprechpartner:innen für die Absender-Auflösung, optional. */
  kontakte?: Array<{ name: string; rolle: string }>;
}
