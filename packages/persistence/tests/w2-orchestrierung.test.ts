import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from '@konsole/llm/testing';
import type { W2Input } from '@konsole/handlers/w2';
import { fuehreW2AusUndErfasseNutzung, LLM_NUTZUNG_HANDLER_SLUG_W2 } from '../src/w2-orchestrierung.js';
import { FakeKlassifikationsRepository } from '../src/testing/index.js';
import { KUNDE_A1_STUFE1, VORGANG_ID } from './fixtures.js';

const W2_INPUT: W2Input = {
  anfrage: {
    medium_name: 'Süddeutsche Zeitung',
    journalist_name: 'Petra Beispiel',
    journalist_kontakt: null,
    ressort: 'Wirtschaft',
    thema_beschreibung: 'Marktentwicklung Sauerteig-Linie',
    frist_at: null,
    fragen_woertlich: ['Wie schätzen Sie die Entwicklung ein?'],
    format_gewuenscht: 'schriftliche_antworten',
    sprecher_vorgeschlagen: null,
    sprecher_rolle: null,
  },
  kunde_kontext: {
    kunde_slug: 'baeckerei-hoffmann',
    sprachregelungen_slug: 'baeckerei-hoffmann-sauerteig',
    thema_positionierung: 'Der Kunde positioniert sich als Handwerksbäckerei mit langer Tradition.',
  },
};

const GUTER_DRAFT = {
  what_were_doing: 'Die Redaktion hat eine Anfrage zur Marktentwicklung gestellt, und wir bereiten eine sachliche Antwort vor, die die aktuelle Situation des Kunden beschreibt.',
  strategic_objectives: {
    reputation: 'Die Position des Kunden ruhig und sachlich darstellen.',
    risk: 'Keine zusätzlichen Angriffsflächen durch unklare Aussagen schaffen.',
  },
  reactive_statement: null,
  background_information: [
    {
      topic_field: 'Marktposition',
      content: 'Der Kunde ist eine traditionsreiche Handwerksbäckerei.',
      sources: ['Kunden-Website'],
      strategy_note: 'Kann unverändert übernommen werden.',
    },
  ],
  open_questions: ['Wer soll als Sprecher benannt werden?'],
};

const LEERE_REVIEW = { verstoesse: [] };

function antwort(objekt: unknown, tokenVerbrauch: { input_tokens: number; output_tokens: number }) {
  return { text: JSON.stringify(objekt), tokenVerbrauch };
}

describe('fuehreW2AusUndErfasseNutzung', () => {
  it('schreibt für jeden LLM-Aufruf (Draft + Review) eine eigene llm_nutzung-Zeile mit handler_slug="W2_presseanfragen_drafter"', async () => {
    const provider = new MockLLMProvider({
      antworten: [
        antwort(GUTER_DRAFT, { input_tokens: 500, output_tokens: 300 }),
        antwort(LEERE_REVIEW, { input_tokens: 200, output_tokens: 100 }),
      ],
    });
    const repo = new FakeKlassifikationsRepository({ kunden: [KUNDE_A1_STUFE1] });

    const resultat = await fuehreW2AusUndErfasseNutzung({
      input: W2_INPUT,
      kundeId: KUNDE_A1_STUFE1.id,
      vorgangId: VORGANG_ID,
      deps: { llmProvider: provider },
      repo,
    });

    expect(resultat.status).toBe('erfolg');
    expect(repo.llmNutzung).toHaveLength(2);
    expect(repo.llmNutzung[0]).toMatchObject({
      agentur_id: KUNDE_A1_STUFE1.agentur_id,
      kunde_id: KUNDE_A1_STUFE1.id,
      vorgang_id: VORGANG_ID,
      handler_slug: LLM_NUTZUNG_HANDLER_SLUG_W2,
      input_tokens: 500,
      output_tokens: 300,
    });
    expect(repo.llmNutzung[1]).toMatchObject({
      handler_slug: LLM_NUTZUNG_HANDLER_SLUG_W2,
      input_tokens: 200,
      output_tokens: 100,
    });
  });

  it('schreibt AUCH bei einem gescheiterten Draft-Lauf eine llm_nutzung-Zeile für den bereits abgerechneten Aufruf', async () => {
    const provider = new MockLLMProvider({
      antworten: [antwort({ foo: 'bar' }, { input_tokens: 111, output_tokens: 22 })],
    });
    const repo = new FakeKlassifikationsRepository({ kunden: [KUNDE_A1_STUFE1] });

    const resultat = await fuehreW2AusUndErfasseNutzung({
      input: W2_INPUT,
      kundeId: KUNDE_A1_STUFE1.id,
      vorgangId: VORGANG_ID,
      deps: { llmProvider: provider },
      repo,
    });

    expect(resultat.status).toBe('fehlgeschlagen');
    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0]).toMatchObject({ input_tokens: 111, output_tokens: 22 });
  });

  it('wirft einen Fehler, wenn der Kunde nicht existiert (kein stiller Fallback)', async () => {
    const provider = new MockLLMProvider({ antworten: [] });
    const repo = new FakeKlassifikationsRepository({ kunden: [] });

    await expect(
      fuehreW2AusUndErfasseNutzung({
        input: W2_INPUT,
        kundeId: KUNDE_A1_STUFE1.id,
        vorgangId: VORGANG_ID,
        deps: { llmProvider: provider },
        repo,
      }),
    ).rejects.toThrow(/existiert nicht/);
  });
});
