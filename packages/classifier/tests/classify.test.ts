import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { klassifiziereNachricht } from '../src/classify.js';
import { GUTER_OUTPUT, KONTEXT_BAECKEREI, NACHRICHT_BAECKEREI, SCHLECHTER_OUTPUT } from './fixtures.js';

const OPTIONEN = { model: 'mock-model', maxTokens: 16000 };

describe('klassifiziereNachricht', () => {
  it('(a) klassifiziert eine normale Anfrage korrekt mit sauber getrennten Anliegen (Persistenz folgt in Teil 2)', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_OUTPUT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.ergebnis.anliegen).toHaveLength(2);
      expect(resultat.ergebnis.typ_primaer).toBe('Anfrage');
      expect(resultat.ergebnis.sensitivity).toBe('normal');
    }
  });

  it('(b) hebt die Sensitivity per Hardrule an und erzwingt die Eskalation, auch wenn das LLM normal meldet', async () => {
    const sensitiveNachricht = {
      ...NACHRICHT_BAECKEREI,
      inhalt_text: 'Wir haben gerade einen handfesten Skandal, die Presse ruft schon an.',
    };
    const llmOutputTrotzdemNormal = {
      ...GUTER_OUTPUT,
      sensitivity: 'normal' as const,
      rueckfragen: ['Wer soll das übernehmen?'],
      rueckfrage_nachricht: 'Kurze Rückfrage dazu.',
    };
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(llmOutputTrotzdemNormal), tokenVerbrauch: { input_tokens: 100, output_tokens: 80 } },
      ],
    });

    const resultat = await klassifiziereNachricht(sensitiveNachricht, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.ergebnis.sensitivity).toBe('krise');
      expect(resultat.ergebnis.rueckfragen).toEqual([]);
      expect(resultat.ergebnis.rueckfrage_nachricht).toBeNull();
      expect(resultat.ergebnis.antwort_nachricht).toContain('liegt bei');
    }
  });

  it('(c) markiert einen schema-verletzenden Output als fehlgeschlagen statt als halben Vorgang', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(SCHLECHTER_OUTPUT), tokenVerbrauch: { input_tokens: 100, output_tokens: 80 } }],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Zod-Validierung fehlgeschlagen');
      expect(resultat).not.toHaveProperty('ergebnis');
    }
  });

  it('markiert nicht-valides JSON als fehlgeschlagen', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: 'das ist kein JSON', tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('kein valides JSON');
    }
  });

  it('fängt einen LLM-Aufruf-Fehler ab und gibt ein definiertes Fehler-Resultat zurück', async () => {
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Netzwerk-Timeout');
      },
    };

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('fehlgeschlagen');
    if (resultat.status === 'fehlgeschlagen') {
      expect(resultat.fehler).toContain('Netzwerk-Timeout');
    }
  });

  it('(e) löst in keinem Fall einen Handler aus, nur ein Vorschlag ist im Ergebnis enthalten', async () => {
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_OUTPUT), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } }],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(provider.aufrufe).toHaveLength(1); // kein zusätzlicher Aufruf für einen Handler
    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      for (const anliegen of resultat.ergebnis.anliegen) {
        // backend_handler_vorschlag ist Daten, kein "ausgeloest"-Feld existiert im Schema.
        expect(anliegen).not.toHaveProperty('handler_ausgeloest');
        expect(anliegen).not.toHaveProperty('handler_aufruf_id');
      }
    }
  });

  it('(f) gibt den Token-Verbrauch exakt so zurück, wie ihn der Provider gemeldet hat', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(GUTER_OUTPUT), tokenVerbrauch: { input_tokens: 4321, output_tokens: 987 } },
      ],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.tokenVerbrauch).toEqual({ input_tokens: 4321, output_tokens: 987 });
    }
    // Die Zuordnung zum richtigen Kunden (nachricht.kunde_id) passiert erst
    // beim Schreiben nach llm_nutzung in Teil 2 (Persistenz), siehe Design-
    // Decision. Hier wird nur sichergestellt, dass der Wert unverfälscht
    // durchgereicht wird, damit Teil 2 ihn korrekt zuordnen kann.
  });

  it('parst JSON auch, wenn das LLM es trotz Anweisung in Markdown-Code-Fences verpackt', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        {
          text: '```json\n' + JSON.stringify(GUTER_OUTPUT) + '\n```',
          tokenVerbrauch: { input_tokens: 500, output_tokens: 300 },
        },
      ],
    });

    const resultat = await klassifiziereNachricht(NACHRICHT_BAECKEREI, KONTEXT_BAECKEREI, provider, OPTIONEN);

    expect(resultat.status).toBe('erfolg');
  });
});
