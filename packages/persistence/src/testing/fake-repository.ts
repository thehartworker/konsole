// In-Memory-Fake von KlassifikationsRepository für Tests, analog zu
// MockLLMProvider in packages/llm/src/testing/mock-provider.ts: kein echtes
// Netzwerk, keine echte Postgres-Instanz nötig (die bleibt der pgTAP-Suite
// vorbehalten, siehe supabase/tests/). Erlaubt, Status-Übergänge,
// Kompensations-Pfade und geschriebene Zeilen direkt zu inspizieren.

import type {
  AnliegenEinfuegung,
  AuditLogEinfuegung,
  KlassifikationsRepository,
  KundeStammdaten,
  LlmNutzungEinfuegung,
  NutzerSlugEintrag,
  VorgangKlassifikationsUpdate,
} from '../types.js';

export interface FakeVorgangZustand {
  klassifikation_status: 'queued' | 'in_progress' | 'done' | 'failed';
  klassifikation_gestartet_at?: string;
  klassifikation_beendet_at?: string;
  klassifikation?: VorgangKlassifikationsUpdate;
}

export interface FakeAnliegenZeile extends AnliegenEinfuegung {
  id: string;
  vorgang_id: string;
  deleted_at: string | null;
}

export interface FakeNutzerEintrag extends NutzerSlugEintrag {
  agentur_id: string;
}

export interface FakeKlassifikationsRepositoryOptions {
  kunden?: KundeStammdaten[];
  nutzer?: FakeNutzerEintrag[];
  vorgaenge?: Record<string, FakeVorgangZustand>;
}

let anliegenIdZaehler = 0;

export class FakeKlassifikationsRepository implements KlassifikationsRepository {
  readonly kunden: Map<string, KundeStammdaten>;
  readonly nutzer: FakeNutzerEintrag[];
  readonly vorgaenge: Map<string, FakeVorgangZustand>;
  readonly anliegen: FakeAnliegenZeile[] = [];
  readonly auditLog: AuditLogEinfuegung[] = [];
  readonly llmNutzung: LlmNutzungEinfuegung[] = [];

  constructor(options: FakeKlassifikationsRepositoryOptions = {}) {
    this.kunden = new Map((options.kunden ?? []).map((kunde) => [kunde.id, kunde]));
    this.nutzer = options.nutzer ?? [];
    this.vorgaenge = new Map(Object.entries(options.vorgaenge ?? {}));
  }

  async kundeLaden(kundeId: string): Promise<KundeStammdaten | null> {
    return this.kunden.get(kundeId) ?? null;
  }

  async nutzerFuerAgenturLaden(agenturId: string): Promise<NutzerSlugEintrag[]> {
    return this.nutzer
      .filter((nutzer) => nutzer.agentur_id === agenturId)
      .map(({ id, name }) => ({ id, name }));
  }

  private vorgangOderDefault(vorgangId: string): FakeVorgangZustand {
    return this.vorgaenge.get(vorgangId) ?? { klassifikation_status: 'queued' };
  }

  async vorgangStatusSetzen(
    vorgangId: string,
    status: 'in_progress' | 'failed',
    felder?: { klassifikation_gestartet_at?: string; klassifikation_beendet_at?: string },
  ): Promise<void> {
    const bestehend = this.vorgangOderDefault(vorgangId);
    this.vorgaenge.set(vorgangId, { ...bestehend, klassifikation_status: status, ...felder });
  }

  async vorgangKlassifikationAbschliessen(
    vorgangId: string,
    update: VorgangKlassifikationsUpdate,
    klassifikationBeendetAt: string,
  ): Promise<void> {
    const bestehend = this.vorgangOderDefault(vorgangId);
    this.vorgaenge.set(vorgangId, {
      ...bestehend,
      klassifikation_status: 'done',
      klassifikation_beendet_at: klassifikationBeendetAt,
      klassifikation: update,
    });
  }

  async anliegenEinfuegen(vorgangId: string, zeilen: AnliegenEinfuegung[]): Promise<string[]> {
    const ids: string[] = [];
    for (const zeile of zeilen) {
      anliegenIdZaehler += 1;
      const id = `fake-anliegen-${anliegenIdZaehler}`;
      this.anliegen.push({ ...zeile, id, vorgang_id: vorgangId, deleted_at: null });
      ids.push(id);
    }
    return ids;
  }

  async anliegenLoeschen(anliegenIds: string[]): Promise<void> {
    const jetzt = new Date().toISOString();
    for (const zeile of this.anliegen) {
      if (anliegenIds.includes(zeile.id)) {
        zeile.deleted_at = jetzt;
      }
    }
  }

  async auditLogSchreiben(eintrag: AuditLogEinfuegung): Promise<void> {
    this.auditLog.push(eintrag);
  }

  async llmNutzungSchreiben(eintrag: LlmNutzungEinfuegung): Promise<void> {
    this.llmNutzung.push(eintrag);
  }
}
