// Zod-Schema für den Profil-Extraktions-Output (Teil 2, Issue #37). Bewusst
// 1:1 auf die Kundenprofil-Tabellenstruktur gemappt (siehe
// packages/persistence/src/kundenprofil.ts), damit PR 2 die Vorschläge ohne
// Zwischentransformation auf KundenProfilRepository-Schreibpfade abbilden
// kann. Siehe docs/decisions/2026-07-12_kundenprofil-ki-befuellung.md,
// Abschnitt "Extraktions-Schema".
//
// AGENTS.md §3.3/§4: kein LLM-Output ohne Zod-Validierung wird verwendet.

import { z } from 'zod';

// Identisch zu kunden_profil_grundton (supabase/migrations/20260712110000_kundenprofil.sql).
export const KUNDEN_PROFIL_GRUNDTON = ['sachlich', 'warm_handwerklich', 'technisch_praezise', 'aktivistisch'] as const;

export const ANREDE_KONVENTION = ['du', 'sie'] as const;

export const KUNDEN_BOILERPLATE_TYP = ['kurz', 'lang'] as const;

// Identisch zu kunden_grenzen_typ (supabase/migrations/20260712110100_kundenprofil_listen.sql).
// Kein ist_deterministisch_erzwungen-Feld im Schema: das Modell kann dieses
// Flag gar nicht erst vorschlagen, siehe Decision, Abschnitt "Konservativ-
// Prinzip" -- das Scharf-Schalten bleibt ausschließlich ein manueller Schritt.
export const KUNDEN_GRENZEN_TYP = [
  'no_go_thema',
  'nicht_nennbarer_wettbewerber',
  'nicht_nennbare_person',
  'verbotene_aussage',
  'pflichtbaustein',
] as const;

export const MEDIEN_PRIORITAET = ['hoch', 'mittel', 'niedrig'] as const;

const FaktenSchema = z.object({
  rechtsform: z.string().nullable(),
  sitz: z.string().nullable(),
  geschaeftsbeschreibung: z.string().nullable(),
});

const StimmeSchema = z.object({
  grundton: z.enum(KUNDEN_PROFIL_GRUNDTON).nullable(),
  anrede_konvention: z.enum(ANREDE_KONVENTION).nullable(),
  gendering_konvention: z.string().nullable(),
  zielsprache_absender_texte: z.string().nullable(),
});

const StrategieSchema = z.object({
  positionierung: z.string().nullable(),
  usp: z.string().nullable(),
});

const BoilerplateVorschlagSchema = z.object({
  typ: z.enum(KUNDEN_BOILERPLATE_TYP),
  sprache: z.string().min(1),
  text: z.string().min(1),
});

// stichtag/quelle sind hier NULLABLE (anders als die DB-Spalten, die NOT
// NULL sind, siehe kunden_kennzahlen) -- das Modell MUSS ein Feld, das es
// nicht belegen kann, als null ausgeben können, sonst würde die Zod-
// Validierung selbst zum Rateverbots-Umgehungsweg (Modell erfindet irgendeine
// Zeichenkette, nur um das Schema zu erfüllen). Die eigentliche
// Konservativ-Durchsetzung ("kein Stichtag+Quelle -> ganzer Eintrag
// verworfen") passiert NACH der Zod-Validierung in konservativ.ts.
const KennzahlVorschlagSchema = z.object({
  bezeichnung: z.string().min(1),
  wert: z.string().min(1),
  stichtag: z.string().nullable(),
  quelle: z.string().nullable(),
});

const SprecherVorschlagSchema = z.object({
  name: z.string().min(1),
  rolle: z.string().nullable(),
  exakte_schreibweise: z.string().nullable(),
  zitat_freigabe: z.boolean(),
});

const KernbotschaftVorschlagSchema = z.object({
  text: z.string().min(1),
  reihenfolge: z.number().int().min(0),
});

const ThemaVorschlagSchema = z.object({
  thema: z.string().min(1),
  sprachregelung: z.string().nullable(),
  reaktives_statement: z.string().nullable(),
  positionierung_vorhanden: z.boolean(),
});

const GrenzeVorschlagSchema = z.object({
  typ: z.enum(KUNDEN_GRENZEN_TYP),
  inhalt: z.string().min(1),
  textart_geltungsbereich: z.string().nullable(),
});

const MedienKontextVorschlagSchema = z.object({
  medium_name: z.string().min(1),
  journalist_name: z.string().nullable(),
  beziehungsnotiz: z.string().nullable(),
  prioritaet: z.enum(MEDIEN_PRIORITAET).nullable(),
});

export const ProfilExtraktionsVorschlagSchema = z.object({
  fakten: FaktenSchema,
  stimme: StimmeSchema,
  strategie: StrategieSchema,
  boilerplate: z.array(BoilerplateVorschlagSchema),
  kennzahlen: z.array(KennzahlVorschlagSchema),
  sprecher: z.array(SprecherVorschlagSchema),
  kernbotschaften: z.array(KernbotschaftVorschlagSchema),
  themen: z.array(ThemaVorschlagSchema),
  grenzen: z.array(GrenzeVorschlagSchema),
  medien_kontext: z.array(MedienKontextVorschlagSchema),
  /** Im Text gesehen, aber nicht sicher genug für ein Profil-Feld -- für die spätere menschliche Prüfung (Ebene 4). */
  unklare_hinweise: z.array(z.string()),
});

export type ProfilExtraktionsVorschlag = z.infer<typeof ProfilExtraktionsVorschlagSchema>;
export type KennzahlVorschlag = z.infer<typeof KennzahlVorschlagSchema>;
export type BoilerplateVorschlag = z.infer<typeof BoilerplateVorschlagSchema>;
export type SprecherVorschlag = z.infer<typeof SprecherVorschlagSchema>;
export type KernbotschaftVorschlag = z.infer<typeof KernbotschaftVorschlagSchema>;
export type ThemaVorschlag = z.infer<typeof ThemaVorschlagSchema>;
export type GrenzeVorschlag = z.infer<typeof GrenzeVorschlagSchema>;
export type MedienKontextVorschlag = z.infer<typeof MedienKontextVorschlagSchema>;
