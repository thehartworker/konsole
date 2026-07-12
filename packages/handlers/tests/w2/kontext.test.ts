import { describe, expect, it } from 'vitest';
import {
  sammleW2Kontext,
  verwendeteQuellenAusKontext,
  V1_STUB_KONTEXT_QUELLEN_PROVIDER,
  type W2KontextQuellenProvider,
} from '../../src/w2/kontext.js';
import { W2_INPUT_STANDARD } from './fixtures.js';

describe('sammleW2Kontext', () => {
  it('markiert alle vier Loader-Quellen v1 als leer/Stub, wenn der Default-Stub-Provider verwendet wird', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);

    expect(kontext.sprachregelungen.status).toBe('leer');
    expect(kontext.praezedenzen.status).toBe('leer');
    expect(kontext.ssot.status).toBe('v1_stub');
    expect(kontext.journalistenProfil.status).toBe('v1_stub');
  });

  it('nutzt kunde_kontext.thema_positionierung direkt als externesWissen, ohne eigenen Loader', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);

    expect(kontext.externesWissen.status).toBe('verfuegbar');
    expect(kontext.externesWissen.daten).toEqual({
      positionierung: W2_INPUT_STANDARD.kunde_kontext.thema_positionierung,
    });
  });

  it('markiert externesWissen als leer, wenn thema_positionierung null ist', async () => {
    const input = {
      ...W2_INPUT_STANDARD,
      kunde_kontext: { ...W2_INPUT_STANDARD.kunde_kontext, thema_positionierung: null },
    };
    const kontext = await sammleW2Kontext(input);

    expect(kontext.externesWissen.status).toBe('leer');
    expect(kontext.externesWissen.daten).toBeNull();
  });

  it('erzeugt einen Hinweis, wenn keine Sprachregelung hinterlegt ist (Fallback: reactive_statement bleibt null)', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);

    expect(kontext.warnHinweise.some((hinweis) => hinweis.includes('Sprachregelung'))).toBe(true);
  });

  it('erzeugt einen "Onboarding empfohlen"-Hinweis, wenn keine Präzedenzen hinterlegt sind', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);

    expect(kontext.warnHinweise.some((hinweis) => hinweis.includes('Onboarding empfohlen'))).toBe(true);
  });

  it('nutzt eine injizierte Sprachregelung, wenn ein Provider sie liefert, und erzeugt dann KEINEN Hinweis', async () => {
    const provider: W2KontextQuellenProvider = {
      ...V1_STUB_KONTEXT_QUELLEN_PROVIDER,
      async sprachregelungLaden() {
        return { text: 'Der Kunde äußert sich zum Thema wie folgt: ...' };
      },
    };

    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD, provider);

    expect(kontext.sprachregelungen.status).toBe('verfuegbar');
    expect(kontext.warnHinweise.some((hinweis) => hinweis.includes('Sprachregelung'))).toBe(false);
  });

  it('nutzt injizierte Präzedenzen, wenn ein Provider sie liefert, und erzeugt dann KEINEN Onboarding-Hinweis', async () => {
    const provider: W2KontextQuellenProvider = {
      ...V1_STUB_KONTEXT_QUELLEN_PROVIDER,
      async praezedenzenLaden() {
        return { beispiele: ['Frühere Antwort auf eine ähnliche Anfrage.'] };
      },
    };

    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD, provider);

    expect(kontext.praezedenzen.status).toBe('verfuegbar');
    expect(kontext.warnHinweise.some((hinweis) => hinweis.includes('Onboarding empfohlen'))).toBe(false);
  });
});

describe('verwendeteQuellenAusKontext', () => {
  it('listet nur tatsächlich verfügbare (nicht-leere, nicht-Stub) Quellen', async () => {
    const kontext = await sammleW2Kontext(W2_INPUT_STANDARD);
    const quellen = verwendeteQuellenAusKontext(kontext);

    expect(quellen).toEqual(['externes_wissen']);
  });
});
