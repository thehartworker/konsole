// Zod-Schemas für den W1-Output-Kontrakt (WORKFLOW_HANDLERS_v1.0.md "W1:
// Pressemitteilungs-Drafter"). AGENTS.md §3.3/§4: kein LLM-Output ohne
// Zod-Validierung. `grenz_pruefung_ergebnis`, `ueberarbeitungsbeduerftig` und
// `hinweise` sind Erweiterungen über den wörtlichen Spec-Ausschnitt hinaus,
// siehe docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md, Abschnitt
// "Output-Kontrakt-Erweiterungen". RegelVerstossSchema wird von w2/schema.ts
// wiederverwendet -- reines Zod-Bauteil ohne W2-Geschäftslogik, siehe
// Decision, Abschnitt 4.

import { z } from 'zod';
import { RegelVerstossSchema } from '../w2/schema.js';

export const ZitatSchema = z.object({
  text: z.string().min(1),
  sprecher_name: z.string().min(1),
  sprecher_rolle: z.string().min(1),
});

export const PressemitteilungSchema = z.object({
  headline: z.string().min(1),
  sub_headline: z.string().min(1).nullable(),
  ort_datum: z.string().min(1),
  lead_absatz: z.string().min(1),
  ausfuehrung_absaetze: z.array(z.string().min(1)).min(1),
  zitat: ZitatSchema.nullable(),
  boilerplate: z.string().min(1),
  kontakt_fusszeile: z.string().min(1),
  laenge_worte: z.number().int().min(0),
});

export type PressemitteilungDraft = z.infer<typeof PressemitteilungSchema>;

export const KritikerFindingSchema = z.object({
  schweregrad: z.enum(['niedrig', 'mittel', 'hoch']),
  finding: z.string().min(1),
  empfehlung: z.string().min(1),
});

export type KritikerFinding = z.infer<typeof KritikerFindingSchema>;

export const GrenzPruefungsErgebnisSchema = z.object({
  bestanden: z.boolean(),
  verstoesse: z.array(RegelVerstossSchema),
});

export const W1OutputSchema = z.object({
  pressemitteilung: PressemitteilungSchema,
  kritiker_findings: z.array(KritikerFindingSchema),
  grenz_pruefung_ergebnis: GrenzPruefungsErgebnisSchema,
  ueberarbeitungsbeduerftig: z.boolean(),
  // z.literal(true): Shadow-Mode strukturell im Schema erzwungen, siehe
  // Design-Decision "Shadow-Mode".
  benoetigt_menschliche_freigabe: z.literal(true),
  freigabe_grund: z.string().min(1),
  vorschlaege_fuer_naechste_schritte: z.array(z.string().min(1)),
  hinweise: z.array(z.string()),
  audit_metadaten: z.object({
    verwendete_quellen: z.array(z.string()),
    modell: z.string().min(1),
    dauer_ms: z.number().int().min(0),
    tokens_input: z.number().int().min(0),
    tokens_output: z.number().int().min(0),
  }),
});

export type W1Output = z.infer<typeof W1OutputSchema>;
