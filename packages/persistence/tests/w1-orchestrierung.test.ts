import { describe, expect, it } from 'vitest';
import { W1_HANDLER_SLUG, type W1BriefingInput } from '@konsole/handlers';
import { MockLLMProvider } from '@konsole/llm/testing';
import { fuehreW1AusUndProtokolliere } from '../src/w1-orchestrierung.js';
import { FakeKlassifikationsRepository } from '../src/testing/fake-repository.js';
import { FakeKundenProfilRepository } from '../src/testing/fake-kundenprofil-repository.js';

const BRIEFING: W1BriefingInput = {
  anlass: 'Neue Produktlinie',
  kernbotschaft: 'Nachhaltigere Verpackung.',
  fakten: ['Marktstart 01.09.2026'],
  zitat_sprecher: null,
  zitat_kernaussage: null,
  ziel_medien_gruppe: 'Fachpresse Handel',
  boilerplate_referenz: null,
  laenge_ziel: 'standard',
  sperrfrist_at: null,
  zusatz_hinweis: null,
};

const GUTER_DRAFT = {
  headline: 'Kunde reduziert Plastikanteil neuer Verpackung um 40 Prozent',
  sub_headline: null,
  ort_datum: 'München, 13. Juli 2026',
  lead_absatz: 'Kunde bringt eine neue, nachhaltigere Verpackung auf den Markt.',
  ausfuehrung_absaetze: ['Details zur neuen Verpackung.'],
  zitat: null,
  boilerplate: 'Kunde ist Marktführer.',
  kontakt_fusszeile: 'Kontakt: Kommunikationsabteilung.',
  laenge_worte: 60,
};

const OHNE_FINDINGS = { text: JSON.stringify({ kritiker_findings: [] }), tokenVerbrauch: { input_tokens: 150, output_tokens: 40 } };

function kundenProfilRepoMitSlugs(slugs: Record<string, string>): FakeKundenProfilRepository {
  return new FakeKundenProfilRepository({ kundenSlugs: slugs });
}

describe('fuehreW1AusUndProtokolliere', () => {
  it('lädt die Tonalität aus dem Kundenprofil und schreibt pro LLM-Aufruf eine llm_nutzung-Zeile', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const kundenProfilRepo = kundenProfilRepoMitSlugs({ 'kunde-a': 'kunde-a' });
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: 'vorgang-1',
      briefing: BRIEFING,
      provider,
      repo,
      kundenProfilRepo,
    });

    expect(resultat.status).toBe('erfolg');
    expect(repo.llmNutzung).toHaveLength(2);
    expect(repo.llmNutzung[0]).toMatchObject({
      agentur_id: 'agentur-a',
      kunde_id: 'kunde-a',
      vorgang_id: 'vorgang-1',
      handler_slug: W1_HANDLER_SLUG,
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(repo.llmNutzung[1]).toMatchObject({ handler_slug: W1_HANDLER_SLUG, input_tokens: 150, output_tokens: 40 });
  });

  it('schreibt llm_nutzung auch, wenn der Gesamtlauf am Ende scheitert (Draft dauerhaft ungültig)', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const kundenProfilRepo = kundenProfilRepoMitSlugs({ 'kunde-a': 'kunde-a' });
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify({ unsinn: true }), tokenVerbrauch: { input_tokens: 10, output_tokens: 5 } }],
    });

    const resultat = await fuehreW1AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: null,
      briefing: BRIEFING,
      provider,
      repo,
      kundenProfilRepo,
    });

    expect(resultat.status).toBe('fehlgeschlagen');
    expect(repo.llmNutzung).toHaveLength(1); // nur der gescheiterte Draft-Versuch wurde abgerechnet
  });

  it('wirft, wenn der Kunde nicht existiert', async () => {
    const repo = new FakeKlassifikationsRepository({ kunden: [] });
    const kundenProfilRepo = kundenProfilRepoMitSlugs({});
    const provider = new MockLLMProvider({ antworten: [] });

    await expect(
      fuehreW1AusUndProtokolliere({
        kundeId: 'kunde-unbekannt',
        vorgangId: null,
        briefing: BRIEFING,
        provider,
        repo,
        kundenProfilRepo,
      }),
    ).rejects.toThrow('existiert nicht');
  });

  it('kunden_grenzen mit ist_deterministisch_erzwungen=true blockieren den Draft unabhängig vom Kritiker-Pass (verbotene Aussage)', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [{ id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 }],
    });
    const kundenProfilRepo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a' },
      grenzen: [
        {
          id: 'grenze-1',
          kunde_id: 'kunde-a',
          typ: 'verbotene_aussage',
          inhalt: 'Marktführer', // kommt wörtlich in GUTER_DRAFT.boilerplate vor
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: true,
          status: 'abgeleitet', // Status irrelevant für die Durchsetzung, siehe Decision
        },
      ],
    });
    const provider = new MockLLMProvider({
      antworten: [{ text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } }, OHNE_FINDINGS],
    });

    const resultat = await fuehreW1AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: null,
      briefing: BRIEFING,
      provider,
      repo,
      kundenProfilRepo,
    });

    expect(resultat.status).toBe('erfolg');
    if (resultat.status === 'erfolg') {
      expect(resultat.output.grenz_pruefung_ergebnis.bestanden).toBe(false);
      expect(resultat.output.ueberarbeitungsbeduerftig).toBe(true);
      expect(resultat.output.grenz_pruefung_ergebnis.verstoesse.some((v) => v.baustein_name === 'kundengrenze_verbotene_aussage')).toBe(true);
    }
  });

  it('Kern-Beweis der Kundenagnostik: derselbe Draft besteht bei Kunde A, fällt bei Kunde B durch (unterschiedliche Grenzen)', async () => {
    const repo = new FakeKlassifikationsRepository({
      kunden: [
        { id: 'kunde-a', agentur_id: 'agentur-a', autonomie_level: 1 },
        { id: 'kunde-b', agentur_id: 'agentur-a', autonomie_level: 1 },
      ],
    });
    const kundenProfilRepo = new FakeKundenProfilRepository({
      kundenSlugs: { 'kunde-a': 'kunde-a', 'kunde-b': 'kunde-b' },
      grenzen: [
        {
          id: 'grenze-b',
          kunde_id: 'kunde-b',
          typ: 'verbotene_aussage',
          inhalt: 'Marktführer',
          textart_geltungsbereich: null,
          ist_deterministisch_erzwungen: true,
          status: 'freigegeben',
        },
      ],
    });

    const antwort = { text: JSON.stringify(GUTER_DRAFT), tokenVerbrauch: { input_tokens: 100, output_tokens: 50 } };

    const resultatA = await fuehreW1AusUndProtokolliere({
      kundeId: 'kunde-a',
      vorgangId: null,
      briefing: BRIEFING,
      provider: new MockLLMProvider({ antworten: [antwort, OHNE_FINDINGS] }),
      repo,
      kundenProfilRepo,
    });

    const resultatB = await fuehreW1AusUndProtokolliere({
      kundeId: 'kunde-b',
      vorgangId: null,
      briefing: BRIEFING,
      provider: new MockLLMProvider({ antworten: [antwort, OHNE_FINDINGS] }),
      repo,
      kundenProfilRepo,
    });

    expect(resultatA.status).toBe('erfolg');
    expect(resultatB.status).toBe('erfolg');
    if (resultatA.status === 'erfolg' && resultatB.status === 'erfolg') {
      expect(resultatA.output.grenz_pruefung_ergebnis.bestanden).toBe(true);
      expect(resultatB.output.grenz_pruefung_ergebnis.bestanden).toBe(false);
    }
  });
});
