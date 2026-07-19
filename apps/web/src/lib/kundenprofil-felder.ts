// Feld-Konfiguration für den Kundenprofil-Editor (Issue #50, Konsole Block
// 3): eine einzige Quelle für Labels, Feldtypen, Zod-Validierung und die
// Zuordnung von Kern-Feldern/Listen-Tabellen zu den fünf Sektionen aus
// Aufgabe B. Bewusst konfigurations- statt komponenten-getrieben: neun
// Listen-Tabellen mit unterschiedlichen Spalten wären als neun eigene
// Formular-Komponenten deutlich mehr Code, ohne dass sich das Editier-
// Verhalten (Inline-Aktivierung, Speichern, Entfernen) zwischen ihnen
// unterscheidet.

import { z } from "zod";
import {
  ANREDE_KONVENTION,
  KUNDEN_BOILERPLATE_TYP,
  KUNDEN_GRENZEN_TYP,
  KUNDEN_PROFIL_GRUNDTON,
  MEDIEN_PRIORITAET,
} from "@konsole/profil-extraktion/client";
import type { KundenProfilListenTabelle } from "@konsole/persistence";

// Nur die beiden aktuell produktiven Handler (siehe
// packages/handlers/src/w1/handler.ts, packages/handlers/src/w2/regel-engine/default-template.ts).
// kunden_praezedenzfaelle.handler_slug ist in der DB ein umfassenderes Enum
// (alle sechs künftigen Handler), diese Liste ist bewusst nur die
// Teilmenge, die im Editor sinnvoll auswählbar ist.
export const PRAEZEDENZFALL_HANDLER_SLUGS = ["W1_pressemitteilung_drafter", "W2_presseanfragen_drafter"] as const;

export type KernSektion = "fakten" | "ton_und_stimme" | "strategie";
export type ListenSektion = "ton_und_stimme" | "strategie" | "grenzen_und_governance" | "referenzen_und_operatives";

export const SEKTIONEN = [
  { key: "fakten", label: "Fakten" },
  { key: "ton_und_stimme", label: "Ton und Stimme" },
  { key: "strategie", label: "Strategie" },
  { key: "grenzen_und_governance", label: "Grenzen und Governance" },
  { key: "referenzen_und_operatives", label: "Referenzen und Operatives" },
] as const;

export type KernFeldTyp = "text" | "textarea" | "select" | "json";

export interface KernFeldKonfiguration {
  key: string;
  label: string;
  sektion: KernSektion;
  typ: KernFeldTyp;
  optionen?: readonly string[];
}

export const KERN_FELDER: KernFeldKonfiguration[] = [
  { key: "rechtsform", label: "Rechtsform", sektion: "fakten", typ: "text" },
  { key: "sitz", label: "Sitz", sektion: "fakten", typ: "text" },
  { key: "geschaeftsbeschreibung", label: "Geschäftsbeschreibung", sektion: "fakten", typ: "textarea" },
  { key: "corporate_design_ref", label: "Corporate-Design-Referenz", sektion: "fakten", typ: "text" },
  { key: "grundton", label: "Grundton", sektion: "ton_und_stimme", typ: "select", optionen: KUNDEN_PROFIL_GRUNDTON },
  { key: "anrede_konvention", label: "Anrede-Konvention", sektion: "ton_und_stimme", typ: "select", optionen: ANREDE_KONVENTION },
  { key: "gendering_konvention", label: "Gendering-Konvention", sektion: "ton_und_stimme", typ: "text" },
  { key: "stil_parameter", label: "Stil-Parameter (JSON)", sektion: "ton_und_stimme", typ: "json" },
  { key: "zielsprache_absender_texte", label: "Zielsprache Absender-Texte", sektion: "strategie", typ: "text" },
  { key: "positionierung", label: "Positionierung", sektion: "strategie", typ: "textarea" },
  { key: "usp", label: "USP", sektion: "strategie", typ: "textarea" },
];

