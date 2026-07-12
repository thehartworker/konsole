// Zod-Schema für den §3.4-Klassifikations-Output (SAAS_SPEC_v1.0_CONSOLE.md).
// Jedes Feld aus dem §3.4-Beispiel ist abgebildet (siehe docs/decisions/2026-07-12_klassifikations-layer.md,
// "Zu 2"). Enum-Werte sind identisch zu den Postgres-Enums aus
// supabase/migrations/20260711130000_enums_und_basistabellen.sql.
//
// AGENTS.md §3.3/§4: kein LLM-Output ohne Zod-Validierung wird verwendet.
// Verletzung dieses Schemas ist ein definierter Fehler (siehe classify.ts),
// nie ein halb-gültiger Vorgang.

import { z } from 'zod';

export const VORGANG_TYP = [
  'Anfrage',
  'Projekt-Briefing',
  'To-Do',
  'FYI',
  'Freigabe',
  'Issue',
  'Krise',
  'Sonstiges',
] as const;

export const SENSITIVITY = [
  'normal',
  'vertraulich',
  'krise',
  'besonders_geschuetzt',
  'regulatorisch_relevant',
] as const;

export const PRIORITAET = ['hoch', 'mittel', 'niedrig'] as const;

export const HANDLER_SLUG = [
  'W1_pressemitteilung_drafter',
  'W2_presseanfragen_drafter',
  'W3_monitoring_digest',
  'W4_journalisten_intelligence',
  'W5_terminbriefing',
  'W6_multichannel_transformer',
] as const;

export const TRANSKRIPT_QUALITAET = ['gut', 'maessig', 'schlecht', 'n/a'] as const;

// §7.1: verbotene Phrasen im automatischen Output.
const VERBOTENE_PHRASEN: RegExp[] = [
  /in der heutigen schnelllebigen/i,
  /es ist wichtig zu betonen/i,
  /wir freuen uns/i,
];

// §7.1 / AGENTS.md §3.5: "nie als ae/oe/ue/ss". Ein generischer Regex auf
// ae|oe|ue hätte zu viele falsch-positive Treffer bei legitimen Wörtern
// (z. B. Eigennamen, Fremdwörtern). Stattdessen eine kuratierte, erweiterbare
// Wortliste der häufigsten deutschen Umlaut-Ersatzformen (siehe Design-
// Decision, "Zu 2"). Case-insensitive, Wortgrenzen-basiert.
const UMLAUT_ERSATZ_WOERTER = [
  'koennen', 'koennte', 'koennten', 'koenntest', 'koennt',
  'moechte', 'moechten', 'moechtest',
  'wuerde', 'wuerden', 'wuerdest',
  'fuer', 'ueber', 'gruen', 'schoen', 'groesse', 'groesser', 'groesste',
  'waere', 'waeren', 'muessen', 'muesste', 'duerfen',
  'hoeren', 'hoert', 'benoetigen', 'benoetigt', 'benoetigte',
  'wuenschen', 'wuenscht', 'gruesse', 'gruessen', 'strasse',
  'natuerlich', 'zurueck', 'frueh', 'spaeter', 'maessig',
] as const;

export function findUmlautErsatz(text: string): string[] {
  const treffer = new Set<string>();
  for (const wort of UMLAUT_ERSATZ_WOERTER) {
    if (new RegExp(`\\b${wort}\\b`, 'i').test(text)) {
      treffer.add(wort);
    }
  }
  return [...treffer];
}

const AnliegenSchema = z.object({
  anliegen_id: z.string().min(1),
  beschreibung: z.string().min(1),
  prioritaet: z.enum(PRIORITAET),
  frist_erschlossen: z.string().nullable(),
  frist_annahme: z.string().nullable(),
  backend_handler_vorschlag: z.enum(HANDLER_SLUG).nullable(),
  backend_handler_input: z.record(z.unknown()),
});

const RoutingSchema = z.object({
  rolle: z.string().min(1),
  person_slug: z.string().nullable(),
  verteiler: z.array(z.string()),
});

const BackendCallGeplantSchema = z.object({
  handler: z.enum(HANDLER_SLUG),
  anliegen_id: z.string().min(1),
});

const FelderSchema = z.object({
  absender_name: z.string().nullable(),
  absender_rolle: z.string().nullable(),
  erwaehnte_personen: z.array(z.string()),
});

export const KlassifikationsErgebnisSchema = z
  .object({
    vorgang_id: z.string().min(1),
    sprache_eingang: z.string().min(1),
    sprache_ausgang: z.string().min(1),
    typ_primaer: z.enum(VORGANG_TYP),
    typ_sekundaer: z.string().nullable(),
    confidence: z.number().int().min(0).max(100),
    sensitivity: z.enum(SENSITIVITY),
    verstandener_inhalt: z.string().min(1),
    transkript_qualitaet: z.enum(TRANSKRIPT_QUALITAET).nullable(),
    kunde_slug: z.string().min(1),
    prioritaet: z.enum(PRIORITAET),
    anliegen: z.array(AnliegenSchema).min(1),
    felder: FelderSchema,
    erschlossen: z.array(z.string()),
    annahmen: z.array(z.string()),
    missing_mandatory: z.array(z.string()),
    rueckfragen: z.array(z.string()),
    rueckfrage_nachricht: z.string().nullable(),
    antwort_nachricht: z.string().min(1),
    routing: RoutingSchema,
    backend_calls_geplant: z.array(BackendCallGeplantSchema),
    audit_summary: z.string().min(1),
    zusammenfassung: z.string().min(1),
  })
  .superRefine((wert, ctx) => {
    for (const feld of ['antwort_nachricht', 'rueckfrage_nachricht'] as const) {
      const text = wert[feld];
      if (!text) continue;

      for (const muster of VERBOTENE_PHRASEN) {
        if (muster.test(text)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [feld],
            message: `verbotene Phrase im Absender-Text erkannt (§7.1): ${muster}`,
          });
        }
      }

      const ersatzTreffer = findUmlautErsatz(text);
      if (ersatzTreffer.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [feld],
          message: `Umlaut-Ersatzform statt echtem Umlaut erkannt (AGENTS.md §3.5): ${ersatzTreffer.join(', ')}`,
        });
      }
    }

    if (wert.rueckfragen.some((frage) => /^\s*\d+[.)]/.test(frage))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rueckfragen'],
        message: 'Selbst-Nummerierung in Rückfragen ist nicht erlaubt (§3.2), die UI nummeriert.',
      });
    }
  });

export type KlassifikationsErgebnis = z.infer<typeof KlassifikationsErgebnisSchema>;
