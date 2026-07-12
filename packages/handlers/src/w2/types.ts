// W2-Input-Kontrakt und Stage-1-Kontext-Typen, aus WORKFLOW_HANDLERS_v1.0.md
// "W2: Presseanfragen-Drafter" übernommen. Siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md,
// "Zu 4" für die Begründung der Fünf-Quellen-Kapselung und die v1-Stubs.

export type W2FormatGewuenscht =
  | 'schriftliche_antworten'
  | 'interview_termin'
  | 'hintergrund_gespraech'
  | 'statement';

export interface W2AnfrageInput {
  medium_name: string;
  journalist_name: string | null;
  journalist_kontakt: string | null;
  ressort: string | null;
  thema_beschreibung: string;
  frist_at: string | null;
  fragen_woertlich: string[];
  format_gewuenscht: W2FormatGewuenscht;
  sprecher_vorgeschlagen: string | null;
  sprecher_rolle: string | null;
}

export interface W2KundeKontextInput {
  kunde_slug: string;
  /** Welche Sprachregelungen aktiv sind, für die Stage-1-Auflösung über W2KontextQuellenProvider. */
  sprachregelungen_slug: string;
  thema_positionierung: string | null;
}

export interface W2Input {
  anfrage: W2AnfrageInput;
  kunde_kontext: W2KundeKontextInput;
}

/**
 * Wrapper für jede der fünf RAG-Quellen aus der Spec. `verfuegbar: false`
 * markiert sowohl echte v1-Stubs (SSOT, Journalisten-Profil) als auch
 * angebundene, aber leere Quellen (keine Sprachregelung/Präzedenz hinterlegt)
 * -- in beiden Fällen liefert die Stage-1-Kontext-Sammlung einen Fallback-
 * Hinweis statt eines Fehlers.
 */
export interface KontextQuelle<T> {
  name: string;
  verfuegbar: boolean;
  daten: T | null;
}

export interface SprachregelungsEintrag {
  thema: string;
  position_text: string;
}

export interface PraezedenzEintrag {
  anfrage_thema: string;
  antwort_auszug: string;
}

/**
 * Injizierbare Quelle für die zwei in v1 tatsächlich angebundenen RAG-Quellen
 * (Sprachregelungen, Client-Final-Präzedenzen). `packages/handlers` kennt
 * keine Datenbank -- die produktive Implementierung dieses Interfaces lebt
 * außerhalb dieses Pakets (Persistenz-Schicht), v1 liefert hier nur
 * `LeererW2KontextQuellenProvider` als Default (siehe kontext.ts).
 */
export interface W2KontextQuellenProvider {
  sprachregelungenLaden(sprachregelungenSlug: string, thema: string): Promise<SprachregelungsEintrag[]>;
  praezedenzenLaden(kundeSlug: string, thema: string): Promise<PraezedenzEintrag[]>;
}

export interface W2GesammelterKontext {
  sprachregelungen: KontextQuelle<SprachregelungsEintrag[]>;
  /** v1-Stub: kein Datenbestand für frühere Comms-Plans desselben Kunden angebunden. */
  ssot: KontextQuelle<never>;
  externes_wissen: KontextQuelle<string>;
  praezedenzen: KontextQuelle<PraezedenzEintrag[]>;
  /** v1-Stub: keine Journalisten-Artikel-Historie angebunden. */
  journalisten_profil: KontextQuelle<never>;
  /** Fallback-Warnungen aus Stage 1, z. B. "Onboarding empfohlen". Landen unverändert in W2Output.hinweise. */
  hinweise: string[];
}