export const KERN_FELD_VALIDATOREN: Record<string, z.ZodTypeAny> = {
  rechtsform: z.string().trim().min(1).max(500).nullable(),
  sitz: z.string().trim().min(1).max(500).nullable(),
  geschaeftsbeschreibung: z.string().trim().min(1).max(5000).nullable(),
  corporate_design_ref: z.string().trim().min(1).max(2000).nullable(),
  grundton: z.enum(KUNDEN_PROFIL_GRUNDTON).nullable(),
  anrede_konvention: z.enum(ANREDE_KONVENTION).nullable(),
  gendering_konvention: z.string().trim().min(1).max(500).nullable(),
  stil_parameter: z.record(z.unknown()),
  zielsprache_absender_texte: z.string().trim().min(1).max(200).nullable(),
  positionierung: z.string().trim().min(1).max(5000).nullable(),
  usp: z.string().trim().min(1).max(5000).nullable(),
};

export type ListenFeldTyp = "text" | "textarea" | "select" | "boolean" | "number" | "date";

export interface ListenFeldKonfiguration {
  key: string;
  label: string;
  typ: ListenFeldTyp;
  optionen?: readonly string[];
  optional?: boolean;
}

export interface ListenTabellenKonfiguration {
  tabelle: KundenProfilListenTabelle;
  sektion: ListenSektion;
  label: string;
  einzahl: string;
  felder: ListenFeldKonfiguration[];
  /** Kurzer Anzeige-Text für die Zeile in nicht-editiertem Zustand. */
  anzeige: (zeile: Record<string, unknown>) => string;
}

export const LISTEN_TABELLEN: ListenTabellenKonfiguration[] = [
  {
    tabelle: "kunden_sprecher",
    sektion: "ton_und_stimme",
    label: "Sprecher",
    einzahl: "Sprecher",
    felder: [
      { key: "name", label: "Name", typ: "text" },
      { key: "rolle", label: "Rolle", typ: "text", optional: true },
      { key: "exakte_schreibweise", label: "Exakte Schreibweise", typ: "text", optional: true },
      { key: "zitat_freigabe", label: "Zitat-Freigabe", typ: "boolean" },
    ],
    anzeige: (zeile) => String(zeile.name ?? ""),
  },
  {
    tabelle: "kunden_boilerplate",
    sektion: "ton_und_stimme",
    label: "Boilerplate",
    einzahl: "Boilerplate-Text",
    felder: [
      { key: "typ", label: "Typ", typ: "select", optionen: KUNDEN_BOILERPLATE_TYP },
      { key: "sprache", label: "Sprache", typ: "text" },
      { key: "text", label: "Text", typ: "textarea" },
    ],
    anzeige: (zeile) => String(zeile.text ?? "").slice(0, 80),
  },
  {
    tabelle: "kunden_kernbotschaften",
    sektion: "strategie",
    label: "Kernbotschaften",
    einzahl: "Kernbotschaft",
    felder: [
      { key: "text", label: "Text", typ: "textarea" },
      { key: "reihenfolge", label: "Reihenfolge", typ: "number" },
    ],
    anzeige: (zeile) => String(zeile.text ?? "").slice(0, 80),
  },
  {
    tabelle: "kunden_themen",
    sektion: "strategie",
    label: "Themen",
    einzahl: "Thema",
    felder: [
      { key: "thema", label: "Thema", typ: "text" },
      { key: "sprachregelung", label: "Sprachregelung", typ: "textarea", optional: true },
      { key: "reaktives_statement", label: "Reaktives Statement", typ: "textarea", optional: true },
      { key: "positionierung_vorhanden", label: "Positionierung vorhanden", typ: "boolean" },
    ],
    anzeige: (zeile) => String(zeile.thema ?? ""),
  },
  {
    tabelle: "kunden_grenzen",
    sektion: "grenzen_und_governance",
    label: "Grenzen",
    einzahl: "Grenze",
    felder: [
      { key: "typ", label: "Typ", typ: "select", optionen: KUNDEN_GRENZEN_TYP },
      { key: "inhalt", label: "Inhalt", typ: "textarea" },
      { key: "textart_geltungsbereich", label: "Textart-Geltungsbereich", typ: "text", optional: true },
      { key: "ist_deterministisch_erzwungen", label: "Deterministisch erzwungen (scharf geschaltet)", typ: "boolean" },
    ],
    anzeige: (zeile) => String(zeile.inhalt ?? "").slice(0, 80),
  },
  {
    tabelle: "kunden_freigabekette",
    sektion: "grenzen_und_governance",
    label: "Freigabekette",
    einzahl: "Freigabeschritt",
    felder: [
      { key: "rolle_oder_person", label: "Rolle oder Person", typ: "text" },
      { key: "reihenfolge", label: "Reihenfolge", typ: "number" },
      { key: "bedingung", label: "Bedingung", typ: "text", optional: true },
    ],
    anzeige: (zeile) => String(zeile.rolle_oder_person ?? ""),
  },
  {
    tabelle: "kunden_praezedenzfaelle",
    sektion: "referenzen_und_operatives",
    label: "Präzedenzfälle",
    einzahl: "Präzedenzfall",
    felder: [
      { key: "handler_slug", label: "Handler", typ: "select", optionen: PRAEZEDENZFALL_HANDLER_SLUGS },
      { key: "titel", label: "Titel", typ: "text" },
      { key: "volltext", label: "Volltext", typ: "textarea" },
      { key: "freigegeben_am", label: "Freigegeben am", typ: "date", optional: true },
    ],
    anzeige: (zeile) => String(zeile.titel ?? ""),
  },
  {
    tabelle: "kunden_medien_kontext",
    sektion: "referenzen_und_operatives",
    label: "Medien-Kontext",
    einzahl: "Medien-Kontakt",
    felder: [
      { key: "medium_name", label: "Medium", typ: "text" },
      { key: "journalist_name", label: "Journalist:in", typ: "text", optional: true },
      { key: "beziehungsnotiz", label: "Beziehungsnotiz", typ: "textarea", optional: true },
      { key: "prioritaet", label: "Priorität", typ: "select", optionen: MEDIEN_PRIORITAET, optional: true },
    ],
    anzeige: (zeile) => String(zeile.medium_name ?? ""),
  },
  {
    tabelle: "kunden_kennzahlen",
    sektion: "referenzen_und_operatives",
    label: "Kennzahlen",
    einzahl: "Kennzahl",
    felder: [
      { key: "bezeichnung", label: "Bezeichnung", typ: "text" },
      { key: "wert", label: "Wert", typ: "text" },
      { key: "stichtag", label: "Stichtag", typ: "date" },
      { key: "quelle", label: "Quelle", typ: "text" },
    ],
    anzeige: (zeile) => `${String(zeile.bezeichnung ?? "")}: ${String(zeile.wert ?? "")}`,
  },
];

