import { describe, expect, it } from 'vitest';
import { FakeDokumentTextProvider } from '../src/testing/fake-dokument-text-provider.js';
import { FakeWebsiteTextProvider } from '../src/testing/fake-website-text-provider.js';

describe('FakeDokumentTextProvider', () => {
  it('liefert den konfigurierten Text für eine bekannte quelldokumentId, kein echter Datei-Zugriff', async () => {
    const provider = new FakeDokumentTextProvider({
      textNachQuelldokumentId: { 'doc-1': 'Musterfirma GmbH, Sitz in München.' },
    });

    const ergebnis = await provider.textExtrahieren({
      quelldokumentId: 'doc-1',
      dateiname: 'geschaeftsbericht.pdf',
      typ: 'pdf',
      inhalt: new Uint8Array(),
    });

    expect(ergebnis.text).toBe('Musterfirma GmbH, Sitz in München.');
    expect(provider.angefragteDateien).toHaveLength(1);
  });

  it('wirft bei einer nicht konfigurierten quelldokumentId, statt stillschweigend leeren Text zu liefern', async () => {
    const provider = new FakeDokumentTextProvider({ textNachQuelldokumentId: {} });

    await expect(
      provider.textExtrahieren({ quelldokumentId: 'unbekannt', dateiname: 'x.pdf', typ: 'pdf', inhalt: new Uint8Array() }),
    ).rejects.toThrow('kein Text für quelldokumentId');
  });
});

describe('FakeWebsiteTextProvider', () => {
  it('liefert die konfigurierten Seiten für eine bekannte kundeId, kein echter Netzwerk-Zugriff', async () => {
    const provider = new FakeWebsiteTextProvider({
      seitenNachKundeId: { 'kunde-1': [{ bezeichnung: 'Startseite', text: 'Willkommen bei Musterfirma.' }] },
    });

    const ergebnis = await provider.textDerRelevantenSeitenLaden({ kundeId: 'kunde-1', erlaubteDomain: 'musterfirma.de' });

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0]?.text).toBe('Willkommen bei Musterfirma.');
    expect(provider.angefragteQuellen).toEqual([{ kundeId: 'kunde-1', erlaubteDomain: 'musterfirma.de' }]);
  });

  it('liefert eine leere Liste für einen nicht konfigurierten Kunden, statt zu werfen (leere Website-Präsenz ist ein gültiger Zustand)', async () => {
    const provider = new FakeWebsiteTextProvider({ seitenNachKundeId: {} });

    const ergebnis = await provider.textDerRelevantenSeitenLaden({ kundeId: 'unbekannt', erlaubteDomain: 'x.de' });

    expect(ergebnis).toEqual([]);
  });
});
