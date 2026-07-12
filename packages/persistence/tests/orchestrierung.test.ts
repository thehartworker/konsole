import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import { klassifiziereUndPersistiere } from '../src/orchestrierung.js';
import { FakeKlassifikationsRepository } from '../src/testing/index.js';
import {
  ERGEBNIS_ZWEI_ANLIEGEN,
  KONTEXT_BAECKEREI,
  KUNDE_A1_STUFE1,
  NACHRICHT_BAECKEREI,
  NUTZER_JULIA,
  VORGANG_ID,
} from './fixtures.js';

const OPTIONEN = { model: 'mock-model', maxTokens: 16000 };

describe('klassifiziereUndPersistiere', () => {
  it('(Aufgabe A) durchläuft klassifikation_status queued -> in_progress -> done bei einer erfolgreichen Klassifikation', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(ERGEBNIS_ZWEI_ANLIEGEN), tokenVerbrauch: { input_tokens: 500, output_tokens: 300 } },
      ],
    });
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
      vorgaenge: { [VORGANG_ID]: { klassifikation_status: 'queued' } },
    });

    const resultat = await klassifiziereUndPersistiere({
      nachricht: NACHRICHT_BAECKEREI,
      kontext: KONTEXT_BAECKEREI,
      provider,
      repo,
      optionen: OPTIONEN,
    });

    expect(resultat.status).toBe('done');
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation_status).toBe('done');
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation_gestartet_at).toBeDefined();
  });

  it('(Aufgabe B) schreibt bei Erfolg genau eine llm_nutzung-Zeile mit dem exakten Token-Verbrauch, zugeordnet zu kunde_id/agentur_id, handler_slug="klassifikation"', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        { text: JSON.stringify(ERGEBNIS_ZWEI_ANLIEGEN), tokenVerbrauch: { input_tokens: 4321, output_tokens: 987 } },
      ],
    });
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });

    await klassifiziereUndPersistiere({
      nachricht: NACHRICHT_BAECKEREI,
      kontext: KONTEXT_BAECKEREI,
      provider,
      repo,
      optionen: OPTIONEN,
    });

    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0]).toMatchObject({
      agentur_id: KUNDE_A1_STUFE1.agentur_id,
      kunde_id: KUNDE_A1_STUFE1.id,
      vorgang_id: VORGANG_ID,
      handler_slug: 'klassifikation',
      input_tokens: 4321,
      output_tokens: 987,
    });
  });

  it('(Aufgabe B) schreibt AUCH bei einem schema-verletzenden Output eine llm_nutzung-Zeile (der Call wurde abgerechnet, auch wenn der Output verworfen wird), und setzt klassifikation_status=failed', async () => {
    const ungueltigerOutput = { foo: 'bar' }; // valides JSON, verletzt aber das Zod-Schema
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(ungueltigerOutput), tokenVerbrauch: { input_tokens: 111, output_tokens: 22 } }],
    });
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });

    const resultat = await klassifiziereUndPersistiere({
      nachricht: NACHRICHT_BAECKEREI,
      kontext: KONTEXT_BAECKEREI,
      provider,
      repo,
      optionen: OPTIONEN,
    });

    expect(resultat.status).toBe('failed');
    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0]).toMatchObject({ input_tokens: 111, output_tokens: 22 });
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation_status).toBe('failed');
    expect(repo.anliegen).toHaveLength(0); // kein halber Vorgang: keine anliegen-Zeile bei einem gescheiterten Vorgang
  });

  it('schreibt KEINE llm_nutzung-Zeile, wenn der LLM-Aufruf selbst fehlschlägt (kein Response, keine Abrechnung)', async () => {
    const provider = {
      strukturierteCompletion: async () => {
        throw new Error('Netzwerk-Timeout');
      },
    };
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
    });

    const resultat = await klassifiziereUndPersistiere({
      nachricht: NACHRICHT_BAECKEREI,
      kontext: KONTEXT_BAECKEREI,
      provider,
      repo,
      optionen: OPTIONEN,
    });

    expect(resultat.status).toBe('failed');
    expect(repo.llmNutzung).toHaveLength(0);
    expect(repo.vorgaenge.get(VORGANG_ID)?.klassifikation_status).toBe('failed');
  });

  it('(Aufgabe A) markiert den Vorgang als in_progress, BEVOR der LLM-Call läuft (nicht erst danach)', async () => {
    let statusBeimLlmAufruf: string | undefined;
    const provider = {
      strukturierteCompletion: async () => {
        statusBeimLlmAufruf = repo.vorgaenge.get(VORGANG_ID)?.klassifikation_status;
        return {
          text: JSON.stringify(ERGEBNIS_ZWEI_ANLIEGEN),
          tokenVerbrauch: { input_tokens: 1, output_tokens: 1 },
          modell: 'mock-model',
        };
      },
    };
    const repo = new FakeKlassifikationsRepository({
      kunden: [KUNDE_A1_STUFE1],
      nutzer: [NUTZER_JULIA],
      vorgaenge: { [VORGANG_ID]: { klassifikation_status: 'queued' } },
    });

    await klassifiziereUndPersistiere({
      nachricht: NACHRICHT_BAECKEREI,
      kontext: KONTEXT_BAECKEREI,
      provider,
      repo,
      optionen: OPTIONEN,
    });

    expect(statusBeimLlmAufruf).toBe('in_progress');
  });
});
