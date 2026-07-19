import { describe, expect, it, vi } from 'vitest';
import { speichereAnhaenge } from '../src/anhaenge.js';
import type { Anhang } from '../src/types.js';

function baueFakeSupabaseClient(uploadError: { message: string } | null = null) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const from = vi.fn().mockReturnValue({ upload });
  return { client: { storage: { from } } as never, upload, from };
}

function baueAnhang(overrides: Partial<Anhang> = {}): Anhang {
  return {
    dateiname: 'pressemitteilung.pdf',
    contentType: 'application/pdf',
    groesseBytes: 1024,
    inhalt: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

describe('speichereAnhaenge', () => {
  it('lädt jedes Attachment in den mail_anhaenge-Bucket hoch und gibt Metadaten zurück', async () => {
    const { client, from, upload } = baueFakeSupabaseClient();
    const anhang = baueAnhang();

    const ergebnis = await speichereAnhaenge(
      [anhang],
      { agenturId: 'agentur-1', kundeId: 'kunde-1', vorgangId: 'vorgang-1' },
      client,
    );

    expect(from).toHaveBeenCalledWith('mail_anhaenge');
    expect(upload).toHaveBeenCalledTimes(1);
    const [bucketPfad, inhalt, optionen] = upload.mock.calls[0];
    expect(bucketPfad).toMatch(/^agentur-1\/kunde-1\/vorgang-1\/.+-pressemitteilung\.pdf$/);
    expect(inhalt).toBe(anhang.inhalt);
    expect(optionen).toEqual({ contentType: 'application/pdf' });

    expect(ergebnis).toEqual([
      {
        dateiname: 'pressemitteilung.pdf',
        contentType: 'application/pdf',
        groesseBytes: 1024,
        bucketPfad: expect.stringContaining('agentur-1/kunde-1/vorgang-1/'),
      },
    ]);
  });

  it('lädt mehrere Anhänge in der übergebenen Reihenfolge hoch', async () => {
    const { client, upload } = baueFakeSupabaseClient();
    const anhaenge = [baueAnhang({ dateiname: 'a.pdf' }), baueAnhang({ dateiname: 'b.png', contentType: 'image/png' })];

    const ergebnis = await speichereAnhaenge(anhaenge, { agenturId: 'a', kundeId: 'k', vorgangId: 'v' }, client);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(ergebnis.map((e) => e.dateiname)).toEqual(['a.pdf', 'b.png']);
  });

  it('wirft einen aussagekräftigen Fehler, wenn der Upload fehlschlägt', async () => {
    const { client } = baueFakeSupabaseClient({ message: 'Bucket nicht gefunden' });

    await expect(
      speichereAnhaenge([baueAnhang()], { agenturId: 'a', kundeId: 'k', vorgangId: 'v' }, client),
    ).rejects.toThrow(/pressemitteilung\.pdf.*Bucket nicht gefunden/);
  });

  it('gibt ein leeres Array zurück, wenn keine Anhänge übergeben werden', async () => {
    const { client, upload } = baueFakeSupabaseClient();

    const ergebnis = await speichereAnhaenge([], { agenturId: 'a', kundeId: 'k', vorgangId: 'v' }, client);

    expect(ergebnis).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });
});
