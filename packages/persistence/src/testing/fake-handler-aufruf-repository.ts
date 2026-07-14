// In-Memory-Fake von HandlerAufrufRepository für Tests (Issue #45), analog
// zu FakeKundenProfilRepository.

import { W1OutputSchema } from '@konsole/handlers';
import { ErgebnisBearbeitetValidierungsFehler, type ErgebnisBearbeitenResultat, type HandlerAufrufRepository } from '../handler-aufruf.js';

export interface FakeHandlerAufrufZeile {
  id: string;
  ergebnis_bearbeitet: unknown | null;
  freigegeben_at: string | null;
  bearbeitet_at: string | null;
}

export interface FakeHandlerAufrufRepositoryOptions {
  handlerAufrufe?: FakeHandlerAufrufZeile[];
  jetzt?: () => string;
}

export class FakeHandlerAufrufRepository implements HandlerAufrufRepository {
  readonly handlerAufrufe: Map<string, FakeHandlerAufrufZeile>;
  private readonly jetzt: () => string;

  constructor(options: FakeHandlerAufrufRepositoryOptions = {}) {
    this.handlerAufrufe = new Map((options.handlerAufrufe ?? []).map((zeile) => [zeile.id, zeile]));
    this.jetzt = options.jetzt ?? (() => new Date().toISOString());
  }

  async ergebnisBearbeitenSpeichern(handlerAufrufId: string, ergebnisBearbeitet: unknown): Promise<ErgebnisBearbeitenResultat> {
    const validiert = W1OutputSchema.safeParse(ergebnisBearbeitet);
    if (!validiert.success) {
      throw new ErgebnisBearbeitetValidierungsFehler(validiert.error.message);
    }

    const bestehend = this.handlerAufrufe.get(handlerAufrufId);
    if (!bestehend) {
      throw new Error(`FakeHandlerAufrufRepository.ergebnisBearbeitenSpeichern: handler_aufruf ${handlerAufrufId} nicht gefunden.`);
    }

    const warFreigegeben = bestehend.freigegeben_at !== null;
    const bearbeitetAt = this.jetzt();
    const aktualisiert: FakeHandlerAufrufZeile = {
      ...bestehend,
      ergebnis_bearbeitet: validiert.data,
      bearbeitet_at: bearbeitetAt,
      freigegeben_at: null,
    };
    this.handlerAufrufe.set(handlerAufrufId, aktualisiert);

    return { freigabeErloschen: warFreigegeben, bearbeitetAt };
  }
}
