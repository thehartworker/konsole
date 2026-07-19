import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeKlassifikationsRepository, type FakeKlassifikationsRepositoryOptions } from '@konsole/persistence/testing';
import { MockLLMProvider, type MockLLMProviderOptions } from '@konsole/llm/testing';
import type { AnhangMetadaten, ImapNachricht, KundenMailAnbindung } from '@konsole/mail-ingest';
import type {
  MailEingangLogEintrag,
  MailIngestRepository,
  ModusBVerbindungsdaten,
  VorgangAnlegenEingabe,
} from '../src/types.js';
import { baueLogger } from '../src/logger.js';
import type { VerarbeiteNachrichtAbhaengigkeiten } from '../src/verarbeite-nachricht.js';

export interface FakeMailIngestRepositoryOptions {
  anbindungen?: KundenMailAnbindung[];
  kundenSlugs?: Record<string, string>;
  modusBVerbindungsdaten?: Record<string, ModusBVerbindungsdaten>;
  passwoerter?: Record<string, string>;
}

let vorgangIdZaehler = 0;

export interface FakeVorgangZeile extends VorgangAnlegenEingabe {
  id: string;
  anhaenge: AnhangMetadaten[];
}

export class FakeMailIngestRepository implements MailIngestRepository {
  readonly vorgaenge: FakeVorgangZeile[] = [];
  readonly mailEingangLog: MailEingangLogEintrag[] = [];
  private readonly bekannteMessageIds = new Set<string>();

  constructor(private readonly options: FakeMailIngestRepositoryOptions = {}) {}

  async aktiveAnbindungenLaden(): Promise<KundenMailAnbindung[]> {
    return this.options.anbindungen ?? [];
  }

  async istDuplikat(messageId: string): Promise<boolean> {
    return this.bekannteMessageIds.has(messageId);
  }

  async kundeSlugLaden(kundeId: string): Promise<string | null> {
    return this.options.kundenSlugs?.[kundeId] ?? null;
  }

  async vorgangAnlegen(eingabe: VorgangAnlegenEingabe): Promise<string> {
    vorgangIdZaehler += 1;
    const id = `vorgang-${vorgangIdZaehler}`;
    this.vorgaenge.push({ ...eingabe, id, anhaenge: [] });
    return id;
  }

  async vorgangAnhaengeAktualisieren(vorgangId: string, anhaenge: AnhangMetadaten[]): Promise<void> {
    const vorgang = this.vorgaenge.find((v) => v.id === vorgangId);
    if (vorgang) vorgang.anhaenge = anhaenge;
  }

  async mailEingangLogSchreiben(eintrag: MailEingangLogEintrag): Promise<void> {
    // message_id ist UNIQUE über die gesamte Tabelle (siehe Migration) --
    // sobald IRGENDEIN Eintrag existiert, gilt die Nachricht als "bekannt"
    // (Issue #52, Aufgabe C, Schritt a: "Falls schon da: verarbeitungs_status
    // = 'duplikat'"), unabhängig vom ursprünglichen Status.
    this.mailEingangLog.push(eintrag);
    this.bekannteMessageIds.add(eintrag.messageId);
  }

  async modusBVerbindungsdatenLaden(anbindungId: string): Promise<ModusBVerbindungsdaten | null> {
    return this.options.modusBVerbindungsdaten?.[anbindungId] ?? null;
  }

  async passwortEntschluesseln(anbindungId: string): Promise<string | null> {
    return this.options.passwoerter?.[anbindungId] ?? null;
  }
}

export function baueFakeSupabaseClient() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upload });
  return { storage: { from } } as unknown as SupabaseClient;
}

export function baueAbhaengigkeiten(
  optionen: {
    repoOptionen?: FakeMailIngestRepositoryOptions;
    klassifikationsRepoOptionen?: FakeKlassifikationsRepositoryOptions;
    mockAntworten?: MockLLMProviderOptions['antworten'];
  } = {},
): { deps: VerarbeiteNachrichtAbhaengigkeiten; repo: FakeMailIngestRepository; klassifikationsRepo: FakeKlassifikationsRepository } {
  const repo = new FakeMailIngestRepository(optionen.repoOptionen);
  const klassifikationsRepo = new FakeKlassifikationsRepository(optionen.klassifikationsRepoOptionen);
  const provider = new MockLLMProvider({ antworten: optionen.mockAntworten ?? [] });
  const supabaseClient = baueFakeSupabaseClient();
  const logger = baueLogger('silent');

  return {
    deps: { repo, klassifikationsRepo, provider, supabaseClient, logger },
    repo,
    klassifikationsRepo,
  };
}

export function baueImapNachricht(overrides: Partial<ImapNachricht> = {}): ImapNachricht {
  return {
    uid: 1,
    messageId: '<abc123@absender.example>',
    von: 'kunde@kunde-a1.example',
    an: ['mensch-betrieb+neurabin-pharma@intake.example.de'],
    cc: [],
    bcc: [],
    betreff: 'Testbetreff',
    textBody: 'Testinhalt.',
    htmlBody: null,
    datum: '2026-07-19T09:00:00.000Z',
    anhaenge: [],
    ...overrides,
  };
}

export function baueAnbindung(overrides: Partial<KundenMailAnbindung> = {}): KundenMailAnbindung {
  return {
    id: 'anbindung-1',
    kundeId: 'kunde-1',
    agenturId: 'agentur-1',
    anbindungsTyp: 'weiterleitung',
    konsolenAdresse: 'mensch-betrieb+neurabin-pharma@intake.example.de',
    aktiv: true,
    ...overrides,
  };
}
