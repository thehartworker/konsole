// Vertrags-Test für ImapClient über FakeImapClient (Issue #52, Aufgabe B):
// ProduktiverImapClient selbst braucht einen echten IMAP-Server und wird
// hier bewusst nicht getestet (siehe Kommentar in
// src/produktiver-imap-client.ts) -- FakeImapClient implementiert exakt
// dasselbe Interface und ist die Grundlage für die End-to-End-Tests in
// apps/mail-ingest.

import { describe, expect, it } from 'vitest';
import { FakeImapClient } from '../src/testing/fake-imap-client.js';
import { baueImapNachricht } from './fixtures.js';

describe('FakeImapClient', () => {
  it('ist nach connect() verbunden und nach disconnect() nicht mehr', async () => {
    const client = new FakeImapClient();
    await client.connect();
    expect(client.verbunden).toBe(true);
    await client.disconnect();
    expect(client.verbunden).toBe(false);
  });

  it('holeUngeleseneNachrichten liefert die im Konstruktor übergebenen Nachrichten', async () => {
    const nachricht = baueImapNachricht();
    const client = new FakeImapClient([nachricht]);

    await expect(client.holeUngeleseneNachrichten()).resolves.toEqual([nachricht]);
  });

  it('verschiebeNachricht entfernt die Nachricht aus dem simulierten Posteingang und protokolliert das Ziel', async () => {
    const nachricht = baueImapNachricht({ uid: 7 });
    const client = new FakeImapClient([nachricht]);

    await client.verschiebeNachricht(7, 'Verarbeitet');

    expect(client.verschobeneNachrichten).toEqual([{ uid: 7, zielOrdner: 'Verarbeitet' }]);
    await expect(client.holeUngeleseneNachrichten()).resolves.toEqual([]);
  });

  it('markiereAlsGelesen protokolliert die uid', async () => {
    const client = new FakeImapClient();
    await client.markiereAlsGelesen(3);
    expect(client.alsGelesenMarkiert).toEqual([3]);
  });

  it('starteIdle ruft den callback bei simuliereEingehendeMail auf', async () => {
    const client = new FakeImapClient();
    let aufrufe = 0;
    await client.starteIdle(() => {
      aufrufe += 1;
    });

    client.simuliereEingehendeMail(baueImapNachricht({ uid: 99 }));

    expect(aufrufe).toBe(1);
    await expect(client.holeUngeleseneNachrichten()).resolves.toHaveLength(1);
  });

  it('die von starteIdle zurückgegebene Stop-Funktion beendet die callback-Zustellung', async () => {
    const client = new FakeImapClient();
    let aufrufe = 0;
    const stoppen = await client.starteIdle(() => {
      aufrufe += 1;
    });

    stoppen();
    client.simuliereEingehendeMail(baueImapNachricht({ uid: 100 }));

    expect(aufrufe).toBe(0);
  });
});
