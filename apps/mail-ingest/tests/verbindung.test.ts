import { describe, expect, it, vi } from 'vitest';
import { FakeImapClient } from '@konsole/mail-ingest/testing';
import { starteVerbindung, type VerbindungsStatus } from '../src/verbindung.js';
import { baueAbhaengigkeiten, baueAnbindung, baueImapNachricht } from './fixtures.js';
import { MAIL_KLASSIFIKATIONS_ERGEBNIS } from './klassifikations-fixture.js';

function baueDeps(anbindung: ReturnType<typeof baueAnbindung>) {
  return baueAbhaengigkeiten({
    repoOptionen: { anbindungen: [anbindung], kundenSlugs: { [anbindung.kundeId]: 'kunde-a1-test' } },
    klassifikationsRepoOptionen: {
      kunden: [{ id: anbindung.kundeId, agentur_id: anbindung.agenturId, autonomie_level: 1 }],
    },
    mockAntworten: [{ text: JSON.stringify(MAIL_KLASSIFIKATIONS_ERGEBNIS), tokenVerbrauch: { input_tokens: 1, output_tokens: 1 } }],
  });
}

describe('starteVerbindung', () => {
  it('verbindet beim Start und verarbeitet bereits im Posteingang liegende Nachrichten', async () => {
    const anbindung = baueAnbindung();
    const nachricht = baueImapNachricht();
    const imapClient = new FakeImapClient([nachricht]);
    const { deps, repo } = baueDeps(anbindung);
    const status: VerbindungsStatus = { bezeichnung: 'test', letzteMailAt: null };

    const verbindung = await starteVerbindung({
      bezeichnung: 'test',
      imapClient,
      verarbeitetOrdner: 'Verarbeitet',
      anbindungenLaden: async () => [anbindung],
      abhaengigkeiten: deps,
      fallbackPollIntervallMs: 60_000,
      status,
    });

    // verarbeiteNeueMails() läuft asynchron im Hintergrund (void-Aufruf) --
    // auf das Ende der Mikrotask-Kette warten, bevor Assertions laufen.
    await vi.waitFor(() => expect(repo.vorgaenge).toHaveLength(1));

    expect(imapClient.verbunden).toBe(true);
    expect(imapClient.verschobeneNachrichten).toEqual([{ uid: nachricht.uid, zielOrdner: 'Verarbeitet' }]);
    expect(status.letzteMailAt).not.toBeNull();

    await verbindung.stoppen();
    expect(imapClient.verbunden).toBe(false);
  });

  it('verarbeitet eine per IDLE simulierte neue Nachricht', async () => {
    const anbindung = baueAnbindung();
    const imapClient = new FakeImapClient([]);
    const { deps, repo } = baueDeps(anbindung);
    const status: VerbindungsStatus = { bezeichnung: 'test', letzteMailAt: null };

    const verbindung = await starteVerbindung({
      bezeichnung: 'test',
      imapClient,
      verarbeitetOrdner: 'Verarbeitet',
      anbindungenLaden: async () => [anbindung],
      abhaengigkeiten: deps,
      fallbackPollIntervallMs: 60_000,
      status,
    });

    await vi.waitFor(() => expect(repo.vorgaenge).toHaveLength(0));

    imapClient.simuliereEingehendeMail(baueImapNachricht({ uid: 42, messageId: '<neu@absender.example>' }));

    await vi.waitFor(() => expect(repo.vorgaenge).toHaveLength(1));

    await verbindung.stoppen();
  });
});
