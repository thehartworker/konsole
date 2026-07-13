import { describe, expect, it } from 'vitest';
import { LeererW1KontextQuellenProvider, sammleKontext } from '../../src/w1/kontext.js';
import type { W1KontextQuellenProvider, W1PraezedenzEintrag, W1SprecherEintrag } from '../../src/w1/types.js';
import { W1_INPUT_BASIS } from './fixtures.js';

class FakeProvider implements W1KontextQuellenProvider {
  constructor(
    private readonly praezedenzen: W1PraezedenzEintrag[] = [],
    private readonly boilerplate: string | null = null,
    private readonly sprecher: W1SprecherEintrag | null = null,
  ) {}

  async praezedenzenLaden(): Promise<W1PraezedenzEintrag[]> {
    return this.praezedenzen;
  }

  async boilerplateLaden(): Promise<string | null> {
    return this.boilerplate;
  }

  async sprecherLaden(): Promise<W1SprecherEintrag | null> {
    return this.sprecher;
  }
}

describe('sammleKontext', () => {
  it('Fallback: keine Präzedenzen erzeugen den Spec-Hinweis "SSOT aufsetzen"', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS, new LeererW1KontextQuellenProvider());

    expect(kontext.praezedenzen.verfuegbar).toBe(false);
    expect(kontext.praezedenzen.daten).toBeNull();
    expect(kontext.hinweise.some((h) => h.includes('Kunden-SSOT aufsetzen'))).toBe(true);
  });

  it('Fallback: keine Boilerplate erzeugt einen Hinweis mit Typ/Sprache', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS, new LeererW1KontextQuellenProvider());

    expect(kontext.boilerplate.verfuegbar).toBe(false);
    expect(kontext.hinweise.some((h) => h.includes('Boilerplate') && h.includes('lang'))).toBe(true);
  });

  it('vorhandene Präzedenzen/Boilerplate: verfuegbar=true, kein Fallback-Hinweis für diese Quelle', async () => {
    const provider = new FakeProvider([{ titel: 'Frühere PM', volltext: 'Text.' }], 'Kunde X ist Marktführer.');

    const kontext = await sammleKontext(W1_INPUT_BASIS, provider);

    expect(kontext.praezedenzen.verfuegbar).toBe(true);
    expect(kontext.praezedenzen.daten).toHaveLength(1);
    expect(kontext.boilerplate.verfuegbar).toBe(true);
    expect(kontext.boilerplate.daten).toBe('Kunde X ist Marktführer.');
  });

  it('Länge -> Boilerplate-Typ-Mapping: "kurz" bleibt kurz, "standard"/"lang" werden zu "lang"', async () => {
    let angefragterTyp: string | null = null;
    class AufzeichnenderProvider implements W1KontextQuellenProvider {
      async praezedenzenLaden(): Promise<W1PraezedenzEintrag[]> {
        return [];
      }
      async boilerplateLaden(_slug: string, laenge: 'kurz' | 'lang'): Promise<string | null> {
        angefragterTyp = laenge;
        return null;
      }
      async sprecherLaden(): Promise<W1SprecherEintrag | null> {
        return null;
      }
    }

    await sammleKontext(W1_INPUT_BASIS, new AufzeichnenderProvider()); // laenge_ziel: 'standard'
    expect(angefragterTyp).toBe('lang');

    const kurzInput = { ...W1_INPUT_BASIS, briefing: { ...W1_INPUT_BASIS.briefing, laenge_ziel: 'kurz' as const } };
    await sammleKontext(kurzInput, new AufzeichnenderProvider());
    expect(angefragterTyp).toBe('kurz');
  });

  it('sektor_corpus und diskurs_snapshot sind reine v1-Stubs, immer nicht verfügbar', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS, new LeererW1KontextQuellenProvider());

    expect(kontext.sektor_corpus).toEqual({ name: 'sektor_corpus', verfuegbar: false, daten: null });
    expect(kontext.diskurs_snapshot).toEqual({ name: 'diskurs_snapshot', verfuegbar: false, daten: null });
  });

  it('tonalitaet kommt EAGER aus kunde_kontext, ohne RAG', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS, new LeererW1KontextQuellenProvider());

    expect(kontext.tonalitaet.verfuegbar).toBe(true);
    expect(kontext.tonalitaet.daten).toEqual(W1_INPUT_BASIS.kunde_kontext.tonalitaet);
  });

  it('tonalitaet ist nicht verfügbar, wenn grundton null ist, mit Hinweis', async () => {
    const input = { ...W1_INPUT_BASIS, kunde_kontext: { ...W1_INPUT_BASIS.kunde_kontext, tonalitaet: { grundton: null, stil_parameter: {}, anrede_konvention: null, gendering_konvention: null } } };

    const kontext = await sammleKontext(input, new LeererW1KontextQuellenProvider());

    expect(kontext.tonalitaet.verfuegbar).toBe(false);
    expect(kontext.hinweise.some((h) => h.includes('Tonalität'))).toBe(true);
  });

  describe('Sprecher/Zitat-Freigabe', () => {
    it('kein zitat_sprecher im Briefing: sprecher nicht verfügbar, kein Hinweis', async () => {
      const input = { ...W1_INPUT_BASIS, briefing: { ...W1_INPUT_BASIS.briefing, zitat_sprecher: null } };

      const kontext = await sammleKontext(input, new LeererW1KontextQuellenProvider());

      expect(kontext.sprecher.verfuegbar).toBe(false);
      expect(kontext.hinweise.some((h) => h.includes('Sprecher'))).toBe(false);
    });

    it('Sprecher nicht im Profil gefunden: nicht verfügbar, mit Hinweis', async () => {
      const kontext = await sammleKontext(W1_INPUT_BASIS, new FakeProvider([], null, null));

      expect(kontext.sprecher.verfuegbar).toBe(false);
      expect(kontext.hinweise.some((h) => h.includes('nicht im Kundenprofil hinterlegt'))).toBe(true);
    });

    it('Sprecher gefunden, aber zitat_freigabe=false: nicht verfügbar, mit Freigabe-Hinweis', async () => {
      const sprecher: W1SprecherEintrag = {
        name: 'Dr. Mara Beispiel',
        rolle: 'Geschäftsführung',
        exakte_schreibweise: null,
        zitat_freigabe: false,
      };
      const kontext = await sammleKontext(W1_INPUT_BASIS, new FakeProvider([], null, sprecher));

      expect(kontext.sprecher.verfuegbar).toBe(false);
      expect(kontext.hinweise.some((h) => h.includes('Zitat-Freigabe') && h.includes('fehlt'))).toBe(true);
    });

    it('Sprecher gefunden und zitat_freigabe=true: verfügbar, kein Hinweis', async () => {
      const sprecher: W1SprecherEintrag = {
        name: 'Dr. Mara Beispiel',
        rolle: 'Geschäftsführung',
        exakte_schreibweise: 'Dr. Mara Beispiel',
        zitat_freigabe: true,
      };
      const kontext = await sammleKontext(W1_INPUT_BASIS, new FakeProvider([], null, sprecher));

      expect(kontext.sprecher.verfuegbar).toBe(true);
      expect(kontext.sprecher.daten).toEqual(sprecher);
      expect(kontext.hinweise.some((h) => h.includes('Sprecher'))).toBe(false);
    });
  });

  it('ohne injizierten Provider wird der leere v1-Default verwendet (kein Fehler)', async () => {
    const kontext = await sammleKontext(W1_INPUT_BASIS);

    expect(kontext.praezedenzen.verfuegbar).toBe(false);
    expect(kontext.boilerplate.verfuegbar).toBe(false);
  });
});
