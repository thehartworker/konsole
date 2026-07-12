import { describe, expect, it } from 'vitest';
import { W2_HANDLER_SLUG, type Pruefregel, type W2Input } from '@konsole/handlers';
import { MockLLMProvider } from '@konsole/llm/testing';
import { fuehreW2AusUndProtokolliere } from '../src/w2-orchestrierung.js';
import { FakeKlassifikationsRepository } from '../src/testing/fake-repository.js';
import { FakePruefregelnRepository } from '../src/testing/fake-pruefregeln-repository.js';

const W2_INPUT: W2Input = {
  anfrage: {
    medium_name: 'Süddeutsche Zeitung',
    journalist_name: 'Anna Journalistin',
    journalist_kontakt: 'anna@sz.example',
    ressort: 'Wirtschaft',
    thema_beschreibung: 'Rückruf eines Produkts',
    frist_at: null,
    fragen_woertlich: ['Wie viele Einheiten sind betroffen?'],
    format_gewuenscht: 'schriftliche_antworten',
    sprecher_vorgeschlagen: null,
    sprecher_rolle: null,
  },
  kunde_kontext: {
    kunde_slug: 'kunde-a',
    sprachregelungen_slug: 'kunde-a-sprachregelungen',
    thema_positionierung: null,
  },
};

const GUTER_DRAFT = {
  what_were_doing: 'Wir bereiten eine schriftliche Antwort für die Süddeutsche Zeitung vor.',
  strategic_objectives: { reputation: 'Transparenz wahren.', risk: 'Eskalation vermeiden.' },
  reactive_statement: null,
  background_information: [
    { topic_field: 'Rückruf', content: 'Details zum Rückruf.', sources: ['Interne QS'], strategy_note: 'Transparenz.' },
  ],
  open_questions: ['Ist die Anzahl final? (Confirm)'],
  key_messages: [],
};

function codeRegel(id: string, kundeId: string, baustein_name: string): Pruefregel & { kunde_id: string } {
  return {
    id,
    kunde_id: kundeId,
    handler_slug: W2_HANDLER_SLUG,
    typ: 'code_baustein',
    baustein_name,
    parameter: {},
    prompt_text: null,
    aktiv: true,
    reihenfolge: 1,
  };
}

describe('fuehreW2AusUndProtokolliere', () => {
  it('lädt die kunde-gescopten Regeln und schreibt pro LLM-Aufruf eine llm_nutzung-Zeile', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const pruefregelnRepo = new FakePruefregelnRepository([codeRegel('r1', 'kunde-a', 'keine_tier_nennung')]);
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } }],
    });

    const resultat = await fuehreW2AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: 'vorgang-1',
      input: W2_INPUT,
      provider,
      repo,
      pruefregelnRepo,
    });

    expect(resultat.status).toBe('erfolg');
    expect(repo.llmNutzung).toHaveLength(1);
    expect(repo.llmNutzung[0]).toMatchObject({
      agentur_id: 'agentur-a',
      kunde_id: 'kunde-a',
      vorgang_id: 'vorgang-1',
      handler_slug: W2_HANDLER_SLUG,
      input_tokens: 100,
      output_tokens: 50,
    });
  });

  it('Kern-Beweis der Kundenagnostik über den vollen Stack: derselbe Draft besteht bei Kunde A, fällt bei Kunde B durch', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [
        { id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 },
        { id: 'kunde-b', agentur_id: 'agentur-a', autonomie_level: 1 },
      ],
    });
    const pruefregelnRepo = new FakePruefregelnRepository([
      codeRegel('r1', 'kunde-a', 'keine_tier_nennung'),
      codeRegel('r2', 'kunde-b', 'background_mit_quellenangabe'),
    ]);

    // Draft ohne Tier-Nennung (besteht bei A), aber ohne Quellenangabe (fällt bei B durch).
    const gemeinsamerDraft = { ...GUTER_DRAFT, background_information: [{ ...GUTER_DRAFT.background_information[0], sources: [] }] };
    const antwort = { text: JSON.stringify(gemeinsamerDraft), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } };

    const resultatA = await fuehreW2AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: null,
      input: W2_INPUT,
      provider: new MockLLMProvider({ antworten: [antwort, antwort, antwort] }),
      repo,
      pruefregelnRepo,
    });

    const resultatB = await fuehreW2AusUndProtokolliere({
      kundeId: 'kunde-b',
      vorgangId: null,
      input: { ...W2_INPUT, kunde_kontext: { ...W2_INPUT.kunde_kontext, kunde_slug: 'kunde-b' } },
      provider: new MockLLMProvider({ antworten: [antwort, antwort, antwort] }),
      repo,
      pruefregelnRepo,
    });

    expect(resultatA.status).toBe('erfolg');
    expect(resultatB.status).toBe('erfolg');
    if (resultatA.status === 'erfolg' && resultatB.status === 'erfolg') {
      expect(resultatA.output.pruefung.bestanden).toBe(true);
      expect(resultatB.output.pruefung.bestanden).toBe(false);
    }
  });

  it('schreibt llm_nutzung auch, wenn der Gesamtlauf am Ende scheitert (Draft dauerhaft ungültig)', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const pruefregelnRepo = new FakePruefregelnRepository();
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ unsinn: true }), tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await fuehreW2AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: null,
      input: W2_INPUT,
      provider,
      repo,
      pruefregelnRepo,
    });

    expect(resultat.status).toBe('fehlgeschlagen');
    expect(repo.llmNutzung).toHaveLength(3); // jeder der 3 Versuche wurde abgerechnet
  });

  it('wirft, wenn der Kunde nicht existiert', async () => {
    const repo = new FakeKlassifikationsRepository({ kunden: [] });
    const pruefregelnRepo = new FakePruefregelnRepository();
    const provider = new MockLLMProvider({ antworten: [] });

    await expect(
      fuehreW2AusUndProtokolliere({
        kundeId: 'kunde-unbekannt',
        vorgangId: null,
        input: W2_INPUT,
        provider,
        repo,
        pruefregelnRepo,
      }),
    ).rejects.toThrow('existiert nicht');
  });
});
