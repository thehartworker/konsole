// Zod-Schemas für den W2-Output-Kontrakt (WORKFLOW_HANDLERS_v1.0.md "W2:
// Presseanfragen-Drafter"). AGENTS.md §3.3/§4: kein LLM-Output ohne
// Zod-Validierung. `pruefung` und `hinweise` sind Erweiterungen über den
// wörtlichen Spec-Ausschnitt hinaus, siehe docs/decisions/2026-07-12_w2-presseanfragen-drafter.md,
// Abschnitt "Output-Kontrakt-Erweiterung".

import { z } from 'zod';

export const BackgroundInformationSchema = z.object({
  topic_field: z.string().min(1),
  content: z.string().min(1),
  sources: z.array(z.string().min(1)),
  strategy_note: z.string().min(1),
});

/**
 * Stage-2-Draft-Schema. `key_messages` muss leer bleiben (v1 pausiert, wie
 * im Meta-System) -- superRefine statt z.tuple([]), damit die Fehlermeldung
 * erklärt, warum ein befülltes Array abgelehnt wird.
 */
export const CommsPlanSchema = z
  .object({
    what_were_doing: z.string().min(1),
    strategic_objectives: z.object({
      reputation: z.string().min(1),
      risk: z.string().min(1),
    }),
    reactive_statement: z.string().min(1).nullable(),
    background_information: z.array(BackgroundInformationSchema),
    open_questions: z.array(z.string().min(1)),
    key_messages: z.array(z.string()),
  })
  .superRefine((wert, ctx) => {
    if (wert.key_messages.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key_messages'],
        message: 'key_messages ist in v1 pausiert (WORKFLOW_HANDLERS_v1.0.md W2), muss ein leeres Array sein.',
      });
    }
  });

export type CommsPlanDraft = z.infer<typeof CommsPlanSchema>;

export const ExportVorbereitungSchema = z.object({
  doc_titel_vorschlag: z.string().min(1),
  doc_kommentar_background: z.string().min(1),
  doc_end_appendix: z.string().min(1),
});

export type ExportVorbereitung = z.infer<typeof ExportVorbereitungSchema>;

export const RegelVerstossSchema = z.object({
  regel_id: z.string().nullable(),
  baustein_name: z.string().nullable(),
  quelle: z.enum(['code', 'llm']),
  begruendung: z.string().min(1),
});

export type RegelVerstoss = z.infer<typeof RegelVerstossSchema>;

export const PruefungsErgebnisSchema = z.object({
  bestanden: z.boolean(),
  versuche: z.number().int().min(1),
  verstoesse: z.array(RegelVerstossSchema),
});

export const W2OutputSchema = z.object({
  comms_plan: CommsPlanSchema,
  export_vorbereitung: ExportVorbereitungSchema,
  // z.literal(true): Shadow-Mode strukturell im Schema erzwungen, siehe
  // Design-Decision "Shadow-Mode-Durchsetzung".
  benoetigt_menschliche_freigabe: z.literal(true),
  freigabe_grund: z.string().min(1),
  pruefung: PruefungsErgebnisSchema,
  hinweise: z.array(z.string()),
  audit_metadaten: z.object({
    verwendete_quellen: z.array(z.string()),
    modell: z.string().min(1),
    tokens_input: z.number().int().min(0),
    tokens_output: z.number().int().min(0),
  }),
});

export type W2Output = z.infer<typeof W2OutputSchema>;
