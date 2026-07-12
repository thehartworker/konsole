// Produktive KlassifikationsRepository-Implementierung über den Supabase
// Service-Role-Client (RLS-Bypass für den Klassifikations-Ingest-Pfad, siehe
// docs/decisions/2026-07-10_rls-policies.md, "Konsequenzen").
//
// AGENTS.md §4 ("keine Secrets im Code"): dieses Modul liest KEINE Env-
// Variablen und erzeugt KEINEN eigenen Supabase-Client. Der Aufrufer
// (Edge Function / Worker-Prozess) konstruiert den Service-Role-Client mit
// dem Secret aus seiner eigenen Umgebung und übergibt ihn hier per
// Dependency Injection.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnliegenEinfuegung,
  AuditLogEinfuegung,
  KlassifikationsRepository,
  KundeStammdaten,
  LlmNutzungEinfuegung,
  NutzerSlugEintrag,
  VorgangKlassifikationsUpdate,
} from './types.js';

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabaseKlassifikationsRepository.${kontext}: ${fehler.message}`);
  }
}

export class SupabaseKlassifikationsRepository implements KlassifikationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async kundeLaden(kundeId: string): Promise<KundeStammdaten | null> {
    const { data, error } = await this.client
      .from('kunden')
      .select('id, agentur_id, autonomie_level')
      .eq('id', kundeId)
      .is('deleted_at', null)
      .maybeSingle();

    pruefeFehler(error, 'kundeLaden');
    return data as KundeStammdaten | null;
  }

  async nutzerFuerAgenturLaden(agenturId: string): Promise<NutzerSlugEintrag[]> {
    const { data, error } = await this.client
      .from('nutzer')
      .select('id, name')
      .eq('agentur_id', agenturId)
      .is('deleted_at', null);

    pruefeFehler(error, 'nutzerFuerAgenturLaden');
    return (data ?? []) as NutzerSlugEintrag[];
  }

  async vorgangStatusSetzen(
    vorgangId: string,
    status: 'in_progress' | 'failed',
    felder?: { klassifikation_gestartet_at?: string; klassifikation_beendet_at?: string },
  ): Promise<void> {
    const { error } = await this.client
      .from('vorgaenge')
      .update({ klassifikation_status: status, ...felder })
      .eq('id', vorgangId);

    pruefeFehler(error, 'vorgangStatusSetzen');
  }

  async vorgangKlassifikationAbschliessen(
    vorgangId: string,
    update: VorgangKlassifikationsUpdate,
    klassifikationBeendetAt: string,
  ): Promise<void> {
    const { error } = await this.client
      .from('vorgaenge')
      .update({
        ...update,
        klassifikation_status: 'done',
        klassifikation_beendet_at: klassifikationBeendetAt,
        // §2.4: der Vorgang ist ab hier klassifiziert und wartet auf einen
        // Menschen (Shadow-Mode, §5.1). Kein Teil der Klassifikations-
        // Output-Felder im engeren Sinn, aber der einzige Ort, an dem sich
        // der Gesamt-Workflow-Status (status vorgang_status) nach der
        // Klassifikation sinnvoll bewegen kann.
        status: 'klassifiziert',
      })
      .eq('id', vorgangId);

    pruefeFehler(error, 'vorgangKlassifikationAbschliessen');
  }

  async anliegenEinfuegen(vorgangId: string, zeilen: AnliegenEinfuegung[]): Promise<string[]> {
    const { data, error } = await this.client
      .from('anliegen')
      .insert(zeilen.map((zeile) => ({ vorgang_id: vorgangId, ...zeile })))
      .select('id');

    pruefeFehler(error, 'anliegenEinfuegen');
    return (data ?? []).map((zeile) => (zeile as { id: string }).id);
  }

  async anliegenLoeschen(anliegenIds: string[]): Promise<void> {
    // Soft-Delete (AGENTS.md §4: kein Direct-Delete in der Datenbank).
    const { error } = await this.client
      .from('anliegen')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', anliegenIds);

    pruefeFehler(error, 'anliegenLoeschen');
  }

  async auditLogSchreiben(eintrag: AuditLogEinfuegung): Promise<void> {
    const { error } = await this.client.from('audit_log').insert({
      agentur_id: eintrag.agentur_id,
      vorgang_id: eintrag.vorgang_id,
      nutzer_id: null,
      aktion: eintrag.aktion,
      aktion_payload: eintrag.aktion_payload,
    });

    pruefeFehler(error, 'auditLogSchreiben');
  }

  async llmNutzungSchreiben(eintrag: LlmNutzungEinfuegung): Promise<void> {
    const { error } = await this.client.from('llm_nutzung').insert({
      agentur_id: eintrag.agentur_id,
      kunde_id: eintrag.kunde_id,
      vorgang_id: eintrag.vorgang_id,
      handler_slug: eintrag.handler_slug,
      input_tokens: eintrag.input_tokens,
      output_tokens: eintrag.output_tokens,
      modell: eintrag.modell,
    });

    pruefeFehler(error, 'llmNutzungSchreiben');
  }
}
