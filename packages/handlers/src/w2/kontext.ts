// Stage 1: Kontext-Sammlung (v1 vereinfacht).
// Quelle: WORKFLOW_HANDLERS_v1.0.md, "W2", Stage 1 (RAG aus fünf Quellen),
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md ("Zu 5").
//
// v1 hat noch keine gefüllten Datenbestände für Sprachregelungen, SSOT,
// Client-Final-Präzedenzen oder Journalist:innen-Profile. Diese Funktion
// kapselt trotzdem alle fünf Quellen hinter einem Interface, damit spätere
// echte Anbindungen (RAG über pgvector, siehe AGENTS.md §2) ohne
// Schnittstellen-Bruch nachgerüstet werden können. "externesWissen" hat
// keinen eigenen Loader: v1 nutzt kunde_kontext.thema_positionierung direkt
// aus dem Input (siehe Decision, "Zu 5").

import type { W2Input } from './types.js';

export type W2KontextQuellenStatus = 'verfuegbar' | 'leer' | 'v1_stub';

export interface W2KontextQuelle<T> {
  status: W2KontextQuellenStatus;
  daten: T | null;
}

export interface SprachregelungDaten {
  text: string;
}

export interface SsotDaten {
  frueherComms: string[];
}

export interface PraezedenzenDaten {
  beispiele: string[];
}

export interface JournalistenProfilDaten {
  artikel: string[];
}

export interface W2KontextErgebnis {
  sprachregelungen: W2KontextQuelle<SprachregelungDaten>;
  ssot: W2KontextQuelle<SsotDaten>;
  externesWissen: W2KontextQuelle<{ positionierung: string }>;
  praezedenzen: W2KontextQuelle<PraezedenzenDaten>;
  journalistenProfil: W2KontextQuelle<JournalistenProfilDaten>;
  /**
   * Für die Beraterin sichtbare Hinweise aus fehlenden Quellen (§ "Failure-
   * Fallbacks" der Spec). Nur für Quellen mit einer explizit spezifizierten
   * Fallback-Formulierung (Sprachregelungen, Präzedenzen) — siehe Decision.
   */
  warnHinweise: string[];
}

export interface W2KontextQuellenProvider {
  sprachregelungLaden(slug: string): Promise<SprachregelungDaten | null>;
  ssotLaden(kundeSlug: string): Promise<SsotDaten | null>;
  praezedenzenLaden(kundeSlug: string, themaBeschreibung: string): Promise<PraezedenzenDaten | null>;
  journalistenProfilLaden(journalistName: string | null): Promise<JournalistenProfilDaten | null>;
}

/**
 * v1-Default: keine der vier Loader-Quellen ist an einen echten Datenbestand
 * angebunden, jede liefert `null`. Ein Aufrufer (Konsole, Test) kann eine
 * eigene Implementierung dieses Interfaces injizieren, sobald echte Daten
 * existieren, ohne dass sich sammleW2Kontext() oder die Handler-Orchestrierung
 * ändern müssen.
 */
export const V1_STUB_KONTEXT_QUELLEN_PROVIDER: W2KontextQuellenProvider = {
  async sprachregelungLaden() {
    return null;
  },
  async ssotLaden() {
    return null;
  },
  async praezedenzenLaden() {
    return null;
  },
  async journalistenProfilLaden() {
    return null;
  },
};

const HINWEIS_KEINE_SPRACHREGELUNG =
  'Hinweis: Keine Sprachregelung hinterlegt (Slug nicht auflösbar). reactive_statement bleibt leer, bis eine Sprachregelung ergänzt wird.';

const HINWEIS_KEINE_PRAEZEDENZEN =
  'Hinweis: Keine Client-Final-Präzedenzen für diesen Kunden hinterlegt. Draft ist entsprechend generischer. Onboarding empfohlen.';

export async function sammleW2Kontext(
  input: W2Input,
  provider: W2KontextQuellenProvider = V1_STUB_KONTEXT_QUELLEN_PROVIDER,
): Promise<W2KontextErgebnis> {
  const warnHinweise: string[] = [];

  const sprachregelungDaten = await provider.sprachregelungLaden(
    input.kunde_kontext.sprachregelungen_slug,
  );
  if (!sprachregelungDaten) {
    warnHinweise.push(HINWEIS_KEINE_SPRACHREGELUNG);
  }

  const praezedenzenDaten = await provider.praezedenzenLaden(
    input.kunde_kontext.kunde_slug,
    input.anfrage.thema_beschreibung,
  );
  if (!praezedenzenDaten || praezedenzenDaten.beispiele.length === 0) {
    warnHinweise.push(HINWEIS_KEINE_PRAEZEDENZEN);
  }

  const ssotDaten = await provider.ssotLaden(input.kunde_kontext.kunde_slug);
  const journalistenProfilDaten = await provider.journalistenProfilLaden(
    input.anfrage.journalist_name,
  );

  const positionierung = input.kunde_kontext.thema_positionierung;

  return {
    sprachregelungen: {
      status: sprachregelungDaten ? 'verfuegbar' : 'leer',
      daten: sprachregelungDaten,
    },
    // SSOT hat in der Spec keine eigene Fallback-Formulierung: bleibt stumm
    // leer, wenn v1 (noch) keine echte Anbindung hat.
    ssot: {
      status: 'v1_stub',
      daten: ssotDaten,
    },
    externesWissen: {
      status: positionierung ? 'verfuegbar' : 'leer',
      daten: positionierung ? { positionierung } : null,
    },
    praezedenzen: {
      status: praezedenzenDaten && praezedenzenDaten.beispiele.length > 0 ? 'verfuegbar' : 'leer',
      daten: praezedenzenDaten,
    },
    // Journalist:innen-Profil hat in der Spec ebenfalls keine eigene
    // Fallback-Formulierung, gleiche Begründung wie SSOT.
    journalistenProfil: {
      status: 'v1_stub',
      daten: journalistenProfilDaten,
    },
    warnHinweise,
  };
}

/** Namen der tatsächlich genutzten (nicht-leeren, nicht-Stub) Quellen für audit_metadaten.verwendete_quellen. */
export function verwendeteQuellenAusKontext(kontext: W2KontextErgebnis): string[] {
  const quellen: string[] = [];
  if (kontext.sprachregelungen.status === 'verfuegbar') quellen.push('sprachregelungen');
  if (kontext.externesWissen.status === 'verfuegbar') quellen.push('externes_wissen');
  if (kontext.praezedenzen.status === 'verfuegbar') quellen.push('praezedenzen');
  return quellen;
}
