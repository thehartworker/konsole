import { describe, expect, it } from 'vitest';
import { LeererW2KontextQuellenProvider, sammleKontext } from '../../src/w2/kontext.js';
import type { PraezedenzEintrag, SprachregelungsEintrag, W2KontextQuellenProvider } from '../../src/w2/types.js';
import { W2_INPUT_BASIS } from './fixtures.js';

class FakeProvider implements W2KontextQuellenProvider {
  constructor(
    private readonly sprachregelungen: SprachregelungsEintrag[],
    private readonly praezedenzen: PraezedenzEintrag[],
  ) {}

  async sprachregelungenLaden(): Promise<SprachregelungsEintrag[]> {
    return this.sprachregelungen;
  }

  async praezedenzenLaden(): Promise<PraezedenzEintrag[]> {
    return this.praezedenzen;
  }
}

describe('sammleKontext', () => {
  it('Fallback: leere Sprachregelungen erzeugen einen Hinweis und verfuegbar=false', async () => {
    const kontext = await sammleKontext(W2_INPUT_BASIS, new LeererW2KontextQuellenProvider());

    expect(kontext.sprachregelungen.verfuegbar).toBe(false);
    expect(kontext.sprachregelungen.daten).toBeNull();
    expect(kontext.hinweise.some((h) => h.includes('Sprachregelungen'))).toBe(true);
  });

  it('Fallback: leere Präzedenzen erzeugen den "Onboarding empfohlen"-Hinweis', async () => {
    const kontext = await sammleKontext(W2_INPUT_BASIS, new LeererW2KontextQuellenProvider());

    expect(kontext.praezedenzen.verfuegbar).toBe(false);
    expect(kontext.hinweise.some((h) => h.includes('Onboarding empfohlen'))).toBe(true);
  });

  it('vorhandene Sprachregelungen/Präzedenzen: verfuegbar=true, kein Fallback-Hinweis für diese Quelle', async () => {
    const provider = new FakeProvider(
      [{ thema: 'Produktrückruf', position_text: 'Wir kommunizieren transparent.' }],
      [{ anfrage_thema: 'Rückruf', antwort_auszug: 'Frühere Antwort zu einem ähnlichen Fall.' }],
    );

    const kontext = await sammleKontext(W2_INPUT_BASIS, provider);

    expect(kontext.sprachregelungen.verfuegbar).toBe(true);
    expect(kontext.sprachregelungen.daten).toHaveLength(1);
    expect(kontext.praezedenzen.verfuegbar).toBe(true);
    expect(kontext.hinweise).toHaveLength(0);
  });

  it('ssot und journalisten_profil sind reine v1-Stubs, immer nicht verfügbar', async () => {
    const kontext = await sammleKontext(W2_INPUT_BASIS, new LeererW2KontextQuellenProvider());

    expect(kontext.ssot).toEqual({ name: 'ssot', verfuegbar: false, daten: null });
    expect(kontext.journalisten_profil).toEqual({ name: 'journalisten_profil', verfuegbar: false, daten: null });
  });

  it('externes_wissen kommt direkt aus kunde_kontext.thema_positionierung, ohne RAG', async () => {
    const kontext = await sammleKontext(W2_INPUT_BASIS, new LeererW2KontextQuellenProvider());

    expect(kontext.externes_wissen.verfuegbar).toBe(true);
    expect(kontext.externes_wissen.daten).toBe(W2_INPUT_BASIS.kunde_kontext.thema_positionierung);
  });

  it('externes_wissen ist nicht verfügbar, wenn thema_positionierung null ist', async () => {
    const input = { ...W2_INPUT_BASIS, kunde_kontext: { ...W2_INPUT_BASIS.kunde_kontext, thema_positionierung: null } };

    const kontext = await sammleKontext(input, new LeererW2KontextQuellenProvider());

    expect(kontext.externes_wissen.verfuegbar).toBe(false);
  });

  it('ohne injizierten Provider wird der leere v1-Default verwendet (kein Fehler)', async () => {
    const kontext = await sammleKontext(W2_INPUT_BASIS);

    expect(kontext.sprachregelungen.verfuegbar).toBe(false);
    expect(kontext.praezedenzen.verfuegbar).toBe(false);
  });
});
