// Persistenz-Schicht (Teil 2 des Klassifikations-Layers, Issue #30).
// Quelle: docs/decisions/2026-07-10_datenmodell.md, docs/decisions/2026-07-10_rls-policies.md,
// docs/decisions/2026-07-12_klassifikations-layer.md ("Grenze Klassifikation/
// Handler-Auslösung" und der Nachtrag Teil 2 dort).
//
// KlassifikationsRepository ist die Persistenz-Schnittstelle, analog zu
// LLMProvider in packages/llm: Geschäftslogik hängt nur vom Interface ab,
// die produktive Implementierung (SupabaseKlassifikationsRepository) nutzt
// den Supabase Service-Role-Client (RLS-Bypass), Tests nutzen eine
// In-Memory-Fake-Implementierung (siehe src/testing/).

import type { KlassifikationsErgebnis } from '@konsole/classifier';

type AnliegenElement = KlassifikationsErgebnis['anliegen'][number];

/** kunden.autonomie_level, §5.1. Stufe 1 (Shadow-Mode) ist der Default. */
export type AutonomieLevel = 1 | 2 | 3;

export interface KundeStammdaten {
  id: string;
  agentur_id: string;
  autonomie_level: AutonomieLevel;
}

export interface NutzerSlugEintrag {
  id: string;
  name: string;
}

export interface AnliegenEinfuegung {
  beschreibung: string;
  prioritaet: AnliegenElement['prioritaet'];
  frist_erschlossen: string | null;
  frist_annahme: string | null;
  backend_handler_vorschlag: AnliegenElement['backend_handler_vorschlag'];
  backend_handler_input: Record<string, unknown>;
}

export interface VorgangKlassifikationsUpdate {
  sprache_ausgang: string;
  typ_primaer: KlassifikationsErgebnis['typ_primaer'];
  typ_sekundaer: string | null;
  confidence: number;
  sensitivity: KlassifikationsErgebnis['sensitivity'];
  prioritaet: KlassifikationsErgebnis['prioritaet'];
  routing_rolle: string;
  routing_verteiler: string[];
  zustaendige_nutzer_id: string | null;
  /**
   * Erstmals ab Issue #43 (Konsolen-Detailansicht) persistiert -- vorher ein
   * reiner Klassifikations-Laufzeit-Wert, der nirgends gespeichert wurde.
   * Siehe docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
   * Abschnitt 8.
   */
  rueckfrage_nachricht: string | null;
}

export type AuditAktion = 'klassifikation_abgeschlossen';

export interface AuditLogEinfuegung {
  agentur_id: string;
  vorgang_id: string;
  aktion: AuditAktion;
  aktion_payload: Record<string, unknown>;
}

export interface LlmNutzungEinfuegung {
  agentur_id: string;
  kunde_id: string;
  vorgang_id: string | null;
  handler_slug: string | null;
  input_tokens: number;
  output_tokens: number;
  modell: string;
}

/**
 * Persistenz-Schnittstelle für Teil 2. Jede Methode entspricht genau einer
 * SQL-Anweisung (kein implizites Multi-Statement-Verhalten), damit
 * persistiere-klassifikation.ts die Reihenfolge und Fehlerbehandlung
 * (Kompensation, siehe dortige Kommentare) explizit steuern kann.
 */
export interface KlassifikationsRepository {
  kundeLaden(kundeId: string): Promise<KundeStammdaten | null>;
  nutzerFuerAgenturLaden(agenturId: string): Promise<NutzerSlugEintrag[]>;

  vorgangStatusSetzen(
    vorgangId: string,
    status: 'in_progress' | 'failed',
    felder?: { klassifikation_gestartet_at?: string; klassifikation_beendet_at?: string },
  ): Promise<void>;

  vorgangKlassifikationAbschliessen(
    vorgangId: string,
    update: VorgangKlassifikationsUpdate,
    klassifikationBeendetAt: string,
  ): Promise<void>;

  anliegenEinfuegen(vorgangId: string, zeilen: AnliegenEinfuegung[]): Promise<string[]>;
  /**
   * Kompensation für "kein halber Vorgang" (Aufgabe A), wenn ein Schritt
   * NACH dem anliegen-Insert fehlschlägt. Setzt deleted_at (Soft-Delete),
   * kein Hard-Delete -- AGENTS.md §4: "Kein Direct-Delete in der Datenbank.
   * Immer über Soft-Delete-Pattern mit deleted_at-Feld."
   */
  anliegenLoeschen(anliegenIds: string[]): Promise<void>;

  auditLogSchreiben(eintrag: AuditLogEinfuegung): Promise<void>;

  llmNutzungSchreiben(eintrag: LlmNutzungEinfuegung): Promise<void>;
}

export interface PersistiereKlassifikationEingabe {
  vorgangId: string;
  kundeId: string;
  ergebnis: KlassifikationsErgebnis;
}

export type PersistiereKlassifikationResultat =
  | { status: 'done'; vorgangId: string; anliegenIds: string[] }
  | { status: 'failed'; vorgangId: string; fehler: string };
