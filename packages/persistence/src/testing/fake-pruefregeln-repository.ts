// In-Memory-Fake von PruefregelnRepository für Tests, analog zu
// FakeKlassifikationsRepository: kein echtes Netzwerk, keine echte Postgres-
// Instanz nötig (die bleibt der pgTAP-Suite vorbehalten, siehe
// supabase/tests/database/12_pruefregeln_rls.test.sql). Erlaubt, die
// Mandanten-Trennung beim Laden (Kern-Beweis der Kundenagnostik) und die
// Default-Template-Zuweisung direkt zu inspizieren.

import type { Pruefregel, PruefregelDefinition } from '@konsole/handlers';
import type { PruefregelnRepository, PruefregelZeile } from '../pruefregeln.js';

let idZaehler = 0;

export class FakePruefregelnRepository implements PruefregelnRepository {
  readonly zeilen: PruefregelZeile[];

  constructor(initial: PruefregelZeile[] = []) {
    this.zeilen = [...initial];
  }

  async aktivePruefregelnLaden(kundeId: string, handlerSlug: string): Promise<Pruefregel[]> {
    return this.zeilen
      .filter((zeile) => zeile.kunde_id === kundeId && zeile.handler_slug === handlerSlug && zeile.aktiv)
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
  }

  async defaultTemplateZuweisen(kundeId: string, definitionen: PruefregelDefinition[]): Promise<void> {
    for (const definition of definitionen) {
      idZaehler += 1;
      this.zeilen.push({ id: `fake-pruefregel-${idZaehler}`, kunde_id: kundeId, ...definition });
    }
  }
}
