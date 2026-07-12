import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { extrahiereProfilVorschlag } from '../src/extrahiere.js';
import { OUTPUT_MIT_UNBELEGTER_KENNZAHL, SCHLECHTER_OUTPUT, TEXT_GESCHAEFTSBERICHT, VOLLSTAENDIGER_OUTPUT } from './fixtures.js';

const OPTIONEN = { model: 'mock-model', maxTokens: 12000 };

describe('extrahiereProfilVorschlag', () => {
  it('extrahiert einen vollständigen, belegten Vorschlag korrekt', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(VOLLSTAENDIGER_OUTPUT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }],
    });

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.vorschlag.fakten.sitz).toBe('München');
      expect(resultat.vorschlag.sprecher).toHaveLength(1);
      expect(resultat.verworfeneKennzahlen).toBe(0);
    }
  });

  it('Konservativ-Prinzip: eine Kennzahl ohne Stichtag/Quelle wird verworfen, KEINE erfundene Kennzahl im Ergebnis', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(OUTPUT_MIT_UNBELEGTER_KENNZAHL), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } },
      ],
    });

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.vorschlag.kennzahlen).toHaveLength(1);
      expect(resultat.vorschlag.kennzahlen[0]?.bezeichnung).toBe('Mitarbeitende');
      expect(resultat.verworfeneKennzahlen).toBe(1);
    }
  });

  it('markiert einen schema-verletzenden Output als fehlgeschlagen statt einen halben Vorschlag zu übernehmen', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(SCHLECHTER_OUTPUT), tokenVerbrauch: { input_tokens: 100, output_tokens: 80 } }],
    });

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Zod-Validierung fehlgeschlagen');
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 100, output_tokens: 80 });
    }
  });

  it('gibt bei nicht-validem JSON den Token-Verbrauch trotzdem zurück (bereits abgerechnet)', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: 'kein JSON', tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'website-scraping', 'https://kunde.example/', provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('kein valides JSON');
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 10, output_tokens: 5 });
    }
  });

  it('fängt einen LLM-Aufruf-Fehler ab, ohne Token-Verbrauch (kein Response empfangen)', async () => {
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Netzwerk-Timeout');
      },
    };

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Netzwerk-Timeout');
      expect(resultat.tokenVerbrauch).toBeUndefined();
    }
  });

  it('ruft das Opus-Default-Modell auf, wenn keine Modell-Option gesetzt ist', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(VOLLSTAENDIGER_OUTPUT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }],
    });

    await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider);

    expect(provider.aufrufe[0]?.model).toBe('claude-opus-4-5-20250929');
    expect(provider.aufrufe[0]?.max_tokens).toBe(12000);
  });

  it('parst JSON auch, wenn das LLM es trotz Anweisung in Markdown-Code-Fences verpackt', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        {
          text: '```json\n' + JSON.stringify(VOLLSTAENDIGER_OUTPUT) + '\n```',
          tokenVerbrauch: { input_tokens: 500, output_tokens: 300 },
        },
      ],
    });

    const resultat = await extrahiereProfilVorschlag(TEXT_GESCHAEFTSBERICHT, 'dokument-upload', 'geschaeftsbericht.pdf', provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
  });
});
