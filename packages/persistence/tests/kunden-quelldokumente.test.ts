import { describe, expect, it } from 'vitest';
import { FakeKundenQuelldokumenteRepository } from '../src/testing/fake-kunden-quelldokumente-repository.js';

describe('FakeKundenQuelldokumenteRepository', () => {
  it('lädt eine bestehende Quelldokument-Zeile', async () => {
    const repo = new FakeKundenQuelldokumenteRepository({
      quelldokumente: [
        {
          id: 'doc-1',
          kunde_id: 'kunde-a',
          bucket_pfad: 'agentur-a/kunde-a/doc-1-bericht.pdf',
          dateiname: 'bericht.pdf',
          mime_typ: 'application/pdf',
          extraktion_status: 'ausstehend',
        },
      ],
    });

    const zeile = await repo.quelldokumentLaden('doc-1');
    expect(zeile?.dateiname).toBe('bericht.pdf');
  });

  it('gibt null für ein unbekanntes Quelldokument zurück, statt zu werfen', async () => {
    const repo = new FakeKundenQuelldokumenteRepository();
    expect(await repo.quelldokumentLaden('unbekannt')).toBeNull();
  });

  it('lädt den konfigurierten Datei-Inhalt für einen bucket_pfad', async () => {
    const inhalt = new TextEncoder().encode('PDF-Rohinhalt');
    const repo = new FakeKundenQuelldokumenteRepository({ dateiInhalte: { 'pfad/datei.pdf': inhalt } });

    expect(await repo.dateiInhaltLaden('pfad/datei.pdf')).toBe(inhalt);
  });

  it('wirft, wenn für einen bucket_pfad kein Datei-Inhalt konfiguriert ist', async () => {
    const repo = new FakeKundenQuelldokumenteRepository();
    await expect(repo.dateiInhaltLaden('unbekannt.pdf')).rejects.toThrow('kein Datei-Inhalt');
  });

  it('setzt extraktion_status auf der richtigen Zeile, ohne andere Zeilen zu berühren', async () => {
    const repo = new FakeKundenQuelldokumenteRepository({
      quelldokumente: [
        { id: 'doc-1', kunde_id: 'kunde-a', bucket_pfad: 'p1', dateiname: 'a.pdf', mime_typ: null, extraktion_status: 'ausstehend' },
        { id: 'doc-2', kunde_id: 'kunde-a', bucket_pfad: 'p2', dateiname: 'b.pdf', mime_typ: null, extraktion_status: 'ausstehend' },
      ],
    });

    await repo.extraktionStatusSetzen('doc-1', 'verarbeitet');

    expect((await repo.quelldokumentLaden('doc-1'))?.extraktion_status).toBe('verarbeitet');
    expect((await repo.quelldokumentLaden('doc-2'))?.extraktion_status).toBe('ausstehend');
  });
});
