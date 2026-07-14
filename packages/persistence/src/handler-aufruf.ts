// Persistenz-Schicht für das Inline-Editing von Handler-Ergebnissen (Issue
// #45, Konsole Block 2). Bisher gab es keine eigene Repository-Klasse für
// handler_aufrufe -- Block 1 (actions.ts) schrieb direkt über den
// Session-Client. Diese Datei bündelt den einen neuen Schreibpfad
// (`ergebnis_bearbeitet` setzen), analog zum Aufbau von
// KundenProfilRepository (packages/persistence/src/kundenprofil.ts):
// Interface plus Supabase-Implementierung, Fake in src/testing/. Siehe
// docs/decisions/2026-07-13_konsole-block2-editing-und-export.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import { W1OutputSchema, type W1Output } from '@konsole/handlers';

export class ErgebnisBearbeitetValidierungsFehler extends Error {
  constructor(zodMeldung: string) {
    super(`Bearbeitetes Ergebnis entspricht nicht dem W1-Output-Schema: ${zodMeldung}`);
    this.name = 'ErgebnisBearbeitetValidierungsFehler';
  }
}

export interface ErgebnisBearbeitenResultat {
  /**
   * true, wenn dieses Schreiben eine zuvor bestehende Freigabe erloschen
   * ließ (der DB-Trigger handler_aufrufe_freigabe_erlischt_trg hat
   * freigegeben_at/freigegeben_durch zurückgesetzt). Die Server-Action nutzt
   * das, um der Nutzerin die Freigabe-Erläuterung anzuzeigen, siehe
   * pressemitteilung-editor.tsx.
   */
  freigabeErloschen: boolean;
  bearbeitetAt: string;
}

export interface HandlerAufrufRepository {
  /**
   * Schreibt ergebnis_bearbeitet. Validiert serverseitig gegen
   * W1OutputSchema (AGENTS.md §3.3: "Schema-Validierung (Zod) für alle
   * LLM-Outputs", gilt hier ebenso für redigierte Outputs) -- ein
   * ungültiges Objekt wird NIE geschrieben, sondern wirft
   * ErgebnisBearbeitetValidierungsFehler.
   */
  ergebnisBearbeitenSpeichern(handlerAufrufId: string, ergebnisBearbeitet: unknown): Promise<ErgebnisBearbeitenResultat>;
}

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabaseHandlerAufrufRepository.${kontext}: ${fehler.message}`);
  }
}

export class SupabaseHandlerAufrufRepository implements HandlerAufrufRepository {
  constructor(private readonly client: SupabaseClient) {}

  async ergebnisBearbeitenSpeichern(handlerAufrufId: string, ergebnisBearbeitet: unknown): Promise<ErgebnisBearbeitenResultat> {
    const validiert = W1OutputSchema.safeParse(ergebnisBearbeitet);
    if (!validiert.success) {
      throw new ErgebnisBearbeitetValidierungsFehler(validiert.error.message);
    }

    const { data: vorher, error: vorherFehler } = await this.client
      .from('handler_aufrufe')
      .select('freigegeben_at')
      .eq('id', handlerAufrufId)
      .maybeSingle();
    pruefeFehler(vorherFehler, 'ergebnisBearbeitenSpeichern(vorher laden)');
    if (!vorher) {
      throw new Error(`SupabaseHandlerAufrufRepository.ergebnisBearbeitenSpeichern: handler_aufruf ${handlerAufrufId} nicht gefunden oder keine Berechtigung.`);
    }
    const warFreigegeben = vorher.freigegeben_at !== null;

    const { data, error } = await this.client
      .from('handler_aufrufe')
      .update({ ergebnis_bearbeitet: validiert.data as unknown as Record<string, unknown> })
      .eq('id', handlerAufrufId)
      .select('bearbeitet_at, freigegeben_at')
      .maybeSingle();
    pruefeFehler(error, 'ergebnisBearbeitenSpeichern(schreiben)');
    if (!data) {
      throw new Error(`SupabaseHandlerAufrufRepository.ergebnisBearbeitenSpeichern: Schreiben fehlgeschlagen (keine Berechtigung oder Eintrag nicht gefunden).`);
    }

    return {
      freigabeErloschen: warFreigegeben && data.freigegeben_at === null,
      bearbeitetAt: data.bearbeitet_at as string,
    };
  }
}

export type { W1Output };
