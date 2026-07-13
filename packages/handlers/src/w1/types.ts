// W1-Input-Kontrakt und Stage-1-Kontext-Typen, aus WORKFLOW_HANDLERS_v1.0.md
// "W1: Pressemitteilungs-Drafter" übernommen. Siehe
// docs/decisions/2026-07-13_w1-pressemitteilung-drafter.md für die
// Begründung der Profil-Anbindung (Tonalität/Boilerplate/Präzedenzen/
// Sprecher) und die v1-Stubs.

import type { KontextQuelle } from '../w2/types.js';

export type W1LaengeZiel = 'kurz' | 'standard' | 'lang';

export interface W1BriefingInput {
  anlass: string;
  kernbotschaft: string | null;
  fakten: string[];
  zitat_sprecher: string | null;
  zitat_kernaussage: string | null;
  ziel_medien_gruppe: string | null;
  boilerplate_referenz: string | null;
  laenge_ziel: W1LaengeZiel;
  sperrfrist_at: string | null;
  zusatz_hinweis: string | null;
}

/** Tonalität aus kunden_profil (Kern-Felder), EAGER geladen -- kein RAG nötig, siehe Decision Punkt 2. */
export interface W1TonalitaetEintrag {
  grundton: string | null;
  stil_parameter: Record<string, unknown>;
  anrede_konvention: 'du' | 'sie' | null;
  gendering_konvention: string | null;
}

export interface W1KundeKontextInput {
  kunde_slug: string;
  tonalitaet: W1TonalitaetEintrag;
}

export interface W1Input {
  briefing: W1BriefingInput;
  kunde_kontext: W1KundeKontextInput;
}

export interface W1PraezedenzEintrag {
  titel: string;
  volltext: string;
}

export interface W1SprecherEintrag {
  name: string;
  rolle: string | null;
  exakte_schreibweise: string | null;
  zitat_freigabe: boolean;
}

/**
 * Injizierbare Quelle der drei tatsächlich per RAG/Lookup angebundenen
 * Wissens-Kategorien (Präzedenzen, Boilerplate, Sprecher). packages/handlers
 * kennt keine Datenbank -- die produktive Implementierung lebt in
 * packages/persistence (KundenProfilW1KontextQuellenProvider), v1 liefert
 * hier nur LeererW1KontextQuellenProvider als Default (siehe kontext.ts).
 */
export interface W1KontextQuellenProvider {
  praezedenzenLaden(kundeSlug: string, anlass: string): Promise<W1PraezedenzEintrag[]>;
  boilerplateLaden(kundeSlug: string, laenge: 'kurz' | 'lang', sprache: string): Promise<string | null>;
  sprecherLaden(kundeSlug: string, sprecherName: string): Promise<W1SprecherEintrag | null>;
}

export interface W1GesammelterKontext {
  tonalitaet: KontextQuelle<W1TonalitaetEintrag>;
  praezedenzen: KontextQuelle<W1PraezedenzEintrag[]>;
  boilerplate: KontextQuelle<string>;
  sprecher: KontextQuelle<W1SprecherEintrag>;
  /** v1-Stub: kein branchenweiter, geteilter Datenbestand angebunden. */
  sektor_corpus: KontextQuelle<never>;
  /** v1-Stub: Websearch noch nicht angebunden. */
  diskurs_snapshot: KontextQuelle<never>;
  /** Fallback-Warnungen aus Stage 1 plus spätere Erzwingungs-Hinweise (Zitat-Freigabe, Kritiker-Ausfall). Landen unverändert in W1Output.hinweise. */
  hinweise: string[];
}
