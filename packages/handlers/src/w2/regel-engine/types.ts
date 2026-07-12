// Regel-Engine-Typen für Stage 3. Ersetzt einen fest verdrahteten
// "19-Punkte-Check" durch pro-Kunde konfigurierbare Regeln, siehe
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, Abschnitt
// "Regel-Engine". packages/handlers kennt keine Datenbank: Pruefregel ist
// die reine Werte-Form einer pruefregeln-Zeile (ohne kunde_id -- der
// Aufrufer hat das Array bereits kunde-gescoped geladen), injiziert vom
// Aufrufer (packages/persistence).

export type PruefregelTyp = 'code_baustein' | 'llm_prompt';

export interface Pruefregel {
  id: string;
  handler_slug: string;
  typ: PruefregelTyp;
  baustein_name: string | null;
  parameter: Record<string, unknown>;
  prompt_text: string | null;
  aktiv: boolean;
  reihenfolge: number;
}

/** Form des Default-Templates vor dem DB-Insert, ohne Laufzeit-Identität. */
export type PruefregelDefinition = Omit<Pruefregel, 'id'>;

export interface RegelVerstoss {
  /** null bei einem Review-Pass-Format-Fehler, der keiner Regel zugeordnet werden konnte. */
  regel_id: string | null;
  baustein_name: string | null;
  quelle: 'code' | 'llm';
  begruendung: string;
}

export interface PruefungsErgebnis {
  bestanden: boolean;
  verstoesse: RegelVerstoss[];
}
