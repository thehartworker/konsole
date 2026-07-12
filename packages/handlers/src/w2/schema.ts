// Zod-Schemas für W2 (AGENTS.md §3.3/§4: kein LLM-Output ohne Zod-Validierung).
// Getrennt in: was das LLM pro Stage liefert (roh, unvalidiert bis hierhin)
// versus der vollständige, intern zusammengesetzte W2Output-Vertrag.

import { z } from 'zod';
import { PRUEFUNGS_REGEL, W2_FREIGABE_GRUND } from './types.js';

export const BackgroundInformationSchema = z.object({
  topic_field: z.string().min(1),
  content: z.string().min(1),
  sources: z.array(z.string()),
  strategy_note: z.string().min(1),
});

/**
 * Was das Draft-LLM in Stage 2 liefert. key_messages ist bewusst NICHT Teil
 * dieses Schemas -- das Feld bleibt in v1 immer leer und wird deterministisch
 * in handler.ts gesetzt, nicht dem Modell überlassen (siehe Decision, Zu 3
 * Kontext: "in v1 leer" ist eine harte Invariante, keine Modell-Entscheidung).
 */
export const CommsPlanLlmAusgabeSchema = z.object({
  what_were_doing: z.string().min(1),
  strategic_objectives: z.object({
    reputation: z.string().min(1),
    risk: z.string().min(1),
  }),
  reactive_statement: z.string().min(1).nullable(),
  background_information: z.array(BackgroundInformationSchema),
  open_questions: z.array(z.string()),
});

export type CommsPlanLlmAusgabe = z.infer<typeof CommsPlanLlmAusgabeSchema>;

export const CommsPlanSchema = CommsPlanLlmAusgabeSchema.extend({
  key_messages: z.array(z.string()),
});

export const ExportVorbereitungSchema = z.object({
  doc_titel_vorschlag: z.string().min(1),
  doc_kommentar_background: z.string().min(1),
  doc_end_appendix: z.string().min(1),
});

export const PruefungsVerstossSchema = z.object({
  regel: z.enum(PRUEFUNGS_REGEL),
  quelle: z.enum(['code_check', 'review_prompt']),
  begruendung: z.string().min(1),
});

export const PruefungsErgebnisSchema = z.object({
  verstoesse: z.array(PruefungsVerstossSchema),
  versuche: z.number().int().min(1),
  alle_regeln_bestanden: z.boolean(),
});

export const AuditMetadatenSchema = z.object({
  verwendete_quellen: z.array(z.string()),
  modell: z.string().min(1),
  dauer_ms: z.number().int().min(0),
  tokens_input: z.number().int().min(0),
  tokens_output: z.number().int().min(0),
});

export const W2OutputSchema = z.object({
  comms_plan: CommsPlanSchema,
  export_vorbereitung: ExportVorbereitungSchema,
  benoetigt_menschliche_freigabe: z.literal(true),
  freigabe_grund: z.literal(W2_FREIGABE_GRUND),
  pruefung: PruefungsErgebnisSchema,
  audit_metadaten: AuditMetadatenSchema,
});

/**
 * Was das Review-LLM in Stage 3 für die vier urteilsbasierten Regeln liefert
 * (Vermittlungs-Bezüge, Prozess-Erklärungen, Vermutungen, Framing-Risiken --
 * siehe Decision, "Zu 3, Regel-Zuordnung"). Die restlichen acht Regeln sind
 * deterministische Code-Checks, siehe pruefung.ts.
 */
export const REVIEW_PROMPT_REGELN = [
  'keine_vermittlungsbezuege',
  'keine_prozesserklaerungen',
  'keine_vermutungen',
  'keine_framing_risiken',
] as const;

export const ReviewLlmAusgabeSchema = z.object({
  verstoesse: z.array(
    z.object({
      regel: z.enum(REVIEW_PROMPT_REGELN),
      begruendung: z.string().min(1),
    }),
  ),
});

export type ReviewLlmAusgabe = z.infer<typeof ReviewLlmAusgabeSchema>;
