// Persistenz-Schicht für die W2-Regel-Engine (Issue #32, Architektur-
// Nachschärfung). Lädt aktive pruefregeln pro (kunde_id, handler_slug) zur
// Laufzeit und weist neu angelegten Kunden das Default-Template zu. Siehe
// docs/decisions/2026-07-12_w2-presseanfragen-drafter.md, Abschnitt
// "Regel-Engine" für die Architektur-Grenze zu @konsole/handlers: dort ist
// `Pruefregel` die reine Werte-Form OHNE kunde_id (das Array ist beim
// Aufrufer bereits kunde-gescoped) -- hier lokal ergänzt um `kunde_id` für
// den Lade-/Fake-Repository-Pfad.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pruefregel, PruefregelDefinition } from '@konsole/handlers';

export interface PruefregelZeile extends Pruefregel {
  kunde_id: string;
}

export interface PruefregelnRepository {
  aktivePruefregelnLaden(kundeId: string, handlerSlug: string): Promise<Pruefregel[]>;
  defaultTemplateZuweisen(kundeId: string, definitionen: PruefregelDefinition[]): Promise<void>;
}

function pruefeFehler(fehler: { message: string } | null, kontext: string): void {
  if (fehler) {
    throw new Error(`SupabasePruefregelnRepository.${kontext}: ${fehler.message}`);
  }
}

export class SupabasePruefregelnRepository implements PruefregelnRepository {
  constructor(private readonly client: SupabaseClient) {}

  async aktivePruefregelnLaden(kundeId: string, handlerSlug: string): Promise<Pruefregel[]> {
    const { data, error } = await this.client
      .from('pruefregeln')
      .select('id, handler_slug, typ, baustein_name, parameter, prompt_text, aktiv, reihenfolge')
      .eq('kunde_id', kundeId)
      .eq('handler_slug', handlerSlug)
      .eq('aktiv', true)
      .is('deleted_at', null)
      .order('reihenfolge', { ascending: true });

    pruefeFehler(error, 'aktivePruefregelnLaden');
    return (data ?? []) as Pruefregel[];
  }

  async defaultTemplateZuweisen(kundeId: string, definitionen: PruefregelDefinition[]): Promise<void> {
    const { error } = await this.client.from('pruefregeln').insert(
      definitionen.map((definition) => ({
        kunde_id: kundeId,
        handler_slug: definition.handler_slug,
        typ: definition.typ,
        baustein_name: definition.baustein_name,
        parameter: definition.parameter,
        prompt_text: definition.prompt_text,
        aktiv: definition.aktiv,
        reihenfolge: definition.reihenfolge,
      })),
    );

    pruefeFehler(error, 'defaultTemplateZuweisen');
  }
}
