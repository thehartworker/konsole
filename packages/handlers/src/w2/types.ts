// W2-Presseanfragen-Drafter: Input-/Output-Kontrakt und interne Typen.
// Quelle: WORKFLOW_HANDLERS_v1.0.md, Abschnitt "W2: Presseanfragen-Drafter",
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md ("Erweiterung des
// Output-Vertrags: pruefung-Feld" für die Abweichung vom wörtlichen
// Spec-Ausschnitt).

export type FormatGewuenscht =
  | 'schriftliche_antworten'
  | 'interview_termin'
  | 'hintergrund_gespraech'
  | 'statement';

export interface W2Anfrage {
  medium_name: string;
  journalist_name: string | null;
  journalist_kontakt: string | null;
  ressort: string | null;
  thema_beschreibung: string;
  frist_at: string | null;
  fragen_woertlich: string[];
  format_gewuenscht: FormatGewuenscht;
  sprecher_vorgeschlagen: string | null;
  sprecher_rolle: string | null;
}

export interface W2KundeKontext {
  kunde_slug: string;
  sprachregelungen_slug: string;
  thema_positionierung: string | null;
}

export interface W2Input {
  anfrage: W2Anfrage;
  kunde_kontext: W2KundeKontext;
}

export interface BackgroundInformationEintrag {
  topic_field: string;
  content: string;
  sources: string[];
  strategy_note: string;
}

export interface StrategicObjectives {
  reputation: string;
  risk: string;
}

/** Die sechs Felder aus dem Meta-System-Output-Kontrakt (Stage 2). */
export interface CommsPlan {
  what_were_doing: string;
  strategic_objectives: StrategicObjectives;
  reactive_statement: string | null;
  background_information: BackgroundInformationEintrag[];
  open_questions: string[];
  /** In v1 immer leer (pausiert wie im Meta-System, siehe Spec). */
  key_messages: string[];
}

export interface ExportVorbereitung {
  doc_titel_vorschlag: string;
  doc_kommentar_background: string;
  /** Originalanfrage 1:1, siehe Stage 4. */
  doc_end_appendix: string;
}

export const PRUEFUNGS_REGEL = [
  'sprache_what_were_doing',
  'reactive_statement_nur_bei_sprachregelung',
  'keine_vermittlungsbezuege',
  'keine_prozesserklaerungen',
  'keine_vermutungen',
  'deadline_format_standardisiert',
  'keine_tier_nennung',
  'keine_framing_risiken',
  'action_items_nur_in_open_questions',
  'background_mit_quellenangabe',
  'deadline_schlusssatz_bei_frist',
  'questions_verbatim',
] as const;

export type PruefungsRegel = (typeof PRUEFUNGS_REGEL)[number];

export interface PruefungsVerstoss {
  regel: PruefungsRegel;
  quelle: 'code_check' | 'review_prompt';
  begruendung: string;
}

export interface PruefungsErgebnis {
  verstoesse: PruefungsVerstoss[];
  versuche: number;
  alle_regeln_bestanden: boolean;
}

export const W2_FREIGABE_GRUND =
  'Standard: jeder Comms Plan muss vor Kunden-Weiterleitung Beraterin-freigegeben werden.';

export interface AuditMetadaten {
  verwendete_quellen: string[];
  modell: string;
  dauer_ms: number;
  tokens_input: number;
  tokens_output: number;
}

export interface W2Output {
  comms_plan: CommsPlan;
  export_vorbereitung: ExportVorbereitung;
  benoetigt_menschliche_freigabe: true;
  freigabe_grund: typeof W2_FREIGABE_GRUND;
  pruefung: PruefungsErgebnis;
  audit_metadaten: AuditMetadaten;
}

export type W2LlmAufrufZweck = 'w2_draft' | 'w2_review';

export interface W2LlmAufrufProtokoll {
  zweck: W2LlmAufrufZweck;
  versuch: number;
  modell: string;
  tokens_input: number;
  tokens_output: number;
}

export type W2HandlerResultat =
  | { status: 'erfolg'; output: W2Output; llmAufrufe: W2LlmAufrufProtokoll[] }
  | { status: 'fehlgeschlagen'; fehler: string; llmAufrufe: W2LlmAufrufProtokoll[] };