function feldSchema(feld: ListenFeldKonfiguration): z.ZodTypeAny {
  let basis: z.ZodTypeAny;
  switch (feld.typ) {
    case "boolean":
      basis = z.boolean();
      break;
    case "number":
      basis = z.number().int().min(0);
      break;
    case "select":
      basis = z.enum((feld.optionen ?? []) as [string, ...string[]]);
      break;
    case "date":
      basis = z.string().min(1).max(20);
      break;
    default:
      basis = z.string().trim().min(1).max(5000);
  }
  return feld.optional ? basis.nullable() : basis;
}

export function listenZeilenSchema(tabelle: KundenProfilListenTabelle): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const konfiguration = LISTEN_TABELLEN.find((eintrag) => eintrag.tabelle === tabelle);
  if (!konfiguration) {
    throw new Error(`listenZeilenSchema: unbekannte Tabelle "${tabelle}"`);
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const feld of konfiguration.felder) {
    shape[feld.key] = feldSchema(feld);
  }
  return z.object(shape);
}

export function listenTabelleKonfiguration(tabelle: KundenProfilListenTabelle): ListenTabellenKonfiguration {
  const konfiguration = LISTEN_TABELLEN.find((eintrag) => eintrag.tabelle === tabelle);
  if (!konfiguration) {
    throw new Error(`listenTabelleKonfiguration: unbekannte Tabelle "${tabelle}"`);
  }
  return konfiguration;
}
